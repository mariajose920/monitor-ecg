# Plan de tratamiento de riesgos

> **Código:** SGSI-RSK-02 · **Versión:** 1.0 · **Fecha:** 2026-10-15 · **Clasificación:** Interno
> **Referencias:** ISO/IEC 27001:2013 cláusulas 6.1.3 e)–f) y 8.3 · Riesgos R01–R20 en `ISO27001_controles.md` §3.2 · SoA en §8

## 1. Plan

| Riesgo | Nivel inicial | Opción | Acciones (requisitos) | Controles | Responsable | Plazo | Estado | Residual |
|---|---|---|---|---|---|---|---|---|
| R01 Acceso a datos en equipo compartido | 9 | Mitigar | SEC-10, SEC-24–31 | A.10.1.1, A.11.2.8 | Dev | Hito 2 | Implementado | 3 Medio |
| R02 Cambio indebido de parámetros | 6 | Mitigar | SEC-01–12; RLS `parametros` | A.9.2.3, A.9.4.2 | Dev | Hito 2 | Implementado | 2 Bajo |
| R03 XSS | 6 | Mitigar | SEC-48, SEC-53 | A.14.1.2, A.14.2.1 | Dev | Hito 2 | Implementado | 3 Medio |
| R04 Datos seriales maliciosos | 6 | Mitigar | SEC-34–37 | A.14.1.3 | Dev | Hito 1 | Implementado | 2 Bajo |
| R05 Cadena de suministro | 6 | Mitigar | SEC-51, SEC-52 | A.15.1.3, A.12.6.1 | Dev | Hito 3 | Parcial (CI pendiente) | 3 Medio |
| R06 Fuga por CSV | 6 | Mitigar | SEC-43–47 | A.13.2.1, A.8.2.3 | Admin | Hito 2 | Implementado | 3 Medio |
| R07 Reidentificación | 6 | Mitigar | SEC-13–15, SEC-20 | A.18.1.4 | RS | Hito 1 | Implementado | 2 Bajo |
| R08 Sin base legal | 6 | Mitigar | SEC-16–19 | A.18.1.1, A.18.1.4 | RS | Hito 1 | Implementado | 2 Bajo |
| R09 Cabeceras | 4 | Mitigar | SEC-48, SEC-49 | A.13.1.1 | Dev | Hito 3 | Implementado | 1 Bajo |
| R10 Pérdida de datos locales | 4 | Mitigar | Réplica Supabase, exportación | A.12.3.1 | Admin | Hito 3 | Parcial | 2 Bajo |
| R11 Manipulación de auditoría | 4 | Mitigar | SEC-38–42; `auditoria` sin UPDATE/DELETE | A.12.4.2 | Dev | Hito 2 | Implementado | 2 Bajo |
| R12 Secretos en el bundle | 4 | Evitar | SEC-54, SEC-55 | A.9.4.5, A.10.1.2 | Dev | Hito 1 | Implementado | 1 Bajo |
| R13 Indisponibilidad | 2 | Aceptar | SEC-59, simulador | A.17.1.2 | Dev | — | Aceptado | 2 Bajo |
| R14 Riesgo eléctrico | 6 | Mitigar | SEC-21 | A.11.2.1, A.11.2.2 | Docente | Hito 1 | Implementado | 3 Medio |
| R15 Fuga entre participantes (RLS) | 6 | Mitigar | RLS en todas las tablas + prueba con dos sesiones | A.9.4.1, A.14.2.8 | Dev | Hito 3 | Implementado (prueba manual) | 2 Bajo |
| R16 Abuso de autenticación anónima | 4 | Mitigar | `CHECK` de tamaño, límites de Auth, purga | A.13.1.2, A.12.1.3 | Admin | Hito 3 | Parcial (CAPTCHA no activado) | 2 Bajo |
| R17 Compromiso admin Supabase | 3 | Mitigar | MFA, contraseña robusta, tabla `administradores` | A.9.2.3, A.9.2.4 | Docente | Hito 3 | Documentado | 2 Bajo |
| R18 Transferencia internacional | 6 | Mitigar | Aviso en `/privacidad`, seudónimos, DPA, opción local | A.15.1.1, A.18.1.4 | Docente | Hito 3 | Parcial | 3 Medio |
| R19 Incidente no gestionado | 4 | Mitigar | SEC-65, SEC-66, procedimiento | A.16.1 | RS | Hito 3 | Implementado | 1 Bajo |
| R20 Relojes desfasados | 2 | Aceptar + control | SEC-68 | A.12.4.4 | Dev | Hito 3 | Implementado | 1 Bajo |

## 2. Riesgos residuales aceptados (6.1.3 f)

| Riesgo residual | Motivo de aceptación |
|---|---|
| Quien controla el navegador y las DevTools puede eludir los controles del cliente (R01, R03) | Inherente a una SPA; mitigado con RLS en la nube y con reglas de uso del laboratorio |
| R05 sin `npm audit` en CI | No hay CI inicializado (sin repositorio por instrucción del curso); se ejecuta manualmente antes de cada entrega |
| R18 región del proveedor fuera de Chile | Datos seudonimizados, consentimiento informado que lo declara, opción de operar solo en local |

## 3. Aprobación

| Rol | Nombre | Decisión | Fecha |
|---|---|---|---|
| Dueño de los riesgos / dirección | Docente supervisor | ☐ Aprueba el plan y acepta los residuales | |
| Responsable de seguridad | | ☐ Elaboró | 2026-10-15 |
