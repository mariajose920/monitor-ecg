# Política de control de acceso

> **Código:** SGSI-ACC-01 · **Versión:** 2.0 · **Fecha:** 2026-10-20 · **Clasificación:** Interno
> **Referencias:** ISO/IEC 27001:2013 A.9.1.1 (y A.9.1.2, A.9.2.1–A.9.2.6, A.9.3.1, A.9.4.1–A.9.4.5) · Implementación: `src/stores/auth.js`, `src/router/guards.js`, `src/services/security/*`, `src/services/cloud/almacenSesion.js`, `supabase/schema.sql`
> **Cambios de la v2.0 (TANDAS 1 y 2):** el administrador ya **no lee datos de salud de otras cuentas** salvo por acceso excepcional con motivo; no existen sesiones anónimas; la sesión de las cuentas tiene modo «equipo compartido» e inactividad de 15 min; lo público solo se lee por funciones; retención ampliada. Los controles dependen en parte de verificaciones manuales aún pendientes (ver §7).

## 1. Principios

- **Necesidad de conocer y mínimo privilegio:** cada rol accede solo a lo necesario.
- **Todo está prohibido salvo lo expresamente permitido:** RLS habilitado en todas las tablas; sin política = sin acceso.
- **Doble barrera:** ruta (guard) + acción (`assertAdmin`) en el cliente; RLS y funciones en el servidor.
- **Los datos de salud de una cuenta solo los ve su titular.** Ni siquiera el administrador los lee de forma masiva (decisión de la responsable, Q6).

## 2. Roles y permisos

| Recurso | Participante / cuenta normal | Administrador local (solo sin nube, PIN) | Administrador (nube: cuenta + rol + TOTP) |
|---|---|---|---|
| Medir, ver y exportar **sus** monitoreos | Sí | Sí | Solo los propios, como cualquier cuenta |
| Ver monitoreos y pacientes de **otras** cuentas | No | Solo los del equipo local (no hay otras cuentas) | **No** por consulta directa. Excepción: `admin_leer_sesion(id, motivo)` (motivo escrito de 10 a 300 caracteres, TOTP de ≤ 5 min, solo `datos` sin señal, **registrado antes de leer y visible para el titular**) |
| Ver lo público | Sí (cuentas registradas), solo vía funciones | — | Igual que cualquier cuenta |
| Reportar un monitoreo público | Sí | — | Sí; además revisa y retira publicaciones con motivo |
| Parámetros globales (RF15, RF26, RF27) | Leer | Escribir local | Escribir en `parametros` |
| Auditoría | No | Leer / exportar la local | Leer la de toda la nube (`admin_leer_auditoria`) y verificar la cadena |
| Incidentes | Notificar y ver los propios | Gestionar | Ver todos y gestionar |
| Borrar | Lo propio | Borrar todo local con reautenticación | Lo propio; **no** puede borrar sesiones ajenas (la purga programada cubre la retención) |

## 3. Gestión de usuarios (A.9.2)

