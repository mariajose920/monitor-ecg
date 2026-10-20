# Roles, responsabilidades y autoridades

> **Código:** SGSI-ROL-01 · **Versión:** 1.0 · **Fecha:** 2026-10-15 · **Clasificación:** Interno
> **Referencias:** ISO/IEC 27001:2013 cláusulas 5.1, 5.3, 7.4 y controles A.6.1.1, A.6.1.2, A.7.2.1, A.13.2.4

## 1. Roles

| Rol | Quién | Responsabilidades | Autoridad |
|---|---|---|---|
| **Alta dirección** | Docente supervisor | Aprobar política y SoA; asignar recursos; aceptar riesgos residuales; revisión por la dirección (9.3) | Aprueba / rechaza cambios del SGSI |
| **Responsable de seguridad (RS)** | Integrante designado del equipo | Mantener `ISO27001_controles.md` y `docs/sgsi/`; gestionar incidentes (A.16); informar a la dirección del desempeño (5.3 b) | Puede suspender exportaciones o la sincronización ante un incidente |
| **Administrador de la plataforma** | Docente o ayudante | Configurar parámetros; revisar accesos cada 90 días (A.9.2.5) y la auditoría; aceptar la política; custodiar PIN y cuenta Supabase | Funciones `/admin` (cuenta + TOTP); fila en `public.administradores` concedida por el dueño del proyecto. Debe haber **al menos dos** |
| **Desarrolladores** | Equipo | Aplicar desarrollo seguro (A.14.2), pruebas, revisión cruzada de PR | Merge a `main` solo con revisión de otro integrante |
| **Auditor interno** | Integrante de **otro** grupo | Auditoría interna objetiva (9.2) | Acceso de lectura a documentos y evidencias |
| **Participante** | Persona medida | Dar/retirar consentimiento; no usar datos identificables; notificar incidentes | Solo sobre sus propios datos |

## 2. Matriz RACI

R = realiza · A = aprueba/responde · C = consultado · I = informado

| Actividad | Dirección | RS | Admin | Dev | Auditor |
|---|---|---|---|---|---|
| Política y SoA | A | R | C | C | I |
| Apreciación y tratamiento de riesgos | A | R | C | C | I |
| Configuración de parámetros | I | I | R/A | — | — |
| Revisión de derechos de acceso (A.9.2.5) | I | C | R/A | — | — |
| Concesión / retiro del rol de administrador (A.9.2.3, A.9.2.6) | A | C | I | — | — |
| Recuperación de acceso de administrador (A.9.2.4) | A | R | C | — | I |
| Gestión de incidentes (A.16) | I | R/A | R | C | — |
| Cambios de código (A.14.2.2) | I | C | — | R | — |
| Auditoría interna (9.2) | A | C | C | C | R |
| Revisión por la dirección (9.3) | R/A | R | C | I | C |
| No conformidades (10.1) | A | R | C | R | I |

**Dueño del proyecto Supabase** (responsable del proyecto): único que concede o retira el rol de administrador y que restablece contraseñas o elimina factores TOTP, siempre bajo `recuperacion_acceso_admin.md` y con aprobación de otra persona.

## 3. Segregación de tareas y confidencialidad

- Quien desarrolla un cambio no lo aprueba (A.6.1.2). Quien administra no se audita a sí mismo.
- Todo integrante con acceso a datos de participantes firma un **compromiso de confidencialidad** (A.13.2.4) al inicio del semestre; se archiva con el acta del primer hito.

## 4. Comunicación (7.4)

| Qué | Cuándo | A quién | Quién | Cómo |
|---|---|---|---|---|
| Política vigente | Inicio de semestre y cada cambio | Equipo, administrador, participantes | RS | `/seguridad`, reunión de inducción |
| Incidente de severidad alta | Inmediato (< 24 h) | Docente y RS | Quien lo detecta / Admin | Formulario de la app + correo del equipo |
| Brecha con datos personales | Tras evaluación (< 72 h) | Titulares afectados y, si corresponde, autoridad (Ley 21.719) | Dirección | Comunicación escrita |
| Indicadores 9.1 | Cada hito | Dirección | RS | Acta de revisión |
| Avisos de vulnerabilidades (A.6.1.4) | Al publicarse | Desarrolladores | RS | GitHub Security Advisories / Dependabot |
