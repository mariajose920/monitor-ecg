-- ============================================================
-- Monitor ECG — Esquema Supabase (PostgreSQL)
-- Ejecutar completo en: Supabase → SQL Editor → New query → Run
-- Es idempotente: se puede volver a ejecutar sin perder datos.
--
-- ISO/IEC 27001:2013 (UNE-EN ISO/IEC 27001:2017), Anexo A
--   A.9.1.1 / A.9.4.1   Política de control de acceso / restricción del acceso → RLS en TODAS las tablas
--   A.9.2.3             Gestión de privilegios → admin solo vía la tabla public.administradores
--   A.9.4.2             Inicio de sesión seguro → admin con Supabase Auth (email + contraseña)
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

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.administradores where user_id = auth.uid());
$$;
revoke all on function public.es_admin() from public;
grant execute on function public.es_admin() to authenticated;

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

drop policy if exists "dueño o admin lee sesiones" on public.sesiones;
create policy "dueño o admin lee sesiones" on public.sesiones
  for select to authenticated using (propietario = auth.uid() or public.es_admin());

drop policy if exists "dueño inserta sesiones" on public.sesiones;
create policy "dueño inserta sesiones" on public.sesiones
  for insert to authenticated with check (propietario = auth.uid());

drop policy if exists "dueño modifica sesiones" on public.sesiones;
create policy "dueño modifica sesiones" on public.sesiones
  for update to authenticated using (propietario = auth.uid()) with check (propietario = auth.uid());

drop policy if exists "dueño o admin borra sesiones" on public.sesiones;
create policy "dueño o admin borra sesiones" on public.sesiones
  for delete to authenticated using (propietario = auth.uid() or public.es_admin());

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

