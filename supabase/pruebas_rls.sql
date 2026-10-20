-- ============================================================
-- Pruebas MANUALES de políticas RLS y de las RPC de la TANDA 1 (supabase/migracion_endurecimiento_2.sql)
-- Casos de ataque de la Parte C de docs/AUDITORIA_SISTEMA.md (C.1) y criterios de aceptación de C-04, C-05, C-06, C-08, C-09, C-11, C-21.
--
-- CÓMO EJECUTARLO (primero en un proyecto Supabase de PRUEBAS; en el real solo si no hay datos de personas que importen):
--   1) Authentication -> Users: crea 3 cuentas de prueba CON el correo confirmado:
--        prueba-a@ejemplo.cl, prueba-b@ejemplo.cl, prueba-admin@ejemplo.cl   (cambia los correos abajo si usas otros)
--   2) SQL Editor -> pega TODO este archivo -> Run.
--   3) Lee la tabla final: la columna "ok" debe ser true en todas las filas.
--
-- Todo ocurre dentro de una transacción que termina en ROLLBACK: no deja datos. No toca pg_cron ni crea cuentas.
-- Las "sesiones" se simulan con claims JWT (request.jwt.claims) y SET ROLE authenticated/anon; es la misma forma en que
-- PostgREST evalúa las políticas. Los TOTP "recientes" y "viejos" se simulan con la claim amr.
--
-- CASO 0 (manual, una vez): inicia sesión como administrador en la app con TOTP y, en la consola del navegador, ejecuta
--   JSON.parse(atob((await supabase.auth.getSession()).data.session.access_token.split('.')[1])).amr
-- Debe mostrar un elemento {method:'totp', timestamp:<segundos Unix de ahora>}. Tras esperar 16 min y refrescar el token,
-- esa marca NO debe cambiar (el refresco no renueva el segundo factor) y rpc('es_admin') debe dar false hasta ingresar un código nuevo.
-- ============================================================
begin;

create temp table _ctx on commit drop as
select (select id from auth.users where email = 'prueba-a@ejemplo.cl') as a,
       (select id from auth.users where email = 'prueba-b@ejemplo.cl') as b,
       (select id from auth.users where email = 'prueba-admin@ejemplo.cl') as adm;
create temp table _res (id serial, caso text, esperado text, obtenido text, ok boolean) on commit drop;

do $$
begin
  if exists (select 1 from _ctx where a is null or b is null or adm is null) then
    raise exception 'Faltan cuentas de prueba (revisa los correos en el encabezado de este archivo).';
  end if;
end;
$$;

-- El administrador de prueba debe tener el rol (se revierte con el ROLLBACK final).
insert into public.administradores (user_id) select adm from _ctx on conflict do nothing;

-- Ejecuta p_sql como la identidad p_quien y compara con p_espera:
--   'ok' | 'ok:N' (N filas) | 'error' | 'error:SQLSTATE' | 'v:texto' (primera columna de la primera fila); varias opciones con |
-- Marcadores en p_sql: {A} {B} {ADM} (uuid de cada cuenta).
create function pg_temp.t(p_caso text, p_quien text, p_sql text, p_espera text) returns void
language plpgsql as $f$
declare
  c record;
  v_ahora bigint := extract(epoch from now())::bigint;
  v_claims jsonb;
  v_rol text := 'authenticated';
  v_sql text;
  v_n bigint;
  v_val text;
  v_obt text;
  v_ok boolean;
