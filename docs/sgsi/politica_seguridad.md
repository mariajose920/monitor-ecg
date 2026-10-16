# Política de seguridad de la información

> **Código:** SGSI-POL-01 · **Versión:** 1.0-2013 · **Fecha:** 2026-10-15 · **Clasificación:** Público
> **Aprobada por:** docente supervisor (alta dirección) · **Revisión:** en cada hito del curso o ante cambios significativos (A.5.1.2)
> **Referencias:** ISO/IEC 27001:2013 cláusula 5.2 y control A.5.1.1 · `docs/ISO27001_controles.md`
> **Publicación:** visible para todas las partes interesadas en la app, ruta `/seguridad` (`src/data/securityPolicy.js`). La versión de la app (`POLICY_VERSION`) debe coincidir con la de este documento.

## 1. Propósito y alcance

Proteger la confidencialidad, integridad y disponibilidad de las señales ECG y de los datos de los participantes del proyecto académico **Monitor ECG**, dentro del alcance definido en `ISO27001_controles.md` §1.3 (app Vue, almacenamiento cifrado en el navegador, Supabase, Vercel, firmware y sensores). Aplica al docente, al equipo, al administrador de la plataforma y a los participantes.

## 2. Principios

1. **Privacidad desde el diseño:** seudónimos ("Usuario N"), minimización, consentimiento informado y derecho de supresión.
2. **Mínimo privilegio:** solo el administrador configura, exporta todo y borra; en la nube la autorización la impone RLS.
3. **Defensa en profundidad y fallo seguro:** guard + `assertAdmin` + RLS; datos dañados se descartan y se auditan.
4. **Trazabilidad:** eventos de seguridad en una auditoría encadenada (SHA-256) con marcas UTC.
5. **Transparencia:** las limitaciones del sistema se publican en `/privacidad`.

## 3. Marco de objetivos (5.2 b)

Los objetivos medibles se fijan en `objetivos_seguridad.md` (OBJ-1 a OBJ-6) y se evalúan en la app (Administración → SGSI).

## 4. Directrices

| Tema | Directriz | Control |
|---|---|---|
| Control de acceso | Política específica en `control_acceso.md` | A.9.1.1 |
| Criptografía | AES-GCM 256 en reposo con clave no extraíble; PBKDF2-SHA-256 (600 000 iteraciones) para el PIN; SHA-256 para la auditoría; TLS en tránsito. Prohibido inventar algoritmos o reutilizar IV. Solo la clave **publicable** de Supabase en el cliente | A.10.1.1, A.10.1.2 |
| Uso aceptable y clasificación | `uso_aceptable_y_clasificacion.md` | A.8.1.3, A.8.2 |
| Intercambio de información | CSV solo seudonimizado, con advertencia y registro en auditoría; sin canales públicos | A.13.2.1 |
| Desarrollo | Sin `v-html`/`eval`, ESLint de seguridad, pruebas, sin datos reales, sin secretos en el repositorio | A.14.2.1, A.14.3.1 |
| Incidentes | Toda persona notifica en `/seguridad#reportar`; procedimiento en `procedimiento_incidentes.md` | A.16.1 |
| Continuidad | `plan_continuidad.md` | A.17.1 |

## 5. Proveedores en la nube (A.15.1.1)

- **Supabase** (BD y autenticación): RLS obligatorio en todas las tablas, contraseña robusta y MFA en el panel, `service_role` nunca fuera del panel, revisión de región y DPA (transferencia internacional, Ley 21.719).
- **Vercel** (hosting): solo activos estáticos, cabeceras de seguridad, MFA, sin analítica.
- **GitHub / npm:** repositorio con acceso mínimo, lockfile y `npm audit`.

## 6. Cumplimiento y consecuencias

Se cumplen la Ley 19.628, la Ley 21.719 (datos sensibles de salud), la normativa ética de la universidad y los términos de los proveedores (A.18.1.1). El incumplimiento por integrantes del equipo se trata según el reglamento universitario (A.7.2.3, excluido del SGSI por estar cubierto externamente) y puede implicar la retirada de accesos (A.9.2.6).

## 7. Compromisos de la dirección

- Cumplir los requisitos aplicables a la seguridad de la información (5.2 c).
- Mejorar de forma continua el SGSI (5.2 d) mediante auditoría interna, revisión por la dirección y acciones correctivas.

## 8. Comunicación y aceptación

- Se comunica al equipo en la inducción y a los participantes en `/seguridad` y `/privacidad`.
- El administrador **acepta** la versión vigente dentro de la app antes de operar (evento `POLICY_ACCEPTED`, A.7.2.2).

| Versión | Fecha | Cambio | Aprobó |
|---|---|---|---|
| 1.0-2013 | 2026-10-15 | Primera versión alineada con ISO/IEC 27001:2013 | Docente supervisor |
