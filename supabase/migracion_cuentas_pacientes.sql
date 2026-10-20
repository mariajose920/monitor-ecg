-- NOTA: la vista public.monitoreos_publicos que crea este script fue REEMPLAZADA por funciones RPC en migracion_endurecimiento.sql (ejecutarla DESPUÉS de este script).
-- ============================================================
-- Monitor ECG — Migración: cuentas (Supabase Auth), pacientes propios y visibilidad de monitoreos
-- Idempotente: se puede ejecutar varias veces. Ejecutar en Supabase → SQL Editor.
-- Requisito previo: schema.sql ya aplicado (funciones es_admin(), cuota(), _agregar_check()).
--
-- ISO/IEC 27001:2013  A.9.1.1/A.9.2.x/A.9.4.1 (acceso por cuenta, mínimo privilegio) ·
--   A.13.2.x (publicación controlada) · A.18.1.4 (Ley 19.628 / 21.719: datos de salud).
-- Decisiones de privacidad:
--   * pacientes: SOLO el propietario (RLS). El administrador NO los lee (minimización).
--   * Lo público se expone ÚNICAMENTE por la vista public.monitoreos_publicos (columnas permitidas,
--     seudónimo anónimo, sin propietario, sin nombre/nota/etiqueta/alias). No hay política SELECT
--     "pública" sobre la tabla sesiones (RLS no filtra columnas).
--   * El rol anon no tiene acceso a nada de esto; "público" = cualquier cuenta autenticada, solo lectura.
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

-- ---------- Auditoría: lista blanca ampliada ----------
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
