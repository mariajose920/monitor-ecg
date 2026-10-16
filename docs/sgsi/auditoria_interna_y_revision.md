# Auditoría interna y revisión por la dirección

> **Código:** SGSI-AUD-01 · **Versión:** 1.0 · **Fecha:** 2026-10-15 · **Clasificación:** Interno
> **Referencias:** ISO/IEC 27001:2013 cláusulas 9.2 y 9.3; A.18.2.1, A.18.2.2, A.18.2.3

## 1. Programa de auditoría interna (9.2)

| Elemento | Definición |
|---|---|
| Frecuencia | Una auditoría por hito del curso (mínimo 2 por semestre) y tras cambios significativos |
| Auditor | Integrante de **otro grupo** (objetividad e imparcialidad, 9.2 e); el docente puede actuar como revisor independiente (A.18.2.1) |
| Criterios | Cláusulas 4–10 de ISO/IEC 27001:2013, la SoA (`ISO27001_controles.md` §8) y los documentos de `docs/sgsi/` |
| Alcance | El definido en §1.3 del documento principal; se priorizan los controles asociados a riesgos Altos y los hallazgos previos |
| Métodos | Entrevista, revisión de documentos, muestreo de evidencias `archivo:línea`, ejecución de `npm test`/`npm run lint`, prueba de RLS con dos sesiones, revisión del panel SGSI |
| Informe | Plantilla §1.1, entregada al RS y a la dirección (9.2 f) |
| Conservación | En este directorio (historial git) (9.2 g) |

### 1.1 Plantilla de informe de auditoría interna

```
Auditoría N.º: ____    Fecha: ____-__-__    Auditor: __________ (grupo ___)
Criterios: ISO/IEC 27001:2013 cl. 4–10, SoA v__, docs/sgsi v__
Alcance: ______________________________________________

| # | Requisito / control | Evidencia revisada | Resultado (C / NC menor / NC mayor / Obs.) | Comentario |
|---|---|---|---|---|
| 1 | 6.1.3 d) SoA con 114 controles | docs/ISO27001_controles.md §8 | | |
| 2 | A.9.2.5 Revisión de accesos | Panel SGSI, evento ACCESS_REVIEW_DONE | | |
| 3 | A.12.4.2 Protección del registro | /admin/auditoria "Integridad OK" | | |
| 4 | A.16.1.2 Notificación de eventos | /seguridad#reportar + tabla incidentes | | |
| 5 | A.9.4.1 Restricción del acceso (RLS) | Prueba con dos sesiones anónimas | | |
| 6 | A.14.2.8 Pruebas de seguridad | npm test (resultado) | | |
| ... | | | | |

Conclusión: el SGSI ☐ es conforme ☐ es conforme con observaciones ☐ no es conforme
No conformidades abiertas → registro_no_conformidades.md: NC-____
Firma auditor: __________   Recibido (RS): __________
```

## 2. Revisión por la dirección (9.3)

Al cierre de cada hito, presidida por el docente, con el RS y el administrador.

### 2.1 Plantilla de acta

```
Revisión por la dirección N.º: ____   Fecha: ____-__-__
Asistentes: Docente (dirección), RS, Administrador, ________

ENTRADAS (9.3)
a) Estado de las acciones de revisiones anteriores: ______________________
b) Cambios en cuestiones externas e internas (p. ej. Ley 21.719, nuevo proveedor): ____
c) Desempeño de la seguridad:
   1) No conformidades y acciones correctivas: abiertas __ / cerradas __
   2) Resultados de seguimiento y medición (panel SGSI, 9.1):
      OBJ-1 __  OBJ-2 __  OBJ-3 __  OBJ-4 __  OBJ-5 __  OBJ-6 __
      npm test __/__   lint __   npm audit (altas) __   securityheaders __
   3) Resultados de auditoría interna: ______________________
   4) Cumplimiento de objetivos de seguridad: ______________________
d) Comentarios de partes interesadas (participantes, docente, proveedores): ______
e) Resultado de la apreciación de riesgos y estado del plan de tratamiento: ______
f) Oportunidades de mejora continua: ______________________

SALIDAS
- Decisiones de mejora: ______________________
- Cambios necesarios en el SGSI (política, SoA, controles): ______________________
- Recursos asignados: ______________________
- Aceptación de riesgos residuales: ☐ Sí ☐ No (motivo: ______)

Firma de la dirección: __________
```

## 3. Registro

| N.º | Tipo | Fecha | Resultado | Enlace / ubicación |
|---|---|---|---|---|
| AI-01 | Auditoría interna | (planificada, hito 3) | — | — |
| RD-01 | Revisión por la dirección | (planificada, cierre hito 3) | — | — |
