-- ============================================================
-- Monitor ECG — Esquema Supabase (PostgreSQL)
-- Ejecutar completo en: Supabase → SQL Editor → New query → Run
-- Es idempotente: se puede volver a ejecutar sin perder datos.
--
-- ESTADO / ORDEN (H-18): este archivo es la FUENTE ÚNICA para una instalación nueva e integra TODO, incluida la TANDA 1
-- (migracion_endurecimiento_2.sql: sus sentencias están copiadas al final de este archivo, entre las marcas CUERPO).
-- Para una base ya existente aplica, en este orden, solo lo que falte:
--   migracion_cuentas_pacientes -> migracion_endurecimiento -> migracion_admin_mfa -> migracion_admin_roles -> migracion_endurecimiento_2.
-- Las migraciones 1-4 son históricas (se abortan si ya se aplicó la 2) y migracion_eventos_camara.sql no hace nada.
--
-- ISO/IEC 27001:2013 (UNE-EN ISO/IEC 27001:2017), Anexo A
--   A.9.1.1 / A.9.4.1   Política de control de acceso / restricción del acceso → RLS en TODAS las tablas
--   A.9.2.3             Gestión de privilegios → admin solo vía la tabla public.administradores
--   A.9.4.2             Inicio de sesión seguro → admin con Supabase Auth (email + contraseña) + TOTP (aal2) RECIENTE (<= 15 min, claim amr) exigido por es_admin()
--   A.18.1.4            Protección de datos personales (Ley 19.628 / 21.719) → solo seudónimos
--   A.12.4.1 / A.12.4.2 Registro de eventos protegido → tabla auditoria (solo inserción)
--   A.12.4.4            Sincronización del reloj → función hora_servidor() (fuente única de tiempo)
--   A.16.1.2 / A.16.1.3 Notificación de eventos y puntos débiles → tabla incidentes
--   A.12.1.3 / A.13.1.1  Gestión de capacidades → CHECK de tamaño, lista blanca de auditoría y triggers de cuota
--   A.18.1.4 (supresión)  → función borrar_mis_datos()
-- ============================================================

-- ---------- Administradores ----------
-- Un usuario de Supabase Auth es admin solo si su id está en esta tabla.
create table if not exists public.administradores (
  user_id uuid primary key references auth.users (id) on delete cascade,
  creado_en timestamptz not null default now()
);
alter table public.administradores enable row level security;

-- ---------- Rol asignado (sin exigir aal2) ----------
create or replace function public.es_admin_registrado()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.administradores where user_id = (select auth.uid()));
$$;
revoke all on function public.es_admin_registrado() from public, anon;
grant execute on function public.es_admin_registrado() to authenticated;

-- ---------- Privilegios efectivos: rol + segundo factor RECIENTE (definición final; ver C-05 al final del archivo) ----------
create or replace function public.totp_reciente(p_segundos integer default 900)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from jsonb_array_elements(
           case when jsonb_typeof((select auth.jwt()) -> 'amr') = 'array'
                then (select auth.jwt()) -> 'amr' else '[]'::jsonb end) a
    where jsonb_typeof(a) = 'object'
      and a ->> 'method' = 'totp'
      and (case when (a ->> 'timestamp') ~ '^[0-9]{1,12}$' then (a ->> 'timestamp')::bigint else 0 end)
          > extract(epoch from now())::bigint - greatest(coalesce(p_segundos, 900), 1)
      and (case when (a ->> 'timestamp') ~ '^[0-9]{1,12}$' then (a ->> 'timestamp')::bigint else 0 end)
          <= extract(epoch from now())::bigint + 60
  );
$$;
revoke all on function public.totp_reciente(integer) from public, anon;
grant execute on function public.totp_reciente(integer) to authenticated;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.administradores where user_id = (select auth.uid()))
         and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
         and public.totp_reciente(900);
$$;
revoke all on function public.es_admin() from public, anon;
grant execute on function public.es_admin() to authenticated;

create or replace function public.es_admin_reciente(p_segundos integer default 300)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.administradores where user_id = (select auth.uid()))
         and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
         and public.totp_reciente(least(greatest(coalesce(p_segundos, 300), 30), 900));
$$;
revoke all on function public.es_admin_reciente(integer) from public, anon;
grant execute on function public.es_admin_reciente(integer) to authenticated;

-- La tabla de roles NO se modifica directamente desde la app: los cambios pasan por
-- admin_conceder_rol / admin_retirar_rol (ver migracion_admin_roles.sql). Contingencia: SQL Editor del dueño.
revoke insert, update, delete on public.administradores from anon, authenticated;

