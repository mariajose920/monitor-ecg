# Pendientes manuales (fuera del código), priorizados

> **Versión:** 2.0 · **Fecha:** 2026-10-20 · **Clasificación:** Interno
> Acciones que solo puede hacer la responsable en los paneles de Supabase, Vercel y GitHub, o en reuniones. Esta versión reemplaza a la 1.0 y refleja el estado tras las TANDAS 1 y 2 (`CAMBIOS_TANDA1.md`, `CAMBIOS_TANDA2.md`) y la auditoría (`AUDITORIA_SISTEMA.md`).
> **Cómo usar este documento.** Hazlas en el orden de las prioridades. Al terminar cada una: anota fecha y evidencia (captura o salida), marca la casilla y actualiza la fila indicada de `sgsi/registro_no_conformidades.md`. Nada de lo que sigue se ha ejecutado todavía.

## Estado de partida (lo que sí está hecho)

- Las migraciones SQL **ya están aplicadas** en el proyecto real de Supabase (us-east-1) y existe una copia temporal en el esquema privado `respaldo_20261020`.
- Código verificado el 2026-10-20: 343 pruebas unitarias, 75 E2E (con Supabase simulado), 0 vulnerabilidades de producción. El SQL se probó en PGlite, **no en Supabase real**.
- No se ha verificado en el proyecto real: el claim `amr`, las políticas RLS con cuentas reales, la configuración del panel, las tareas de `pg_cron`.

## Resumen por prioridad

| Prioridad | Pendiente | Registro |
|---|---|---|
| **P0** (antes de volver a medir personas reales) | 1 Validar la migración; 2 Verificar acceso admin y el claim `amr`; 3 Segundo administrador; 4 Prueba de RLS con cuentas reales; 5 Eliminar `respaldo_20261020` tras validar; 6 Decidir sobre el monitoreo público previo | NC-07, NC-06, NC-08, NC-09, NC-10, NC-11 |
| **P1** (próximas semanas) | 7 Panel de Supabase; 8 SMTP propio; 9 CAPTCHA (con una advertencia importante); 10 Variables `VITE_RESPONSABLE_*` en Vercel; 11 Protección de rama y MFA en GitHub y Vercel | NC-12, NC-13, NC-18 |
| **P2** (por hito o antes de diciembre de 2026) | 12 Auditoría interna; 13 Revisión por la dirección; 14 Simulacro de incidente; 15 Prueba de restauración; 16 Revisión legal (Ley 21.719), DPA y región; 17 Rutinas periódicas | NC-14, NC-17 |

---

## P0

### 1. Validar la migración en el proyecto real (solo lectura)

1. Supabase → SQL Editor, ejecutar (son consultas de solo lectura):
   - `select jobname, schedule, active from cron.job;` → deben aparecer `purga-ecg` (`15 3 * * *`) y `purga-auditoria` (`25 3 * * *`), ambas `active = true`. Si falta alguna: Database → Extensions → habilitar `pg_cron` y volver a ejecutar `supabase/schema.sql` (idempotente).
   - `select * from information_schema.views where table_name = 'monitoreos_publicos';` → 0 filas.
   - `select tipo, origen from public.tipos_evento order by 1;` → incluye `CLOUD_SYNC_CHANGED`, `SESSION_IDLE_TIMEOUT`, `ISMS_EVIDENCE_RECORDED`.
   - `select has_table_privilege('authenticated', 'public.auditoria', 'insert');` → `false`.
   - `select count(*) from public.pacientes where alias is not null;` → 0, y `select count(*) from public.sesiones where datos ? 'notas' or datos ? 'nombre';` → 0.
2. Supabase → Advisors (Security y Performance): archivar captura; no debe aparecer `security_definer_view`.
3. Probar la app publicada: crear una cuenta de prueba, activar la nube en `/cuenta`, guardar un monitoreo y comprobar que aparece; borrar la cuenta de prueba con «Eliminar mi cuenta».
4. Evidencia: capturas con fecha. Cierra o actualiza NC-06 y NC-07.

