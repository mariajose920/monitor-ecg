# Cambios de la TANDA 1 — endurecimiento del servidor y de sus clientes

Origen: `docs/AUDITORIA_SISTEMA.md` (Parte C hallazgos, Parte E cambios). Decisiones de la usuaria aplicadas: (2) "público" = cuentas registradas, solo resumen y señal procesada, fecha truncada, con reporte y retiro; (6) el administrador no ve datos de salud ajenos por defecto, solo acceso excepcional con motivo escrito, registrado y visible; (10) la concesión de admin desde la app se mantiene (TOTP, máx. 5). Los puntos (1) borradores sin subir hasta "Guardar", (3) menores y (11) alias/notas solo en el dispositivo son de la TANDA 2 y no se tocaron.

## 1. Qué hay que aplicar (SQL) y en qué orden

Instalación nueva: solo `supabase/schema.sql` (integra todo, incluida esta tanda). Base existente (la real): ejecutar **`supabase/migracion_endurecimiento_2.sql`** después de las migraciones 1-4 ya aplicadas.

Orden formal (también en la cabecera de ambos archivos, H-18):

1. `migracion_cuentas_pacientes.sql` → 2. `migracion_endurecimiento.sql` → 3. `migracion_admin_mfa.sql` → 4. `migracion_admin_roles.sql` → 5. **`migracion_endurecimiento_2.sql`**.

Las migraciones 1-4 quedaron **neutralizadas**: si ya se aplicó la 5 se abortan con un mensaje (re-ejecutarlas reabriría la lectura pública de bloques, la lectura global del admin y la lista blanca fija); `migracion_admin_mfa.sql` ahora hace `drop function` antes de recrear `admin_listar_administradores` (error de tipo de retorno señalado en H-18); `migracion_eventos_camara.sql` es un no-op (antes reemplazaba la lista blanca por una incompleta). `supabase/pruebas_rls.sql` son 101 casos manuales con tres cuentas de prueba.

Verificación hecha aquí (sin tocar la base real): las sentencias se ejecutaron en un PostgreSQL embebido (PGlite) con stubs de `auth.uid()/auth.jwt()` y roles `anon/authenticated`: (a) esquema viejo → migración 2 (dos veces, idempotente); (b) esquema viejo → migraciones 1-4 → 2 → intento de re-ejecutar 1-4 (las 4 se rechazan); (c) `schema.sql` nuevo (dos veces). En las tres rutas `pruebas_rls.sql` dio 101 casos, 0 fallos. Lo que **no** se pudo probar aquí: carreras reales entre transacciones paralelas (el motor es de una sola conexión), `pg_cron` y el comportamiento exacto del JWT de Supabase (ver 2.2).

## 2. Implementado

### 2.1 C-04 · Lo "público"
- Se elimina la política `dueño, admin o público lee bloques` (solo el propietario lee sus bloques) y la función `sesion_es_publica`.
- `senal_publica(p_sesion, p_canal, p_desde, p_limite)`: `security definer`, `search_path` fijo, `REVOKE` a `anon`, solo `authenticated`, máx. 60 bloques por llamada, solo sesiones `publico` y `finalizada`, sin propietario ni ids de paciente. El cliente (`fetchSenalNube(..., {publica:true})`) pagina con ella; Comunidad ya no consulta la tabla.
- `listar_monitoreos_publicos` y `monitoreo_publico`: excluyen cuentas anónimas (`es_cuenta_registrada()`), devuelven `inicio` truncado al día (UTC) y `duracion_s` en lugar de `fin`.
- Moderación: `reportes_contenido` (sin acceso directo, un reporte por cuenta y sesión, 5 al día), `reportar_monitoreo`, `admin_listar_reportes`, `admin_resolver_reporte`, `admin_retirar_publicacion` (pasa a privado, marca los reportes, **y una sesión retirada no puede volver a `publico`**: tabla `retiros_contenido` + trigger), todo con auditoría (`CONTENT_REPORTED`, `CONTENT_REPORT_REVIEWED`, `CONTENT_REMOVED`).
- Cliente: botón "Reportar este monitoreo" en la selección de Comunidad (diálogo con motivo 3-200 caracteres) y pestaña admin "Soporte y moderación" (lista de reportes, descartar/revisado/retirar con motivo 10-300).