-- ---------- Revisión (A.9.2.5): incluye el correo (solo visible para es_admin) ----------
drop function if exists public.admin_listar_administradores();
create function public.admin_listar_administradores()
returns table (user_id uuid, email text, creado_en timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'Privilegios insuficientes' using errcode = '42501';
  end if;
  return query
    select a.user_id, u.email::text, a.creado_en
    from public.administradores a
    left join auth.users u on u.id = a.user_id
    order by a.creado_en;
end;
$$;
revoke all on function public.admin_listar_administradores() from public, anon;
grant execute on function public.admin_listar_administradores() to authenticated;

-- ---------- Conceder el rol (A.9.2.3) ----------
drop function if exists public.admin_conceder_rol(text);
create function public.admin_conceder_rol(p_correo text)
returns table (user_id uuid, creado_en timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_correo text := lower(btrim(coalesce(p_correo, '')));
  v_objetivo uuid;
  v_yo uuid := (select auth.uid());
  v_creado timestamptz;
begin
  if not public.es_admin_reciente(300) then
    raise exception 'Privilegios insuficientes' using errcode = '42501';
  end if;
  if char_length(v_correo) = 0 or char_length(v_correo) > 254
     or v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'No se pudo conceder el rol' using errcode = 'P0001';
  end if;

  -- Serializa altas/bajas para que el límite no se salte con peticiones simultáneas.
  lock table public.administradores in share row exclusive mode;

  select u.id into v_objetivo
  from auth.users u
  where lower(u.email) = v_correo and u.email_confirmed_at is not null
  limit 1;
  if v_objetivo is null then
    -- Mensaje genérico: no revela si el correo existe o no está confirmado.
    raise exception 'No se pudo conceder el rol' using errcode = 'P0001';
  end if;

  if (select count(*) from public.administradores) >= 5
     and not exists (select 1 from public.administradores a where a.user_id = v_objetivo) then
    raise exception 'limite_administradores' using errcode = 'P0001';
  end if;

  insert into public.administradores (user_id) values (v_objetivo) on conflict (user_id) do nothing;
  select a.creado_en into v_creado from public.administradores a where a.user_id = v_objetivo;

  -- El trigger de auditoría fija usuario (auth.uid()) y hora, y aplica la cuota. Sin correos.
  insert into public.auditoria (tipo, actor, detalle)
  values ('ADMIN_ROLE_GRANTED', 'admin', jsonb_build_object('objetivo', v_objetivo, 'por', v_yo));

  return query select v_objetivo, v_creado;
end;
$$;
revoke all on function public.admin_conceder_rol(text) from public, anon;
grant execute on function public.admin_conceder_rol(text) to authenticated;

-- ---------- Retirar el rol (A.9.2.6) ----------
drop function if exists public.admin_retirar_rol(uuid);
create function public.admin_retirar_rol(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := (select auth.uid());
  v_borradas int;
begin
  if not public.es_admin_reciente(300) then
    raise exception 'Privilegios insuficientes' using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = v_yo then
    raise exception 'no_puede_retirarse_a_si_mismo' using errcode = 'P0001';
  end if;

  lock table public.administradores in share row exclusive mode;

  if (select count(*) from public.administradores) <= 1 then
    raise exception 'minimo_un_administrador' using errcode = 'P0001';
  end if;

  delete from public.administradores a where a.user_id = p_user_id;
  get diagnostics v_borradas = row_count;
  if v_borradas = 0 then
    return false;
  end if;

  insert into public.auditoria (tipo, actor, detalle)
  values ('ADMIN_ROLE_REVOKED', 'admin', jsonb_build_object('objetivo', p_user_id, 'por', v_yo));
  return true;
end;
$$;
revoke all on function public.admin_retirar_rol(uuid) from public, anon;
grant execute on function public.admin_retirar_rol(uuid) to authenticated;


drop policy if exists "admin ve administradores" on public.administradores;
create policy "admin ve administradores" on public.administradores
  for select to authenticated using (public.es_admin());

-- ---------- Parámetros globales (RF15, RF26, RF27) ----------
create table if not exists public.parametros (
  id smallint primary key default 1 check (id = 1),
  parametros jsonb not null,
  sincronizacion jsonb,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users (id) on delete set null
);
alter table public.parametros enable row level security;

drop policy if exists "todos leen parametros" on public.parametros;
create policy "todos leen parametros" on public.parametros
  for select to authenticated using (true);

drop policy if exists "admin inserta parametros" on public.parametros;
create policy "admin inserta parametros" on public.parametros
  for insert to authenticated with check (public.es_admin());

drop policy if exists "admin modifica parametros" on public.parametros;
create policy "admin modifica parametros" on public.parametros
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

-- ---------- Sesiones de medición (RF08, RF18, RF19) ----------
create table if not exists public.sesiones (
  id uuid primary key,
  propietario uuid not null default auth.uid() references auth.users (id) on delete cascade,
  inicio timestamptz not null,
  fin timestamptz,
  estado text not null check (estado in ('activa', 'finalizada')),
  motivo_fin text,
  -- participantes seudonimizados, actividad, eventos, resumen de BPM y parámetros aplicados
  datos jsonb not null,
  actualizado_en timestamptz not null default now()
);
create index if not exists sesiones_propietario_idx on public.sesiones (propietario);
alter table public.sesiones enable row level security;

-- C-06: el administrador NO lee sesiones ajenas (solo admin_leer_sesion con motivo, auditado).
drop policy if exists "dueño lee sesiones" on public.sesiones;
create policy "dueño lee sesiones" on public.sesiones
  for select to authenticated using (propietario = (select auth.uid()));

drop policy if exists "dueño inserta sesiones" on public.sesiones;
create policy "dueño inserta sesiones" on public.sesiones
  for insert to authenticated with check (propietario = auth.uid());

drop policy if exists "dueño modifica sesiones" on public.sesiones;
create policy "dueño modifica sesiones" on public.sesiones
  for update to authenticated using (propietario = auth.uid()) with check (propietario = auth.uid());

drop policy if exists "dueño borra sesiones" on public.sesiones;
create policy "dueño borra sesiones" on public.sesiones
  for delete to authenticated using (propietario = (select auth.uid()));

-- ---------- Bloques de muestras (~2 s de señal a 250 Hz por fila) ----------
create table if not exists public.bloques_muestras (
  sesion_id uuid not null references public.sesiones (id) on delete cascade,
  canal smallint not null check (canal between 0 and 9),
  seq integer not null check (seq >= 0),
  t integer[] not null,
  ecg_raw smallint[] not null,
  leads_off smallint[] not null,
  bpm real[],
  creado_en timestamptz not null default now(),
  primary key (sesion_id, canal, seq),
  -- validación en el servidor (A.14.2.5 / A.14.1.3): máximo 2000 muestras por bloque y longitudes consistentes
  check (cardinality(t) between 1 and 2000),
  check (cardinality(ecg_raw) = cardinality(t)),
  check (cardinality(leads_off) = cardinality(t))
);
alter table public.bloques_muestras enable row level security;

-- C-04/C-06: solo el propietario lee sus bloques; lo público pasa por la RPC senal_publica().
drop policy if exists "dueño lee bloques" on public.bloques_muestras;
create policy "dueño lee bloques" on public.bloques_muestras
  for select to authenticated using (
    exists (select 1 from public.sesiones s where s.id = sesion_id and s.propietario = (select auth.uid()))
  );

drop policy if exists "dueño inserta bloques" on public.bloques_muestras;
create policy "dueño inserta bloques" on public.bloques_muestras
  for insert to authenticated with check (
    exists (select 1 from public.sesiones s where s.id = sesion_id and s.propietario = auth.uid())
  );

drop policy if exists "dueño borra bloques" on public.bloques_muestras;
create policy "dueño borra bloques" on public.bloques_muestras
  for delete to authenticated using (
    exists (select 1 from public.sesiones s where s.id = sesion_id and s.propietario = auth.uid())
  );

-- ---------- Auditoría (A.12.4.1, A.12.4.2) — solo inserción, nunca datos de salud ----------
create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  usuario uuid default auth.uid() references auth.users (id) on delete set null,
  tipo text not null check (char_length(tipo) <= 64),
  actor text not null check (actor in ('system', 'admin', 'participant')),
  detalle jsonb not null default '{}'::jsonb
);
alter table public.auditoria enable row level security;

-- C-08: nadie inserta directamente; solo registrar_evento() y las funciones del servidor (ver final del archivo).
drop policy if exists "admin lee auditoria" on public.auditoria;
create policy "admin lee auditoria" on public.auditoria
  for select to authenticated using (public.es_admin());
-- Sin políticas de UPDATE/DELETE: el registro es inmutable desde la app.


-- ---------- Incidentes y puntos débiles (A.16.1.2 – A.16.1.6) ----------
-- Cualquier sesión (anónima de participante o admin) notifica; solo el admin evalúa, responde y cierra.
-- Nunca contiene datos de salud ni identificadores personales (validado también en el cliente).
create table if not exists public.incidentes (
  id uuid primary key,
  reportante uuid not null default auth.uid() references auth.users (id) on delete cascade,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  tipo text not null check (tipo in ('acceso', 'fuga', 'integridad', 'disponibilidad', 'debilidad', 'otro')),
  severidad text not null check (severidad in ('baja', 'media', 'alta')),
  descripcion text not null check (char_length(descripcion) between 10 and 500),
  reportado_por text not null check (reportado_por in ('participant', 'admin', 'system')),
  estado text not null default 'abierto' check (estado in ('abierto', 'en_analisis', 'cerrado', 'descartado')),
  respuesta text check (respuesta is null or char_length(respuesta) <= 500),
  leccion text check (leccion is null or char_length(leccion) <= 500)
);
create index if not exists incidentes_estado_idx on public.incidentes (estado);
alter table public.incidentes enable row level security;

drop policy if exists "autenticados notifican incidentes" on public.incidentes;
create policy "autenticados notifican incidentes" on public.incidentes
  for insert to authenticated with check (
    (reportante = auth.uid() and estado = 'abierto') or public.es_admin()
  );

drop policy if exists "reportante o admin lee incidentes" on public.incidentes;
create policy "reportante o admin lee incidentes" on public.incidentes
  for select to authenticated using (reportante = auth.uid() or public.es_admin());

drop policy if exists "admin gestiona incidentes" on public.incidentes;
create policy "admin gestiona incidentes" on public.incidentes
  for update to authenticated using (public.es_admin()) with check (public.es_admin());
-- Sin política DELETE: los incidentes se conservan como evidencia (A.16.1.7).

-- ---------- Hora del servidor (A.12.4.4) ----------
create or replace function public.hora_servidor()
returns timestamptz
language sql
stable
as $$ select now(); $$;
revoke all on function public.hora_servidor() from public;
grant execute on function public.hora_servidor() to authenticated;

-- (Retención: purgar_sesiones() y la purga de auditoría están al final del archivo, por fecha de creación del servidor.)

-- ============================================================
-- Límites, cuotas e integridad (SUG-04 / SUG-05 / SUG-14)
--   A.12.1.3 Gestión de capacidades → cuotas por usuario frente al llenado del plan gratuito (500 MB)
--   A.13.1.1 / A.9.4.2 → mitigación del abuso de sesiones anónimas (junto a CAPTCHA y rate limit de Auth)
--   A.12.4.2 Protección del registro → lista blanca de tipos, tamaño acotado, ts/usuario fijados por el servidor
-- Compatibles con el flujo de la app: bloques de 500 muestras (~2 s) por canal, hasta 5 canales.
-- Las restricciones nuevas se agregan NOT VALID: no fallan por filas antiguas, pero sí se aplican a las nuevas.
-- ============================================================

-- Parámetros de cuota: función public.cuota() al final del archivo (sección 0 del cuerpo de la TANDA 1).

-- Agrega una restricción CHECK solo si no existe (idempotente).
create or replace function public._agregar_check(tabla regclass, nombre text, expr text)
returns void
language plpgsql
as $$
begin
  if not exists (select 1 from pg_constraint where conrelid = tabla and conname = nombre) then
    execute format('alter table %s add constraint %I check (%s) not valid', tabla, nombre, expr);
  end if;
end;
$$;

-- Sesiones: JSON acotado.
select public._agregar_check('public.sesiones', 'sesiones_datos_tamano',
  'pg_column_size(datos) <= 65536');

-- Bloques: canal 0–9 ya existe; secuencia acotada (máx. ~3 h por canal) y BPM consistente.
select public._agregar_check('public.bloques_muestras', 'bloques_seq_max', 'seq <= 5400');
select public._agregar_check('public.bloques_muestras', 'bloques_bpm_len',
  'bpm is null or cardinality(bpm) = cardinality(t)');

-- Auditoría: la lista blanca de tipos vive en la tabla tipos_evento (sección C-08 al final; la verifica tests/schema.spec.js).
select public._agregar_check('public.auditoria', 'auditoria_detalle_tamano',
  'pg_column_size(detalle) <= 2048 and jsonb_typeof(detalle) = ''object''');

create index if not exists auditoria_usuario_ts_idx on public.auditoria (usuario, ts);
create index if not exists bloques_creado_idx on public.bloques_muestras (creado_en);
create index if not exists incidentes_reportante_idx on public.incidentes (reportante, creado_en);

-- ---------- Triggers de cuota ----------
-- tg_cuota_sesiones, tg_cuota_bloques, tg_cuota_pacientes y tg_auditoria_servidor están al final del archivo (TANDA 1).

create or replace function public.tg_cuota_incidentes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.es_admin() then return new; end if;
  if exists (select 1 from public.incidentes where id = new.id) then return new; end if;
  if (select count(*) from public.incidentes
      where reportante = new.reportante and creado_en > now() - interval '1 day') >= public.cuota('incidentes_por_dia') then
    raise exception 'Cuota de notificaciones de incidentes superada' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists cuota_incidentes on public.incidentes;
create trigger cuota_incidentes before insert on public.incidentes
  for each row execute function public.tg_cuota_incidentes();

revoke all on function public.tg_cuota_incidentes() from public, anon, authenticated;
revoke all on function public._agregar_check(regclass, text, text) from public, anon, authenticated;

-- ---------- Supresión de los datos propios: borrar_mis_datos() está al final del archivo ----------

-- ---------- Purga programada (SEC-32) ----------
-- Requiere la extensión pg_cron (Database → Extensions → pg_cron). Ejecutar UNA vez:
--   select cron.schedule('purga-ecg', '15 3 * * *', $select public.purgar_sesiones(365)$);  (ya incluido en migracion_endurecimiento.sql)
-- Para quitarla:  select cron.unschedule('purga-ecg');

-- ============================================================
-- DESPUÉS de ejecutar este script, para nombrar al administrador:
--   1) Authentication → Users → Add user (correo + contraseña fuerte, "Auto confirm").
--   2) Ejecuta (cambia el correo):
--        insert into public.administradores (user_id)
--        select id from auth.users where email = 'correo-del-admin@ejemplo.cl';
-- ============================================================

