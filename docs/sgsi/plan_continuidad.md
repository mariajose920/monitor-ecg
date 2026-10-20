# Plan de continuidad de la seguridad de la información

> **Código:** SGSI-BCP-01 · **Versión:** 1.1 · **Fecha:** 2026-10-20 · **Clasificación:** Interno
> **Referencias:** ISO/IEC 27001:2013 A.17.1.1, A.17.1.2, A.17.1.3, A.17.2.1, A.12.3.1

## 1. Requisitos (A.17.1.1)

- **Proceso crítico:** sesiones de medición en clase o laboratorio (RNF05).
- **Tiempo máximo tolerable de interrupción:** la duración de una sesión (≈ 15 min); se acepta repetir una medición.
- **Pérdida de datos tolerable:** la sesión en curso; las sesiones finalizadas no deben perderse.
- **La seguridad no se relaja en situación adversa:** el cifrado, la auditoría y el control de acceso siguen activos en todos los modos de respaldo.

## 2. Escenarios y respuesta (A.17.1.2)

| Escenario | Detección | Respuesta | Seguridad que se mantiene |
|---|---|---|---|
| Desconexión del sensor / Bluetooth | "Señal perdida" (watchdog), `SERIAL_LOST` | Revisar cables y batería; reconectar; los datos capturados se conservan | Datos cifrados localmente |
| Sensor averiado | Sin datos / leads-off permanente | Usar el **simulador** para la demostración; registrar en el préstamo | Sin datos reales en el simulador |
| Sin Internet / Vercel caído | La app no carga o la nube no responde | La PWA abre desde el service worker (app shell en caché, si ya se visitó en línea) y trabaja con datos locales; sin red no hay nube, cuentas ni comunidad; alternativa: `vite preview` desde un equipo del equipo | Igual que en línea |
| Supabase caído o sin cuota | Estado "error" en Administración → Nube | Continuar en local; la sincronización se reintenta en la siguiente escritura | Datos solo en el equipo, cifrados |
| Borrado del almacenamiento del navegador | Lista de sesiones vacía | Recuperar desde Supabase (admin) o desde la última exportación | Exportaciones seudonimizadas |
| Equipo comprometido o robado | Notificación de incidente | Procedimiento SGSI-INC-01; "Borrar todo" si se recupera; revocar sesiones de la nube | *Crypto-shredding* |
| Pérdida del PIN de administrador | — | "Olvidé el PIN" = restablecer borrando los datos locales (por diseño); los datos de la nube siguen disponibles para el admin de Supabase | No hay recuperación que eluda el control |

## 3. Redundancia (A.17.2.1)

- SPA servida por la CDN de Vercel (varias regiones) y PWA con service worker (app shell sin conexión; no cubre la nube).
- Copia de sesiones y auditoría en Supabase (cuando está configurado); respaldo de la BD según el plan del proveedor.
- Proyecto Supabase en una sola región (us-east-1), sin conmutación por error; se acepta (R13). La prueba de restauración de copias está pendiente (docs/PENDIENTES_MANUALES.md).
- Cámara/sensor: si el MAX30100 falla, usar la cámara PPG o el simulador.

## 4. Copias de seguridad (A.12.3.1)

- Antes de "Borrar todo" o del fin de semestre: exportación CSV seudonimizada y exportación JSON de la auditoría, guardadas cifradas por el docente.
- Retención en la nube: 365 días (tarea purga-ecg); exportar antes lo que deba conservarse más tiempo.
- Verificación: abrir el CSV exportado y comprobar la línea de clasificación y el número de filas.

## 5. Verificación del plan (A.17.1.3)

En cada hito se ejecuta un **simulacro** de 10 minutos: (1) desconectar el sensor durante una sesión, (2) desactivar la red y continuar con el simulador, (3) comprobar que la auditoría registra los eventos. El resultado se anota en el acta de revisión.
