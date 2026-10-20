# Pendientes manuales (fuera del código)

> **Versión:** 1.0 · **Fecha:** 2026-10-20 · **Clasificación:** Interno
> Acciones que solo puede hacer la responsable en los paneles de Supabase, Vercel y GitHub, o en reuniones. Al terminar cada una, anotar fecha y evidencia (captura o acta) y actualizar `sgsi/registro_no_conformidades.md`.

## 0. Aplicar los SQL (primero)

1. Supabase → SQL Editor: ejecutar `supabase/schema.sql` (idempotente) o, si ya está aplicado, `supabase/migracion_endurecimiento.sql`.
2. Verificar: `select jobname, schedule, active from cron.job;` debe mostrar `purga-ecg` (`15 3 * * *`). Si pg_cron no se pudo crear, habilitarlo en Database → Extensions y volver a ejecutar.
3. Verificar que no existe la vista: `select * from information_schema.views where table_name = 'monitoreos_publicos';` (0 filas) y volver a correr el asesor (Advisors → Security): debe desaparecer `security_definer_view`.
4. Desactivar la purga si hiciera falta: `select cron.unschedule('purga-ecg');`.
5. Cierra NC-06 y NC-07.

## 1. SMTP propio y confirmación de correo (R23, R16)

1. Authentication → Providers → Email: dejar **Confirm email** activo.
2. Project Settings → Authentication → SMTP Settings: activar *Custom SMTP* con un proveedor (remitente propio, usuario y clave del proveedor; guardar la clave solo en el panel).
3. Authentication → Rate Limits: revisar límites de correos, inicios de sesión y altas.
4. Probar: registrar una cuenta de prueba y confirmar que llega el correo desde el remitente propio; borrarla después.

## 2a. Administrador con cuenta + TOTP (R27, A.9.2.3, A.9.4.2) — hacer antes de usar el panel

1. Supabase → SQL Editor: ejecutar `supabase/migracion_admin_mfa.sql` (o `schema.sql` completo). Verificar: `select public.es_admin_registrado();` no falla y la lista blanca incluye `ADMIN_MFA_VERIFIED`.
2. Authentication → Sign In / Providers (o Multi-Factor): **habilitar MFA TOTP** (Enroll y Verify) si no lo está.
3. Mantener *JWT expiry* en 3600 s o menos (Project Settings → JWT).
4. Conceder el rol **solo a cuentas que ya existan y tengan correo confirmado** (nunca a una cuenta de uso compartido):
   `insert into public.administradores (user_id) select id from auth.users where email = 'correo@ejemplo.cl' on conflict (user_id) do nothing;`
5. Cada administrador entra en `/acceso`, pulsa **Admin** e inscribe su aplicación de autenticación en `/admin/mfa`.
6. **Crear el segundo administrador** (mínimo dos) y probar que cada uno puede entrar. Guardar el respaldo del TOTP según `sgsi/recuperacion_acceso_admin.md` §6.
7. Evidencia: captura de `select * from public.administradores;` (ids) y del evento `ADMIN_MFA_ENROLLED`.

## 2. MFA de la cuenta administradora (R17, SEC-50)

1. Activar MFA (TOTP) en la cuenta de Supabase (panel), en GitHub y en Vercel (Account → Security).
2. Guardar los códigos de recuperación fuera del repositorio.
3. Evidencia: captura de «MFA enabled» en cada servicio.

## 3. Protección de contraseñas filtradas y política de contraseñas (R23)

1. Authentication → Sign In / Providers → Email (o Attack Protection): activar **Leaked password protection**; si el plan no lo ofrece, anotarlo como riesgo aceptado.
2. Fijar longitud mínima 10 y exigir letras y números.
3. Evidencia: captura de la configuración.

## 4. Protección de la rama `main` en GitHub (SEC-58, R05)

1. Repositorio → Settings → Branches → Add rule para `main`.
2. Marcar: *Require a pull request before merging* (1 aprobación), *Require status checks to pass* (el job de `ci.yml`), *Require branches to be up to date*, *Do not allow bypassing*.
3. Evidencia: captura de la regla. Luego cambiar el estado de MC-01 a «Cerrada».

