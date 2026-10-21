# Uso aceptable de los activos y clasificación de la información

> **Código:** SGSI-USO-01 · **Versión:** 2.0 · **Fecha:** 2026-10-20 · **Clasificación:** Público
> **Referencias:** ISO/IEC 27001:2013 A.8.1.3, A.8.1.4, A.8.2.1, A.8.2.2, A.8.2.3, A.8.3.1, A.8.3.3, A.6.2.1, A.11.2.9 · Resumen visible en `/seguridad`

## 1. Reglas de uso aceptable (A.8.1.3)

1. El sistema se usa solo para actividades del curso. **No es un dispositivo médico** ni sirve para diagnóstico.
2. No ingresar nombres reales, RUT, correos, teléfonos ni fotos; usar el identificador generado («Paciente N»). El alias y las notas, si se usan, se quedan solo en el dispositivo y no deben contener datos identificables.
2b. Usar la app solo con personas **mayores de 18 años** (la cuenta y cada paciente piden una declaración); no medir menores.
3. No intentar eludir los controles (DevTools, editar el almacenamiento, usar claves de otros) ni acceder a datos de otros participantes.
4. Respetar la seguridad eléctrica: batería o Bluetooth aislado con electrodos puestos.
5. Notificar cualquier incidente o punto débil en `/seguridad#reportar`.

## 2. Dispositivos móviles y equipos del laboratorio (A.6.2.1)

Bloqueo de pantalla activo; navegador actualizado; no usar perfiles de navegador sincronizados o compartidos para la app; no instalar extensiones no autorizadas en el perfil usado para medir.

**Cámara del celular (PPG):** conceder el permiso de cámara solo al sitio de la app y solo para medir; no apuntar la cámara a otras personas ni documentos; la app no guarda imágenes, únicamente la señal derivada (clasificación Confidencial-Sensible como el resto de señales de salud). Si la app se instala como PWA, aplican las mismas reglas de bloqueo de pantalla y perfil de navegador.

## 3. Pantalla limpia (A.11.2.9)

Cerrar la sesión de administrador al terminar; no dejar datos opcionales visibles; no tomar fotos o capturas con datos identificables. En equipos compartidos marcar «Estoy en un equipo compartido» al iniciar sesión (el token muere al cerrar la pestaña y la sesión se cierra tras 15 min de inactividad) y cerrar sesión para quitar los datos de la cuenta del equipo.

## 4. Esquema de clasificación (A.8.2.1), etiquetado (A.8.2.2) y manipulación (A.8.2.3)

| Nivel | Ejemplos | Etiqueta | Almacenar | Compartir / transferir | Eliminar |
|---|---|---|---|---|---|
| **Confidencial-Sensible** | Señal ECG, BPM, edad, peso, CSV exportados, copia temporal `respaldo_20261020` | Insignia roja "Confidencial-Sensible"; primera línea del CSV `# CLASIFICACION: CONFIDENCIAL-SENSIBLE…` | Cifrado (AES-GCM) o en Supabase con RLS | Solo seudonimizado, a personal autorizado, nunca por canales públicos; USB cifrado (A.8.3.1); no trasladar sin cifrar (A.8.3.3) | Borrado + *crypto-shredding*; borrar CSV tras su uso; local: retención del admin (30 días por defecto); nube: 365 días desde el inicio |
| **Confidencial** | Consentimientos, auditoría, credenciales, incidentes | Insignia ámbar "Confidencial" | Cifrado / hash | Solo admin y RS | Según retención (180 días auditoría) |
| **Interno** | Seudónimo, parámetros, código fuente | Insignia azul "Interno" | Repositorio privado / app | Equipo y docente | Libre |
| **Público** | Contenido educativo, política, aviso de privacidad | Insignia gris "Público" | — | Libre | Libre |

La insignia de la app es el componente `DataClassBadge` y su texto emergente cita los controles A.8.2.1/A.8.2.2.

## 4b. Publicación de monitoreos (A.8.2.3, A.13.2.1, A.18.1.4)

- Los monitoreos son **Confidencial-Sensible (datos de salud)**. Por defecto son privados y la nube está apagada. Publicar exige la nube activada, un paciente con declaración de mayoría de edad y el **consentimiento de publicación v2.0 de ese monitoreo** (el servidor rechaza lo contrario). Solo lo ven cuentas registradas, como «Paciente anónimo», con el día (sin hora) y la duración; nunca se publica el nombre, alias, nota ni la cuenta, y los datos del paciente solo con una segunda casilla.
- Uso aceptable: publicar únicamente datos de personas que lo consintieron; no escribir nombres, RUT ni correos en nombres o notas; no intentar reidentificar a las personas de monitoreos públicos ni descargarlos masivamente.
- Al detectar un monitoreo público que identifique a alguien, usar **«Reportar este monitoreo»** en Comunidad (o `/seguridad#reportar`); el administrador lo revisa y puede retirarlo con motivo (pasa a privado y no se puede volver a publicar).
- Equipos compartidos: con «equipo compartido» el cierre de sesión quita los datos de la cuenta sin preguntar; en equipo personal se pregunta.
- **Acceso del administrador:** solo excepcional, con motivo escrito, registrado y visible para el titular en Monitoreos.

## 4c. Política de retención (A.18.1.3, A.8.3.2)

| Dato | Plazo | Mecanismo |
|---|---|---|
| Sesiones locales (IndexedDB cifrado) | Retención configurada por el administrador (**30 días por defecto**, máx. 180); la purga local no borra la copia de la nube | Purga al iniciar la app y al abrir el espacio de una cuenta (`RETENTION_PURGE`) |
| Monitoreos en la nube (Supabase) | **365 días desde su fecha de inicio**, salvo que el titular los borre antes | Tarea diaria `purga-ecg` (pg_cron, 03:15 UTC) que ejecuta `public.purgar_sesiones(365)`; desactivable con `select cron.unschedule('purga-ecg');` |
| Cuentas sin acceso en 24 meses | Aviso por correo y, tras el plazo de aviso, eliminación | **Procedimiento manual / futuro** (no automatizado): el administrador revisa `auth.users.last_sign_in_at`, avisa y elimina |
| Auditoría local | 180 días | Rotación de la cadena de hashes |
| Auditoría de la nube | 2 años | Tarea `purga-auditoria` (`purgar_auditoria(730)`) |

Detalle y estado de verificación de cada tarea: `control_acceso.md` (política de retención).

## 5. Devolución de activos (A.8.1.4, A.11.2.5)

Registro de préstamo de sensores y electrodos (fecha, responsable, estado). Al terminar el semestre se devuelven y, si un PC prestado tuvo datos, se ejecuta "Borrar todos los datos" (A.11.2.7).

| Fecha | Activo | Responsable | Devuelto | Estado |
|---|---|---|---|---|
| | | | ☐ | |
