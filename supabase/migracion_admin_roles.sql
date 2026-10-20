-- migracion_admin_roles.sql (paso 4) es HISTÓRICA. Si ya se aplicó migracion_endurecimiento_2.sql, esta migración NO debe re-ejecutarse
-- (reabriría controles cerrados: lectura pública de bloques, lectura global del administrador, lista blanca fija).
do $$
begin
  if to_regclass('public.tipos_evento') is not null then
    raise exception 'Migración histórica superada por migracion_endurecimiento_2.sql: no se vuelve a ejecutar.';
  end if;
end;
$$;

-- ============================================================
-- Migración idempotente: gestión de administradores desde la app (un admin concede/retira a otro)
-- Aplicar en: Supabase -> SQL Editor -> New query -> Run (se puede repetir sin perder datos).
-- Requiere haber aplicado antes migracion_admin_mfa.sql (es_admin / es_admin_registrado).
--
-- ISO/IEC 27001:2013, Anexo A
--   A.9.2.3  Gestión de derechos de acceso con privilegios -> admin_conceder_rol() (solo es_admin = rol + aal2)
--   A.9.2.5  Revisión de los derechos de acceso            -> admin_listar_administradores() (id, correo, fecha)
--   A.9.2.6  Retirada o reasignación de derechos           -> admin_retirar_rol()
--   A.12.4.1 Registro de eventos                           -> ADMIN_ROLE_GRANTED / ADMIN_ROLE_REVOKED en public.auditoria
--
-- La tabla public.administradores sigue SIN escritura directa para anon/authenticated: los cambios
-- solo pasan por estas funciones (security definer, search_path fijo, exigen aal2).
-- Los eventos de auditoría guardan solo identificadores (objetivo, por), nunca correos.
-- ============================================================

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
  v_yo uuid := auth.uid();
  v_creado timestamptz;
begin
  if not public.es_admin() then
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
  v_yo uuid := auth.uid();
  v_borradas int;
begin
  if not public.es_admin() then
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

-- Contingencia del dueño del proyecto (SQL Editor): ver docs/sgsi/recuperacion_acceso_admin.md