### 2.2 C-05 · El privilegio de admin caduca en el servidor
- `es_admin()` = rol + `aal2` + `totp_reciente(900)`; `es_admin_reciente(p_segundos)` (por defecto 300) para acciones sensibles; `admin_conceder_rol`/`admin_retirar_rol` ahora exigen TOTP de ≤ 5 min (la app ya pedía un código nuevo justo antes).
- **Viabilidad de `amr`:** el formato real de la claim de Supabase Auth es un arreglo de objetos `{method, timestamp}` con `timestamp` en segundos Unix; al refrescar el token las entradas se conservan con su marca original (el refresco no renueva el segundo factor). Es viable, y la función tolera `amr` ausente, con cadenas, nulos o marcas no numéricas o futuras (probado). **Pendiente de confirmar en el proyecto real** (caso 0 de `pruebas_rls.sql`): que tras `challengeAndVerify` el JWT trae una entrada `totp` con marca reciente. Si no la trajera, ningún admin tendría privilegios: por eso conviene aplicarlo primero en el proyecto de pruebas.
- Cliente: cuando el servidor responde "privilegios insuficientes" (42501) el panel abre un diálogo (`TotpRenovarDialog`) que pide un código nuevo, verifica con `mfa.challengeAndVerify` y reintenta una vez (`conRenovacionTotp`); aplicado a Soporte, Auditoría de la nube e incidentes. Si se cancela, la acción falla con mensaje claro.
- `fijarNuevaPassword`: tras `updateUser` llama `signOut({scope:'others'})`; evento nuevo `ACCOUNT_PASSWORD_CHANGED`.
- No se aplicó `es_admin_reciente` a las políticas de escritura de `parametros` (siguen con `es_admin()`, ventana de 15 min); ver 3.

### 2.3 C-06 · Mínimo privilegio del admin
- Quitado el `OR es_admin()` de SELECT sobre `sesiones` y `bloques_muestras` y del DELETE de `sesiones` (solo propietario; la purga sigue por función).
- `admin_leer_sesion(p_id, p_motivo)`: `es_admin_reciente(300)`, motivo 10-300, **primero** inserta `ADMIN_DATA_ACCESS {sesion, motivo}` (también si la sesión no existe), entrega solo `id, estado, visibilidad, inicio, fin, datos` (sin señal) y guarda el acceso en `accesos_admin`.
- **Visible para el titular:** `mis_accesos_admin()` (fecha y motivo, sin identidad del admin) y aviso en la pantalla Monitoreos (`AccesosAdminAviso`).
- UI admin: pestaña "Soporte y moderación" con el formulario de acceso excepcional (el contenido nunca se muestra sin motivo).

### 2.4 C-08 · Auditoría de nube fiable
- `tipos_evento` es la **única** lista blanca (origen `cliente`/`admin`/`servidor`); se elimina el CHECK fijo. `tests/schema.spec.js` verifica que coincida con `AUDIT_EVENTS` y que los de origen `servidor` coincidan con `EVENTOS_SOLO_SERVIDOR`.
- `registrar_evento(p_tipo, p_detalle)`: el actor lo calcula el servidor (`admin` solo si `es_admin()` efectivo); rechaza tipos `servidor` a todos y `admin` a quien no lo sea; cupo separado para eventos de seguridad. INSERT/UPDATE/DELETE directos revocados y política de inserción eliminada.
- Hash encadenado en servidor (`n`, `prev_hash`, `hash`, bajo `pg_advisory_xact_lock`), `verificar_cadena_auditoria()`, `admin_leer_auditoria(p_limite, p_desde, p_antes_de_id)`, `purgar_auditoria(730)` programada (`purga-auditoria`, 03:25 UTC).
- Cliente: cola persistente en IndexedDB (`meta['outbox:audit']`) con reintento exponencial (5 s a 5 min), que se vacía al volver la red, al iniciar o restaurar sesión; solo se envía lo de la cuenta con sesión; sin cuenta no se sube nada; un rechazo permanente se descarta sin atascar la cola. Se quitó el doble registro de `ADMIN_ROLE_GRANTED/REVOKED` e `INCIDENT_UPDATED` (los registra el servidor; el log local los conserva). Vista `/admin/auditoria` → pestaña "Nube" (filtros, paginación, exportación, "Verificar cadena").
- Eventos nuevos (`auditLog.js`, `schema.sql`, migración, tests): `ACCOUNT_PASSWORD_CHANGED`, `ADMIN_DATA_ACCESS`, `CONTENT_REPORTED`, `CONTENT_REMOVED`, `CONTENT_REPORT_REVIEWED`.

