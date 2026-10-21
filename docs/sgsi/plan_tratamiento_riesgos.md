# Plan de tratamiento de riesgos

> **Código:** SGSI-RSK-02 · **Versión:** 2.0 · **Fecha:** 2026-10-20 · **Clasificación:** Interno
> **Referencias:** ISO/IEC 27001:2013 cláusulas 6.1.3 e)–f) y 8.3 · Riesgos R01–R38 en `ISO27001_controles.md` §3.2 · SoA en §8 · Origen de los cambios: `AUDITORIA_SISTEMA.md`, `CAMBIOS_TANDA1.md`, `CAMBIOS_TANDA2.md`
> **Cambios de la v2.0:** se actualizan estados y residuales con lo que el código hace de verdad (TANDAS 1 y 2) y se añaden R28 a R38. «Implementado» = existe en el código/SQL con pruebas automáticas simuladas (343 unitarias, 75 E2E; SQL en PGlite); lo que depende de verificación o configuración en el entorno real figura como «Parcial». **Los niveles residuales son una valoración del equipo, aún no aceptada por el docente** (ver §3). Cuando el control es una acción pendiente, el residual se da «hoy» y «tras» completarla.

## 1. Plan

| Riesgo | Nivel inicial | Opción | Acciones (requisitos) | Controles | Responsable | Plazo | Estado | Residual |
|---|---|---|---|---|---|---|---|---|
| R01 Acceso a datos en equipo compartido | 9 | Mitigar | SEC-10, SEC-24–31, SEC-93, SEC-95 (equipo compartido, inactividad 15 min, nube apagada) | A.10.1.1, A.11.2.8 | Dev | Hito 2 | Implementado (alcance del cifrado limitado) | 6 Alto |
| R02 Cambio indebido de parámetros | 6 | Mitigar | SEC-01–12; RLS `parametros` con `es_admin()`; SEC-87 | A.9.2.3, A.9.4.2 | Dev | Hito 2 | Parcial (depende de verificar `amr`) | 3 Medio |
| R03 XSS | 6 | Mitigar | SEC-48, SEC-53 | A.14.1.2, A.14.2.1 | Dev | Hito 2 | Implementado | 3 Medio |
| R04 Datos seriales maliciosos | 6 | Mitigar | SEC-34–37 | A.14.1.3 | Dev | Hito 1 | Implementado | 2 Bajo |
| R05 Cadena de suministro | 6 | Mitigar | SEC-51, SEC-52 | A.15.1.3, A.12.6.1 | Dev | Hito 3 | Implementado (CI y Dependabot; 0 vulnerabilidades de producción); falta protección de rama | 3 Medio |
| R06 Fuga por CSV | 6 | Mitigar | SEC-43–47 | A.13.2.1, A.8.2.3 | Admin | Hito 2 | Implementado | 3 Medio |
| R07 Reidentificación | 6 | Mitigar | SEC-13–15, SEC-20, SEC-94 (alias local con heurística) | A.18.1.4 | RS | Hito 1 | Implementado | 2 Bajo |
| R08 Sin base legal | 6 | Mitigar | SEC-16–19, SEC-99 | A.18.1.1, A.18.1.4 | RS | Hito 1 | Parcial (sin revisión legal) | 3 Medio |
| R09 Cabeceras | 4 | Mitigar | SEC-48, SEC-49 | A.13.1.1 | Dev | Hito 3 | Implementado | 1 Bajo |
| R10 Pérdida de datos locales | 4 | Mitigar | Copia opcional en Supabase, exportación | A.12.3.1 | Admin | Hito 3 | Parcial (sin restauración desde la nube; prueba pendiente) | 4 Medio |
| R11 Manipulación de auditoría | 4 | Mitigar | SEC-38–42, SEC-89 (cadena y actor en servidor) | A.12.4.2 | Dev | Hito 2 | Implementado (cadena probada en PGlite) | 2 Bajo |
| R12 Secretos en el bundle | 4 | Evitar | SEC-54, SEC-55 | A.9.4.5, A.10.1.2 | Dev | Hito 1 | Implementado | 1 Bajo |
| R13 Indisponibilidad | 2 | Aceptar | SEC-59, simulador | A.17.1.2 | Dev | — | Aceptado | 2 Bajo |
| R14 Riesgo eléctrico | 6 | Mitigar | SEC-21 | A.11.2.1, A.11.2.2 | Docente | Hito 1 | Implementado (requisito de procedimiento; aislamiento no verificado por la app) | 3 Medio |
| R15 Fuga entre participantes (RLS) | 6 | Mitigar | RLS en todas las tablas; `pruebas_rls.sql` | A.9.4.1, A.14.2.8 | Dev | Hito 3 | Parcial (101 casos en PGlite; falta prueba con cuentas reales) | 6 Alto |
| R16 Abuso del registro de cuentas | 4 | Mitigar | Confirmación de correo, límites de Auth, cuotas del servidor, purga | A.13.1.2, A.12.1.3 | Admin | Hito 3 | Parcial (CAPTCHA no activado; SMTP propio pendiente) | 4 Medio |
| R17 Compromiso admin Supabase | 3 | Mitigar | MFA del panel, contraseña robusta, tabla `administradores` | A.9.2.3, A.9.2.4 | Docente | Hito 3 | Documentado | 2 Bajo |
| R18 Transferencia internacional (us-east-1) | 6 | Mitigar | Nube opcional apagada por defecto, aviso, seudónimos sin alias/notas, DPA, opción local | A.15.1.1, A.18.1.4 | Docente | Hito 3 | Parcial (DPA y región por decidir) | 4 Medio |
| R19 Incidente no gestionado | 4 | Mitigar | SEC-65, SEC-66, SEC-90, procedimiento | A.16.1 | RS | Hito 3 | Parcial (sin simulacro ni aviso automático) | 2 Bajo |
| R20 Relojes desfasados | 2 | Aceptar + control | SEC-68, SEC-91 | A.12.4.4 | Dev | Hito 3 | Implementado | 1 Bajo |
| R21 Uso indebido de la cámara | 6 | Mitigar | Solo promedios RGB, consentimiento, apagado automático, auditoría | A.18.1.4, A.14.2.5 | Dev | Hito 3 | Implementado | 2 Bajo |
| R22 Publicación de datos de salud | 6 | Mitigar | SEC-85, SEC-86, SEC-99 (consentimiento 2.0 por monitoreo exigido por el servidor, fecha truncada, reporte y retiro) | A.8.2.3, A.13.2.1, A.18.1.4 | Docente | Hito 3 | Implementado (persiste R33) | 3 Medio |
| R23 Cuentas y credenciales | 6 | Mitigar | Contraseña ≥ 10 con política, confirmación, `signOut` de otras sesiones; **manual:** SMTP propio, contraseñas filtradas, desactivar anónimos | A.9.2.1, A.9.2.4, A.9.4.3 | Admin | Hito 4 | Parcial (acciones manuales pendientes) | 6 Alto |
| R24 Función pública | 6 | Mitigar | RPC `listar_monitoreos_publicos`, `monitoreo_publico`, `senal_publica` (migraciones aplicadas) | A.9.4.1, A.14.2.5 | Dev | Hito 4 | Implementado (sin prueba real) | 3 Medio |
| R25 Retención excesiva | 4 | Mitigar | `purga-ecg` (365 d), `purga-auditoria` (2 años), purga local; cuentas inactivas manual | A.18.1.3, A.8.3.2 | Admin | Hito 4 | Parcial (verificar `cron.job`) | 4 Medio |
| R26 PPG tomado como diagnóstico | 4 | Mitigar | Aviso, rótulo de fuente, erratas de requisitos | A.18.1.1 | Docente | Hito 4 | Implementado | 2 Bajo |
| R27 Cuenta privilegiada comprometida | 6 | Mitigar | SEC-77–83, SEC-87, `recuperacion_acceso_admin.md`, 2 administradores | A.9.2.3–A.9.2.6 | Docente | Hito 4 | Parcial (verificar `amr`; segundo administrador por crear) | 3 Medio |
| R28 Claim `amr` no se comporta como se supone | 4 | Mitigar | Caso 0 de `pruebas_rls.sql`; contingencia SQL | A.9.2.3, A.9.4.2 | Admin | Antes de depender del panel | Pendiente (manual) | 4 Medio hoy; 2 Bajo tras verificar |
| R29 Divergencia entre lo probado y lo desplegado | 6 | Mitigar | `pruebas_rls.sql` con tres cuentas reales; Advisors | A.14.2.8, A.18.2.3 | Dev | Hito 4 | Pendiente (manual) | 6 Alto hoy; 3 Medio tras la prueba |
| R30 Reautenticación solo en el cliente | 3 | Aceptar temporalmente | Diálogo de contraseña; diferido: `amr` con `password` en el servidor | A.9.4.2, A.9.4.3 | Dev | Siguiente tanda | Diferido | 3 Medio |
| R31 Cifrado local de alcance limitado | 6 | Mitigar | Aviso del alcance real, equipo compartido; diferido: bóveda con frase | A.10.1.1, A.10.1.2 | Dev | Siguiente tanda | Parcial | 6 Alto |
| R32 Copia temporal olvidada (`respaldo_20261020`) | 6 | Evitar | Eliminar el esquema tras validar | A.8.3.2, A.18.1.3 | Docente | Al validar la migración | Pendiente (manual) | 6 Alto hoy; 1 Bajo tras borrar |
| R33 Monitoreos públicos previos sin consentimiento 2.0 | 6 | Mitigar | Decisión sobre pasarlos a privado | A.18.1.1, A.18.1.4 | Docente | Hito 4 | Pendiente (decisión) | 6 Alto hoy; 3 Medio tras decidir |
| R34 Declaración de edad falsa | 3 | Aceptar | Casillas, bloqueo de subida y publicación sin declaración | A.18.1.1 | Docente | — | Aceptado (autodeclarada) | 3 Medio |
| R35 Fallas de auditoría no detectadas | 2 | Aceptar + control | Revisión trimestral de registros de Auth; verificación de la cadena | A.12.4.1, A.12.4.2 | RS | Trimestral | Parcial | 2 Bajo |
| R36 Configuración manual sin verificar | 6 | Mitigar | `docs/PENDIENTES_MANUALES.md` | A.9.2.4, A.9.4.2, A.12.1.2 | Docente | Hito 4 | Pendiente (manual) | 6 Alto hoy; 3 Medio al completarlo |
| R37 Incumplimiento Ley 21.719 | 6 | Mitigar | Revisión legal, registro de tratamientos, EIPD, DPA | A.18.1.1, A.15.1.2 | Docente | Dic. 2026 | Pendiente (manual) | 6 Alto hoy; 4 Medio con revisión legal y DPA |
| R38 Abuso del acceso excepcional del admin | 3 | Mitigar | `admin_leer_sesion` con motivo, TOTP ≤ 5 min, aviso al titular | A.9.4.1, A.12.4.3 | Docente | Hito 3 | Implementado | 2 Bajo |

