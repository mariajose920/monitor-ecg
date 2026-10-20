-- ============================================================
-- Migración TANDA 2 (privacidad en la app) — IDEMPOTENTE: se puede ejecutar varias veces sin perder datos.
-- Probar PRIMERO en un proyecto Supabase de pruebas; después en el real (SQL Editor -> New query -> Run).
--
-- ORDEN: 1-4 (históricas) -> migracion_endurecimiento_2.sql (TANDA 1, ya aplicada) -> ESTA (migracion_tanda2.sql).
-- Instalación nueva: basta schema.sql (ya integra esta migración al final, entre las marcas CUERPO).
--
-- Cambios (docs/AUDITORIA_SISTEMA.md Parte E):
--   C-02/C-18  pacientes.declaracion (declaración de mayoría de edad de la persona medida, con versión y fecha).
--   C-04       Consentimiento de publicación POR MONITOREO: el servidor rechaza pasar una sesión a 'publico' sin
--              datos.consentPublicacion (versión 2.0) y sin la declaración de mayoría de edad del paciente.
--              Retiro automático: si el paciente retira el consentimiento (consentimiento -> null) o la declaración,
--              todo lo suyo que estaba público vuelve a privado y pierde perfil compartido y consentimiento.
--   C-17       Alias y notas solo en el dispositivo: el servidor anula pacientes.alias y quita de sesiones.datos las claves
--              notas, nombre, parametrosAplicados y, por participante, eventos y fuente.info (aunque un cliente antiguo las envíe).
--              Limpia también lo que ya hubiera subido.
--   C-03/C-07/C-10  Tres tipos de evento nuevos en la lista blanca (tipos_evento): CLOUD_SYNC_CHANGED, SESSION_IDLE_TIMEOUT,
--              ISMS_EVIDENCE_RECORDED.
--
-- DESPLIEGUE: aplicar este SQL ANTES de publicar el cliente nuevo (el cliente nuevo envía pacientes.declaracion y
-- datos.consentPublicacion). El cliente viejo sigue funcionando salvo que intente publicar (el servidor lo rechazará sin consentimiento).
-- Lo público ya existente (sin consentPublicacion) NO se toca automáticamente: ver la consulta opcional al final.
-- ============================================================

-- >>> CUERPO (schema.sql incluye este mismo cuerpo desde aquí hasta el final) >>>

-- ------------------------------------------------------------
-- 1. Declaración de mayoría de edad del paciente (C-18)
-- ------------------------------------------------------------
alter table public.pacientes add column if not exists declaracion jsonb;
select public._agregar_check('public.pacientes', 'pacientes_declaracion_tamano', 'declaracion is null or pg_column_size(declaracion) <= 512');