-- ---------- Endurecimiento según asesores de Supabase (aplicado 2026-10-15) ----------
alter function public.hora_servidor() set search_path = public;
alter function public._agregar_check(regclass, text, text) set search_path = public;
revoke execute on function public.hora_servidor() from anon;
create index if not exists parametros_actualizado_por_idx on public.parametros (actualizado_por);
-- Nota: en la base real las políticas RLS usan (select auth.uid()) para evaluarse una vez por consulta.

-- ============================================================
-- CUENTAS, PACIENTES Y VISIBILIDAD (migracion_cuentas_pacientes.sql, ya integrada aquí)
-- Nota: la lista blanca de auditoría está en la tabla tipos_evento (final del archivo).
-- ============================================================

-- ---------- Pacientes (seudónimos de cada cuenta) ----------
create table if not exists public.pacientes (
  id uuid primary key,
  propietario uuid not null default auth.uid() references auth.users (id) on delete cascade,
  etiqueta text not null check (char_length(etiqueta) between 1 and 30),
  alias text check (alias is null or alias ~ '^[A-Za-z0-9 _-]{1,20}$'),
  perfil jsonb,               -- solo con consentimiento vigente
  consentimiento jsonb,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (perfil is null or consentimiento is not null),
  check (perfil is null or pg_column_size(perfil) <= 1024),
  check (consentimiento is null or pg_column_size(consentimiento) <= 1024)
);
create index if not exists pacientes_propietario_idx on public.pacientes (propietario);
alter table public.pacientes enable row level security;

drop policy if exists "propietario lee pacientes" on public.pacientes;
create policy "propietario lee pacientes" on public.pacientes
  for select to authenticated using (propietario = (select auth.uid()));
drop policy if exists "propietario crea pacientes" on public.pacientes;
create policy "propietario crea pacientes" on public.pacientes
  for insert to authenticated with check (propietario = (select auth.uid()));
drop policy if exists "propietario edita pacientes" on public.pacientes;
create policy "propietario edita pacientes" on public.pacientes
  for update to authenticated using (propietario = (select auth.uid())) with check (propietario = (select auth.uid()));
drop policy if exists "propietario borra pacientes" on public.pacientes;
create policy "propietario borra pacientes" on public.pacientes
  for delete to authenticated using (propietario = (select auth.uid()));
revoke all on public.pacientes from anon;

-- ---------- Sesiones: paciente, visibilidad y consentimiento de perfil ----------
alter table public.sesiones add column if not exists paciente_id uuid references public.pacientes (id) on delete set null;
alter table public.sesiones add column if not exists visibilidad text not null default 'privado';
alter table public.sesiones add column if not exists compartir_perfil boolean not null default false;
select public._agregar_check('public.sesiones', 'sesiones_visibilidad_valida', 'visibilidad in (''privado'', ''publico'')');
select public._agregar_check('public.sesiones', 'sesiones_perfil_solo_publico', 'compartir_perfil = false or visibilidad = ''publico''');
create index if not exists sesiones_paciente_idx on public.sesiones (paciente_id);
create index if not exists sesiones_publicas_idx on public.sesiones (inicio desc) where visibilidad = 'publico';

-- Políticas de sesiones con (select auth.uid()) y SIN lectura pública directa de la tabla.
drop policy if exists "dueño inserta sesiones" on public.sesiones;
create policy "dueño inserta sesiones" on public.sesiones
  for insert to authenticated with check (propietario = (select auth.uid()));
drop policy if exists "dueño modifica sesiones" on public.sesiones;
create policy "dueño modifica sesiones" on public.sesiones
  for update to authenticated using (propietario = (select auth.uid())) with check (propietario = (select auth.uid()));

-- tg_sesion_paciente (paciente de la cuenta, privado no comparte perfil, retiros de moderación) está al final del archivo.

-- Al retirar el consentimiento / borrar el perfil se deja de compartir y se retira la copia del perfil.
create or replace function public.tg_paciente_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.perfil is null and old.perfil is not null then
    update public.sesiones
       set compartir_perfil = false, datos = datos - 'perfilCompartido'
     where paciente_id = new.id;
  end if;
  new.actualizado_en := now();
  return new;
end;
$$;
drop trigger if exists paciente_perfil on public.pacientes;
create trigger paciente_perfil before update on public.pacientes
  for each row execute function public.tg_paciente_perfil();
revoke all on function public.tg_paciente_perfil() from public, anon, authenticated;

-- ---------- Lectura pública controlada ----------
-- Solo por RPC (security definer, search_path fijo): listar_monitoreos_publicos, monitoreo_publico y senal_publica (al final del archivo).
-- No hay política SELECT pública sobre sesiones ni sobre bloques_muestras.
drop view if exists public.monitoreos_publicos;

-- ---------- Supresión: borrar_mis_datos() incluye pacientes (definición final al final del archivo) ----------

-- Eliminar la cuenta: borra todos los datos y el usuario de auth (cascada). Irreversible.
create or replace function public.eliminar_mi_cuenta()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Sin sesión' using errcode = '28000'; end if;
  perform public.borrar_mis_datos();
  delete from auth.users where id = uid;
end;
$$;
revoke all on function public.eliminar_mi_cuenta() from public, anon;
grant execute on function public.eliminar_mi_cuenta() to authenticated;

-- Cuota de pacientes por cuenta: tg_cuota_pacientes al final del archivo.

-- Recomendado en el panel (no es SQL): Authentication → Providers → Email habilitado, "Confirm email" activo,
-- longitud mínima de contraseña 10 y "Leaked password protection". Ver README.

-- ============================================================
-- TANDA 1 — ENDURECIMIENTO 2 (idéntico a supabase/migracion_endurecimiento_2.sql; C-04, C-05, C-06, C-08, C-09, C-11, C-21)
-- ============================================================
-- >>> CUERPO (schema.sql incluye este mismo cuerpo desde aquí hasta el final) >>>

-- ------------------------------------------------------------
-- 0. Cuotas (editar aquí y volver a ejecutar) y utilidades de identidad
-- ------------------------------------------------------------
create or replace function public.cuota(nombre text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case nombre
    when 'sesiones_por_dia'            then 50        -- sesiones nuevas por cuenta y día (reloj del servidor)
    when 'sesiones_por_cuenta'         then 1000      -- sesiones totales por cuenta
    when 'pacientes_por_cuenta'        then 200       -- pacientes por cuenta
    when 'bloques_por_minuto'          then 300       -- 5 canales x 30 bloques/min = 150; holgura x2 para reintentos
    when 'seq_max'                     then 5400      -- 5400 bloques x 2 s = 3 h por canal y sesión
    when 'bloque_bytes'                then 32768     -- tamaño máximo de un bloque (2000 muestras ~ 24 KB)
    when 'bytes_por_sesion'            then 26214400  -- 25 MB por sesión
    when 'bytes_por_cuenta'            then 52428800  -- 50 MB por cuenta (plan gratuito: 500 MB en total)
    when 'auditoria_por_hora'          then 200       -- eventos "cliente" por cuenta y hora
    when 'auditoria_seguridad_por_hora' then 200      -- eventos de seguridad (admin/servidor): cupo SEPARADO
    when 'incidentes_por_dia'          then 10        -- notificaciones por cuenta y día
    when 'reportes_por_dia'            then 5         -- reportes de contenido por cuenta y día
    when 'sesion_datos_bytes'          then 65536     -- tamaño máximo del JSON de una sesión
    when 'auditoria_detalle_bytes'     then 2048      -- tamaño máximo del detalle de auditoría
  end;
$$;
revoke all on function public.cuota(text) from public, anon, authenticated;

-- Cuenta real (no anónima): las RPC de lo público y de reportes la exigen (H-02).
create or replace function public.es_cuenta_registrada()
returns boolean
language sql
stable
set search_path = public
as $$
  select (select auth.uid()) is not null
         and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false;
$$;
revoke all on function public.es_cuenta_registrada() from public, anon;
grant execute on function public.es_cuenta_registrada() to authenticated;

-- ------------------------------------------------------------
-- 1. C-05 · El privilegio de administrador caduca en el servidor
--    Formato real de la claim amr de Supabase Auth (GoTrue): arreglo de objetos
--    [{"method":"totp","timestamp":1760000000},{"method":"password","timestamp":1759999000}]
--    "timestamp" = segundos Unix en que se completó ESE método. Al refrescar el token se conservan las entradas
--    originales (la marca NO se renueva), por eso sirve para medir la antigüedad del segundo factor.
--    [VERIFICAR en el proyecto real, ver supabase/pruebas_rls.sql, caso 0] que tras challengeAndVerify el JWT trae
--    una entrada 'totp' con marca reciente.
-- ------------------------------------------------------------
create or replace function public.totp_reciente(p_segundos integer default 900)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from jsonb_array_elements(
           case when jsonb_typeof((select auth.jwt()) -> 'amr') = 'array'
                then (select auth.jwt()) -> 'amr' else '[]'::jsonb end) a
    where jsonb_typeof(a) = 'object'
      and a ->> 'method' = 'totp'
      and (case when (a ->> 'timestamp') ~ '^[0-9]{1,12}$' then (a ->> 'timestamp')::bigint else 0 end)
          > extract(epoch from now())::bigint - greatest(coalesce(p_segundos, 900), 1)
      and (case when (a ->> 'timestamp') ~ '^[0-9]{1,12}$' then (a ->> 'timestamp')::bigint else 0 end)
          <= extract(epoch from now())::bigint + 60
  );