drop policy if exists "dueño o admin lee bloques" on public.bloques_muestras;
create policy "dueño o admin lee bloques" on public.bloques_muestras
  for select to authenticated using (
    exists (select 1 from public.sesiones s
            where s.id = sesion_id and (s.propietario = auth.uid() or public.es_admin()))
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

drop policy if exists "autenticados registran auditoria" on public.auditoria;
create policy "autenticados registran auditoria" on public.auditoria
  for insert to authenticated with check (usuario = auth.uid());

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

-- ---------- Retención (SEC-32): borrar sesiones con más de N días ----------
-- Ejecutar manualmente o programar con pg_cron:  select public.purgar_sesiones(30);
create or replace function public.purgar_sesiones(dias integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  delete from public.sesiones where inicio < now() - make_interval(days => dias);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.purgar_sesiones(integer) from public, anon, authenticated;

-- ============================================================
-- Límites, cuotas e integridad (SUG-04 / SUG-05 / SUG-14)
--   A.12.1.3 Gestión de capacidades → cuotas por usuario frente al llenado del plan gratuito (500 MB)
--   A.13.1.1 / A.9.4.2 → mitigación del abuso de sesiones anónimas (junto a CAPTCHA y rate limit de Auth)
--   A.12.4.2 Protección del registro → lista blanca de tipos, tamaño acotado, ts/usuario fijados por el servidor
-- Compatibles con el flujo de la app: bloques de 500 muestras (~2 s) por canal, hasta 5 canales.
-- Las restricciones nuevas se agregan NOT VALID: no fallan por filas antiguas, pero sí se aplican a las nuevas.
-- ============================================================

-- Parámetros de cuota (editar aquí y volver a ejecutar el script).
create or replace function public.cuota(nombre text)
returns integer
language sql
immutable
as $$
  select case nombre
    when 'sesiones_por_dia'       then 50     -- sesiones nuevas por usuario y día
    when 'bloques_por_minuto'     then 300    -- 5 canales × 30 bloques/min = 150; holgura ×2 para reintentos
    when 'seq_max'                then 5400   -- 5400 bloques × 2 s = 3 h por canal y sesión
    when 'auditoria_por_hora'     then 200    -- eventos de auditoría por usuario y hora
    when 'incidentes_por_dia'     then 10     -- notificaciones por usuario y día
    when 'sesion_datos_bytes'     then 65536  -- tamaño máximo del JSON de una sesión
    when 'auditoria_detalle_bytes' then 2048  -- tamaño máximo del detalle de auditoría
  end;
$$;

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

-- Auditoría: lista blanca de tipos (= AUDIT_EVENTS de src/services/audit/auditLog.js) y detalle acotado.
-- Si se agrega un evento en la app, agregarlo aquí (la prueba tests/schema.spec.js lo verifica).
alter table public.auditoria drop constraint if exists auditoria_tipo_lista_blanca;
alter table public.auditoria add constraint auditoria_tipo_lista_blanca check (tipo in (
  'ADMIN_SETUP', 'ADMIN_LOGIN_OK', 'ADMIN_LOGIN_FAIL', 'ADMIN_LOCKED', 'ADMIN_LOGOUT', 'ADMIN_SESSION_EXPIRED',
  'ADMIN_PIN_CHANGED', 'PARAM_CHANGED', 'USER_CREATED', 'CONSENT_GIVEN', 'CONSENT_WITHDRAWN', 'USER_DATA_DELETED',
  'ALL_DATA_WIPED', 'CLOUD_ADMIN_LOGIN', 'CLOUD_ADMIN_LOGOUT', 'RETENTION_PURGE', 'EXPORT_CSV', 'SERIAL_CONNECTED',
  'SERIAL_DISCONNECTED', 'SERIAL_LOST', 'SERIAL_INVALID_DATA', 'DEVICE_RESET', 'INTEGRITY_ERROR', 'AUDIT_EXPORTED',
  'SESSION_STARTED', 'SESSION_ENDED', 'ALERT_TRIGGERED',
  'INCIDENT_REPORTED', 'INCIDENT_UPDATED', 'POLICY_ACCEPTED', 'ACCESS_REVIEW_DONE', 'CLOCK_SKEW',
  'ELECTRICAL_SAFETY_ACK', 'CLOUD_DATA_DELETED',
  'USER_UPDATED', 'SESSION_SAVED', 'SESSION_UPDATED', 'SESSION_DISCARDED', 'SESSION_DELETED', 'EXPORT_REPORT',
  'CAMERA_STARTED', 'CAMERA_STOPPED', 'CAMERA_DENIED', 'TORCH_UNAVAILABLE',
  'ACCOUNT_REGISTERED', 'ACCOUNT_LOGIN', 'ACCOUNT_LOGOUT', 'ACCOUNT_PASSWORD_RESET', 'ACCOUNT_DELETED',
  'PATIENT_CREATED', 'PATIENT_UPDATED', 'PATIENT_DELETED', 'VISIBILITY_CHANGED', 'LOCAL_DATA_LINKED'
)) not valid;
select public._agregar_check('public.auditoria', 'auditoria_detalle_tamano',
  'pg_column_size(detalle) <= 2048 and jsonb_typeof(detalle) = ''object''');

create index if not exists auditoria_usuario_ts_idx on public.auditoria (usuario, ts);
create index if not exists bloques_creado_idx on public.bloques_muestras (creado_en);
create index if not exists incidentes_reportante_idx on public.incidentes (reportante, creado_en);

-- ---------- Triggers de cuota (security definer: cuentan aunque RLS oculte filas) ----------
create or replace function public.tg_cuota_sesiones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Un upsert de una sesión existente no consume cuota.
  if exists (select 1 from public.sesiones where id = new.id) then return new; end if;
  if (select count(*) from public.sesiones
      where propietario = new.propietario and inicio > now() - interval '1 day') >= public.cuota('sesiones_por_dia') then
    raise exception 'Cuota de sesiones diarias superada' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists cuota_sesiones on public.sesiones;
create trigger cuota_sesiones before insert on public.sesiones
  for each row execute function public.tg_cuota_sesiones();

create or replace function public.tg_cuota_bloques()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare dueno uuid;
begin
  select propietario into dueno from public.sesiones where id = new.sesion_id;
  if (select count(*) from public.bloques_muestras b join public.sesiones s on s.id = b.sesion_id
      where s.propietario = dueno and b.creado_en > now() - interval '1 minute') >= public.cuota('bloques_por_minuto') then
    raise exception 'Cuota de bloques por minuto superada' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists cuota_bloques on public.bloques_muestras;
create trigger cuota_bloques before insert on public.bloques_muestras
  for each row execute function public.tg_cuota_bloques();

-- Auditoría: el servidor fija hora y autor (A.12.4.4, no repudio) y limita la tasa.
create or replace function public.tg_auditoria_servidor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.ts := now();
  new.usuario := auth.uid();
  if (select count(*) from public.auditoria
      where usuario = new.usuario and ts > now() - interval '1 hour') >= public.cuota('auditoria_por_hora') then
    raise exception 'Cuota de auditoría superada' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists auditoria_servidor on public.auditoria;
create trigger auditoria_servidor before insert on public.auditoria
  for each row execute function public.tg_auditoria_servidor();

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

revoke all on function public.tg_cuota_sesiones() from public, anon, authenticated;
revoke all on function public.tg_cuota_bloques() from public, anon, authenticated;
revoke all on function public.tg_auditoria_servidor() from public, anon, authenticated;
revoke all on function public.tg_cuota_incidentes() from public, anon, authenticated;
revoke all on function public._agregar_check(regclass, text, text) from public, anon, authenticated;

-- ---------- Supresión de los datos propios (SUG-06, A.18.1.4) ----------
-- Borra las sesiones (bloques en cascada) e incidentes del usuario que llama. Nunca los de otros.
create or replace function public.borrar_mis_datos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare ns integer; ni integer; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sin sesión' using errcode = '28000'; end if;
  delete from public.sesiones where propietario = uid;
  get diagnostics ns = row_count;
  delete from public.incidentes where reportante = uid;
  get diagnostics ni = row_count;
  return jsonb_build_object('sesiones', ns, 'incidentes', ni);
end;
$$;
revoke all on function public.borrar_mis_datos() from public, anon;
grant execute on function public.borrar_mis_datos() to authenticated;

-- ---------- Purga programada (SEC-32) ----------
-- Requiere la extensión pg_cron (Database → Extensions → pg_cron). Ejecutar UNA vez:
--   select cron.schedule('purga-ecg', '15 3 * * *', $$select public.purgar_sesiones(30)$$);
-- Para quitarla:  select cron.unschedule('purga-ecg');

-- ============================================================
-- DESPUÉS de ejecutar este script, para nombrar al administrador:
--   1) Authentication → Users → Add user (correo + contraseña fuerte, "Auto confirm").
--   2) Ejecuta (cambia el correo):
--        insert into public.administradores (user_id)
--        select id from auth.users where email = 'correo-del-admin@ejemplo.cl';
-- ============================================================