## 5. DPA y región de Supabase y Vercel (R18, A.15.1.2)

1. Supabase → Settings → General: confirmar la región (**us-east-1**) y guardar captura.
2. Revisar el DPA/términos de Supabase y Vercel (sitio de cada proveedor, sección legal/privacidad) y guardar el documento con fecha en el archivo del SGSI.
3. Anotar en `sgsi/proveedores.md` la fecha de revisión, certificaciones declaradas y si hay cláusulas de transferencia internacional.
4. Decidir: aceptar us-east-1 (mantener el aviso de `/privacidad`) o migrar de región (implica proyecto nuevo y migración de datos).

## 6. Acta firmada de auditoría interna (cláusula 9.2)

1. Designar a una persona auditora distinta de quien desarrolló.
2. Usar el programa y la lista de `sgsi/auditoria_interna_y_revision.md`; auditar al menos cláusulas 4–10 y los controles con estado Parcial.
3. Redactar el informe, firmarlo (auditora y responsable de seguridad) y archivarlo con fecha. Registrar hallazgos en `sgsi/registro_no_conformidades.md`.

## 7. Acta de revisión por la dirección (cláusula 9.3)

1. Reunión con el docente supervisor; llevar: resultados de la auditoría, indicadores del panel SGSI, NC abiertas (NC-05 a NC-07), cambios en riesgos (R22–R26) y oportunidades (MC-01 a MC-04).
2. Registrar decisiones y recursos; firmar el acta y archivarla.

## 8. Simulacro de incidente (A.16.1, A.17.1.3)

1. Escenario sugerido: un monitoreo público con datos identificables.
2. Pasos: reportar en `/seguridad`, el administrador lo vuelve privado, evaluar severidad, decidir si corresponde notificar (Ley 21.719), cerrar con lección aprendida (`sgsi/procedimiento_incidentes.md`).
3. Medir tiempos de detección y contención; anotar en el acta de revisión.

## 9. Prueba de restauración de copias (A.12.3.1)

1. Supabase → Database → Backups: comprobar si el plan incluye copias; si no, usar `pg_dump` o la exportación JSON/CSV de la app.
2. Restaurar en un proyecto de prueba (nunca sobre producción) y comprobar el recuento de sesiones, bloques y pacientes.
3. Registrar fecha, duración y resultado.

## 10. Variables en Vercel (opcional)

`monitor-ecg-vue/.env.production` ya trae la configuración. Si se prefiere no depender de ese archivo: Vercel → Project → Settings → Environment Variables, definir `VITE_SUPABASE_URL` y la clave **publicable** (nunca `service_role`) para *Production*, y volver a desplegar. Verificar cabeceras con `curl -I` y securityheaders.com.

## 11. Prueba real de las políticas RLS con dos cuentas (R15, MC-04)

1. Crear las cuentas A y B (correos de prueba, confirmadas).
2. Con A: crear un paciente y un monitoreo privado, y otro público. Con B comprobar: no ve el paciente ni el monitoreo privado (consulta directa a `sesiones`/`pacientes` devuelve 0 filas); `rpc('listar_monitoreos_publicos')` sí devuelve solo el público, con «Paciente anónimo» y sin etiqueta, alias ni propietario.
3. Sin sesión (clave anon): `listar_monitoreos_publicos` debe dar error de permiso.
4. Con B: intentar leer `bloques_muestras` del privado de A (0 filas) y borrar/actualizar filas de A (0 filas afectadas).
5. Borrar las cuentas de prueba con «Eliminar mi cuenta» y anotar resultado en `VERIFICACION.md`.

## 12. Cuentas inactivas (política de 24 meses, manual)

Cada semestre: `select id, email, last_sign_in_at from auth.users where last_sign_in_at < now() - interval '24 months';` avisar por correo, esperar el plazo de aviso (sugerido 30 días) y eliminar la cuenta desde el panel o con `eliminar_mi_cuenta` en nombre de la persona si lo solicita. No está automatizado.