$$;
revoke all on function public.totp_reciente(integer) from public, anon;
grant execute on function public.totp_reciente(integer) to authenticated;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.administradores where user_id = (select auth.uid()))
         and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
         and public.totp_reciente(900);
$$;
revoke all on function public.es_admin() from public, anon;
grant execute on function public.es_admin() to authenticated;

-- Para acciones sensibles (leer contenido, retirar publicaciones, conceder roles): TOTP de los últimos p_segundos.
create or replace function public.es_admin_reciente(p_segundos integer default 300)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.administradores where user_id = (select auth.uid()))
         and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
         and public.totp_reciente(least(greatest(coalesce(p_segundos, 300), 30), 900));
$$;
revoke all on function public.es_admin_reciente(integer) from public, anon;
grant execute on function public.es_admin_reciente(integer) to authenticated;

-- Conceder / retirar el rol: ahora exigen TOTP de los últimos 5 min (la app pide un código nuevo justo antes).
create or replace function public.admin_conceder_rol(p_correo text)
returns table (user_id uuid, creado_en timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_correo text := lower(btrim(coalesce(p_correo, '')));
  v_objetivo uuid;
  v_yo uuid := (select auth.uid());
  v_creado timestamptz;
begin
  if not public.es_admin_reciente(300) then
    raise exception 'Privilegios insuficientes' using errcode = '42501';
  end if;
  if char_length(v_correo) = 0 or char_length(v_correo) > 254
     or v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'No se pudo conceder el rol' using errcode = 'P0001';
  end if;
  lock table public.administradores in share row exclusive mode;
  select u.id into v_objetivo
  from auth.users u
  where lower(u.email) = v_correo and u.email_confirmed_at is not null
  limit 1;
  if v_objetivo is null then
    raise exception 'No se pudo conceder el rol' using errcode = 'P0001';
  end if;
  if (select count(*) from public.administradores) >= 5
     and not exists (select 1 from public.administradores a where a.user_id = v_objetivo) then
    raise exception 'limite_administradores' using errcode = 'P0001';
  end if;
  insert into public.administradores (user_id) values (v_objetivo) on conflict (user_id) do nothing;
  select a.creado_en into v_creado from public.administradores a where a.user_id = v_objetivo;
  insert into public.auditoria (tipo, actor, detalle)
  values ('ADMIN_ROLE_GRANTED', 'admin', jsonb_build_object('objetivo', v_objetivo, 'por', v_yo));
  return query select v_objetivo, v_creado;
end;
$$;
revoke all on function public.admin_conceder_rol(text) from public, anon;
grant execute on function public.admin_conceder_rol(text) to authenticated;

create or replace function public.admin_retirar_rol(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := (select auth.uid());
  v_borradas int;
begin
  if not public.es_admin_reciente(300) then
    raise exception 'Privilegios insuficientes' using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = v_yo then
    raise exception 'no_puede_retirarse_a_si_mismo' using errcode = 'P0001';
  end if;
  lock table public.administradores in share row exclusive mode;
  if (select count(*) from public.administradores) <= 1 then
    raise exception 'minimo_un_administrador' using errcode = 'P0001';
  end if;
  delete from public.administradores a where a.user_id = p_user_id;
  get diagnostics v_borradas = row_count;
  if v_borradas = 0 then
    return false;
  end if;
  insert into public.auditoria (tipo, actor, detalle)
  values ('ADMIN_ROLE_REVOKED', 'admin', jsonb_build_object('objetivo', p_user_id, 'por', v_yo));
  return true;
end;
$$;
revoke all on function public.admin_retirar_rol(uuid) from public, anon;
grant execute on function public.admin_retirar_rol(uuid) to authenticated;

-- ------------------------------------------------------------
-- 2. C-08 · Auditoría de nube fiable: lista blanca ÚNICA en tipos_evento
--    origen: 'cliente'  = cualquier cuenta puede registrarlo con registrar_evento()
--            'admin'    = solo es_admin() (vía registrar_evento)
--            'servidor' = solo lo inserta una función del servidor (nadie desde el cliente)
--    Fuente de verdad en la app: AUDIT_EVENTS y EVENTOS_SOLO_SERVIDOR de src/services/audit/auditLog.js;
--    tests/schema.spec.js verifica que esta lista y la de la app coincidan.
-- ------------------------------------------------------------
create table if not exists public.tipos_evento (
  tipo text primary key check (char_length(tipo) <= 64),
  origen text not null check (origen in ('cliente', 'admin', 'servidor'))
);
alter table public.tipos_evento enable row level security;
revoke all on public.tipos_evento from anon, authenticated;

insert into public.tipos_evento (tipo, origen) values
  ('ADMIN_SETUP', 'cliente'), ('ADMIN_LOGIN_OK', 'cliente'), ('ADMIN_LOGIN_FAIL', 'cliente'), ('ADMIN_LOCKED', 'cliente'),
  ('ADMIN_LOGOUT', 'cliente'), ('ADMIN_SESSION_EXPIRED', 'cliente'), ('ADMIN_PIN_CHANGED', 'cliente'),
  ('PARAM_CHANGED', 'admin'), ('USER_CREATED', 'cliente'), ('CONSENT_GIVEN', 'cliente'), ('CONSENT_WITHDRAWN', 'cliente'),
  ('USER_DATA_DELETED', 'cliente'), ('ALL_DATA_WIPED', 'cliente'), ('CLOUD_ADMIN_LOGIN', 'cliente'), ('CLOUD_ADMIN_LOGOUT', 'cliente'),
  ('RETENTION_PURGE', 'cliente'), ('EXPORT_CSV', 'cliente'), ('SERIAL_CONNECTED', 'cliente'), ('SERIAL_DISCONNECTED', 'cliente'),
  ('SERIAL_LOST', 'cliente'), ('SERIAL_INVALID_DATA', 'cliente'), ('DEVICE_RESET', 'cliente'), ('INTEGRITY_ERROR', 'cliente'),
  ('AUDIT_EXPORTED', 'admin'), ('SESSION_STARTED', 'cliente'), ('SESSION_ENDED', 'cliente'), ('ALERT_TRIGGERED', 'cliente'),
  ('INCIDENT_REPORTED', 'cliente'), ('INCIDENT_UPDATED', 'servidor'), ('POLICY_ACCEPTED', 'admin'), ('ACCESS_REVIEW_DONE', 'admin'),
  ('CLOCK_SKEW', 'cliente'), ('ELECTRICAL_SAFETY_ACK', 'cliente'), ('CLOUD_DATA_DELETED', 'cliente'),
  ('USER_UPDATED', 'cliente'), ('SESSION_SAVED', 'cliente'), ('SESSION_UPDATED', 'cliente'), ('SESSION_DISCARDED', 'cliente'),
  ('SESSION_DELETED', 'cliente'), ('EXPORT_REPORT', 'cliente'),
  ('CAMERA_STARTED', 'cliente'), ('CAMERA_STOPPED', 'cliente'), ('CAMERA_DENIED', 'cliente'), ('TORCH_UNAVAILABLE', 'cliente'),
  ('ACCOUNT_REGISTERED', 'cliente'), ('ACCOUNT_LOGIN', 'cliente'), ('ACCOUNT_LOGOUT', 'cliente'), ('ACCOUNT_PASSWORD_RESET', 'cliente'),
  ('ACCOUNT_DELETED', 'cliente'), ('ACCOUNT_PASSWORD_CHANGED', 'cliente'),
  ('PATIENT_CREATED', 'cliente'), ('PATIENT_UPDATED', 'cliente'), ('PATIENT_DELETED', 'cliente'), ('VISIBILITY_CHANGED', 'cliente'),
  ('LOCAL_DATA_LINKED', 'cliente'),
  ('ADMIN_ACCOUNT_LOGIN', 'cliente'), ('ADMIN_MFA_ENROLLED', 'cliente'), ('ADMIN_MFA_VERIFIED', 'cliente'), ('ADMIN_MFA_FAILED', 'cliente'),
  ('ADMIN_ROLE_GRANTED', 'servidor'), ('ADMIN_ROLE_REVOKED', 'servidor'), ('ADMIN_RECOVERY_REQUESTED', 'cliente'),
  ('ADMIN_DATA_ACCESS', 'servidor'), ('CONTENT_REPORTED', 'servidor'), ('CONTENT_REMOVED', 'servidor'),
  ('CONTENT_REPORT_REVIEWED', 'servidor')
on conflict (tipo) do update set origen = excluded.origen;

-- La lista blanca ya no es un CHECK fijo (había tres copias que se desfasaban, H-18): la valida el trigger.
alter table public.auditoria drop constraint if exists auditoria_tipo_lista_blanca;
alter table public.auditoria add column if not exists n bigint;
alter table public.auditoria add column if not exists prev_hash text;
alter table public.auditoria add column if not exists hash text;
create unique index if not exists auditoria_n_idx on public.auditoria (n) where n is not null;
create index if not exists auditoria_ts_idx on public.auditoria (ts);

-- Hash de una fila (el usuario NO entra: ON DELETE SET NULL modifica esa columna al borrar una cuenta).
create or replace function public._hash_auditoria(p_n bigint, p_prev text, p_ts timestamptz, p_tipo text, p_actor text, p_detalle jsonb)
returns text
language sql
stable
set search_path = public
as $$
  select encode(sha256(convert_to(
    p_n::text || '|' || coalesce(p_prev, '') || '|' || to_char(p_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
    || '|' || p_tipo || '|' || p_actor || '|' || p_detalle::text, 'UTF8')), 'hex');
$$;
revoke all on function public._hash_auditoria(bigint, text, timestamptz, text, text, jsonb) from public, anon, authenticated;

-- El servidor fija hora, autor, cupo y hash encadenado (A.12.4.2, A.12.4.4, no repudio).
create or replace function public.tg_auditoria_servidor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origen text;
  v_uid uuid := (select auth.uid());
  v_cnt integer;
  v_n bigint;
  v_prev text;
begin
  select t.origen into v_origen from public.tipos_evento t where t.tipo = new.tipo;
  if v_origen is null then
    raise exception 'Operación no permitida' using errcode = '22023';
  end if;
  new.ts := now();
  new.usuario := v_uid;
  if v_uid is not null then
    if v_origen = 'cliente' then
      select count(*) into v_cnt from public.auditoria a join public.tipos_evento t on t.tipo = a.tipo
       where a.usuario = v_uid and a.ts > now() - interval '1 hour' and t.origen = 'cliente';
      if v_cnt >= public.cuota('auditoria_por_hora') then
        raise exception 'Cuota de auditoría superada' using errcode = 'P0001';
      end if;
    else
      select count(*) into v_cnt from public.auditoria a join public.tipos_evento t on t.tipo = a.tipo
       where a.usuario = v_uid and a.ts > now() - interval '1 hour' and t.origen <> 'cliente';
      if v_cnt >= public.cuota('auditoria_seguridad_por_hora') then
        raise exception 'Cuota de auditoría superada' using errcode = 'P0001';
      end if;
    end if;
  end if;
  perform pg_advisory_xact_lock(727001);          -- serializa la cadena global
  select a.n, a.hash into v_n, v_prev from public.auditoria a where a.n is not null order by a.n desc limit 1;
  new.n := coalesce(v_n, 0) + 1;
  new.prev_hash := coalesce(v_prev, repeat('0', 64));
  new.hash := public._hash_auditoria(new.n, new.prev_hash, new.ts, new.tipo, new.actor, new.detalle);
  return new;
end;
$$;
drop trigger if exists auditoria_servidor on public.auditoria;
create trigger auditoria_servidor before insert on public.auditoria
  for each row execute function public.tg_auditoria_servidor();
revoke all on function public.tg_auditoria_servidor() from public, anon, authenticated;

-- Nadie escribe en auditoria desde el cliente: solo registrar_evento() y las funciones del servidor.
drop policy if exists "autenticados registran auditoria" on public.auditoria;
revoke insert, update, delete, truncate on public.auditoria from anon, authenticated;
revoke all on public.auditoria from anon;
drop policy if exists "admin lee auditoria" on public.auditoria;
create policy "admin lee auditoria" on public.auditoria
  for select to authenticated using ((select public.es_admin()));

create or replace function public.registrar_evento(p_tipo text, p_detalle jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_origen text;
  v_detalle jsonb := coalesce(p_detalle, '{}'::jsonb);
begin
  if v_uid is null then
    raise exception 'Sin sesión' using errcode = '28000';
  end if;
  select t.origen into v_origen from public.tipos_evento t where t.tipo = p_tipo;
  if v_origen is null or v_origen = 'servidor' or (v_origen = 'admin' and not public.es_admin()) then
    raise exception 'Operación no permitida' using errcode = '42501';
  end if;
  if jsonb_typeof(v_detalle) is distinct from 'object' or pg_column_size(v_detalle) > public.cuota('auditoria_detalle_bytes') then
    raise exception 'Operación no permitida' using errcode = '22023';
  end if;
  -- El actor lo decide el servidor: 'admin' solo con privilegios efectivos (rol + aal2 + TOTP reciente).
  insert into public.auditoria (tipo, actor, detalle)
  values (p_tipo, case when public.es_admin() then 'admin' else 'participant' end, v_detalle);
end;
$$;
revoke all on function public.registrar_evento(text, jsonb) from public, anon;
grant execute on function public.registrar_evento(text, jsonb) to authenticated;

select public._agregar_check('public.auditoria', 'auditoria_detalle_tamano',
  'pg_column_size(detalle) <= 2048 and jsonb_typeof(detalle) = ''object''');

create or replace function public.admin_leer_auditoria(p_limite integer default 100, p_desde timestamptz default null, p_antes_de_id bigint default null)
returns table (id bigint, n bigint, ts timestamptz, usuario uuid, tipo text, actor text, detalle jsonb, hash text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.es_admin() then
    raise exception 'Privilegios insuficientes' using errcode = '42501';
  end if;
  return query
    select a.id, a.n, a.ts, a.usuario, a.tipo, a.actor, a.detalle, a.hash
    from public.auditoria a
    where (p_desde is null or a.ts >= p_desde)
      and (p_antes_de_id is null or a.id < p_antes_de_id)
    order by a.id desc
    limit least(greatest(coalesce(p_limite, 100), 1), 500);
end;
$$;
revoke all on function public.admin_leer_auditoria(integer, timestamptz, bigint) from public, anon;
grant execute on function public.admin_leer_auditoria(integer, timestamptz, bigint) to authenticated;

create or replace function public.verificar_cadena_auditoria()
returns table (ok boolean, filas bigint, roto_en bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  r record;
  v_prev text := null;
  v_count bigint := 0;
begin
  if not public.es_admin() then
    raise exception 'Privilegios insuficientes' using errcode = '42501';
  end if;
  for r in select a.n, a.ts, a.tipo, a.actor, a.detalle, a.prev_hash, a.hash
           from public.auditoria a where a.n is not null order by a.n loop
    v_count := v_count + 1;
    if (v_prev is not null and r.prev_hash is distinct from v_prev)
       or public._hash_auditoria(r.n, r.prev_hash, r.ts, r.tipo, r.actor, r.detalle) is distinct from r.hash then
      return query select false, v_count, r.n;
      return;
    end if;
    v_prev := r.hash;
  end loop;
  return query select true, v_count, null::bigint;
end;
$$;
revoke all on function public.verificar_cadena_auditoria() from public, anon;
grant execute on function public.verificar_cadena_auditoria() to authenticated;

-- Retención de la auditoría: 2 años (la cadena se verifica desde la primera fila que queda).
create or replace function public.purgar_auditoria(dias integer default 730)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  delete from public.auditoria where ts < now() - make_interval(days => greatest(dias, 30));
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.purgar_auditoria(integer) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. C-11 · Tiempo del servidor, cuotas y topes de almacenamiento
-- ------------------------------------------------------------
alter table public.sesiones add column if not exists creado_en timestamptz;
update public.sesiones set creado_en = least(inicio, now()) where creado_en is null;
alter table public.sesiones alter column creado_en set default now();
alter table public.sesiones alter column creado_en set not null;
alter table public.sesiones add column if not exists bytes_aprox bigint not null default 0;
create index if not exists sesiones_propietario_creado_idx on public.sesiones (propietario, creado_en);

-- Coherencia: el cliente no puede declarar un inicio muy anterior/posterior al momento real de la subida.
-- NOT VALID: no falla por filas antiguas; sí se aplica a toda fila nueva o modificada. Tolerancia de reloj: +15 min.
select public._agregar_check('public.sesiones', 'sesiones_inicio_coherente',
  'inicio between creado_en - interval ''1 day'' and creado_en + interval ''15 minutes''');

create or replace function public.tg_sesion_tiempo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creado timestamptz;
  v_inicio timestamptz;
  v_bytes bigint;
begin
  if tg_op = 'INSERT' then
    -- Si la fila ya existe (upsert), la tupla propuesta conserva su hora de creación e inicio: así la
    -- restricción de coherencia no rechaza la actualización de una sesión antigua.
    select s.creado_en, s.inicio, s.bytes_aprox into v_creado, v_inicio, v_bytes from public.sesiones s where s.id = new.id;
    if v_creado is not null then
      new.creado_en := v_creado;
      new.inicio := v_inicio;
      new.bytes_aprox := v_bytes;
    else
      new.creado_en := now();
      new.bytes_aprox := 0;
    end if;
    new.actualizado_en := now();
  else
    new.creado_en := old.creado_en;
    new.inicio := old.inicio;
    if pg_trigger_depth() = 1 then          -- UPDATE del cliente: no puede tocar el contador ni la hora
      new.actualizado_en := now();
      new.bytes_aprox := old.bytes_aprox;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists sesion_tiempo on public.sesiones;
create trigger sesion_tiempo before insert or update on public.sesiones
  for each row execute function public.tg_sesion_tiempo();
revoke all on function public.tg_sesion_tiempo() from public, anon, authenticated;

alter table public.bloques_muestras add column if not exists propietario uuid;
alter table public.bloques_muestras add column if not exists bytes integer;
create index if not exists bloques_propietario_creado_idx on public.bloques_muestras (propietario, creado_en);

create table if not exists public.uso_cuenta (
  user_id uuid primary key references auth.users (id) on delete cascade,
  bytes bigint not null default 0,
  bloques bigint not null default 0,
  actualizado_en timestamptz not null default now()
);
alter table public.uso_cuenta enable row level security;
revoke all on public.uso_cuenta from anon;
revoke insert, update, delete, truncate on public.uso_cuenta from authenticated;
drop policy if exists "dueño lee su uso" on public.uso_cuenta;
create policy "dueño lee su uso" on public.uso_cuenta
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public._bytes_bloque(p_t integer[], p_raw smallint[], p_lo smallint[], p_bpm real[])
returns integer
language sql
immutable
set search_path = public
as $$
  select (coalesce(pg_column_size(p_t), 0) + coalesce(pg_column_size(p_raw), 0)
          + coalesce(pg_column_size(p_lo), 0) + coalesce(pg_column_size(p_bpm), 0))::integer;
$$;
revoke all on function public._bytes_bloque(integer[], smallint[], smallint[], real[]) from public, anon, authenticated;

create or replace function public.tg_cuota_bloques()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dueno uuid;
  v_uso bigint;
  v_ses bigint;
begin
  select s.propietario into v_dueno from public.sesiones s where s.id = new.sesion_id;
  if v_dueno is null then
    raise exception 'Operación no permitida' using errcode = '42501';
  end if;
  new.creado_en := now();                         -- hora del servidor, no la del cliente
  new.propietario := v_dueno;
  new.bytes := public._bytes_bloque(new.t, new.ecg_raw, new.leads_off, new.bpm);
  if new.bytes > public.cuota('bloque_bytes') then
    raise exception 'Bloque demasiado grande' using errcode = 'ECG01';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_dueno::text, 1));   -- serializa la cuota de esta cuenta
  -- Las lecturas van DESPUÉS del bloqueo: ven los contadores confirmados por la transacción anterior.
  select s.bytes_aprox into v_ses from public.sesiones s where s.id = new.sesion_id;
  if (select count(*) from public.bloques_muestras b
      where b.propietario = v_dueno and b.creado_en > now() - interval '1 minute') >= public.cuota('bloques_por_minuto') then
    raise exception 'Cuota de bloques por minuto superada' using errcode = 'P0001';
  end if;
  select coalesce(u.bytes, 0) into v_uso from public.uso_cuenta u where u.user_id = v_dueno;
  if coalesce(v_uso, 0) + new.bytes > public.cuota('bytes_por_cuenta') then
    raise exception 'Límite de almacenamiento alcanzado' using errcode = 'ECG01';
  end if;
  if coalesce(v_ses, 0) + new.bytes > public.cuota('bytes_por_sesion') then
    raise exception 'Límite de almacenamiento alcanzado' using errcode = 'ECG01';
  end if;
  return new;
end;
$$;
drop trigger if exists cuota_bloques on public.bloques_muestras;
create trigger cuota_bloques before insert on public.bloques_muestras
  for each row execute function public.tg_cuota_bloques();
revoke all on function public.tg_cuota_bloques() from public, anon, authenticated;

-- Contadores: AFTER (solo filas realmente insertadas; un reintento con ON CONFLICT DO NOTHING no suma).
create or replace function public.tg_uso_bloques()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.uso_cuenta (user_id, bytes, bloques) values (new.propietario, coalesce(new.bytes, 0), 1)
    on conflict (user_id) do update
      set bytes = public.uso_cuenta.bytes + coalesce(new.bytes, 0), bloques = public.uso_cuenta.bloques + 1, actualizado_en = now();
    update public.sesiones set bytes_aprox = bytes_aprox + coalesce(new.bytes, 0) where id = new.sesion_id;
    return new;
  end if;
  if old.propietario is not null then
    update public.uso_cuenta
       set bytes = greatest(bytes - coalesce(old.bytes, 0), 0), bloques = greatest(bloques - 1, 0), actualizado_en = now()
     where user_id = old.propietario;
    update public.sesiones set bytes_aprox = greatest(bytes_aprox - coalesce(old.bytes, 0), 0) where id = old.sesion_id;
  end if;
  return old;
end;
$$;
drop trigger if exists uso_bloques_ins on public.bloques_muestras;
create trigger uso_bloques_ins after insert on public.bloques_muestras
  for each row execute function public.tg_uso_bloques();
drop trigger if exists uso_bloques_del on public.bloques_muestras;
create trigger uso_bloques_del after delete on public.bloques_muestras
  for each row execute function public.tg_uso_bloques();
revoke all on function public.tg_uso_bloques() from public, anon, authenticated;

-- Relleno de lo ya existente (idempotente: recalcula desde los bloques). El contador de sesiones se actualiza con
-- el trigger de tiempo desactivado un instante para que el UPDATE no sea tratado como del cliente.
update public.bloques_muestras b
   set propietario = s.propietario,
       bytes = public._bytes_bloque(b.t, b.ecg_raw, b.leads_off, b.bpm)
  from public.sesiones s
 where s.id = b.sesion_id and (b.propietario is null or b.bytes is null);

insert into public.uso_cuenta (user_id, bytes, bloques)
select b.propietario, sum(coalesce(b.bytes, 0)), count(*)
from public.bloques_muestras b where b.propietario is not null group by b.propietario
on conflict (user_id) do update set bytes = excluded.bytes, bloques = excluded.bloques, actualizado_en = now();

alter table public.sesiones disable trigger sesion_tiempo;
update public.sesiones s set bytes_aprox = x.b
  from (select sesion_id, sum(coalesce(bytes, 0)) as b from public.bloques_muestras group by sesion_id) x
 where s.id = x.sesion_id and s.bytes_aprox is distinct from x.b;
alter table public.sesiones enable trigger sesion_tiempo;

create or replace function public.tg_cuota_sesiones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Un upsert de una sesión existente no consume cuota.
  if exists (select 1 from public.sesiones where id = new.id) then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.propietario::text, 2));
  -- Cuenta por creado_en (reloj del servidor), no por el "inicio" que envía el cliente.
  if (select count(*) from public.sesiones
      where propietario = new.propietario and creado_en > now() - interval '1 day') >= public.cuota('sesiones_por_dia') then
    raise exception 'Cuota de sesiones diarias superada' using errcode = 'P0001';
  end if;
  if (select count(*) from public.sesiones where propietario = new.propietario) >= public.cuota('sesiones_por_cuenta') then
    raise exception 'Límite de almacenamiento alcanzado' using errcode = 'ECG01';
  end if;
  return new;
end;
$$;
drop trigger if exists cuota_sesiones on public.sesiones;
create trigger cuota_sesiones before insert on public.sesiones
  for each row execute function public.tg_cuota_sesiones();
revoke all on function public.tg_cuota_sesiones() from public, anon, authenticated;

create or replace function public.tg_cuota_pacientes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.propietario::text, 3));
  if (select count(*) from public.pacientes where propietario = new.propietario) >= public.cuota('pacientes_por_cuenta') then
    raise exception 'Límite de almacenamiento alcanzado' using errcode = 'ECG01';
  end if;
  return new;