### 2. Verificar el acceso de administrador y el claim `amr` (caso 0)

**Por qué:** `es_admin()` exige un código TOTP de los últimos 15 minutos leído de `amr`. Si el JWT real no lo trae, **ningún administrador tendría privilegios**. Esto no se ha probado con un token real.

1. Entra a la app publicada en `/acceso` con tu cuenta administradora. Si es la primera vez: pulsa **Admin** → `/admin/mfa` → escanea el QR con tu aplicación de autenticación e ingresa el código.
2. Confirma que `/admin` abre y que Administración → Administradores lista tu cuenta.
3. Lee el claim sin enviar tu token a ningún sitio externo. En la consola del navegador (F12) de la pestaña de la app:
   ```js
   const k = 'ecg-cloud-auth'
   const raw = localStorage.getItem(k) ?? sessionStorage.getItem(k)
   JSON.parse(atob(JSON.parse(raw).access_token.split('.')[1])).amr
   ```
   Debe mostrar un arreglo con un elemento `{ method: 'totp', timestamp: <segundos Unix de hace poco> }`. (Si usaste «equipo compartido» el token está en `sessionStorage`.) No copies ni pegues el token en otra página.
4. Espera **16 minutos**, recarga y entra a una acción de administrador (por ejemplo Soporte y moderación): la app debe abrir el diálogo «ingresa un código nuevo»; tras ingresarlo, la acción funciona.
5. Si el punto 3 no muestra `totp` o el panel te rechaza siempre: **no sigas**, aplica la contingencia de `sgsi/recuperacion_acceso_admin.md` §7 y deja constancia en NC-08.
6. Evidencia: captura de la salida del punto 3 (sin el token) y anotación en NC-08.

### 3. Crear un segundo administrador

1. La segunda persona se registra en `/registro` y confirma su correo.
2. En la app, con tu sesión de administrador: Administración → Administradores → escribe su correo → «Dar rol de administrador» → ingresa el código TOTP nuevo que te pide.
3. La persona entra en `/acceso`, pulsa **Admin**, inscribe su propio TOTP en `/admin/mfa` y guarda un respaldo del secreto (`sgsi/recuperacion_acceso_admin.md` §6).
4. Probar que **ambas** cuentas pueden entrar y que una puede retirar el rol a la otra (y volver a concederlo).
5. Evidencia: captura de la lista de administradores y eventos `ADMIN_ROLE_GRANTED` en Auditoría → Nube. Registrar la primera revisión de accesos con «Registrar revisión».
6. Solo si la app no permite concederlo (por ejemplo por el punto 2): SQL del dueño del proyecto (contingencia):
   ```sql
   insert into public.administradores (user_id)
   select id from auth.users where email = 'correo@ejemplo.cl' and email_confirmed_at is not null
   on conflict (user_id) do nothing;
   ```

### 4. Prueba de RLS con cuentas reales (`supabase/pruebas_rls.sql`)

1. **Primero en un proyecto de pruebas** (recomendado: crear un proyecto nuevo y ejecutar `supabase/schema.sql`). En el proyecto real solo si no hay datos que importen: el archivo termina en `ROLLBACK`, pero conviene no tocar producción.
2. Authentication → Users → crear tres cuentas con correo confirmado: `prueba-a@ejemplo.cl`, `prueba-b@ejemplo.cl`, `prueba-admin@ejemplo.cl` (o cambia los correos en el encabezado del archivo).
3. SQL Editor → pegar **todo** el archivo → Run. La tabla final debe mostrar `ok = true` en las 101 filas.
4. Hacer también el caso 0 (punto 2).
5. Prueba manual complementaria con dos cuentas A y B en la app: A crea un paciente y dos monitoreos (uno privado y uno público con consentimiento); B no ve el paciente ni el privado; B ve el público solo como «Paciente anónimo», con el día sin hora; sin sesión (clave anónima) `listar_monitoreos_publicos` da error de permiso; B reporta el público y el administrador lo retira desde Soporte y moderación.
6. Eliminar las cuentas de prueba. Archivar la salida con fecha en `docs/evidencias/` (carpeta nueva) y registrar en `VERIFICACION.md`. Cierra NC-09.

