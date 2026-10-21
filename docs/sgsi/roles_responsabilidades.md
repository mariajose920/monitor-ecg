# Roles, responsabilidades y autoridades

> **Código:** SGSI-ROL-01 · **Versión:** 2.0 · **Fecha:** 2026-10-20 · **Clasificación:** Interno
> **Referencias:** ISO/IEC 27001:2013 cláusulas 5.1, 5.3, 7.4 y controles A.6.1.1, A.6.1.2, A.7.2.1, A.13.2.4

## 1. Roles

| Rol | Quién | Responsabilidades | Autoridad |
|---|---|---|---|
| **Alta dirección** | Docente supervisor | Aprobar política y SoA; asignar recursos; aceptar riesgos residuales; revisión por la dirección (9.3) | Aprueba / rechaza cambios del SGSI |
| **Responsable de seguridad (RS)** | Integrante designado del equipo | Mantener `ISO27001_controles.md` y `docs/sgsi/`; gestionar incidentes (A.16); informar a la dirección del desempeño (5.3 b) | Puede suspender exportaciones o la sincronización ante un incidente |
| **Administrador de la plataforma** | Docente o ayudante | Configurar parámetros; revisar accesos cada 90 días (A.9.2.5) y la auditoría; moderar reportes de contenido público; atender el soporte excepcional; aceptar la política; custodiar PIN (solo sin nube) y cuenta Supabase | Funciones `/admin` (cuenta + TOTP reciente); fila en `public.administradores` concedida por **otro administrador desde la app** (TOTP de ≤ 5 min, máx. 5) o, como contingencia, por el dueño del proyecto con SQL. **No lee datos de salud ajenos**: solo `admin_leer_sesion` con motivo escrito, registrado y visible para el titular. Debe haber **al menos dos** |
| **Desarrolladores** | Equipo | Aplicar desarrollo seguro (A.14.2), pruebas, revisión cruzada de PR | Merge a `main` solo con revisión de otro integrante |
| **Auditor interno** | Integrante de **otro** grupo | Auditoría interna objetiva (9.2) | Acceso de lectura a documentos y evidencias |
| **Titular de la cuenta / participante** | Persona que usa la app (mayor de 18 años) y, por declaración, la persona medida | Dar/retirar consentimiento; decidir si activa la nube y si publica un monitoreo; no usar datos identificables; reportar contenido y notificar incidentes | Solo sobre sus propios datos |
| **Responsable del tratamiento** (legal) | Por definir por la dirección (universidad o docente); se muestra en `/privacidad` con `VITE_RESPONSABLE_NOMBRE` y `VITE_RESPONSABLE_CORREO` | Atender derechos de los titulares (plazo de respuesta 30 días corridos), decidir notificaciones de brechas, firmar el registro de tratamientos | Pendiente de designar formalmente (Ley 21.719) |

## 2. Matriz RACI

R = realiza · A = aprueba/responde · C = consultado · I = informado

| Actividad | Dirección | RS | Admin | Dev | Auditor |
|---|---|---|---|---|---|
| Política y SoA | A | R | C | C | I |
| Apreciación y tratamiento de riesgos | A | R | C | C | I |
| Configuración de parámetros | I | I | R/A | — | — |
| Revisión de derechos de acceso (A.9.2.5) | I | C | R/A | — | — |
| Concesión / retiro del rol de administrador (A.9.2.3, A.9.2.6) | A | C | R (otro administrador, desde la app, con TOTP reciente) | — | — |
| Moderación de contenido público (reportes) | I | C | R/A | — | — |
| Acceso excepcional a una sesión ajena (`admin_leer_sesion`) | A | C | R (con motivo registrado) | — | — |
| Recuperación de acceso de administrador (A.9.2.4) | A | R | C | — | I |
| Gestión de incidentes (A.16) | I | R/A | R | C | — |
| Cambios de código (A.14.2.2) | I | C | — | R | — |
| Auditoría interna (9.2) | A | C | C | C | R |
| Revisión por la dirección (9.3) | R/A | R | C | I | C |
| No conformidades (10.1) | A | R | C | R | I |

**Dueño del proyecto Supabase** (responsable del proyecto): concede o retira el rol de administrador **solo como contingencia** (la vía normal es otro administrador desde Administración → Administradores, que el servidor registra como `ADMIN_ROLE_GRANTED/REVOKED`) y es quien restablece contraseñas o elimina factores TOTP, siempre bajo `recuperacion_acceso_admin.md` y con aprobación de otra persona. También configura los paneles (Auth, SMTP, CAPTCHA) y elimina la copia temporal `respaldo_20261020` tras validar.

## 3. Segregación de tareas y confidencialidad

- Quien desarrolla un cambio no lo aprueba (A.6.1.2). Quien administra no se audita a sí mismo.
- Todo integrante con acceso a datos de participantes firma un **compromiso de confidencialidad** (A.13.2.4) al inicio del semestre; se archiva con el acta del primer hito.

## 4. Comunicación (7.4)

| Qué | Cuándo | A quién | Quién | Cómo |
|---|---|---|---|---|
| Política vigente | Inicio de semestre y cada cambio | Equipo, administrador, participantes | RS | `/seguridad`, reunión de inducción |
| Incidente de severidad alta | Inmediato (< 24 h) | Docente y RS | Quien lo detecta / Admin | Formulario de la app + correo del equipo |
| Brecha con datos personales | Tras evaluación (< 72 h, plazo orientativo interno; el plazo legal debe confirmarse con asesoría) | Titulares afectados y, si corresponde, autoridad (Ley 21.719) | Dirección | Comunicación escrita |
| Indicadores 9.1 | Cada hito | Dirección | RS | Acta de revisión |
| Avisos de vulnerabilidades (A.6.1.4) | Al publicarse | Desarrolladores | RS | GitHub Security Advisories / Dependabot |