### 2.5 C-09 · Incidentes de extremo a extremo
- Políticas: alta solo con `estado='abierto'` y sin respuesta/lección (salvo admin); trigger que fija fecha y reportante y rechaza RUT, correos y valores de salud (22023); `admin_actualizar_incidente` valida el ciclo abrir → en análisis → cerrado/descartado (cierre exige respuesta y lección) y registra `INCIDENT_UPDATED`.
- Cliente: `fetchIncidentesNube` (RLS: el admin ve todos, cada persona los suyos) fusionado con la copia local (`mezclarIncidentes`, el servidor manda); contador de abiertos en la pestaña SGSI con refresco cada minuto; la persona ve estado y respuesta en Seguridad → "Mis notificaciones"; el alta usa `ignoreDuplicates` (un reintento no duplica ni sobrescribe).

### 2.6 C-11 · Tiempo y cuotas del servidor
- `sesiones.creado_en` (relleno con `least(inicio, now())`), forzado por trigger; `inicio` inmutable tras el alta; CHECK `inicio between creado_en - 1 día and creado_en + 15 min` (NOT VALID: no falla por filas antiguas); cuotas diarias y `purgar_sesiones` por `creado_en`. Un `inicio` de hace dos días o del año 2100 se rechaza (probado).
- Bloques: `creado_en` fijado por el servidor, `propietario`/`bytes` denormalizados; topes de **32 KB por bloque, 25 MB por sesión, 50 MB por cuenta, 1000 sesiones y 200 pacientes por cuenta** (editables en `cuota()`), contadores en `uso_cuenta` y `sesiones.bytes_aprox` mantenidos por triggers AFTER (un reintento con `ON CONFLICT DO NOTHING` no suma), `pg_advisory_xact_lock` por cuenta contra carreras. Error propio `ECG01` (no se reintenta; la app avisa "Alcanzaste tu límite de almacenamiento"). La cuenta puede leer su propio uso.
- Upsert de una sesión antigua (editar nombre o visibilidad días después) sigue funcionando: el trigger conserva `creado_en` e `inicio` de la fila existente (probado).

### 2.7 C-21 · Etiquetas
- `/(\d+)$/` en `cloudSync.js` y `/^Usuario \d+$/` en `users.js` (ahora en `services/users/etiquetas.js`); `nextUserNumber` usa el máximo entre contador, `numero` y el número de la etiqueta; índice único `pacientes_etiqueta_unica` (se omite con aviso si hay duplicados previos: consulta incluida en el mensaje); `createUser` renumera y reintenta ante `23505` (hasta 3 veces). Pruebas en `tests/etiquetas.spec.js`.

## 3. No implementado o diferido (y por qué)