-- ---------- Endurecimiento según asesores de Supabase (aplicado 2026-10-15) ----------
alter function public.cuota(text) set search_path = public;
alter function public.hora_servidor() set search_path = public;
alter function public._agregar_check(regclass, text, text) set search_path = public;
revoke execute on function public.es_admin() from anon;
revoke execute on function public.borrar_mis_datos() from anon;
revoke execute on function public.hora_servidor() from anon;
create index if not exists parametros_actualizado_por_idx on public.parametros (actualizado_por);
-- Nota: en la base real las políticas RLS usan (select auth.uid()) para evaluarse una vez por consulta.

-- ============================================================
-- CUENTAS, PACIENTES Y VISIBILIDAD (migracion_cuentas_pacientes.sql, ya integrada aquí)
-- Nota: la lista blanca de auditoría ampliada está más arriba (auditoria_tipo_lista_blanca).
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
drop policy if exists "dueño o admin lee sesiones" on public.sesiones;
create policy "dueño o admin lee sesiones" on public.sesiones
  for select to authenticated using (propietario = (select auth.uid()) or public.es_admin());
drop policy if exists "dueño inserta sesiones" on public.sesiones;
create policy "dueño inserta sesiones" on public.sesiones
  for insert to authenticated with check (propietario = (select auth.uid()));
