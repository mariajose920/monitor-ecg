# Auditoría interna y revisión por la dirección

> **Código:** SGSI-AUD-01 · **Versión:** 2.0 · **Fecha:** 2026-10-20 · **Clasificación:** Interno
> **ESTADO: PENDIENTE DE EJECUCIÓN.** No se ha realizado ninguna auditoría interna ni revisión por la dirección. Este documento contiene el **programa y las plantillas**; no hay actas firmadas ni resultados. El informe `docs/AUDITORIA_SISTEMA.md` (revisión independiente de solo lectura, con su sección «Estado de implementación») es un **insumo** propuesto para AI-01, no un acta de auditoría interna: no tiene firma de un auditor del programa. Nadie debe completar estas plantillas con resultados que no se hayan obtenido.
> **Referencias:** ISO/IEC 27001:2013 cláusulas 9.2 y 9.3; A.18.2.1, A.18.2.2, A.18.2.3

## 1. Programa de auditoría interna (9.2)

| Elemento | Definición |
|---|---|
| Frecuencia | Una auditoría por hito del curso (mínimo 2 por semestre) y tras cambios significativos |
| Auditor | Integrante de **otro grupo** (objetividad e imparcialidad, 9.2 e); el docente puede actuar como revisor independiente (A.18.2.1) |
| Criterios | Cláusulas 4–10 de ISO/IEC 27001:2013, la SoA (`ISO27001_controles.md` §8) y los documentos de `docs/sgsi/` |
| Alcance | El definido en §1.3 del documento principal; se priorizan los controles asociados a riesgos Altos y los hallazgos previos |
| Métodos | Entrevista, revisión de documentos, muestreo de evidencias `archivo:línea`, ejecución de `npm test`/`npm run lint`, `supabase/pruebas_rls.sql` con tres cuentas de prueba (incluido el caso 0 del claim `amr`), revisión del panel SGSI y de los registros de Auth |
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
| 5 | A.9.4.1 Restricción del acceso (RLS) | `supabase/pruebas_rls.sql` con cuentas reales (salida archivada) | | |
| 6 | A.14.2.8 Pruebas de seguridad | npm test (343 al 2026-10-20), E2E (75) | | |
| 7 | A.9.2.3 / A.9.4.2 Privilegio del administrador | Caso 0 de `pruebas_rls.sql`; 2 administradores con TOTP | | |
| 8 | A.12.4.2 Auditoría de la nube | «Verificar cadena» en `/admin/auditoria` | | |
| 9 | A.18.1.4 Privacidad | `/privacidad` frente al comportamiento (nube apagada por defecto, borradores locales) | | |
| 10 | A.8.3.2 / A.18.1.3 Retención | `select jobname from cron.job`; esquema `respaldo_20261020` eliminado | | |
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
      OBJ-1 __  OBJ-2 __  OBJ-3 __  OBJ-4 __  OBJ-5 __  OBJ-6 __   (panel SGSI)
      OBJ-7 __  OBJ-8 __  OBJ-9 __  OBJ-10 __  OBJ-11 __  OBJ-12 __  (medidos fuera de la app)
      npm test __/__   E2E __/__   lint __   npm audit (producción) __   securityheaders __
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
| AI-01 | Auditoría interna | (planificada, hito 3) | **Pendiente de ejecución** | — |
| RD-01 | Revisión por la dirección | (planificada, cierre hito 3) | **Pendiente de ejecución** | — |
| SIM-01 | Simulacro de incidente | (por planificar) | **Pendiente de ejecución** | — |
| REST-01 | Prueba de restauración | (por planificar) | **Pendiente de ejecución** | — |

Cuando se ejecute cada una, registrar también la evidencia en la app (Administración → SGSI → «Evidencias del SGSI»: tipo, fecha y responsable; la app no guarda resultados ni firma nada).

## 4. Plantillas adicionales (sin completar)

### 4.1 Acta de simulacro de incidente (A.16.1, A.17.1.3)

```
Simulacro N.º: ____   Fecha: ____-__-__   Escenario: monitoreo público con datos identificables
Participantes: ____________________
Hora de reporte (UTC): ____   Hora de detección por el administrador: ____   Hora de contención (retiro de la publicación): ____
Pasos verificados: [ ] reporte con «Reportar este monitoreo»  [ ] revisión en Soporte y moderación  [ ] retiro con motivo
                   [ ] severidad evaluada  [ ] decisión sobre notificación (Ley 21.719)  [ ] cierre con lección aprendida
Resultado y lecciones: ______________________
Acciones (NC / mejora): ______________________
Firma RS: __________   Firma dirección: __________
```

### 4.2 Acta de prueba de restauración (A.12.3.1)

```
Prueba N.º: ____   Fecha: ____-__-__   Origen de la copia: [ ] exportación de la app  [ ] respaldo del plan  [ ] pg_dump
Proyecto de destino (NUNCA producción): ____________________
Recuentos origen / destino: sesiones __/__   bloques __/__   pacientes __/__
Duración total: ____   RPO observado: ____   RTO observado: ____
Resultado: [ ] correcto  [ ] con diferencias (detalle): ______________________
Firma Admin: __________   Firma RS: __________
```

### 4.3 Registro de ejecución de `pruebas_rls.sql`

```
Fecha: ____-__-__   Proyecto: [ ] pruebas  [ ] real   Cuentas A, B y admin creadas: [ ] sí
Caso 0 (claim amr con entrada totp reciente): [ ] ok  [ ] falla
Casos totales: ___  ok = true: ___  fallos: ___    Salida archivada en: ____________________
Cuentas de prueba eliminadas: [ ] sí
```
