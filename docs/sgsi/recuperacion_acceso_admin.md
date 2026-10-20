# Procedimiento formal de recuperación, concesión y retiro del acceso de administrador

> **Código:** SGSI-ADM-01 · **Versión:** 1.0 · **Fecha:** 2026-10-20 · **Clasificación:** Interno
> **Referencias:** ISO/IEC 27001:2013 A.9.2.3 (gestión de privilegios), A.9.2.4 (información secreta de autenticación), A.9.2.5 (revisión de derechos), A.9.2.6 (retirada de derechos), A.9.4.2 (inicio de sesión seguro), A.16.1.2/A.16.1.7 (eventos y evidencias), A.12.4.1 (registro) · Implementación: `supabase/migracion_admin_mfa.sql`, `src/stores/auth.js`, `src/views/admin/AdminMfaView.vue`

## 1. Principio

El administrador es **una cuenta normal** (correo + contraseña) con un **rol asignado** en `public.administradores` y un **segundo factor TOTP** obligatorio. Los privilegios efectivos (`es_admin()`, usada por RLS) exigen rol **y** sesión `aal2`. Por eso **restablecer la contraseña por correo no concede privilegios**: sin el factor TOTP la sesión queda en `aal1` y el servidor rechaza toda operación privilegiada. No existe autoservicio para recuperar el factor TOTP: se hace solo con este procedimiento.

## 2. Quién puede qué

| Acción | Quién | Dónde |
|---|---|---|
| Conceder / retirar el rol | **Otro administrador** (sesión `aal2` + código TOTP nuevo en cada acción); **contingencia:** el dueño del proyecto Supabase con SQL | App: Administración → Administradores · SQL Editor (contingencia) |
| Restablecer contraseña o eliminar el factor TOTP de otra persona | **Solo el dueño del proyecto** | Authentication → Users → (usuario) → contraseña / MFA |
| Aprobar una recuperación | Otro administrador **o** el docente responsable (regla de dos personas) | Fuera de la app, por escrito |
| Autoconcederse el rol | **Nadie**: `administradores` no admite escritura directa (`revoke insert, update, delete`); las funciones del servidor exigen `es_admin()` y la app no ofrece retirarse el propio rol | — |
| Dar el rol a una cuenta inexistente o sin correo confirmado | **Nadie**: el servidor responde con un mensaje genérico (no revela si el correo existe) | — |
| Superar 5 administradores | **Nadie** desde la app (límite en el servidor) | — |

## 3. Concesión del rol (A.9.2.3)

1. La persona crea su cuenta en `/registro` y confirma su correo.
2. El responsable verifica su identidad y registra la solicitud (ticket o acta con fecha, motivo y aprobador).
3. **Vía normal (en la app):** un administrador abre Administración → **Administradores**, escribe el correo de la cuenta ya registrada y confirmada, pulsa "Dar rol de administrador" y confirma con un código TOTP nuevo. El servidor (`admin_conceder_rol`) registra `ADMIN_ROLE_GRANTED` con los identificadores (nunca correos).
   **Contingencia (no hay otro administrador disponible):** el dueño del proyecto ejecuta en el SQL Editor:
   ```sql
   insert into public.administradores (user_id)
   select id from auth.users where email = 'correo-del-admin@ejemplo.cl'
   on conflict (user_id) do nothing;
   ```
4. La persona inicia sesión en `/acceso`; aparece el botón **Admin**; en `/admin/mfa` inscribe su aplicación de autenticación (primer ingreso).
5. Registrar el hecho: con la vía normal el evento `ADMIN_ROLE_GRANTED` se emite solo (servidor y registro local); con la contingencia SQL, anotarlo en el acta. Después, "Registrar revisión" en Administradores o SGSI.

## 4. Retiro o reasignación (A.9.2.6)

Al terminar el semestre, cambiar de responsable o ante sospecha de compromiso:

**Vía normal (en la app):** otro administrador abre Administración → **Administradores**, pulsa **Retirar rol** en la fila de la persona, confirma el aviso y un código TOTP nuevo. No se puede retirar a uno mismo ni dejar el sistema sin administradores. Evento `ADMIN_ROLE_REVOKED`.

**Contingencia (dueño del proyecto, SQL Editor):**

```sql
delete from public.administradores
where user_id = (select id from auth.users where email = 'correo-a-retirar@ejemplo.cl');
```

Después: eliminar su factor TOTP (Authentication → Users → MFA) si deja el proyecto, revocar accesos a Vercel/GitHub/Supabase, y, si se usó SQL, anotar `ADMIN_ROLE_REVOKED` en el acta. Los privilegios desaparecen en el servidor de inmediato (`es_admin()` consulta la tabla en cada petición); la sesión abierta del ex administrador deja de poder leer o escribir datos privilegiados.