end;
$$;
drop trigger if exists cuota_pacientes on public.pacientes;
create trigger cuota_pacientes before insert on public.pacientes
  for each row execute function public.tg_cuota_pacientes();
revoke all on function public.tg_cuota_pacientes() from public, anon, authenticated;

-- Retención por fecha de CREACIÓN en el servidor (365 días): un "inicio" falso ya no la elude.
create or replace function public.purgar_sesiones(dias integer default 365)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  delete from public.sesiones where creado_en < now() - make_interval(days => dias);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.purgar_sesiones(integer) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. C-06 · Mínimo privilegio: el administrador ya NO lee ni borra sesiones/bloques ajenos
-- ------------------------------------------------------------
drop policy if exists "dueño o admin lee sesiones" on public.sesiones;
drop policy if exists "dueño lee sesiones" on public.sesiones;
create policy "dueño lee sesiones" on public.sesiones
  for select to authenticated using (propietario = (select auth.uid()));

drop policy if exists "dueño o admin borra sesiones" on public.sesiones;
drop policy if exists "dueño borra sesiones" on public.sesiones;
create policy "dueño borra sesiones" on public.sesiones
  for delete to authenticated using (propietario = (select auth.uid()));

-- ------------------------------------------------------------
-- 5. C-04 · Lo "público": sin lectura directa de bloques
-- ------------------------------------------------------------
drop policy if exists "dueño o admin lee bloques" on public.bloques_muestras;
drop policy if exists "dueño, admin o público lee bloques" on public.bloques_muestras;
drop policy if exists "dueño lee bloques" on public.bloques_muestras;
create policy "dueño lee bloques" on public.bloques_muestras
  for select to authenticated using (
    exists (select 1 from public.sesiones s where s.id = sesion_id and s.propietario = (select auth.uid())));