- **C-04 puntos 4, 5 y 7** (casilla de consentimiento de publicación del titular y trigger que rechaza `publico` sin ella, retiro automático de lo público al retirar el consentimiento, correo institucional): dependen del modelo de consentimiento de la TANDA 2 (C-02/C-18) y de la decisión Q2; no se tocaron.
- **C-06**: `admin_resumen_cuentas()` y `admin_borrar_sesion()` no se crearon (la decisión es que el admin no explore cuentas; el soporte parte de un id de sesión, que da el titular o un reporte). El borrado masivo por admin ya no existe; la purga programada cubre la retención.
- **C-05**: `es_admin_reciente` no se aplicó a las escrituras de `parametros` (siguen con la ventana de 15 min de `es_admin()`); se puede endurecer cambiando esas tres políticas. No se tocó el *time-box* ni *inactivity timeout* de Supabase (manual, ver 4).
- **C-08**: no se anclan hashes locales en la nube; `ACCOUNT_LOGIN_FAILED`, `CLOUD_SYNC_FAILED`, `QUOTA_EXCEEDED`, `SESSION_EXPIRED` y `CONSENT_UPDATED` no se añadieron (sin punto de emisión implementado todavía: los fallos de inicio de sesión ocurren antes de tener sesión y deben revisarse en los registros de Auth de Supabase, trimestralmente).
- **C-09**: no hay webhook ni correo al responsable; la plantilla/plazo de notificación a la Agencia queda para C-28 (legal).
- **C-11**: la conciliación de bloques (C-19) y la cola de subida de bloques son de la TANDA 2; no se probó concurrencia real (100 inserciones paralelas) porque el motor de prueba es de una sola conexión: el diseño usa el candado por cuenta y el contador leído tras el candado.
- Tolerancia de reloj del CHECK de `inicio`: +15 min (el informe propone +5); con la subida diferida de la TANDA 2 un monitoreo no puede guardarse más de 24 h después de iniciado.
- La documentación ISO general (SoA, riesgos, R27, `control_acceso.md`, `PrivacyView`) **no** se actualizó (lo hace otro agente). Textos de la app que sí se corrigieron por tocar estos temas: lo que se publica (solo el día y la duración), tabla de privilegios del panel SGSI.

## 4. Qué debe hacer la usuaria

1. En un proyecto de **pruebas**: ejecutar `migracion_endurecimiento_2.sql` (o `schema.sql` en uno vacío), crear tres cuentas de prueba y ejecutar `pruebas_rls.sql`; todas las filas deben dar `ok = true`. Hacer el **caso 0** (leer la claim `amr` real tras ingresar el TOTP).
2. Repetir en el proyecto real y archivar la salida con fecha. Antes de aplicar en el real: confirmar que existe el índice por etiquetas únicas (si el aviso del paso 8 aparece, renombrar los duplicados y volver a ejecutar) y que `pg_cron` está activa (`select jobname from cron.job` debe listar `purga-ecg` y `purga-auditoria`).
3. Panel de Supabase (manual): "Allow anonymous sign-ins" desactivado; Authentication → Sessions: *time-box* e *inactivity timeout* si el plan lo permite; JWT expiry ≤ 3600 s; MFA TOTP habilitado.
4. Tras aplicar el SQL, desplegar el cliente nuevo (el cliente viejo seguiría insertando en `auditoria` y leyendo bloques públicos directamente y fallaría).
5. Mantener al menos dos administradores con TOTP antes de aplicar (si algo fallara con `amr`, la contingencia es el SQL Editor del dueño, `docs/sgsi/recuperacion_acceso_admin.md`).

## 5. Resultados de las verificaciones

Ver el resumen final entregado con esta tanda (lint, Vitest, build, Playwright) y el apartado 1 (SQL en PGlite). Archivos nuevos principales: `supabase/migracion_endurecimiento_2.sql`, `supabase/pruebas_rls.sql`, `src/services/cloud/auditOutbox.js`, `src/services/security/{adminTotp,adminRenovacion,soporte}.js`, `src/services/users/etiquetas.js`, `src/components/admin/{SoportePanel,TotpRenovarDialog}.vue`, `src/components/security/MisIncidentes.vue`, `src/components/account/AccesosAdminAviso.vue`, pruebas `tests/{auditOutbox,adminTotp,cloudSyncNube,incidentesNube,etiquetas}.spec.js` y `e2e/{comunidad,admin-soporte,auditoria}.nube.spec.js`.
