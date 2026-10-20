-- migracion_admin_mfa.sql (paso 3) es HISTÓRICA. Si ya se aplicó migracion_endurecimiento_2.sql, esta migración NO debe re-ejecutarse
-- (reabriría controles cerrados: lectura pública de bloques, lectura global del administrador, lista blanca fija).
do $$
begin
  if to_regclass('public.tipos_evento') is not null then
    raise exception 'Migración histórica superada por migracion_endurecimiento_2.sql: no se vuelve a ejecutar.';
  end if;
end;
$$;

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
-- H-18: sin este DROP, ejecutar esta migración sobre una base que ya tiene la versión de 3 columnas falla (cannot change return type).
drop function if exists public.admin_listar_administradores();
create function public.admin_listar_administradores()
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

-- (La lista blanca de auditoría vive ahora en la tabla tipos_evento: migracion_endurecimiento_2.sql.)

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
