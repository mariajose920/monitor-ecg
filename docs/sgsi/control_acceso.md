# Política de control de acceso

> **Código:** SGSI-ACC-01 · **Versión:** 1.0 · **Fecha:** 2026-10-15 · **Clasificación:** Interno
> **Referencias:** ISO/IEC 27001:2013 A.9.1.1 (y A.9.1.2, A.9.2.1–A.9.2.6, A.9.3.1, A.9.4.1–A.9.4.5) · Implementación: `src/stores/auth.js`, `src/router/guards.js`, `src/services/security/*`, `supabase/schema.sql`

## 1. Principios

- **Necesidad de conocer y mínimo privilegio:** cada rol accede solo a lo necesario.
- **Todo está prohibido salvo lo expresamente permitido:** RLS habilitado en todas las tablas; sin política = sin acceso.
- **Doble barrera:** ruta (guard) + acción (`assertAdmin`) en el cliente; RLS en el servidor.

## 2. Roles y permisos

| Recurso | Participante / cuenta normal | Administrador local (solo sin nube, PIN) | Administrador (nube: cuenta + rol + TOTP `aal2`) |
|---|---|---|---|
| Medir, ver y exportar **sus** sesiones | Sí | Sí | — |
| Ver datos de otros participantes | No | Sí (en el equipo) | Sí (`es_admin()`) |
| Parámetros globales (RF15, RF26, RF27) | Leer | Escribir local | Escribir en `parametros` |
| Auditoría | No | Leer / exportar | Leer `auditoria` |
| Incidentes | Notificar / ver los propios | Gestionar | Gestionar |
| Borrar todo / exportar todo | No | Sí, con reautenticación | Borrar sesiones |

## 3. Gestión de usuarios (A.9.2)

| Control | Regla |
|---|---|
| A.9.2.1 Registro y baja | Participantes: "Usuario N" generado por el sistema; baja con "Eliminar mis datos" o desde Administración → Participantes. En la nube, sesión **anónima** por navegador |
| A.9.2.2 Provisión | Con nube, el administrador es una cuenta normal (`/registro`) a la que **otro administrador (con aal2) concede el rol desde Administración → Administradores** (`admin_conceder_rol`) o, como contingencia, el dueño del proyecto con SQL; sin nube, el admin local se crea una única vez en `/admin/setup` |
| A.9.2.3 Privilegios | Las acciones privilegiadas llaman a `assertAdmin()`; en la nube, políticas con `es_admin()` = rol **y** `aal2` (segundo factor TOTP); `es_admin_registrado()` solo decide si se muestra el botón Admin; la app no puede escribir directamente en `administradores` (solo vía `admin_conceder_rol` / `admin_retirar_rol`, que exigen `es_admin()`, máximo 5 administradores y correo de cuenta confirmada); la clave `service_role` no se usa en la app |
| A.9.2.4 Información secreta | Contraseña de la cuenta ≥ 10 + secreto TOTP (se muestra solo en la inscripción); PIN local (solo sin nube) sin valor por defecto, ≥ 8, PBKDF2. **Recuperación:** el correo de restablecimiento no concede privilegios; la pérdida del TOTP sigue `recuperacion_acceso_admin.md` |
| A.9.2.5 Revisión | **Cada 90 días** o al cambiar de responsable, en Administración → Administradores (lista con correo y fecha de `admin_listar_administradores()`, botón "Registrar revisión") o en SGSI → "Revisión de derechos" ( evento `ACCESS_REVIEW_DONE`); verificar que hay al menos dos administradores |
| A.9.2.6 Retirada | Al terminar el semestre o cambiar de administrador: otro administrador pulsa **Retirar rol** en Administración → Administradores (pide confirmación y un código TOTP nuevo; no puede retirarse a sí mismo ni dejar menos de 1 administrador; evento `ADMIN_ROLE_REVOKED`); contingencia: `delete` del dueño del proyecto con SQL (efecto inmediato), eliminar su factor TOTP si se va, revocar accesos a Vercel/GitHub/Supabase; sin nube, cambiar el PIN |