drop function if exists public.sesion_es_publica(uuid);

-- Retiros de moderación: una sesión retirada por el admin no puede volver a 'publico' (la tabla no tiene acceso directo).
create table if not exists public.retiros_contenido (
  sesion_id uuid primary key references public.sesiones (id) on delete cascade,
  motivo text not null check (char_length(motivo) between 10 and 300),
  retirado_por uuid references auth.users (id) on delete set null,
  creado_en timestamptz not null default now()
);
alter table public.retiros_contenido enable row level security;
revoke all on public.retiros_contenido from anon, authenticated;

create or replace function public.tg_sesion_paciente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.paciente_id is not null and not exists (
    select 1 from public.pacientes p where p.id = new.paciente_id and p.propietario = new.propietario) then
    raise exception 'El paciente no pertenece a la cuenta' using errcode = '42501';
  end if;
  if new.visibilidad = 'publico' and exists (select 1 from public.retiros_contenido r where r.sesion_id = new.id) then
    raise exception 'Operación no permitida' using errcode = '42501';
  end if;
  if new.visibilidad = 'privado' then
    new.compartir_perfil := false;
    new.datos := new.datos - 'perfilCompartido';
  end if;
  return new;
end;
$$;
drop trigger if exists sesion_paciente on public.sesiones;
create trigger sesion_paciente before insert or update on public.sesiones
  for each row execute function public.tg_sesion_paciente();
