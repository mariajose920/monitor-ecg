# Metodología de apreciación de riesgos

> **Código:** SGSI-RSK-01 · **Versión:** 1.0 · **Fecha:** 2026-10-15 · **Clasificación:** Interno
> **Referencias:** ISO/IEC 27001:2013 cláusulas 6.1.2 y 8.2; ISO 31000:2009; ISO/IEC 27005 (guía)

## 1. Criterios (6.1.2 a)

**Impacto (I)** — consecuencia de perder C, I o D del activo:

| Valor | Nivel | Descripción |
|---|---|---|
| 1 | Bajo | Molestia menor, sin datos personales afectados, recuperable en minutos |
| 2 | Medio | Interrupción de una sesión de medición, datos internos expuestos o alteración detectable |
| 3 | Alto | Exposición de datos de salud, incumplimiento legal (Ley 19.628/21.719) o daño a la persona |

**Probabilidad (P)**:

| Valor | Nivel | Descripción |
|---|---|---|
| 1 | Baja | Requiere un atacante con conocimientos y acceso específicos; no se espera en el semestre |
| 2 | Media | Puede ocurrir alguna vez en el semestre |
| 3 | Alta | Es esperable (equipos compartidos, errores comunes de usuario) |

**Nivel de riesgo = P × I**: 1–2 **Bajo**, 3–4 **Medio**, 6–9 **Alto**.

**Criterios de aceptación:** Bajo se acepta; Medio y Alto se tratan. El riesgo residual Medio lo acepta el dueño del riesgo (docente); un residual Alto no se acepta sin una decisión documentada de la dirección.

## 2. Proceso (6.1.2 c–e)

1. **Identificar** activos (`ISO27001_controles.md` §1.4), amenazas y vulnerabilidades por pérdida de C, I y D; asignar **dueño del riesgo**.
2. **Analizar**: valorar I y P de forma realista con la tabla anterior; justificar valores en la columna de tratamiento.
3. **Evaluar**: comparar con el criterio de aceptación y priorizar (Altos primero).
4. **Registrar** en la tabla de riesgos (§3.2 del documento principal, R01–R20).

## 3. Consistencia (6.1.2 b)

- Se usan siempre las mismas escalas y el mismo registro; los cambios de valoración se justifican.
- Dos integrantes valoran por separado los riesgos nuevos y se consensúan las diferencias.

## 4. Frecuencia (8.2)

- En cada hito del curso.
- Ante cambios significativos: nueva tecnología (p. ej. la incorporación de Supabase generó R15–R18), nuevo tipo de dato, incidente de severidad alta o cambio de proveedor.
- Los resultados se conservan como información documentada (historial git de este directorio).