| Control | Regla |
|---|---|
| A.9.2.1 Registro y baja | Cuentas con correo y contraseña (Supabase Auth, confirmación de correo, declaración de mayoría de edad); **no existe autenticación anónima** (debe estar desactivada en el panel, pendiente de verificar). Pacientes «Paciente N» generados por el sistema, con declaración de mayoría de edad. Baja con «Eliminar mis datos en la nube» y «Eliminar mi cuenta» (piden la contraseña), o «Eliminar» por paciente |
| A.9.2.2 Provisión | Con nube, el administrador es una cuenta normal (`/registro`) a la que **otro administrador (TOTP de ≤ 5 min) concede el rol desde Administración → Administradores** (`admin_conceder_rol`) o, como contingencia, el dueño del proyecto con SQL; sin nube, el admin local se crea una única vez en `/admin/setup` |
| A.9.2.3 Privilegios | Las acciones privilegiadas llaman a `assertAdmin()`; en la nube, `es_admin()` = rol **y** `aal2` **y** TOTP de ≤ 15 min, y `es_admin_reciente(300)` para acciones sensibles; `es_admin_registrado()` solo decide si se muestra el botón Admin; la app no escribe directamente en `administradores` (solo vía `admin_conceder_rol` / `admin_retirar_rol`, máximo 5 administradores y correo de cuenta confirmada); la clave `service_role` no se usa en la app |
| A.9.2.4 Información secreta | Contraseña de la cuenta ≥ 10, con letras y números, sin el correo ni contraseñas comunes; cambiarla cierra las otras sesiones; secreto TOTP (se muestra solo en la inscripción); PIN local (solo sin nube) sin valor por defecto, ≥ 8, PBKDF2. **Recuperación:** el correo de restablecimiento no concede privilegios; la pérdida del TOTP sigue `recuperacion_acceso_admin.md` |
| A.9.2.5 Revisión | **Cada 90 días** o al cambiar de responsable, en Administración → Administradores o SGSI → «Revisión de derechos» (evento `ACCESS_REVIEW_DONE`); verificar que hay al menos dos administradores. **Estado: ninguna revisión ejecutada aún** |
| A.9.2.6 Retirada | Otro administrador pulsa **Retirar rol** (confirmación y TOTP nuevo; no a uno mismo; mínimo 1; evento `ADMIN_ROLE_REVOKED` del servidor); contingencia: `delete` del dueño del proyecto con SQL (efecto inmediato), eliminar su factor TOTP si se va, revocar accesos a Vercel/GitHub/Supabase; sin nube, cambiar el PIN |

### 3.1 Cuentas de usuario y pacientes (A.9.2.1, A.9.2.2, A.9.2.6)

- Las personas se registran con correo y contraseña (≥ 10 caracteres), confirman el correo y declaran ser mayores de 18 años; el alta, el acceso y la baja quedan en la auditoría. La baja (`eliminar_mi_cuenta()`) borra cuenta, pacientes, monitoreos e incidentes propios.
- Cada cuenta es dueña de sus pacientes y monitoreos (RLS por propietario). **El administrador no accede a los perfiles de pacientes ni lee monitoreos por consulta directa**; el soporte parte de un identificador de sesión que entrega el titular o un reporte y exige `admin_leer_sesion` con motivo (queda en `accesos_admin` y el titular lo ve en Monitoreos).
- **La nube es opcional y está apagada por defecto.** Sin «Guardar mis datos en la nube» no se sube nada; los borradores nunca se suben; el alias, el nombre y las notas se quedan en el dispositivo.
- Un monitoreo `publico` solo puede ser publicado con consentimiento de publicación v2.0 del titular y declaración de mayoría de edad del paciente (lo exige el servidor); lo ve cualquier **cuenta registrada** (nunca anónimos), en solo lectura, a través de las funciones `listar_monitoreos_publicos()`, `monitoreo_publico()` y `senal_publica()` (security definer, `search_path` fijo, solo `authenticated`), con fecha truncada al día y como «Paciente anónimo». Cualquier cuenta puede reportarlo; el administrador lo retira con motivo y no puede volver a publicarse.
- Vincular datos del dispositivo a una cuenta solo ofrece el espacio sin cuenta, con selección por paciente (apagado por defecto en equipo compartido).
- Revisión de accesos: se revisan trimestralmente las cuentas con rol de administrador (`admin_listar_administradores()`).
- Procedimiento de concesión, retiro y recuperación: [`recuperacion_acceso_admin.md`](recuperacion_acceso_admin.md).

## 4. Responsabilidades del usuario (A.9.3.1)

No compartir el PIN ni la contraseña; no escribirlos en el equipo del laboratorio; marcar «Estoy en un equipo compartido» en equipos que usen otras personas y cerrar sesión al terminar; notificar si se sospecha que se conocen.

## 5. Control de acceso a sistemas (A.9.4)