revoke all on function public.tg_sesion_paciente() from public, anon, authenticated;

drop function if exists public.listar_monitoreos_publicos(integer, integer);
create function public.listar_monitoreos_publicos(p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid,
  inicio timestamptz,          -- TRUNCADO al día (UTC)
  duracion_s integer,          -- en lugar de la hora de fin
  actividad text,
  paciente text,
  participantes jsonb,
  perfil jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    date_trunc('day', s.inicio at time zone 'UTC') at time zone 'UTC',
    case when s.fin is not null then greatest(0, extract(epoch from (s.fin - s.inicio)))::integer end,
    s.datos ->> 'actividadPrincipal',
    'Paciente anónimo'::text,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'canalIndex', p -> 'canalIndex',
        'fs', p -> 'fs',
        'actividad', p -> 'actividad',
        'resumen', p -> 'resumen'))
      from jsonb_array_elements(case when jsonb_typeof(s.datos -> 'participantes') = 'array'
                                     then s.datos -> 'participantes' else '[]'::jsonb end) p
    ), '[]'::jsonb),
    case when s.compartir_perfil then s.datos -> 'perfilCompartido' else null end
  from public.sesiones s
  where s.visibilidad = 'publico' and s.estado = 'finalizada'
    and public.es_cuenta_registrada()
  order by s.inicio desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.listar_monitoreos_publicos(integer, integer) from public, anon;
grant execute on function public.listar_monitoreos_publicos(integer, integer) to authenticated;

drop function if exists public.monitoreo_publico(uuid);
create function public.monitoreo_publico(p_id uuid)
returns table (
  id uuid,
  inicio timestamptz,
  duracion_s integer,
  actividad text,
  paciente text,
  participantes jsonb,
  perfil jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    date_trunc('day', s.inicio at time zone 'UTC') at time zone 'UTC',
    case when s.fin is not null then greatest(0, extract(epoch from (s.fin - s.inicio)))::integer end,
    s.datos ->> 'actividadPrincipal',
    'Paciente anónimo'::text,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'canalIndex', p -> 'canalIndex',
        'fs', p -> 'fs',
        'actividad', p -> 'actividad',
        'resumen', p -> 'resumen'))
      from jsonb_array_elements(case when jsonb_typeof(s.datos -> 'participantes') = 'array'
                                     then s.datos -> 'participantes' else '[]'::jsonb end) p
    ), '[]'::jsonb),
    case when s.compartir_perfil then s.datos -> 'perfilCompartido' else null end
  from public.sesiones s
  where s.id = p_id and s.visibilidad = 'publico' and s.estado = 'finalizada'
    and public.es_cuenta_registrada();
$$;
revoke all on function public.monitoreo_publico(uuid) from public, anon;
grant execute on function public.monitoreo_publico(uuid) to authenticated;

-- Señal de un canal de un monitoreo PÚBLICO: máx. 60 bloques por llamada, sin ids de propietario ni de paciente.
create or replace function public.senal_publica(p_sesion uuid, p_canal smallint default 0, p_desde integer default 0, p_limite integer default 60)
returns table (seq integer, t integer[], ecg_raw smallint[], leads_off smallint[], bpm real[])
language sql
stable
security definer
set search_path = public
as $$
  select b.seq, b.t, b.ecg_raw, b.leads_off, b.bpm
  from public.bloques_muestras b
  where public.es_cuenta_registrada()
    and b.sesion_id = p_sesion
    and b.canal = coalesce(p_canal, 0)
    and b.seq >= greatest(coalesce(p_desde, 0), 0)
    and exists (select 1 from public.sesiones s
                where s.id = b.sesion_id and s.visibilidad = 'publico' and s.estado = 'finalizada')
  order by b.seq
  limit least(greatest(coalesce(p_limite, 60), 1), 60);
$$;
revoke all on function public.senal_publica(uuid, smallint, integer, integer) from public, anon;
grant execute on function public.senal_publica(uuid, smallint, integer, integer) to authenticated;

-- Reportes de contenido público (moderación). Sin acceso directo: solo por RPC.
create table if not exists public.reportes_contenido (
  id uuid primary key default gen_random_uuid(),
  sesion_id uuid not null references public.sesiones (id) on delete cascade,
  reportante uuid default auth.uid() references auth.users (id) on delete set null,
  motivo text not null check (char_length(motivo) between 3 and 200),
  estado text not null default 'abierto' check (estado in ('abierto', 'revisado', 'retirado', 'descartado')),
  creado_en timestamptz not null default now(),
  resuelto_en timestamptz,
  resuelto_por uuid references auth.users (id) on delete set null
);
create unique index if not exists reportes_unico_idx on public.reportes_contenido (sesion_id, reportante) where reportante is not null;
create index if not exists reportes_estado_idx on public.reportes_contenido (estado, creado_en);
create index if not exists reportes_reportante_idx on public.reportes_contenido (reportante, creado_en);
alter table public.reportes_contenido enable row level security;
revoke all on public.reportes_contenido from anon, authenticated;

create or replace function public.reportar_monitoreo(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if not public.es_cuenta_registrada() then
    raise exception 'Operación no permitida' using errcode = '42501';
  end if;
  if p_id is null or char_length(v_motivo) not between 3 and 200 then
    raise exception 'Operación no permitida' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 4));
  if (select count(*) from public.reportes_contenido r
      where r.reportante = v_uid and r.creado_en > now() - interval '1 day') >= public.cuota('reportes_por_dia') then
    raise exception 'Cuota de reportes superada' using errcode = 'P0001';
  end if;
  -- Mismo mensaje exista o no la sesión (o no sea pública): no permite explorar identificadores.
  if not exists (select 1 from public.sesiones s where s.id = p_id and s.visibilidad = 'publico' and s.estado = 'finalizada') then
    raise exception 'Operación no permitida' using errcode = '42501';
  end if;
  insert into public.reportes_contenido (sesion_id, reportante, motivo) values (p_id, v_uid, v_motivo)
  on conflict (sesion_id, reportante) where reportante is not null do nothing;
  insert into public.auditoria (tipo, actor, detalle)
  values ('CONTENT_REPORTED', 'participant', jsonb_build_object('sesion', p_id));
end;
$$;
revoke all on function public.reportar_monitoreo(uuid, text) from public, anon;
grant execute on function public.reportar_monitoreo(uuid, text) to authenticated;