### 5. Eliminar el esquema temporal `respaldo_20261020` (solo tras validar)

1. Condiciones previas: puntos 1 y 4 hechos y la app funcionando con datos reales.
2. Revisa qué contiene: `select table_name from information_schema.tables where table_schema = 'respaldo_20261020';`
3. Si hay algo que quieras conservar, expórtalo antes (es una copia con **datos de salud**).
4. Elimínalo: `drop schema respaldo_20261020 cascade;` (**irreversible**). Verifica con `select schema_name from information_schema.schemata where schema_name like 'respaldo%';` → 0 filas.
5. Anota fecha y evidencia. Cierra NC-10 y baja R32.

### 6. Decidir sobre el monitoreo público previo (publicado sin consentimiento 2.0)

1. Mira cuántos hay: `select count(*) from public.sesiones where visibilidad = 'publico' and coalesce(datos #>> '{consentPublicacion,version}', '') <> '2.0';`
2. Decide (con el docente): **(a)** pasarlos a privado (recomendado: el texto anterior no describía lo que ocurría) con la consulta opcional comentada al final de `supabase/migracion_tanda2.sql` (cópiala, léela y ejecútala tú misma), o **(b)** pedir a los titulares que vuelvan a publicar con el consentimiento nuevo y retirar los que no lo hagan.
3. Registra la decisión, la fecha y el número de filas en NC-11.

---

## P1

### 7. Panel de Supabase (Authentication)

Hazlo con la app cerrada o en un horario sin uso. Toma una captura de cada ajuste.

- [ ] **Desactivar «Allow anonymous sign-ins»** (Authentication → Sign In / Providers). La app ya no los usa; las funciones públicas rechazan cuentas anónimas.
- [ ] **Confirm email** activo.
- [ ] **Longitud mínima de contraseña 10** y requisitos de letras y números (la app ya lo exige en el cliente; el servidor solo aplica lo que configures).
- [ ] **Leaked password protection** (protección de contraseñas filtradas): activarla si el plan lo ofrece; si no, anotar el riesgo residual (R23) en el plan de tratamiento. La app no compara contra bases de contraseñas filtradas.
- [ ] **Site URL** = `https://monitor-ecg1.vercel.app`; **Redirect URLs**: `https://monitor-ecg1.vercel.app/acceso`, `https://monitor-ecg1.vercel.app/restablecer` y, solo para desarrollo, `http://localhost:5173/**`. Probar «Olvidé mi contraseña» y confirmar que una URL ajena es rechazada.
- [ ] **MFA TOTP** habilitado (Authentication → Multi-Factor).
- [ ] **Sessions:** *time-box* (por ejemplo 24 h) e *inactivity timeout* si el plan lo permite; **JWT expiry ≤ 3600 s**. Si el plan gratuito no los ofrece, anotarlo como riesgo residual aceptado.
- [ ] **Rate limits** (registros, inicios de sesión, correos) en valores bajos.
- [ ] Authentication → **Logs**: revisar inicios fallidos (OBJ-10); exportar la revisión trimestral como evidencia.

Cierra NC-12 cuando todo esté marcado.

### 8. SMTP propio (R16, R23)

1. Project Settings → Authentication → SMTP Settings → activar *Custom SMTP* con un proveedor (remitente propio, usuario y clave; la clave solo en el panel).
2. Revisar las plantillas de «Confirm signup» y «Reset password» (en español).
3. Probar: registrar una cuenta de prueba y confirmar que el correo llega desde tu remitente; borrar la cuenta.
4. Este paso también habilita el aviso previo a cuentas inactivas (punto 17).