- **A.9.4.1:** el participante solo ve sus monitoreos (filtro por ID en local, `propietario = auth.uid()` en la nube); la vista multisensor no muestra datos opcionales; el administrador no tiene lectura masiva (ver §2).
- **A.9.4.2:** con nube, el panel exige cuenta con rol + TOTP (`aal2` y TOTP reciente, aplicado por el servidor), 15 min de inactividad y 60 min máximo del modo admin, código TOTP nuevo para borrado total, exportación global y cambio de retención (y diálogo de renovación cuando el servidor lo pide), límite de 5 intentos/10 min, mensajes genéricos y auditoría `ADMIN_*`. Cuentas: cierre de sesión por **inactividad de 15 min** (aviso 1 min antes; una medición en curso cuenta como actividad); con «equipo compartido» el token vive en `sessionStorage` (muere al cerrar la pestaña) y cerrar sesión quita el espacio local de la cuenta; en equipo personal el token queda en `localStorage`. Sin nube: bloqueo del PIN tras 5 fallos (5→60 min), expiración a los 10 min de inactividad y 60 min máximo, reautenticación con PIN.
- **Limitación del modo sin nube:** el administrador local con PIN disuade el uso casual, pero no detiene a quien controla el navegador; para datos reales se debe usar la nube con TOTP. Con la nube activa el PIN **no** se usa.
- **Limitación de la reautenticación:** pedir la contraseña antes de cambiarla, borrar datos de la nube o eliminar la cuenta es una barrera **del cliente**; el servidor no la impone (diferido).
- **A.9.4.3:** validación de calidad del PIN (`validateNewPin`) y política de contraseñas de cuenta (cliente; longitud mínima del servidor según Supabase Auth, por verificar).
- **A.9.4.5:** repositorio con acceso mínimo, CI y Dependabot; **la protección de la rama `main` aún no está activada** (manual).
- **A.9.1.2:** la app solo se conecta a su propio origen y al proyecto Supabase (CSP `connect-src`).

## 6. Revisión de esta política

Junto con la política general (A.5.1.2), o antes si cambia la arquitectura de autenticación.

## 7. Verificaciones pendientes (no declarar «implementado» hasta cerrarlas)

| Pendiente | Registro |
|---|---|
| Claim `amr` real tras `challengeAndVerify` (caso 0 de `supabase/pruebas_rls.sql`) | NC-08 |
| Prueba de RLS con tres cuentas reales (`pruebas_rls.sql`) | NC-09 |
| Panel de Supabase: inicios anónimos desactivados, SMTP propio, CAPTCHA, contraseñas filtradas, redirect URLs, *time-box* | NC-12 |
| Protección de rama `main` y MFA en GitHub/Vercel | NC-13 |

## Política de retención (A.18.1.3, A.8.3.2)

| Dato | Plazo | Mecanismo |
|---|---|---|
| Sesiones locales (IndexedDB cifrado) | Retención configurada por el administrador (**30 días por defecto**, máx. 180); no borra la copia de la nube | Purga al iniciar la app y al abrir el espacio de una cuenta (`RETENTION_PURGE`) |
| Monitoreos en la nube (Supabase) | **365 días desde su fecha de inicio**, salvo que el titular los borre antes | Tarea diaria `purga-ecg` (pg_cron, 03:15 UTC) que ejecuta `public.purgar_sesiones(365)`; verificar con `select jobname from cron.job`; desactivable con `select cron.unschedule('purga-ecg');` |
| Auditoría local | 180 días o 5000 entradas | Rotación de la cadena de hashes |
| Auditoría de la nube | **2 años** | Tarea `purga-auditoria` (03:25 UTC) que ejecuta `purgar_auditoria(730)` |
| Cuentas sin acceso en 24 meses | Aviso por correo y, tras el plazo de aviso, eliminación | **Procedimiento manual** (no automatizado): el administrador revisa `auth.users.last_sign_in_at`, avisa y elimina |
| Incidentes | Sin purga automática (decisión pendiente) | — |
| Copia de respaldo temporal `respaldo_20261020` | Hasta validar la migración | **Eliminar manualmente** (NC-10) |
| Copias de respaldo del proveedor | Según su plan; pueden conservar datos ya borrados | Fuera de nuestro control |
