# Política de control de acceso

> **Código:** SGSI-ACC-01 · **Versión:** 1.0 · **Fecha:** 2026-10-15 · **Clasificación:** Interno
> **Referencias:** ISO/IEC 27001:2013 A.9.1.1 (y A.9.1.2, A.9.2.1–A.9.2.6, A.9.3.1, A.9.4.1–A.9.4.5) · Implementación: `src/stores/auth.js`, `src/router/guards.js`, `src/services/security/*`, `supabase/schema.sql`

## 1. Principios

- **Necesidad de conocer y mínimo privilegio:** cada rol accede solo a lo necesario.
- **Todo está prohibido salvo lo expresamente permitido:** RLS habilitado en todas las tablas; sin política = sin acceso.
- **Doble barrera:** ruta (guard) + acción (`assertAdmin`) en el cliente; RLS en el servidor.

## 2. Roles y permisos

| Recurso | Participante (sin contraseña, RF02) | Administrador local (PIN) | Administrador nube (Supabase Auth) |
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
| A.9.2.2 Provisión | El admin de la nube se crea solo desde el panel de Supabase y se habilita con `insert into public.administradores`; el admin local se crea una única vez en `/admin/setup` |
| A.9.2.3 Privilegios | Las acciones privilegiadas llaman a `assertAdmin()`; en la nube, políticas con `es_admin()`; la clave `service_role` no se usa en la app |
| A.9.2.4 Información secreta | PIN sin valor por defecto, ≥ 8 caracteres, no trivial, guardado como PBKDF2; contraseña de la nube robusta + MFA del panel |
| A.9.2.5 Revisión | **Cada 90 días** o al cambiar de responsable, en Administración → SGSI → "Registrar revisión" (evento `ACCESS_REVIEW_DONE`) |
| A.9.2.6 Retirada | Al terminar el semestre o cambiar de administrador: cambiar PIN, `delete from public.administradores where user_id = …`, revocar accesos a Vercel/GitHub/Supabase |

### 3.1 Cuentas de usuario y pacientes (A.9.2.1, A.9.2.2, A.9.2.6)

- Las personas se registran con correo y contraseña (≥ 10 caracteres) y confirman el correo; el alta, el acceso y la baja quedan en la auditoría. La baja (`eliminar_mi_cuenta()`) borra cuenta, pacientes, monitoreos e incidentes propios.
- Cada cuenta es dueña de sus pacientes y monitoreos (RLS por propietario). El **administrador no accede a los perfiles de pacientes**; sí puede leer monitoreos para soporte, sin identificación del paciente.
- Un monitoreo `publico` es legible, en solo lectura, por cualquier cuenta autenticada y solo a través de la vista `monitoreos_publicos`. Nunca por anónimos.
- Revisión de accesos: se revisan trimestralmente las cuentas con rol de administrador (`public.administradores`).

## 4. Responsabilidades del usuario (A.9.3.1)

No compartir el PIN ni la contraseña; no escribirlos en el equipo del laboratorio; cerrar sesión al terminar; notificar si se sospecha que se conocen.

## 5. Control de acceso a sistemas (A.9.4)

- **A.9.4.1:** el participante solo ve sus sesiones (filtro por ID en local, `propietario = auth.uid()` en la nube); la vista multisensor no muestra datos opcionales.
- **A.9.4.2:** bloqueo tras 5 fallos (5→60 min), expiración por 10 min de inactividad y 60 min máximo, reautenticación para acciones destructivas; auditoría de fallos.
- **A.9.4.3:** validación de calidad del PIN (`validateNewPin`).
- **A.9.4.5:** repositorio con acceso mínimo y rama `main` protegida.
- **A.9.1.2:** la app solo se conecta a su propio origen y al proyecto Supabase (CSP `connect-src`).

## 6. Revisión de esta política

Junto con la política general (A.5.1.2), o antes si cambia la arquitectura de autenticación.