### 9. CAPTCHA (R16) — **leer la advertencia antes de activarlo**

> **Advertencia.** Hoy la app envía el token de CAPTCHA **solo al crear la cuenta** (`authService.js`, función `registrar`). Si activas «CAPTCHA protection» en el panel de Supabase, el servidor lo exigirá también al **iniciar sesión** y al **recuperar la contraseña**, que la app todavía no manda: **nadie podría entrar**. Por eso **no actives el CAPTCHA en Supabase hasta que el código envíe el token en esos flujos** (cambio de código pendiente, H-10/C-12). Mientras tanto la defensa son los límites de tasa de Auth y las cuotas del servidor.

Cuando el código esté listo: crear el sitio en Cloudflare Turnstile (o hCaptcha); Supabase → Attack Protection → Enable CAPTCHA con la clave **secreta**; en Vercel definir `VITE_CAPTCHA_PROVIDER` y `VITE_CAPTCHA_SITE_KEY`; ampliar la CSP de `vercel.json` según el README (`script-src`, `frame-src`, `connect-src`); probar registro, acceso y recuperación.

### 10. Variables `VITE_RESPONSABLE_*` en Vercel

1. Decide con el docente quién es legalmente el **responsable del tratamiento** (universidad o docente) y qué correo recibirá las solicitudes de derechos (plazo de respuesta que prometemos: 30 días corridos).
2. Vercel → Project → Settings → Environment Variables (Production): `VITE_RESPONSABLE_NOMBRE` y `VITE_RESPONSABLE_CORREO`. Verifica también `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` (solo la clave **publicable**; nunca `service_role`).
3. Redesplegar y comprobar que `/privacidad` muestra nombre y correo (sin ellos dice que el responsable no está configurado). Cierra NC-18.

### 11. Protección de la rama `main` y MFA en GitHub y Vercel (R05, R17)

1. GitHub → Settings → Branches → Add rule para `main`: *Require a pull request before merging* (1 aprobación), *Require status checks to pass* (jobs `calidad`, `e2e`, `secretos` de `ci.yml`), *Require branches to be up to date*, *Do not allow bypassing*. Activar *secret scanning* y *push protection*.
2. Activar MFA (TOTP) en la cuenta de GitHub, en Vercel (Account → Security) y en la cuenta del panel de Supabase; guardar los códigos de recuperación fuera del repositorio; añadir un segundo propietario en Supabase, Vercel y GitHub.
3. Decidir si el repositorio sigue siendo público con la documentación de seguridad (Q12 de la auditoría).
4. Evidencia: capturas de la regla y de «MFA enabled». Cierra NC-13 y MC-01.

---

## P2

### 12. Acta de auditoría interna (cláusula 9.2) — AI-01

1. Designar una persona auditora **ajena al equipo que desarrolló**. Entregarle `docs/AUDITORIA_SISTEMA.md` (con su sección «Estado de implementación») como entrada, no como acta.
2. Usar el programa y la plantilla de `sgsi/auditoria_interna_y_revision.md` §1 (auditar cláusulas 4 a 10 y los controles «Parcial» de la SoA).
3. Redactar el informe, firmarlo (auditora y responsable de seguridad), archivarlo con fecha y abrir las NC que resulten. Registrar en la app: Administración → SGSI → «Evidencias del SGSI» (tipo, fecha, responsable). **No se debe completar la plantilla con resultados que no se obtuvieron.**

### 13. Acta de revisión por la dirección (cláusula 9.3) — RD-01

