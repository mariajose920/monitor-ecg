-- ============================================================
-- Migración de endurecimiento (IDEMPOTENTE; se puede ejecutar varias veces)
--  1) Reemplaza la vista public.monitoreos_publicos (alerta del asesor "security_definer_view")
--     por funciones RPC con security definer, search_path fijo y columnas permitidas.
--     ISO 27001:2013 A.9.4.1, A.14.2.5, A.18.1.4.
--  2) Retención en la nube: 365 días desde el inicio del monitoreo (A.18.1.3, A.8.3.2)
--     y purga diaria programada con pg_cron (tarea 'purga-ecg').
-- Ejecutar en el SQL Editor de Supabase. NO borra cuentas (eso es un procedimiento manual).
-- ============================================================

-- ---------- 1) Vista -> funciones ----------
drop view if exists public.monitoreos_publicos;

create or replace function public.listar_monitoreos_publicos(p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid,
  inicio timestamptz,
  fin timestamptz,
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
    s.inicio,
    s.fin,
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
    and (select auth.uid()) is not null
  order by s.inicio desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.listar_monitoreos_publicos(integer, integer) from public, anon;
grant execute on function public.listar_monitoreos_publicos(integer, integer) to authenticated;

create or replace function public.monitoreo_publico(p_id uuid)
returns table (
  id uuid,
  inicio timestamptz,
  fin timestamptz,
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
    s.inicio,
    s.fin,
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
    and (select auth.uid()) is not null;
$$;
revoke all on function public.monitoreo_publico(uuid) from public, anon;
grant execute on function public.monitoreo_publico(uuid) to authenticated;

-- ---------- 2) Retención: 365 días ----------
create or replace function public.purgar_sesiones(dias integer default 365)
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

-- pg_cron: si el rol no puede crear la extensión, se avisa y se continúa (habilitarla en Database -> Extensions).
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'No se pudo crear pg_cron (%). Habilítala en Database > Extensions y vuelve a ejecutar.', sqlerrm;
end;
$$;

-- Tarea diaria 03:15 UTC (idempotente: se desprograma si ya existía).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'purga-ecg') then
      perform cron.unschedule('purga-ecg');
    end if;
    perform cron.schedule('purga-ecg', '15 3 * * *', 'select public.purgar_sesiones(365)');
  end if;
end;
$$;

-- Para desactivar la purga:   select cron.unschedule('purga-ecg');
-- Para verificar:             select jobname, schedule, active from cron.job;
-- Historial de ejecuciones:   select * from cron.job_run_details order by start_time desc limit 10;
