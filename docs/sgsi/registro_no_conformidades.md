# Registro de no conformidades y acciones correctivas

> **Código:** SGSI-NC-01 · **Versión:** 1.0 · **Fecha:** 2026-10-15 · **Clasificación:** Interno
> **Referencias:** ISO/IEC 27001:2013 cláusulas 10.1 y 10.2

## 1. Procedimiento (10.1)

1. **Reaccionar:** controlar y corregir la no conformidad (NC) y hacer frente a sus consecuencias (corrección inmediata).
2. **Analizar la causa:** revisar la NC, determinar la causa raíz (5 porqués) y si existen NC similares o potenciales.
3. **Acción correctiva:** implementar la acción que elimina la causa; actualizar riesgos/SoA si procede (10.1 e).
4. **Verificar la eficacia** en el siguiente hito y cerrar.
5. **Conservar** este registro como evidencia (10.1 f–g).

Fuentes de NC: auditoría interna, revisión por la dirección, objetivos no cumplidos en el panel SGSI (9.1), incidentes cerrados (A.16.1.6), fallos de pruebas o de la lista de verificación §5.15.

## 2. Registro

| ID | Fecha | Origen | Requisito | Descripción | Corrección | Causa raíz | Acción correctiva | Responsable | Verificación de eficacia | Estado |
|---|---|---|---|---|---|---|---|---|---|---|
| NC-01 | 2026-10-15 | Revisión de documentación | 7.5.3 (información de origen externo), 6.1.3 d) | La SoA y el código citaban ISO/IEC 27001:2022 (93 controles), pero la norma entregada por la asignatura es UNE-EN ISO/IEC 27001:2017 = ISO/IEC 27001:2013 (114 controles) | Reescritura de `ISO27001_controles.md` con SoA de 114 controles y tabla de equivalencia; renumeración en `src/` y `supabase/schema.sql` | No se verificó la edición de la norma de referencia al iniciar el proyecto | Registrar en la cabecera de cada documento la edición exacta de la norma; punto 1 del checklist de auditoría interna | RS | Auditoría AI-01: comprobar 114 controles y 0 referencias 2022 en `src/` | Corregida — pendiente de verificación |
| NC-02 | 2026-10-15 | Revisión de documentación | 5.2, 5.3, 6.1.3 e), 6.2, 9.2, 9.3, 10.1 | Faltaba información documentada exigida por las cláusulas (política, roles, plan de tratamiento, objetivos, auditoría, revisión) | Creación de `docs/sgsi/` | El proyecto se centró en los controles técnicos del Anexo A | Incluir las cláusulas 4–10 en la lista de verificación de cada hito | RS | Revisión RD-01 | Corregida — pendiente de verificación |
| NC-03 | 2026-10-15 | Revisión de código | A.16.1.2, A.9.2.5, A.7.2.2 | La app no permitía notificar incidentes, revisar accesos ni registrar la aceptación de la política | Implementados `/seguridad`, panel SGSI e `incidentes` en Supabase | Requisitos organizativos no traducidos a funcionalidades | Requisitos SEC-63 a SEC-69 en el backlog | Dev | Pruebas `tests/isms.spec.js` y prueba manual | Corregida — pendiente de verificación |
| NC-04 | 2026-10-15 | Revisión de código | A.18.1.4, 7.4 | `/privacidad` indicaba que no había servidor remoto, aunque existe sincronización con Supabase | Texto actualizado (nube, RLS, proveedor) | El aviso no se revisó al incorporar la nube | Revisar `/privacidad` en cada cambio de arquitectura (8.1 cambios planificados) | RS | AI-01 | Corregida — pendiente de verificación |

## 3. Mejora continua (10.2)

| ID | Oportunidad | Origen | Prioridad | Estado |
|---|---|---|---|---|
| MC-01 | CI con `npm audit` bloqueante y Dependabot (R05) | Plan de tratamiento | Alta | Pendiente (sin repositorio remoto) |
| MC-02 | PWA offline (SEC-62, A.17.2.1) | Plan de continuidad | Media | Pendiente |
| MC-03 | CAPTCHA en la autenticación anónima de Supabase (R16) | Riesgos | Media | Pendiente |
| MC-04 | Prueba automatizada de políticas RLS (pgTAP o script con dos sesiones) | R15 | Media | Pendiente |
