# Uso aceptable de los activos y clasificación de la información

> **Código:** SGSI-USO-01 · **Versión:** 1.0 · **Fecha:** 2026-10-15 · **Clasificación:** Público
> **Referencias:** ISO/IEC 27001:2013 A.8.1.3, A.8.1.4, A.8.2.1, A.8.2.2, A.8.2.3, A.8.3.1, A.8.3.3, A.6.2.1, A.11.2.9 · Resumen visible en `/seguridad`

## 1. Reglas de uso aceptable (A.8.1.3)

1. El sistema se usa solo para actividades del curso. **No es un dispositivo médico** ni sirve para diagnóstico.
2. No ingresar nombres reales, RUT, correos, teléfonos ni fotos; usar el identificador generado.
3. No intentar eludir los controles (DevTools, editar el almacenamiento, usar claves de otros) ni acceder a datos de otros participantes.
4. Respetar la seguridad eléctrica: batería o Bluetooth aislado con electrodos puestos.
5. Notificar cualquier incidente o punto débil en `/seguridad#reportar`.

## 2. Dispositivos móviles y equipos del laboratorio (A.6.2.1)

Bloqueo de pantalla activo; navegador actualizado; no usar perfiles de navegador sincronizados o compartidos para la app; no instalar extensiones no autorizadas en el perfil usado para medir.

**Cámara del celular (PPG):** conceder el permiso de cámara solo al sitio de la app y solo para medir; no apuntar la cámara a otras personas ni documentos; la app no guarda imágenes, únicamente la señal derivada (clasificación Confidencial-Sensible como el resto de señales de salud). Si la app se instala como PWA, aplican las mismas reglas de bloqueo de pantalla y perfil de navegador.

## 3. Pantalla limpia (A.11.2.9)

Cerrar la sesión de administrador al terminar; no dejar datos opcionales visibles; no tomar fotos o capturas con datos identificables.

## 4. Esquema de clasificación (A.8.2.1), etiquetado (A.8.2.2) y manipulación (A.8.2.3)

| Nivel | Ejemplos | Etiqueta | Almacenar | Compartir / transferir | Eliminar |
|---|---|---|---|---|---|
| **Confidencial-Sensible** | Señal ECG, BPM, edad, peso, CSV exportados | Insignia roja "Confidencial-Sensible"; primera línea del CSV `# CLASIFICACION: CONFIDENCIAL-SENSIBLE…` | Cifrado (AES-GCM) o en Supabase con RLS | Solo seudonimizado, a personal autorizado, nunca por canales públicos; USB cifrado (A.8.3.1); no trasladar sin cifrar (A.8.3.3) | Borrado + *crypto-shredding*; borrar CSV tras su uso |
| **Confidencial** | Consentimientos, auditoría, credenciales, incidentes | Insignia ámbar "Confidencial" | Cifrado / hash | Solo admin y RS | Según retención (180 días auditoría) |
| **Interno** | Seudónimo, parámetros, código fuente | Insignia azul "Interno" | Repositorio privado / app | Equipo y docente | Libre |
| **Público** | Contenido educativo, política, aviso de privacidad | Insignia gris "Público" | — | Libre | Libre |

La insignia de la app es el componente `DataClassBadge` y su texto emergente cita los controles A.8.2.1/A.8.2.2.

## 5. Devolución de activos (A.8.1.4, A.11.2.5)

Registro de préstamo de sensores y electrodos (fecha, responsable, estado). Al terminar el semestre se devuelven y, si un PC prestado tuvo datos, se ejecuta "Borrar todos los datos" (A.11.2.7).

| Fecha | Activo | Responsable | Devuelto | Estado |
|---|---|---|---|---|
| | | | ☐ | |