1. Reunión con el docente supervisor; llevar: resultado de AI-01, indicadores del panel SGSI y OBJ-7 a OBJ-12, NC abiertas (NC-06 a NC-18), cambios en riesgos (R28 a R38) y oportunidades (MC-05 a MC-11).
2. En la misma reunión, **firmar** la política de seguridad, la política criptográfica y el plan de tratamiento, y **decidir** sobre los residuales Altos (R01/R31, R15/R29, R23/R36, R18/R37; ver `sgsi/plan_tratamiento_riesgos.md` §2).
3. Firmar el acta (plantilla en `sgsi/auditoria_interna_y_revision.md` §2.1), archivarla y registrarla en la app.

### 14. Simulacro de incidente (A.16.1, A.17.1.3) — SIM-01

1. Escenario: un monitoreo público con datos identificables (en cuentas de prueba).
2. Pasos: reportar con «Reportar este monitoreo»; el administrador lo revisa en Soporte y moderación y lo retira con motivo; evaluar severidad; decidir si corresponde notificar (Ley 21.719); cerrar con lección aprendida.
3. Medir tiempos de detección y contención. Plantilla en `sgsi/auditoria_interna_y_revision.md` §4.1.

### 15. Prueba de restauración de copias (A.12.3.1) — REST-01

1. Supabase → Database → Backups: comprobar qué incluye el plan. Si no hay copias: usar `pg_dump` o las exportaciones CSV/JSON de la app (la app **no** restaura monitoreos propios desde la nube).
2. Restaurar en un proyecto de prueba (**nunca** sobre producción) y comparar recuentos de sesiones, bloques y pacientes.
3. Registrar fecha, duración, RPO/RTO observados (propuestos: 7 días y 1 día) con la plantilla de §4.2. Cierra OBJ-7.

### 16. Revisión legal (Ley 21.719), DPA y región (R18, R37)

1. Consultar asesoría legal (la ley entra en vigor en diciembre de 2026): revisar `/privacidad` y el aviso de consentimiento; definir el **registro de actividades de tratamiento**, la **evaluación de impacto** (datos de salud con publicación opcional) y el **procedimiento y plazos de notificación de brechas** (plantilla de notificación a la Agencia).
2. Supabase → Settings → General: confirmar la región (**us-east-1**) y guardar captura. Revisar el DPA/términos de Supabase y Vercel, guardar el documento con fecha y anotar en `sgsi/proveedores.md` la fecha, certificaciones y cláusulas de transferencia internacional.
3. Decidir: aceptar us-east-1 (mantener el aviso) o migrar de región (proyecto nuevo y migración de datos). Cierra NC-17.
4. Si se mide a menores en algún taller, definir antes el procedimiento con el responsable legal: hoy la app solo admite personas mayores de 18 años (declaración autodeclarada).

### 17. Rutinas periódicas

- **Trimestral:** revisar inicios fallidos en los logs de Auth (OBJ-10); botón «Verificar cadena» en `/admin/auditoria` → Nube (OBJ-11); revisión de derechos de acceso con «Registrar revisión» (cada 90 días, OBJ-4); `select jobname, active from cron.job;`.
- **Semestral — cuentas inactivas (24 meses, manual):** `select id, email, last_sign_in_at from auth.users where last_sign_in_at < now() - interval '24 months';` avisar por correo (requiere SMTP, punto 8), esperar el plazo de aviso (sugerido 30 días) y eliminar la cuenta desde el panel. No está automatizado.
- **Cada cambio de arquitectura:** revisar la SoA, los riesgos y `/privacidad`; ejecutar el asesor de Supabase tras cada migración.

---

## Lo que está diferido a propósito (no es una tarea manual)

Bóveda local con frase, `exportar_mis_datos()`, reautenticación impuesta por el servidor, restauración de monitoreos propios desde la nube, conciliación de bloques, validación de `sesiones.datos` con lista blanca, retirar el modo PIN local, aislamiento y CRC de los sensores. Ver `CAMBIOS_TANDA1.md` §3 y `CAMBIOS_TANDA2.md` §4.