create or replace function public.admin_listar_reportes(p_estado text default 'abierto', p_limite integer default 100)
returns table (id uuid, sesion_id uuid, motivo text, estado text, creado_en timestamptz, es_publico boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.es_admin() then
    raise exception 'Privilegios insuficientes' using errcode = '42501';
  end if;
  return query
    select r.id, r.sesion_id, r.motivo, r.estado, r.creado_en,
           coalesce((select s.visibilidad = 'publico' from public.sesiones s where s.id = r.sesion_id), false)
    from public.reportes_contenido r
    where p_estado is null or r.estado = p_estado
    order by r.creado_en desc
    limit least(greatest(coalesce(p_limite, 100), 1), 200);
end;
$$;
revoke all on function public.admin_listar_reportes(text, integer) from public, anon;
grant execute on function public.admin_listar_reportes(text, integer) to authenticated;

create or replace function public.admin_retirar_publicacion(p_id uuid, p_motivo text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_uid uuid := (select auth.uid());
  v_n integer;
begin
  if not public.es_admin_reciente(300) then
    raise exception 'Privilegios insuficientes' using errcode = '42501';
  end if;
  if p_id is null or char_length(v_motivo) not between 10 and 300 then
    raise exception 'Operación no permitida' using errcode = '22023';
  end if;
  if not exists (select 1 from public.sesiones where id = p_id) then
    return false;
  end if;
  insert into public.retiros_contenido (sesion_id, motivo, retirado_por) values (p_id, v_motivo, v_uid)
  on conflict (sesion_id) do update set motivo = excluded.motivo, retirado_por = excluded.retirado_por, creado_en = now();
  update public.sesiones set visibilidad = 'privado' where id = p_id;     -- el trigger limpia compartir_perfil/perfil
  update public.reportes_contenido set estado = 'retirado', resuelto_en = now(), resuelto_por = v_uid
   where sesion_id = p_id and estado in ('abierto', 'revisado');
  get diagnostics v_n = row_count;
  insert into public.auditoria (tipo, actor, detalle)
  values ('CONTENT_REMOVED', 'admin', jsonb_build_object('sesion', p_id, 'motivo', v_motivo, 'reportes', v_n));
  return true;
end;
$$;
revoke all on function public.admin_retirar_publicacion(uuid, text) from public, anon;
grant execute on function public.admin_retirar_publicacion(uuid, text) to authenticated;

create or replace function public.admin_resolver_reporte(p_id uuid, p_estado text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if not public.es_admin() then
    raise exception 'Privilegios insuficientes' using errcode = '42501';
  end if;
  if p_id is null or p_estado not in ('revisado', 'descartado') then
    raise exception 'Operación no permitida' using errcode = '22023';
  end if;
  update public.reportes_contenido set estado = p_estado, resuelto_en = now(), resuelto_por = (select auth.uid())
   where id = p_id and estado = 'abierto';
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into public.auditoria (tipo, actor, detalle)
    values ('CONTENT_REPORT_REVIEWED', 'admin', jsonb_build_object('reporte', p_id, 'estado', p_estado));
  end if;
  return v_n > 0;
end;
$$;
revoke all on function public.admin_resolver_reporte(uuid, text) from public, anon;
grant execute on function public.admin_resolver_reporte(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 6. C-06 · Acceso excepcional del administrador: con motivo, registrado y VISIBLE para el titular
-- ------------------------------------------------------------
create table if not exists public.accesos_admin (
  id uuid primary key default gen_random_uuid(),
  sesion_id uuid not null references public.sesiones (id) on delete cascade,
  propietario uuid not null references auth.users (id) on delete cascade,
  admin_id uuid references auth.users (id) on delete set null,
  motivo text not null check (char_length(motivo) between 10 and 300),
  creado_en timestamptz not null default now()
);
create index if not exists accesos_admin_propietario_idx on public.accesos_admin (propietario, creado_en);
create index if not exists accesos_admin_sesion_idx on public.accesos_admin (sesion_id);
alter table public.accesos_admin enable row level security;
revoke all on public.accesos_admin from anon, authenticated;

create or replace function public.admin_leer_sesion(p_id uuid, p_motivo text)
returns table (id uuid, estado text, visibilidad text, inicio timestamptz, fin timestamptz, datos jsonb)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_dueno uuid;
begin
  if not public.es_admin_reciente(300) then
    raise exception 'Privilegios insuficientes' using errcode = '42501';
  end if;
  if p_id is null or char_length(v_motivo) not between 10 and 300 then
    raise exception 'Operación no permitida' using errcode = '22023';
  end if;
  -- Primero se registra (también el intento sobre una sesión inexistente); después se entrega SOLO "datos", sin señal.
  insert into public.auditoria (tipo, actor, detalle)
  values ('ADMIN_DATA_ACCESS', 'admin', jsonb_build_object('sesion', p_id, 'motivo', v_motivo));
  select s.propietario into v_dueno from public.sesiones s where s.id = p_id;
  if v_dueno is null then
    return;
  end if;
  insert into public.accesos_admin (sesion_id, propietario, admin_id, motivo)
  values (p_id, v_dueno, (select auth.uid()), v_motivo);
  return query
    select s.id, s.estado, s.visibilidad, s.inicio, s.fin, s.datos from public.sesiones s where s.id = p_id;
end;
$$;
revoke all on function public.admin_leer_sesion(uuid, text) from public, anon;
grant execute on function public.admin_leer_sesion(uuid, text) to authenticated;

-- El titular ve cuándo y por qué se leyó contenido suyo (no se revela la identidad del administrador).
create or replace function public.mis_accesos_admin(p_limite integer default 50)
returns table (sesion_id uuid, motivo text, creado_en timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.sesion_id, a.motivo, a.creado_en
  from public.accesos_admin a
  where a.propietario = (select auth.uid())
  order by a.creado_en desc
  limit least(greatest(coalesce(p_limite, 50), 1), 200);
$$;
revoke all on function public.mis_accesos_admin(integer) from public, anon;
grant execute on function public.mis_accesos_admin(integer) to authenticated;

-- ------------------------------------------------------------
-- 7. C-09 · Incidentes de extremo a extremo
-- ------------------------------------------------------------
drop policy if exists "autenticados notifican incidentes" on public.incidentes;
create policy "autenticados notifican incidentes" on public.incidentes
  for insert to authenticated with check (
    (reportante = (select auth.uid()) and estado = 'abierto' and respuesta is null and leccion is null)
    or (select public.es_admin())
  );
drop policy if exists "reportante o admin lee incidentes" on public.incidentes;
create policy "reportante o admin lee incidentes" on public.incidentes
  for select to authenticated using (reportante = (select auth.uid()) or (select public.es_admin()));
drop policy if exists "admin gestiona incidentes" on public.incidentes;
create policy "admin gestiona incidentes" on public.incidentes
  for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
-- Sin política DELETE: los incidentes se conservan como evidencia (A.16.1.7). borrar_mis_datos() los elimina por función.

-- Hora del servidor, reportante fijo y filtro de datos personales / de salud (igual que el cliente).
create or replace function public.tg_incidentes_servidor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_texto text;
begin
  if tg_op = 'INSERT' then
    new.creado_en := now();
    new.actualizado_en := now();
    if not public.es_admin() then
      new.reportado_por := 'participant';
      new.reportante := (select auth.uid());
    end if;
  else
    new.creado_en := old.creado_en;
    new.reportante := old.reportante;
    new.actualizado_en := now();
  end if;
  v_texto := coalesce(new.descripcion, '') || ' ' || coalesce(new.respuesta, '') || ' ' || coalesce(new.leccion, '');
  if v_texto ~ '[0-9]{1,2}\.?[0-9]{3}\.?[0-9]{3}-[0-9kK]'
     or v_texto ~ '[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}'
     or v_texto ~* '(^|[^0-9])[0-9]{2,3} ?(bpm|lpm|kg)([^a-z]|$)' then
    raise exception 'Operación no permitida' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists incidentes_servidor on public.incidentes;
create trigger incidentes_servidor before insert or update on public.incidentes
  for each row execute function public.tg_incidentes_servidor();
revoke all on function public.tg_incidentes_servidor() from public, anon, authenticated;

-- Ciclo abrir -> en_analisis -> cerrado/descartado, validado y registrado en el servidor.
create or replace function public.admin_actualizar_incidente(p_id uuid, p_estado text, p_respuesta text default null, p_leccion text default null)
returns table (id uuid, estado text, respuesta text, leccion text, actualizado_en timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_actual text;
  v_resp text;
  v_lec text;
begin
  if not public.es_admin() then
    raise exception 'Privilegios insuficientes' using errcode = '42501';
  end if;
  select i.estado, coalesce(nullif(btrim(p_respuesta), ''), i.respuesta), coalesce(nullif(btrim(p_leccion), ''), i.leccion)
    into v_actual, v_resp, v_lec
    from public.incidentes i where i.id = p_id;
  if v_actual is null then
    raise exception 'Operación no permitida' using errcode = '22023';
  end if;
  if not ((v_actual = 'abierto' and p_estado in ('en_analisis', 'descartado'))
       or (v_actual = 'en_analisis' and p_estado in ('cerrado', 'descartado'))) then
    raise exception 'Operación no permitida' using errcode = '22023';
  end if;
  if p_estado = 'cerrado' and (coalesce(v_resp, '') = '' or coalesce(v_lec, '') = '') then
    raise exception 'Operación no permitida' using errcode = '22023';
  end if;
  update public.incidentes i set estado = p_estado, respuesta = left(v_resp, 500), leccion = left(v_lec, 500) where i.id = p_id;
  insert into public.auditoria (tipo, actor, detalle)
  values ('INCIDENT_UPDATED', 'admin', jsonb_build_object('id', p_id, 'estado', p_estado));
  return query select i.id, i.estado, i.respuesta, i.leccion, i.actualizado_en from public.incidentes i where i.id = p_id;
end;
$$;
revoke all on function public.admin_actualizar_incidente(uuid, text, text, text) from public, anon;
grant execute on function public.admin_actualizar_incidente(uuid, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 8. C-21 · Etiquetas de paciente únicas por cuenta
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.pacientes group by propietario, etiqueta having count(*) > 1) then
    raise notice 'Hay pacientes con etiqueta duplicada en una misma cuenta: renómbralos y vuelve a ejecutar para crear pacientes_etiqueta_unica. Consulta: select propietario, etiqueta, count(*) from public.pacientes group by 1, 2 having count(*) > 1;';
  else
    create unique index if not exists pacientes_etiqueta_unica on public.pacientes (propietario, etiqueta);
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 9. Borrado de datos propios: incluye lo nuevo (reportes hechos por la cuenta; los accesos del admin se conservan hasta borrar la sesión)
-- ------------------------------------------------------------
create or replace function public.borrar_mis_datos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare ns integer; ni integer; np integer; uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Sin sesión' using errcode = '28000'; end if;
  delete from public.sesiones where propietario = uid;
  get diagnostics ns = row_count;
  delete from public.pacientes where propietario = uid;
  get diagnostics np = row_count;
  delete from public.incidentes where reportante = uid;
  get diagnostics ni = row_count;
  delete from public.reportes_contenido where reportante = uid;
  delete from public.uso_cuenta where user_id = uid;
  return jsonb_build_object('sesiones', ns, 'incidentes', ni, 'pacientes', np);
end;
$$;
revoke all on function public.borrar_mis_datos() from public, anon;
grant execute on function public.borrar_mis_datos() to authenticated;

-- ------------------------------------------------------------
-- 10. Tareas programadas (pg_cron): auditoría 2 años (la purga de sesiones 'purga-ecg' ya existe y ahora usa creado_en)
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'purga-auditoria') then
      perform cron.unschedule('purga-auditoria');
    end if;
    perform cron.schedule('purga-auditoria', '25 3 * * *', 'select public.purgar_auditoria(730)');
  else
    raise notice 'pg_cron no está habilitada: activa la extensión y vuelve a ejecutar para programar la purga de auditoría.';
  end if;
end;
$$;

-- Verificación rápida tras aplicar (solo lectura):
--   select jobname, schedule, active from cron.job;
--   select tipo, origen from public.tipos_evento order by 1;
--   select has_table_privilege('authenticated', 'public.auditoria', 'insert');   -- debe dar false
-- <<< FIN DEL CUERPO <<<