drop policy if exists "dueño modifica sesiones" on public.sesiones;
create policy "dueño modifica sesiones" on public.sesiones
  for update to authenticated using (propietario = (select auth.uid())) with check (propietario = (select auth.uid()));

-- El paciente referenciado debe pertenecer al propietario de la sesión; privado nunca comparte perfil.
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
create or replace function public.sesion_es_publica(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.sesiones where id = sid and visibilidad = 'publico');
$$;
revoke all on function public.sesion_es_publica(uuid) from public, anon;
grant execute on function public.sesion_es_publica(uuid) to authenticated;

drop policy if exists "dueño o admin lee bloques" on public.bloques_muestras;
drop policy if exists "dueño, admin o público lee bloques" on public.bloques_muestras;
create policy "dueño, admin o público lee bloques" on public.bloques_muestras
  for select to authenticated using (
    public.sesion_es_publica(sesion_id)
    or exists (select 1 from public.sesiones s
               where s.id = sesion_id and (s.propietario = (select auth.uid()) or public.es_admin()))
  );
drop policy if exists "dueño inserta bloques" on public.bloques_muestras;
create policy "dueño inserta bloques" on public.bloques_muestras
  for insert to authenticated with check (
    exists (select 1 from public.sesiones s where s.id = sesion_id and s.propietario = (select auth.uid())));
drop policy if exists "dueño borra bloques" on public.bloques_muestras;
create policy "dueño borra bloques" on public.bloques_muestras
  for delete to authenticated using (
    exists (select 1 from public.sesiones s where s.id = sesion_id and s.propietario = (select auth.uid())));

-- Vista segura: solo columnas permitidas, seudónimo anónimo. Corre con los derechos del dueño de la vista
-- (necesario para leer filas ajenas) pero filtra por visibilidad='publico' (security_barrier).
create or replace view public.monitoreos_publicos with (security_barrier = true) as
select
  s.id,
  s.inicio,
  s.fin,
  s.datos ->> 'actividadPrincipal' as actividad,
  'Paciente anónimo'::text as paciente,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'canalIndex', p -> 'canalIndex',
      'fs', p -> 'fs',
      'actividad', p -> 'actividad',
      'resumen', p -> 'resumen'))
    from jsonb_array_elements(case when jsonb_typeof(s.datos -> 'participantes') = 'array'
                                   then s.datos -> 'participantes' else '[]'::jsonb end) p
  ), '[]'::jsonb) as participantes,
  case when s.compartir_perfil then s.datos -> 'perfilCompartido' else null end as perfil
from public.sesiones s
where s.visibilidad = 'publico' and s.estado = 'finalizada';
revoke all on public.monitoreos_publicos from public, anon;
grant select on public.monitoreos_publicos to authenticated;

-- ---------- Supresión: borrar_mis_datos() ahora incluye pacientes ----------
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
  return jsonb_build_object('sesiones', ns, 'incidentes', ni, 'pacientes', np);
end;
$$;
revoke all on function public.borrar_mis_datos() from public, anon;
grant execute on function public.borrar_mis_datos() to authenticated;

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

-- Cuota: pacientes por cuenta (evita llenar el plan gratuito).
create or replace function public.tg_cuota_pacientes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.pacientes where propietario = new.propietario) >= 200 then
    raise exception 'Cuota de pacientes superada' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists cuota_pacientes on public.pacientes;
create trigger cuota_pacientes before insert on public.pacientes
  for each row execute function public.tg_cuota_pacientes();
revoke all on function public.tg_cuota_pacientes() from public, anon, authenticated;

-- Recomendado en el panel (no es SQL): Authentication → Providers → Email habilitado, "Confirm email" activo,
-- longitud mínima de contraseña 10 y "Leaked password protection". Ver README.
