# Objetivos de seguridad de la información e indicadores

> **Código:** SGSI-OBJ-01 · **Versión:** 2.0 · **Fecha:** 2026-10-20 · **Clasificación:** Interno
> **Referencias:** ISO/IEC 27001:2013 cláusulas 6.2 y 9.1 · Implementación: `monitor-ecg-vue/src/services/security/isms.js` (`computeSecurityMetrics`, `evaluateObjectives`) y Administración → SGSI
> **Cambios de la v2.0:** se añaden OBJ-7 a OBJ-12 con indicadores que se pueden medir con las herramientas reales del proyecto (CI, funciones del servidor, registros de Auth, actas) y se advierte qué mide la app y qué no. **Ninguna medición de OBJ-7 a OBJ-12 se ha realizado todavía**: figuran «pendiente de primera medición».

## 1. Objetivos (6.2 a–e)

Coherentes con la política (SGSI-POL-01), medibles y derivados de los riesgos R01–R38.

### 1.1 Calculados por la app (Administración → SGSI)

La app los evalúa sobre la **auditoría local** del navegador del administrador y los incidentes (ventana de 30 días). Es un indicador útil, pero **no ve la auditoría de la nube** ni los registros de Auth.

| ID | Objetivo | Indicador | Meta | Riesgos |
|---|---|---|---|---|
| OBJ-1 | Mantener la integridad del registro de auditoría | Resultado de `auditLog.verify()` | **OK** en el 100 % de las verificaciones | R11 |
| OBJ-2 | Responder a los incidentes graves | Incidentes de severidad alta abiertos | **0** al cierre de cada hito | R19 |
| OBJ-3 | Detectar intentos de acceso indebido | `ADMIN_LOGIN_FAIL` local en 30 días | **≤ 10** (más ⇒ investigar). *Limitación:* con nube, los inicios fallidos de las cuentas se ven en los registros de Auth (OBJ-10) | R02 |
| OBJ-4 | Revisar periódicamente los accesos | Días desde la última revisión (A.9.2.5) | **< 90** | R02, R17, R27 |
| OBJ-5 | Concienciar al administrador | Política vigente aceptada en la app | **Sí** | R06, R01 |
| OBJ-6 | Proteger los datos cifrados | `INTEGRITY_ERROR` en 30 días | **0** | R01, R11 |

### 1.2 Medidos fuera de la app

| ID | Objetivo | Indicador y fuente | Meta | Responsable | Frecuencia | Estado | Riesgos |
|---|---|---|---|---|---|---|---|
| OBJ-7 | Poder restaurar los datos | Una prueba de restauración en un proyecto aparte, con acta (fecha, duración, recuentos de sesiones/bloques/pacientes) | ≥ 1 prueba en los últimos **90 días** | Admin | Trimestral | Pendiente de primera medición | R10, R32 |
| OBJ-8 | Consentimiento vigente | Pacientes con datos opcionales o publicados sin consentimiento 2.0 vigente (revisión en Pacientes de cada cuenta de prueba y consulta del propietario del proyecto) | **0** (el servidor ya rechaza publicar sin consentimiento 2.0) | RS | Cada hito | Pendiente de primera medición (R33: publicaciones previas) | R08, R22, R33 |
| OBJ-9 | Cerrar los incidentes a tiempo | Días entre apertura y cierre de cada incidente (pestaña SGSI) | Severidad alta ≤ **3** días; el resto ≤ **15** días | RS | Cada hito | Pendiente de primera medición | R19 |
| OBJ-10 | Detectar intentos de acceso a cuentas | Revisión de los inicios fallidos en *Authentication → Logs* del panel de Supabase, exportada como evidencia | 1 revisión por trimestre, 0 patrones sin investigar | Admin | Trimestral | Pendiente de primera medición | R16, R23, R35 |
| OBJ-11 | Cadena de auditoría de la nube íntegra | botón «Verificar cadena» en `/admin/auditoria` → pestaña Nube (la función `verificar_cadena_auditoria()` exige `es_admin()`, por lo que no funciona desde el SQL Editor) | **OK** en cada verificación; ≥ 1 por trimestre | Admin | Trimestral | Pendiente de primera medición | R11, R35 |
| OBJ-12 | Dependencias sin vulnerabilidades de producción | `npm audit --omit=dev` en el CI (`.github/workflows/ci.yml`) | **0** vulnerabilidades altas o críticas; hoy 0 (verificado el 2026-10-20) | Dev | En cada cambio | Medido: 0 | R05 |

Además se vigilan, sin ser objetivos formales: 343 pruebas unitarias y 75 E2E en verde; nota **A** en securityheaders.com; incidentes de contenido público reportados y resueltos; número de administradores con TOTP (**≥ 2**).

## 2. Planificación (6.2 f–j)

| ID | Qué se hará | Recursos | Responsable | Cuándo | Cómo se evalúa |
|---|---|---|---|---|---|
| OBJ-1 | Verificación al abrir `/admin/auditoria` y en el panel SGSI | App | Admin | Continuo; revisión por hito | Indicador «Integridad de la auditoría» |
| OBJ-2 | Procedimiento de incidentes | App + `procedimiento_incidentes.md` | RS | Cada hito | Indicador «Incidentes abiertos (alta)» |
| OBJ-3 | Bloqueo progresivo y revisión de la auditoría | App | Admin | Mensual | Indicador «Inicios de sesión fallidos» |
| OBJ-4 | Revisión de accesos en el panel SGSI | App | Admin | Cada 90 días o al cambiar de responsable | Indicador «Revisión de accesos» |
| OBJ-5 | Aceptación de la política | App | Admin | Al publicar una versión | Indicador «Política aceptada» |
| OBJ-6 | Cifrado AES-GCM y fallo seguro | App | Dev | Continuo | Contador `INTEGRITY_ERROR` |
| OBJ-7 a OBJ-12 | Ver tabla 1.2 | Panel de Supabase, SQL Editor, CI, actas | Según tabla | Según tabla | Evidencia archivada con fecha |

## 3. Seguimiento y medición (9.1 a–f)

| Qué | Método | Cuándo | Quién mide | Quién analiza |
|---|---|---|---|---|
| OBJ-1 a OBJ-6 | Cálculo automático en la app sobre la auditoría local y los incidentes (ventana de 30 días); función pura con pruebas (`tests/isms.spec.js`) | Al abrir el panel SGSI; registro en el acta de cada hito | Administrador | RS y dirección (9.3) |
| OBJ-7 a OBJ-12 | Manual, con la fuente indicada en 1.2; se archiva la evidencia (captura o salida) con fecha | Según 1.2 | Según 1.2 | RS y dirección (9.3) |
| Pruebas y lint | `npm test` (343), `npm run lint`, `npm run build`, `npm run test:e2e` (75) | Antes de cada entrega | Dev | RS |
| Cabeceras | securityheaders.com / `curl -I` | Tras cada despliegue | Dev | RS |
| Dependencias | `npm audit --audit-level=high --omit=dev` (CI) | En cada cambio y mensual | Dev | RS |

Los resultados se conservan en el acta de revisión (`auditoria_interna_y_revision.md`). Un objetivo no cumplido abre una no conformidad en `registro_no_conformidades.md`. La app **no** calcula todavía OBJ-7 a OBJ-12; añadirlos al panel es una mejora (MC-10).