### 3.1 Cuentas de usuario y pacientes (A.9.2.1, A.9.2.2, A.9.2.6)

- Las personas se registran con correo y contraseña (≥ 10 caracteres) y confirman el correo; el alta, el acceso y la baja quedan en la auditoría. La baja (`eliminar_mi_cuenta()`) borra cuenta, pacientes, monitoreos e incidentes propios.
- Cada cuenta es dueña de sus pacientes y monitoreos (RLS por propietario). El **administrador no accede a los perfiles de pacientes**; sí puede leer monitoreos para soporte, sin identificación del paciente.
- Un monitoreo `publico` es legible, en solo lectura, por cualquier cuenta autenticada y solo a través de las funciones RPC `listar_monitoreos_publicos()` y `monitoreo_publico()` (security definer, `search_path` fijo, máx. 100 filas; sustituyen a la vista `monitoreos_publicos`). Nunca por anónimos.
- Revisión de accesos: se revisan trimestralmente las cuentas con rol de administrador (`public.administradores`, vía `admin_listar_administradores()`).
- Procedimiento de concesión, retiro y recuperación: [`recuperacion_acceso_admin.md`](recuperacion_acceso_admin.md).

## 4. Responsabilidades del usuario (A.9.3.1)

No compartir el PIN ni la contraseña; no escribirlos en el equipo del laboratorio; cerrar sesión al terminar; notificar si se sospecha que se conocen.

## 5. Control de acceso a sistemas (A.9.4)

- **A.9.4.1:** el participante solo ve sus sesiones (filtro por ID en local, `propietario = auth.uid()` en la nube); la vista multisensor no muestra datos opcionales.
- **A.9.4.2:** con nube, el panel exige cuenta con rol + TOTP (`aal2`, aplicado por el servidor), 15 min de inactividad y 60 min máximo, código TOTP nuevo para borrado total, exportación global y cambio de retención, límite de 5 intentos/10 min, mensajes genéricos y auditoría `ADMIN_*`. Sin nube: bloqueo del PIN tras 5 fallos (5→60 min), expiración a los 10 min de inactividad y 60 min máximo, reautenticación con PIN.
- **Limitación del modo sin nube:** el administrador local con PIN disuade el uso casual, pero no detiene a quien controla el navegador; para datos reales se debe usar la nube con TOTP. Con la nube activa el PIN **no** se usa (un solo segundo factor, verificable en el servidor).
- **A.9.4.3:** validación de calidad del PIN (`validateNewPin`).
- **A.9.4.5:** repositorio con acceso mínimo y rama `main` protegida.
- **A.9.1.2:** la app solo se conecta a su propio origen y al proyecto Supabase (CSP `connect-src`).

## 6. Revisión de esta política

Junto con la política general (A.5.1.2), o antes si cambia la arquitectura de autenticación.

## Política de retención (A.18.1.3, A.8.3.2)

| Dato | Plazo | Mecanismo |
|---|---|---|
| Sesiones locales (IndexedDB cifrado) | Retención configurada por el administrador (**30 días por defecto**, máx. 180) | Purga al iniciar la app (`RETENTION_PURGE`) |
| Monitoreos en la nube (Supabase) | **365 días desde su fecha de inicio**, salvo que el titular los borre antes | Tarea diaria `purga-ecg` (pg_cron, 03:15 UTC) que ejecuta `public.purgar_sesiones(365)`; desactivable con `select cron.unschedule('purga-ecg');` |
| Cuentas sin acceso en 24 meses | Aviso por correo y, tras el plazo de aviso, eliminación | **Procedimiento manual / futuro** (no automatizado): el administrador revisa `auth.users.last_sign_in_at`, avisa y elimina |
| Auditoría local y réplica | 180 días | Rotación de la cadena de hashes |
