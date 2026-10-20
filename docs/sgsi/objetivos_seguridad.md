# Objetivos de seguridad de la información e indicadores

> **Código:** SGSI-OBJ-01 · **Versión:** 1.0 · **Fecha:** 2026-10-15 · **Clasificación:** Interno
> **Referencias:** ISO/IEC 27001:2013 cláusulas 6.2 y 9.1 · Implementación: `monitor-ecg-vue/src/services/security/isms.js` (`computeSecurityMetrics`, `evaluateObjectives`) y Administración → SGSI

## 1. Objetivos (6.2 a–e)

Coherentes con la política (SGSI-POL-01), medibles y derivados de los riesgos R01–R26.

| ID | Objetivo | Indicador | Meta | Riesgos |
|---|---|---|---|---|
| OBJ-1 | Mantener la integridad del registro de auditoría | Resultado de `auditLog.verify()` | **OK** en el 100 % de las verificaciones | R11 |
| OBJ-2 | Responder a los incidentes graves | Incidentes de severidad alta abiertos | **0** al cierre de cada hito | R19 |
| OBJ-3 | Detectar intentos de acceso indebido | `ADMIN_LOGIN_FAIL` en 30 días | **≤ 10** (más ⇒ investigar) | R02 |
| OBJ-4 | Revisar periódicamente los accesos | Días desde la última revisión (A.9.2.5) | **< 90** | R02, R17 |
| OBJ-5 | Concienciar al administrador | Política vigente aceptada en la app | **Sí** | R06, R01 |
| OBJ-6 | Proteger los datos cifrados | `INTEGRITY_ERROR` en 30 días | **0** | R01, R11 |

Indicadores complementarios (manuales): pruebas Vitest 100 % en verde; 0 vulnerabilidades altas en `npm audit`; nota **A** en securityheaders.com; 0 fallos en la lista de verificación §5.15.

## 2. Planificación (6.2 f–j)

| ID | Qué se hará | Recursos | Responsable | Cuándo | Cómo se evalúa |
|---|---|---|---|---|---|
| OBJ-1 | Verificación al abrir `/admin/auditoria` y en el panel SGSI | App | Admin | Continuo; revisión por hito | Indicador "Integridad de la auditoría" |
| OBJ-2 | Procedimiento de incidentes | App + `procedimiento_incidentes.md` | RS | Cada hito | Indicador "Incidentes abiertos (alta)" |
| OBJ-3 | Bloqueo progresivo y revisión de la auditoría | App | Admin | Mensual | Indicador "Inicios de sesión fallidos" |
| OBJ-4 | Revisión de accesos en el panel SGSI | App | Admin | Cada 90 días o al cambiar de responsable | Indicador "Revisión de accesos" |
| OBJ-5 | Aceptación de la política | App | Admin | Al publicar una versión | Indicador "Política aceptada" |
| OBJ-6 | Cifrado AES-GCM y fallo seguro | App | Dev | Continuo | Contador `INTEGRITY_ERROR` |

## 3. Seguimiento y medición (9.1 a–f)

| Qué | Método | Cuándo | Quién mide | Quién analiza |
|---|---|---|---|---|
| OBJ-1 a OBJ-6 | Cálculo automático en la app sobre la auditoría local y los incidentes (ventana de 30 días); resultados reproducibles porque la función es pura y tiene pruebas (`tests/isms.spec.js`) | Al abrir el panel SGSI; registro en el acta de cada hito | Administrador | RS y dirección (9.3) |
| Pruebas y lint | `npm test`, `npm run lint`, `npm run build` | Antes de cada entrega | Dev | RS |
| Cabeceras | securityheaders.com / `curl -I` | Tras cada despliegue | Dev | RS |
| Dependencias | `npm audit --audit-level=high` | Mensual | Dev | RS |

Los resultados se conservan en el acta de revisión (`auditoria_interna_y_revision.md`). Un objetivo no cumplido abre una no conformidad en `registro_no_conformidades.md`.