## 5. Recuperación de acceso perdido (A.9.2.4)

Aplica cuando se perdió la contraseña **y/o** el dispositivo con el TOTP.

1. **Solicitud.** La persona avisa al responsable del proyecto (canal oficial). Si la app lo permite, registra un evento `ADMIN_RECOVERY_REQUESTED` en el acta/registro de incidentes.
2. **Verificación de identidad por un canal distinto** al de la solicitud (llamada, videollamada o presencial con el docente; no basta un correo). Anotar cómo se verificó.
3. **Aprobación de una segunda persona** (otro administrador o el docente responsable). Nadie aprueba su propia recuperación.
4. **Ejecución por el dueño del proyecto** en el panel de Supabase:
   - Contraseña perdida: enviar el enlace de restablecimiento (`/recuperar`) o fijar una contraseña temporal fuerte, que la persona cambia al entrar.
   - TOTP perdido: Authentication → Users → (usuario) → **MFA → eliminar el factor**. Esto fuerza una **nueva inscripción** TOTP en `/admin/mfa` en el próximo ingreso.
5. **Registro.** Abrir una entrada en el registro de incidentes (`/seguridad`, tipo «acceso») o en `registro_no_conformidades.md` con: fecha UTC, quién solicitó, cómo se verificó, quién aprobó, quién ejecutó, qué se restableció.
6. **Revisión posterior (≤ 7 días).** El responsable de seguridad confirma que la persona inscribió el nuevo TOTP, revisa la auditoría (`ADMIN_MFA_*`, `ADMIN_ACCOUNT_LOGIN`) buscando accesos extraños y cierra la entrada.
7. Si se sospecha compromiso de la cuenta, tratar como incidente de severidad alta (`procedimiento_incidentes.md`) y retirar el rol hasta aclarar.

## 6. Medidas de contingencia

- **Mínimo DOS administradores** con rol y TOTP propios, para que uno pueda revisar y aprobar al otro y evitar el bloqueo total. La revisión trimestral (A.9.2.5) verifica este mínimo.
- **Respaldo del factor TOTP:** inscribir el mismo secreto en un segundo dispositivo **en el momento de la inscripción** (mismo QR) o guardar la clave mostrada en un gestor de contraseñas del responsable. No guardar el secreto en el repositorio ni en el equipo compartido.
- **Cuenta de emergencia:** el dueño del proyecto conserva acceso al panel de Supabase (con su propio MFA) y puede restablecer cualquier cuenta con este procedimiento; no se usa la clave `service_role` en la app.
- **Códigos de recuperación** del panel de Supabase, GitHub y Vercel guardados fuera del repositorio (`docs/PENDIENTES_MANUALES.md`).

## 7. Caducidad de sesiones privilegiadas

- Modo admin en la app: **15 minutos de inactividad** y **60 minutos como máximo**; salir del modo admin o cerrar la sesión de la cuenta lo cierra de inmediato. Volver a entrar exige un **código TOTP nuevo**.
- Acciones destructivas (borrado total, exportación global, cambio de retención) piden **un código TOTP nuevo** (reautenticación).
- **Límite conocido:** el servidor valida el nivel `aal2` del token de acceso, que dura lo que indique *JWT expiry* (por defecto 1 h). Tras cerrar el modo admin en la app, un token `aal2` ya emitido seguiría siendo aceptado por el servidor hasta expirar. Mitigación: mantener *JWT expiry* en 3600 s o menos y, ante sospecha, retirar el rol (efecto inmediato) o cerrar todas las sesiones del usuario desde el panel.

## 8. Sin nube configurada

Si la copia de la aplicación no tiene Supabase, el único mecanismo es el **administrador local con PIN** (`/admin/setup`, `/admin/acceso`). Limitación: protege frente al uso casual, no frente a quien controla el navegador (ver `ISO27001_controles.md` §5.0); "Olvidé el PIN" solo restablece borrando todos los datos. Con la nube activa el PIN **no interviene**: la segunda confirmación es el código TOTP (decisión: un solo mecanismo de segundo factor, verificable en el servidor).

## 9. Registro de eventos de auditoría

`ADMIN_ACCOUNT_LOGIN` (inicio de sesión de una cuenta con rol), `ADMIN_MFA_ENROLLED`, `ADMIN_MFA_VERIFIED`, `ADMIN_MFA_FAILED`, `ADMIN_ROLE_GRANTED`, `ADMIN_ROLE_REVOKED`, `ADMIN_RECOVERY_REQUESTED`, además de `ACCESS_REVIEW_DONE` (revisión A.9.2.5). Las concesiones y retiros se hacen en el panel de Supabase y se documentan en el acta; los eventos `ADMIN_ROLE_*` y `ADMIN_RECOVERY_REQUESTED` están en la lista blanca para registrarlos en `auditoria` cuando el administrador los anote.
