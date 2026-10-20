-- ============================================================
-- Migración de endurecimiento 2 (TANDA 1) — IDEMPOTENTE: se puede ejecutar varias veces sin perder datos.
-- Probar PRIMERO en un proyecto Supabase de pruebas; después en el real (SQL Editor -> New query -> Run).
--
-- ORDEN DE LAS MIGRACIONES (H-18). Instalación nueva: basta schema.sql (ya integra todo). Base existente:
--   1) migracion_cuentas_pacientes.sql   (pacientes, visibilidad, RPC)      [ya aplicada]
--   2) migracion_endurecimiento.sql      (RPC públicas, purga, pg_cron)     [ya aplicada]
--   3) migracion_admin_mfa.sql           (es_admin = rol + aal2)            [ya aplicada]
--   4) migracion_admin_roles.sql         (conceder/retirar rol)             [ya aplicada]
--   5) migracion_endurecimiento_2.sql    (ESTA; supera partes de 1-4)
--   migracion_eventos_camara.sql es OBSOLETA (no hace nada). Las migraciones 1-4 fueron neutralizadas para que
--   re-ejecutarlas NO reabra lo que esta cierra (lectura pública de bloques, lista blanca fija, lectura global del admin).
--
-- Cambios (docs/AUDITORIA_SISTEMA.md Parte E):
--   C-04  Cierra la lectura pública directa de bloques; RPC senal_publica; cuentas anónimas excluidas; fecha truncada;
--         reportes de contenido (reportes_contenido, reportar_monitoreo) y retiro por el admin con auditoría.
--   C-05  es_admin() exige TOTP RECIENTE (claim amr, <= 15 min) además de aal2; es_admin_reciente(p_segundos).
--   C-06  El admin ya no lee/borra sesiones ni bloques ajenos: solo admin_leer_sesion(id, motivo) con auditoría
--         y registro VISIBLE para el titular (mis_accesos_admin).
--   C-08  Auditoría de nube fiable: tipos_evento (lista blanca única), registrar_evento (actor calculado en servidor),
--         INSERT directo revocado, hash encadenado en servidor, admin_leer_auditoria, verificar_cadena_auditoria, purga 2 años.
--   C-09  Incidentes de extremo a extremo: admin_actualizar_incidente, política de alta sin respuesta, filtro de datos personales.
--   C-11  Cuotas y retención con el reloj del SERVIDOR (creado_en), topes de bytes y de cantidad por cuenta.
--   C-21  Etiquetas de paciente únicas por cuenta (índice único; se omite con aviso si hay duplicados que resolver a mano).
--
-- Mensajes de error genéricos a propósito (no revelan existencia de cuentas ni de sesiones).
-- Código de error propio ECG01 = "límite de almacenamiento" (la app no lo reintenta); P0001 = cuota por tiempo (se reintenta).
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
