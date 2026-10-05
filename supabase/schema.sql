-- ============================================================
-- Monitor ECG — Esquema Supabase (PostgreSQL)
-- Ejecutar completo en: Supabase → SQL Editor → New query → Run
-- Es idempotente: se puede volver a ejecutar sin perder datos.
--
-- ISO/IEC 27001:2022
--   5.15 / 8.3  Control de acceso → Row Level Security en TODAS las tablas
--   5.34        Privacidad y PII → solo seudónimos ("Usuario N"), sin nombres ni RUT
--   8.15        Registro de eventos → tabla auditoria (solo inserción)
--   8.5         Autenticación segura → admin con Supabase Auth (email + contraseña)
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
  -- validación en el servidor (8.28): máximo 2000 muestras por bloque y longitudes consistentes
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

-- ---------- Auditoría (8.15) — solo inserción, nunca datos de salud ----------
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
-- DESPUÉS de ejecutar este script, para nombrar al administrador:
--   1) Authentication → Users → Add user (correo + contraseña fuerte, "Auto confirm").
--   2) Ejecuta (cambia el correo):
--        insert into public.administradores (user_id)
--        select id from auth.users where email = 'correo-del-admin@ejemplo.cl';
-- ============================================================