## 2. Riesgos residuales que requieren decisión de la dirección (6.1.3 f)

Según `metodologia_riesgos.md` §1, un residual **Alto** no se acepta sin decisión documentada. Los siguientes quedan **pendientes de aceptación** (no hay firma):

| Riesgo residual | Motivo propuesto de aceptación | Condición para bajarlo |
|---|---|---|
| R01 (6 Alto) y R31 (6 Alto): el cifrado local no protege frente a quien controla el equipo o el navegador | Inherente a una SPA sin bóveda; mitigado con «equipo compartido», cierre por inactividad, borrado al cerrar sesión y aviso honesto | Implementar bóveda con frase (diferida) |
| R15 (6 Alto) y R29: RLS probada solo en PGlite | Se aceptaría solo hasta ejecutar `pruebas_rls.sql` con cuentas reales | Ejecutar la prueba y archivar la salida |
| R23 (6 Alto) y R36: configuración del panel sin verificar | No se acepta: es trabajo pendiente | Completar `docs/PENDIENTES_MANUALES.md` |
| R05 sin protección de rama `main` | CI y Dependabot existen; falta exigir comprobaciones y revisión antes de fusionar | Activar la regla en GitHub |
| R18 y R37: región (us-east-1) y requisitos de la Ley 21.719 | Datos seudonimizados, nube opcional y apagada por defecto; DPA y revisión legal pendientes | Revisión legal y DPA |

## 3. Aprobación

| Rol | Nombre | Decisión | Fecha |
|---|---|---|---|
| Dueño de los riesgos / dirección | Docente supervisor | ☐ Aprueba el plan y acepta los residuales — **pendiente de ejecución** | |
| Responsable de seguridad | | ☐ Elaboró (v2.0 elaborada el 2026-10-20 con apoyo de asistente de IA; sin firma humana) | |