-- ------------------------------------------------------------
-- 2. Limpieza de lo que no debe estar en la nube (C-17)
-- ------------------------------------------------------------
create or replace function public._limpiar_datos_sesion(d jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(d) is distinct from 'object' then d
    else (d - 'notas' - 'nombre' - 'parametrosAplicados')
      || case when jsonb_typeof(d -> 'participantes') = 'array'
              then jsonb_build_object('participantes', coalesce((
                     select jsonb_agg((p - 'eventos') #- '{fuente,info}')
                       from jsonb_array_elements(d -> 'participantes') p), '[]'::jsonb))
              else '{}'::jsonb end
  end;
$$;
revoke all on function public._limpiar_datos_sesion(jsonb) from public, anon, authenticated;

-- El alias nunca se guarda en la nube (aunque un cliente antiguo lo envíe).
create or replace function public.tg_paciente_alias()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.alias := null;
  return new;
end;
$$;
drop trigger if exists paciente_alias on public.pacientes;
create trigger paciente_alias before insert or update on public.pacientes
  for each row execute function public.tg_paciente_alias();
revoke all on function public.tg_paciente_alias() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. Retiro del consentimiento / de la declaración: lo público del paciente vuelve a privado (C-04, punto 5)
-- ------------------------------------------------------------
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
  -- Retiro del consentimiento (o de la declaración de mayoría de edad): todo lo suyo que estaba público pasa a privado.
  if (old.consentimiento is not null and new.consentimiento is null)
     or (old.declaracion is not null and new.declaracion is null) then
    update public.sesiones
       set visibilidad = 'privado', compartir_perfil = false,
           datos = datos - 'perfilCompartido' - 'consentPublicacion'
     where paciente_id = new.id and visibilidad = 'publico';
  end if;
  new.actualizado_en := now();
  return new;
end;
$$;
drop trigger if exists paciente_perfil on public.pacientes;
create trigger paciente_perfil before update on public.pacientes
  for each row execute function public.tg_paciente_perfil();
revoke all on function public.tg_paciente_perfil() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. Publicación: consentimiento por monitoreo + mayoría de edad; limpieza de datos (C-04, C-17)
-- ------------------------------------------------------------
create or replace function public.tg_sesion_paciente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_ya_publico boolean;
begin
  if new.paciente_id is not null and not exists (
    select 1 from public.pacientes p where p.id = new.paciente_id and p.propietario = new.propietario) then
    raise exception 'El paciente no pertenece a la cuenta' using errcode = '42501';
  end if;
  if new.visibilidad = 'publico' and exists (select 1 from public.retiros_contenido r where r.sesion_id = new.id) then
    raise exception 'Operación no permitida' using errcode = '42501';
  end if;
  new.datos := public._limpiar_datos_sesion(new.datos);
  if new.visibilidad = 'privado' then
    new.compartir_perfil := false;
    new.datos := new.datos - 'perfilCompartido' - 'consentPublicacion';
  else
    -- Pasar a 'publico' (o crear ya público) exige el consentimiento de publicación de ESTE monitoreo (versión 2.0, con fecha)
    -- y que el paciente tenga la declaración de mayoría de edad. Lo que ya era público antes de esta migración no se re-evalúa
    -- en cada edición (el INSERT de un upsert sobre una fila ya pública cuenta como edición).
    select (s.visibilidad = 'publico') into v_ya_publico from public.sesiones s where s.id = new.id;
    if not coalesce(v_ya_publico, false) then
      if coalesce(new.datos #>> '{consentPublicacion,version}', '') <> '2.0'
         or coalesce(new.datos #>> '{consentPublicacion,fecha}', '') = '' then
        raise exception 'Falta el consentimiento de publicación' using errcode = '22023';
      end if;
      if new.paciente_id is null or not exists (
           select 1 from public.pacientes p
            where p.id = new.paciente_id and (p.declaracion ->> 'mayorEdad') = 'true') then
        raise exception 'Falta la declaración de mayoría de edad' using errcode = '22023';
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists sesion_paciente on public.sesiones;
create trigger sesion_paciente before insert or update on public.sesiones
  for each row execute function public.tg_sesion_paciente();
revoke all on function public.tg_sesion_paciente() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5. Limpieza de lo ya subido (una vez; idempotente)
-- ------------------------------------------------------------
update public.pacientes set alias = null where alias is not null;
update public.sesiones set datos = public._limpiar_datos_sesion(datos)
 where datos ? 'notas' or datos ? 'nombre' or datos ? 'parametrosAplicados'
    or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(datos -> 'participantes') = 'array' then datos -> 'participantes' else '[]'::jsonb end) p
                where p ? 'eventos' or (p -> 'fuente') ? 'info');

-- ------------------------------------------------------------
-- 6. Lista blanca de auditoría: eventos nuevos (la única lista es tipos_evento; tests/schema.spec.js la compara con la app)
-- ------------------------------------------------------------
insert into public.tipos_evento (tipo, origen) values
  ('CLOUD_SYNC_CHANGED', 'cliente'), ('SESSION_IDLE_TIMEOUT', 'cliente'), ('ISMS_EVIDENCE_RECORDED', 'cliente')
on conflict (tipo) do update set origen = excluded.origen;

-- >>> FIN DEL CUERPO <<<

-- ------------------------------------------------------------
-- OPCIONAL (decisión de la persona responsable; NO se ejecuta sola): pasar a privado lo que ya estaba público SIN consentimiento
-- de publicación 2.0 (el texto anterior de la aplicación no describía lo que ocurría). Revisa primero cuántas filas son:
--   select count(*) from public.sesiones where visibilidad = 'publico' and coalesce(datos #>> '{consentPublicacion,version}', '') <> '2.0';
-- y, si se decide hacerlo:
--   update public.sesiones set visibilidad = 'privado', compartir_perfil = false, datos = datos - 'perfilCompartido' - 'consentPublicacion'
--    where visibilidad = 'publico' and coalesce(datos #>> '{consentPublicacion,version}', '') <> '2.0';
-- ------------------------------------------------------------
-- Verificación rápida tras aplicar (solo lectura):
--   select column_name from information_schema.columns where table_name = 'pacientes' and column_name = 'declaracion';
--   select tipo, origen from public.tipos_evento where tipo in ('CLOUD_SYNC_CHANGED','SESSION_IDLE_TIMEOUT','ISMS_EVIDENCE_RECORDED');
--   select count(*) from public.pacientes where alias is not null;                          -- debe dar 0
--   select count(*) from public.sesiones where datos ? 'notas' or datos ? 'nombre';          -- debe dar 0