begin
  select * into c from _ctx;
  v_sql := replace(replace(replace(p_sql, '{A}', c.a::text), '{B}', c.b::text), '{ADM}', c.adm::text);
  v_claims := case p_quien
    when 'a' then jsonb_build_object('sub', c.a, 'role', 'authenticated', 'aal', 'aal1', 'amr', '[]'::jsonb)
    when 'b' then jsonb_build_object('sub', c.b, 'role', 'authenticated', 'aal', 'aal1', 'amr', '[]'::jsonb)
    when 'b_anonima' then jsonb_build_object('sub', c.b, 'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', true, 'amr', '[]'::jsonb)
    when 'adm' then jsonb_build_object('sub', c.adm, 'role', 'authenticated', 'aal', 'aal2',
                      'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', v_ahora - 60), jsonb_build_object('method', 'password', 'timestamp', v_ahora - 3000)))
    when 'adm_totp_viejo' then jsonb_build_object('sub', c.adm, 'role', 'authenticated', 'aal', 'aal2',
                      'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', v_ahora - 1200)))
    when 'adm_aal1' then jsonb_build_object('sub', c.adm, 'role', 'authenticated', 'aal', 'aal1',
                      'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_ahora)))
    else '{}'::jsonb
  end;
  if p_quien = 'anon' then v_rol := 'anon'; end if;
  perform set_config('request.jwt.claims', v_claims::text, true);
  execute 'set local role ' || v_rol;
  begin
    if lower(ltrim(v_sql)) like 'select%' then
      if p_espera like 'v:%' then      -- una sola ejecución (algunas RPC cambian datos)
        execute 'select (select * from (' || v_sql || ') _q2 limit 1)::text' into v_val;
      else
        execute 'select count(*) from (' || v_sql || ') _q' into v_n;
      end if;
    else
      execute v_sql;
      get diagnostics v_n = row_count;
    end if;
    v_obt := 'ok:' || coalesce(v_n::text, '0');
  exception when others then
    v_obt := 'error:' || sqlstate;
  end;
  execute 'reset role';
  v_ok := exists (
    select 1 from unnest(string_to_array(p_espera, '|')) e   -- alternativas separadas por |
    where case
      when e = 'ok' then v_obt like 'ok:%'
      when e like 'ok:%' then v_obt = e
      when e = 'error' then v_obt like 'error:%'
      when e like 'error:%' then v_obt = e
      when e like 'v:%' then v_obt like 'ok:%' and coalesce(v_val, '') = substr(e, 3)
      else false end);
  insert into _res (caso, esperado, obtenido, ok) values (p_caso, p_espera, coalesce(case when p_espera like 'v:%' then 'v:' || coalesce(v_val, '') end, v_obt), v_ok);
end;
$f$;

-- ---------- Preparación: datos de A (como superusuario, dentro de la transacción) ----------
insert into public.pacientes (id, propietario, etiqueta) select 'aaaaaaaa-0000-4000-8000-000000000001', a, 'Paciente 1' from _ctx;
insert into public.sesiones (id, propietario, paciente_id, inicio, fin, estado, visibilidad, datos)
select 'bbbbbbbb-0000-4000-8000-000000000001', a, 'aaaaaaaa-0000-4000-8000-000000000001', now() - interval '5 minutes', now(), 'finalizada', 'publico',
       '{"participantes":[{"canalIndex":0,"fs":250,"resumen":{"bpmMedio":70}}],"actividadPrincipal":"reposo","nombre":"Privado de A"}'::jsonb from _ctx;
insert into public.bloques_muestras (sesion_id, canal, seq, t, ecg_raw, leads_off, bpm)
values ('bbbbbbbb-0000-4000-8000-000000000001', 0, 0, '{1,2,3}', '{10,20,30}', '{0,0,0}', '{70,70,70}');

-- ---------- C-05: privilegios con TOTP reciente ----------
select pg_temp.t('es_admin con TOTP reciente (aal2)', 'adm', 'select public.es_admin()', 'v:true');
select pg_temp.t('es_admin con TOTP de 20 min = false', 'adm_totp_viejo', 'select public.es_admin()', 'v:false');
select pg_temp.t('es_admin con aal1 = false', 'adm_aal1', 'select public.es_admin()', 'v:false');
select pg_temp.t('es_admin_reciente(300) con TOTP de 60 s', 'adm', 'select public.es_admin_reciente(300)', 'v:true');
select pg_temp.t('cuenta común no es admin', 'a', 'select public.es_admin()', 'v:false');

-- ---------- C.1 / C-04 / C-06: aislamiento entre cuentas y mínimo privilegio ----------
select pg_temp.t('B no lee sesiones de A', 'b', 'select * from public.sesiones', 'ok:0');
select pg_temp.t('B no lee bloques de A (sesión PÚBLICA)', 'b', 'select * from public.bloques_muestras', 'ok:0');
select pg_temp.t('B no lee pacientes de A', 'b', 'select * from public.pacientes', 'ok:0');
select pg_temp.t('A sí lee sus sesiones', 'a', 'select * from public.sesiones', 'ok:1');
select pg_temp.t('A sí lee sus bloques', 'a', 'select * from public.bloques_muestras', 'ok:1');
select pg_temp.t('admin (aal2 + TOTP reciente) NO lee sesiones ajenas', 'adm', 'select * from public.sesiones', 'ok:0');
select pg_temp.t('admin NO lee bloques ajenos', 'adm', 'select * from public.bloques_muestras', 'ok:0');
select pg_temp.t('admin NO borra sesiones ajenas', 'adm', $q$delete from public.sesiones where id = 'bbbbbbbb-0000-4000-8000-000000000001'$q$, 'ok:0');
select pg_temp.t('B no puede modificar sesiones de A', 'b', $q$update public.sesiones set visibilidad = 'privado' where id = 'bbbbbbbb-0000-4000-8000-000000000001'$q$, 'ok:0');
select pg_temp.t('B no puede insertar bloques en la sesión de A', 'b', $q$insert into public.bloques_muestras (sesion_id, canal, seq, t, ecg_raw, leads_off) values ('bbbbbbbb-0000-4000-8000-000000000001', 0, 9, '{1}', '{1}', '{0}')$q$, 'error');
-- (anon conserva los privilegios por defecto de Supabase: lo protege RLS -> 0 filas, o error si ya se le revocó el acceso)
select pg_temp.t('rol anon no ve sesiones', 'anon', 'select * from public.sesiones', 'ok:0|error');
select pg_temp.t('rol anon no ve bloques', 'anon', 'select * from public.bloques_muestras', 'ok:0|error');
select pg_temp.t('rol anon no ve auditoría', 'anon', 'select * from public.auditoria', 'ok:0|error');

-- ---------- C-04: lo público solo por RPC ----------
select pg_temp.t('B ve la señal pública por RPC', 'b', $q$select * from public.senal_publica('bbbbbbbb-0000-4000-8000-000000000001')$q$, 'ok:1');
select pg_temp.t('señal_publica: límite de 60 filas', 'b', $q$select * from public.senal_publica('bbbbbbbb-0000-4000-8000-000000000001', 0::smallint, 0, 100000)$q$, 'ok:1');
select pg_temp.t('cuenta anónima no ve la señal pública', 'b_anonima', $q$select * from public.senal_publica('bbbbbbbb-0000-4000-8000-000000000001')$q$, 'ok:0');
select pg_temp.t('rol anon sin permiso a senal_publica', 'anon', $q$select * from public.senal_publica('bbbbbbbb-0000-4000-8000-000000000001')$q$, 'error');
select pg_temp.t('cuenta anónima no lista públicos', 'b_anonima', 'select * from public.listar_monitoreos_publicos()', 'ok:0');
select pg_temp.t('B lista públicos', 'b', 'select * from public.listar_monitoreos_publicos()', 'ok:1');
select pg_temp.t('la fecha pública es solo el día (00:00 UTC)', 'b', $q$select (inicio at time zone 'UTC')::time::text from public.listar_monitoreos_publicos()$q$, 'v:00:00:00');
select pg_temp.t('la lista pública no trae propietario ni nombre', 'b', $q$select count(*) from public.listar_monitoreos_publicos() p where p::text ~* '(propietario|Privado de A|paciente_id)'$q$, 'v:0');

-- ---------- C-04: reportes y retiro ----------
select pg_temp.t('cuenta anónima no reporta', 'b_anonima', $q$select public.reportar_monitoreo('bbbbbbbb-0000-4000-8000-000000000001', 'contenido ofensivo')$q$, 'error');
select pg_temp.t('B reporta', 'b', $q$select public.reportar_monitoreo('bbbbbbbb-0000-4000-8000-000000000001', 'contenido ofensivo')$q$, 'ok');
select pg_temp.t('reportar dos veces no duplica (sin error)', 'b', $q$select public.reportar_monitoreo('bbbbbbbb-0000-4000-8000-000000000001', 'otra vez')$q$, 'ok');
select pg_temp.t('reportar una sesión inexistente: error genérico', 'b', $q$select public.reportar_monitoreo('cccccccc-0000-4000-8000-000000000009', 'sin sesion')$q$, 'error:42501');
select pg_temp.t('B no lee la tabla de reportes', 'b', 'select * from public.reportes_contenido', 'error');
select pg_temp.t('no admin no lista reportes', 'b', 'select * from public.admin_listar_reportes()', 'error:42501');
select pg_temp.t('admin lista reportes (1 abierto)', 'adm', 'select * from public.admin_listar_reportes()', 'ok:1');
select pg_temp.t('retirar con motivo corto falla', 'adm', $q$select public.admin_retirar_publicacion('bbbbbbbb-0000-4000-8000-000000000001', 'corto')$q$, 'error');
select pg_temp.t('retirar con TOTP viejo falla', 'adm_totp_viejo', $q$select public.admin_retirar_publicacion('bbbbbbbb-0000-4000-8000-000000000001', 'Contenido reportado y revisado')$q$, 'error:42501');
select pg_temp.t('admin retira la publicación', 'adm', $q$select public.admin_retirar_publicacion('bbbbbbbb-0000-4000-8000-000000000001', 'Contenido reportado y revisado')$q$, 'v:true');
select pg_temp.t('la sesión retirada ya no sale en la lista pública', 'b', 'select * from public.listar_monitoreos_publicos()', 'ok:0');
select pg_temp.t('el dueño no puede volver a publicar lo retirado', 'a', $q$update public.sesiones set visibilidad = 'publico' where id = 'bbbbbbbb-0000-4000-8000-000000000001'$q$, 'error:42501');
select pg_temp.t('B ya no ve su señal', 'b', $q$select * from public.senal_publica('bbbbbbbb-0000-4000-8000-000000000001')$q$, 'ok:0');

-- ---------- C-06: acceso excepcional ----------
select pg_temp.t('admin_leer_sesion sin motivo válido falla', 'adm', $q$select * from public.admin_leer_sesion('bbbbbbbb-0000-4000-8000-000000000001', 'corto')$q$, 'error');
select pg_temp.t('admin_leer_sesion con TOTP viejo falla', 'adm_totp_viejo', $q$select * from public.admin_leer_sesion('bbbbbbbb-0000-4000-8000-000000000001', 'Soporte por solicitud 1234')$q$, 'error:42501');
select pg_temp.t('una cuenta común no puede usar admin_leer_sesion', 'b', $q$select * from public.admin_leer_sesion('bbbbbbbb-0000-4000-8000-000000000001', 'Soporte por solicitud 1234')$q$, 'error:42501');
select pg_temp.t('admin_leer_sesion con motivo entrega los datos', 'adm', $q$select * from public.admin_leer_sesion('bbbbbbbb-0000-4000-8000-000000000001', 'Soporte por solicitud 1234')$q$, 'ok:1');
select pg_temp.t('el acceso quedó auditado (ADMIN_DATA_ACCESS con motivo)', 'adm', $q$select * from public.admin_leer_auditoria(50) where tipo = 'ADMIN_DATA_ACCESS' and detalle ->> 'motivo' = 'Soporte por solicitud 1234'$q$, 'ok:1');
select pg_temp.t('el titular ve el acceso', 'a', 'select * from public.mis_accesos_admin()', 'ok:1');
select pg_temp.t('otra cuenta no ve accesos ajenos', 'b', 'select * from public.mis_accesos_admin()', 'ok:0');

-- ---------- C-08: auditoría ----------
select pg_temp.t('INSERT directo a auditoria denegado', 'b', $q$insert into public.auditoria (tipo, actor, detalle) values ('ADMIN_LOGIN_OK', 'admin', '{}')$q$, 'error');
select pg_temp.t('UPDATE directo a auditoria denegado', 'adm', $q$update public.auditoria set actor = 'system'$q$, 'error');
select pg_temp.t('DELETE directo a auditoria denegado', 'adm', 'delete from public.auditoria', 'error');
select pg_temp.t('registrar_evento de cliente funciona', 'b', $q$select public.registrar_evento('SESSION_SAVED', '{"x":1}'::jsonb)$q$, 'ok');
select pg_temp.t('tipo de administrador rechazado a una cuenta común', 'b', $q$select public.registrar_evento('PARAM_CHANGED', '{}'::jsonb)$q$, 'error:42501');
select pg_temp.t('tipo de servidor rechazado a cualquiera', 'adm', $q$select public.registrar_evento('ADMIN_DATA_ACCESS', '{}'::jsonb)$q$, 'error:42501');
select pg_temp.t('tipo desconocido rechazado', 'b', $q$select public.registrar_evento('NO_EXISTE', '{}'::jsonb)$q$, 'error:42501');
select pg_temp.t('detalle que no es objeto rechazado', 'b', $q$select public.registrar_evento('SESSION_SAVED', '[1]'::jsonb)$q$, 'error');
select pg_temp.t('admin puede registrar un tipo de administrador', 'adm', $q$select public.registrar_evento('PARAM_CHANGED', '{}'::jsonb)$q$, 'ok');
select pg_temp.t('el actor lo calcula el servidor (cuenta común = participant)', 'adm', $q$select * from public.admin_leer_auditoria(50) where tipo = 'SESSION_SAVED' and actor = 'participant'$q$, 'ok:1');
select pg_temp.t('el actor lo calcula el servidor (admin vigente = admin)', 'adm', $q$select * from public.admin_leer_auditoria(50) where tipo = 'PARAM_CHANGED' and actor = 'admin'$q$, 'ok:1');
select pg_temp.t('una cuenta común no lee la auditoría', 'b', 'select * from public.admin_leer_auditoria(10)', 'error:42501');
select pg_temp.t('admin con TOTP viejo no lee la auditoría', 'adm_totp_viejo', 'select * from public.admin_leer_auditoria(10)', 'error:42501');
select pg_temp.t('la cadena de hash está íntegra', 'adm', 'select ok from public.verificar_cadena_auditoria()', 'v:true');
select pg_temp.t('verificar_cadena exige admin', 'b', 'select * from public.verificar_cadena_auditoria()', 'error:42501');
-- Manipulación con privilegios de dueño (lo que haría alguien con la clave de servicio): debe detectarse.
update public.auditoria set detalle = '{"manipulado":true}'::jsonb where id = (select min(id) from public.auditoria where hash is not null);
select pg_temp.t('una fila alterada rompe la cadena', 'adm', 'select ok from public.verificar_cadena_auditoria()', 'v:false');

-- ---------- C-11: tiempo del servidor y cuotas ----------
select pg_temp.t('inicio de hace 2 días rechazado', 'a', $q$insert into public.sesiones (id, inicio, estado, datos) values ('eeeeeeee-0000-4000-8000-000000000001', now() - interval '2 days', 'finalizada', '{}')$q$, 'error:23514');
select pg_temp.t('inicio en el año 2100 rechazado', 'a', $q$insert into public.sesiones (id, inicio, estado, datos) values ('eeeeeeee-0000-4000-8000-000000000002', '2100-01-01', 'activa', '{}')$q$, 'error:23514');
select pg_temp.t('sesión normal aceptada (creado_en enviado se ignora)', 'a', $q$insert into public.sesiones (id, inicio, estado, datos, creado_en) values ('eeeeeeee-0000-4000-8000-000000000003', now() - interval '3 hours', 'activa', '{}', '2000-01-01')$q$, 'ok');
select pg_temp.t('creado_en lo fijó el servidor', 'a', $q$select creado_en > now() - interval '1 minute' from public.sesiones where id = 'eeeeeeee-0000-4000-8000-000000000003'$q$, 'v:true');
select pg_temp.t('el cliente no puede cambiar el inicio de una sesión', 'a', $q$update public.sesiones set inicio = now() - interval '300 days' where id = 'eeeeeeee-0000-4000-8000-000000000003'$q$, 'ok:1');
select pg_temp.t('...y el inicio no cambió', 'a', $q$select inicio > now() - interval '1 day' from public.sesiones where id = 'eeeeeeee-0000-4000-8000-000000000003'$q$, 'v:true');
select pg_temp.t('el cliente no puede poner a cero bytes_aprox', 'a', $q$update public.sesiones set bytes_aprox = 0 where id = 'eeeeeeee-0000-4000-8000-000000000003'$q$, 'ok:1');
select pg_temp.t('bloque propio aceptado (creado_en del cliente ignorado)', 'a', $q$insert into public.bloques_muestras (sesion_id, canal, seq, t, ecg_raw, leads_off, creado_en) values ('eeeeeeee-0000-4000-8000-000000000003', 0, 0, '{1}', '{1}', '{0}', '2001-01-01')$q$, 'ok');
select pg_temp.t('reintento idempotente del mismo bloque (ON CONFLICT DO NOTHING)', 'a', $q$insert into public.bloques_muestras (sesion_id, canal, seq, t, ecg_raw, leads_off) values ('eeeeeeee-0000-4000-8000-000000000003', 0, 0, '{1}', '{1}', '{0}') on conflict do nothing$q$, 'ok');
select pg_temp.t('el bloque tiene la hora del servidor', 'a', $q$select creado_en > now() - interval '1 minute' from public.bloques_muestras where sesion_id = 'eeeeeeee-0000-4000-8000-000000000003'$q$, 'v:true');
select pg_temp.t('el titular ve su uso (1 bloque, sin duplicados)', 'a', 'select bloques from public.uso_cuenta', 'v:2'); -- 1 de preparación + 1 nuevo
update public.uso_cuenta set bytes = 52428800 where user_id = (select a from _ctx);
select pg_temp.t('tope de bytes por cuenta -> ECG01', 'a', $q$insert into public.bloques_muestras (sesion_id, canal, seq, t, ecg_raw, leads_off) values ('eeeeeeee-0000-4000-8000-000000000003', 0, 5, '{1}', '{1}', '{0}')$q$, 'error:ECG01');
select pg_temp.t('la cuenta no puede editar su contador de uso', 'a', 'update public.uso_cuenta set bytes = 0', 'error');
update public.uso_cuenta set bytes = 0 where user_id = (select a from _ctx);
select pg_temp.t('B no ejecuta purgar_sesiones', 'b', 'select public.purgar_sesiones(1)', 'error');
select pg_temp.t('anon no puede ejecutar cuota()', 'a', $q$select has_function_privilege('anon', 'public.cuota(text)', 'execute')$q$, 'v:false');

-- ---------- C-09: incidentes ----------
select pg_temp.t('alta con respuesta de una cuenta común rechazada', 'b', $q$insert into public.incidentes (id, tipo, severidad, descripcion, reportado_por, estado, respuesta) values ('f0000000-0000-4000-8000-000000000001', 'acceso', 'alta', 'Hubo un acceso raro', 'participant', 'abierto', 'ya resuelto')$q$, 'error');
select pg_temp.t('descripción con correo rechazada', 'b', $q$insert into public.incidentes (id, tipo, severidad, descripcion, reportado_por) values ('f0000000-0000-4000-8000-000000000001', 'acceso', 'alta', 'Hubo un acceso raro de juan@x.cl', 'participant')$q$, 'error:22023');
select pg_temp.t('descripción con RUT rechazada', 'b', $q$insert into public.incidentes (id, tipo, severidad, descripcion, reportado_por) values ('f0000000-0000-4000-8000-000000000001', 'acceso', 'alta', 'Persona 12.345.678-5 vio algo raro', 'participant')$q$, 'error:22023');
select pg_temp.t('B notifica un incidente (se declara admin, el servidor lo corrige)', 'b', $q$insert into public.incidentes (id, tipo, severidad, descripcion, reportado_por, creado_en) values ('f0000000-0000-4000-8000-000000000001', 'acceso', 'alta', 'Hubo un acceso raro en el laboratorio', 'admin', '2000-01-01')$q$, 'ok');
select pg_temp.t('reportado_por forzado a participant', 'b', $q$select reportado_por from public.incidentes$q$, 'v:participant');
select pg_temp.t('A no ve incidentes de B', 'a', 'select * from public.incidentes', 'ok:0');
select pg_temp.t('B ve el suyo', 'b', 'select * from public.incidentes', 'ok:1');
select pg_temp.t('el admin ve todos los incidentes', 'adm', 'select * from public.incidentes', 'ok:1');
select pg_temp.t('B no puede actualizar el incidente', 'b', $q$update public.incidentes set estado = 'cerrado'$q$, 'ok:0');
select pg_temp.t('una cuenta común no usa admin_actualizar_incidente', 'b', $q$select * from public.admin_actualizar_incidente('f0000000-0000-4000-8000-000000000001', 'en_analisis')$q$, 'error:42501');
select pg_temp.t('no se salta en_analisis', 'adm', $q$select * from public.admin_actualizar_incidente('f0000000-0000-4000-8000-000000000001', 'cerrado', 'r', 'l')$q$, 'error');
select pg_temp.t('abierto -> en_analisis', 'adm', $q$select estado from public.admin_actualizar_incidente('f0000000-0000-4000-8000-000000000001', 'en_analisis')$q$, 'v:en_analisis');
select pg_temp.t('cerrar sin respuesta ni lección falla', 'adm', $q$select * from public.admin_actualizar_incidente('f0000000-0000-4000-8000-000000000001', 'cerrado')$q$, 'error');
select pg_temp.t('en_analisis -> cerrado', 'adm', $q$select estado from public.admin_actualizar_incidente('f0000000-0000-4000-8000-000000000001', 'cerrado', 'Se cambió la clave', 'Rotar claves cada trimestre')$q$, 'v:cerrado');
select pg_temp.t('el reportante ve el estado y la respuesta', 'b', 'select estado || respuesta from public.incidentes', 'v:cerradoSe cambió la clave');

-- ---------- C-12/C-05: roles ----------
select pg_temp.t('conceder rol con TOTP viejo falla', 'adm_totp_viejo', $q$select * from public.admin_conceder_rol('prueba-a@ejemplo.cl')$q$, 'error:42501');
select pg_temp.t('una cuenta común no puede conceder el rol', 'b', $q$select * from public.admin_conceder_rol('prueba-a@ejemplo.cl')$q$, 'error:42501');
select pg_temp.t('la tabla de roles no se escribe directamente', 'adm', $q$insert into public.administradores (user_id) values ('{A}')$q$, 'error');

-- ---------- C-21: etiquetas únicas ----------
select pg_temp.t('etiqueta duplicada en la misma cuenta rechazada', 'a', $q$insert into public.pacientes (id, etiqueta) values ('aaaaaaaa-0000-4000-8000-000000000002', 'Paciente 1')$q$, 'error:23505');
select pg_temp.t('la misma etiqueta en otra cuenta es válida', 'b', $q$insert into public.pacientes (id, etiqueta) values ('aaaaaaaa-0000-4000-8000-000000000003', 'Paciente 1')$q$, 'ok');

-- ---------- Privilegios ----------
select pg_temp.t('authenticated sin INSERT en auditoria', 'a', $q$select has_table_privilege('authenticated', 'public.auditoria', 'insert')$q$, 'v:false');
select pg_temp.t('authenticated sin acceso a tipos_evento', 'a', 'select * from public.tipos_evento', 'error');
select pg_temp.t('authenticated sin acceso a retiros_contenido', 'a', 'select * from public.retiros_contenido', 'error');
select pg_temp.t('authenticated sin acceso a accesos_admin', 'a', 'select * from public.accesos_admin', 'error');

-- ============================================================
-- RESULTADO: todas las filas deben tener ok = true
-- ============================================================
select id, caso, esperado, obtenido, ok from _res order by id;
select count(*) filter (where not ok) as fallos, count(*) as casos from _res;

rollback;
