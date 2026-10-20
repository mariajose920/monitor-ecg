-- ============================================================
-- Migración idempotente: administrador = cuenta normal + segundo factor TOTP (aal2)
-- Aplicar en: Supabase -> SQL Editor -> New query -> Run (se puede repetir sin perder datos).
--
-- ISO/IEC 27001:2013, Anexo A
--   A.9.2.3  Gestión de derechos de acceso con privilegios  -> rol solo en public.administradores (sin escritura desde la app)
--   A.9.2.5  Revisión de los derechos de acceso de usuario  -> public.admin_listar_administradores()
--   A.9.2.6  Retirada o reasignación de derechos            -> delete manual por el dueño del proyecto (ver docs/sgsi/recuperacion_acceso_admin.md)
--   A.9.4.2  Procedimientos seguros de inicio de sesión     -> es_admin() exige aal2 (TOTP) en el servidor
--   A.12.4.1 Registro de eventos                            -> nuevos tipos en la lista blanca de auditoría
--
-- Separación de conceptos:
--   es_admin_registrado()  rol asignado (solo para MOSTRAR el botón Admin; no concede nada).
--   es_admin()             privilegios EFECTIVOS = registrado Y sesión con segundo factor (aal2).
-- Todas las políticas RLS existentes usan es_admin(): sin aal2 no hay privilegios aunque se conozca la contraseña.
-- Requiere habilitar MFA TOTP en Authentication -> Multi-Factor (ver docs/PENDIENTES_MANUALES.md).
-- ============================================================

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

-- ---------- Privilegios efectivos: rol + segundo factor verificado ----------
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.administradores where user_id = (select auth.uid()))
         and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2';
$$;
revoke all on function public.es_admin() from public, anon;
grant execute on function public.es_admin() to authenticated;

-- La tabla de roles NO se modifica desde la app: ni insert, update ni delete para anon/authenticated.
-- Conceder/retirar el rol lo hace solo el dueño del proyecto desde el SQL Editor.
revoke insert, update, delete on public.administradores from anon, authenticated;

-- ---------- Revisión de administradores (A.9.2.5): solo id y fecha, solo con privilegios efectivos ----------
create or replace function public.admin_listar_administradores()
returns table (user_id uuid, creado_en timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'Privilegios insuficientes' using errcode = '42501';
  end if;
  return query select a.user_id, a.creado_en from public.administradores a order by a.creado_en;
end;
$$;
revoke all on function public.admin_listar_administradores() from public, anon;
grant execute on function public.admin_listar_administradores() to authenticated;

-- ---------- Lista blanca de auditoría (= AUDIT_EVENTS de src/services/audit/auditLog.js) ----------
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
  'PATIENT_CREATED', 'PATIENT_UPDATED', 'PATIENT_DELETED', 'VISIBILITY_CHANGED', 'LOCAL_DATA_LINKED',
  'ADMIN_ACCOUNT_LOGIN', 'ADMIN_MFA_ENROLLED', 'ADMIN_MFA_VERIFIED', 'ADMIN_MFA_FAILED',
  'ADMIN_ROLE_GRANTED', 'ADMIN_ROLE_REVOKED', 'ADMIN_RECOVERY_REQUESTED'
)) not valid;

-- ============================================================
-- EJEMPLOS (NO se ejecutan solos). Solo el dueño del proyecto, en el SQL Editor:
--   -- Conceder (A.9.2.3): la cuenta debe existir y tener el correo confirmado
--   insert into public.administradores (user_id)
--   select id from auth.users where email = 'correo-del-admin@ejemplo.cl'
--   on conflict (user_id) do nothing;
--
--   -- Retirar (A.9.2.6)
--   delete from public.administradores
--   where user_id = (select id from auth.users where email = 'correo-a-retirar@ejemplo.cl');
--
--   -- Listar roles con correo (solo se ve desde el SQL Editor)
--   select a.user_id, u.email, a.creado_en from public.administradores a join auth.users u on u.id = a.user_id;
-- ============================================================
