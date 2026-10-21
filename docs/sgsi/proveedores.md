# Evaluación de proveedores y registro de vulnerabilidades

> **Código:** SGSI-REG-03 · **Versión:** 2.0-2013 · **Fecha:** 2026-10-20 · **Clasificación:** Interno
> **Propietario:** responsable del SGSI · **Revisión:** semestral (A.15.2.1) y en cada alerta de Dependabot
> **Referencias:** ISO/IEC 27001:2013 A.15.1.1, A.15.1.2, A.15.1.3, A.15.2.1, A.12.6.1

## 1. Fichas de proveedores críticos

| Campo | Supabase | Vercel | GitHub |
|---|---|---|---|
| Servicio | PostgreSQL + Auth (plan gratuito) | Hosting estático y CDN (plan Hobby) | Repositorio, Actions, Dependabot |
| Datos tratados | Cuentas (correo y contraseña, Supabase Auth); solo con la nube activada por la persona y al guardar: pacientes «Paciente N», declaración de mayoría de edad, perfil opcional con consentimiento y señales **seudonimizadas** (datos de salud, sin alias, nombre ni notas); auditoría técnica, incidentes, reportes de contenido y registro de accesos del administrador. Existe además una copia temporal en el esquema privado `respaldo_20261020` (por eliminar) | Solo el bundle público; registros de acceso del proveedor | Código fuente, sin datos personales |
| Región | **us-east-1 (Estados Unidos)**, informada al titular en `/privacidad`; confirmar con captura de *Project Settings → General* y anotar la fecha aquí. La decisión de aceptarla o migrar queda pendiente (R18) | Red global; funciones no usadas | EE. UU. |
| Garantías declaradas por el proveedor | Informe SOC 2 Tipo II, cifrado en reposo y TLS, DPA disponible | SOC 2 Tipo II, DPA disponible | SOC 2, DPA en términos de servicio |
| Límites relevantes | 500 MB de BD; pausa por inactividad; rate limit de Auth configurable | Ancho de banda del plan | Minutos de Actions |
| Controles propios | RLS en todas las tablas, cuotas por cuenta (50 MB, 1000 sesiones, 200 pacientes), auditoría con hash encadenado, funciones públicas sin acceso anónimo, CAPTCHA opcional (desactivado), solo clave publicable. **No verificado en el panel:** inicios anónimos, SMTP propio, contraseñas filtradas, *time-box* de sesiones, copias del plan | CSP, HSTS, Permissions-Policy (`vercel.json`); variables `VITE_RESPONSABLE_*` por definir en el proyecto | CI (lint, pruebas, build, `npm audit`, E2E), Dependabot y gitleaks activos; **protección de `main` y MFA obligatorio pendientes** |
| Salida (reversibilidad) | Exportar CSV desde la app o `pg_dump`; modo 100 % local | Cualquier hosting estático (`dist/`) | Clonar repositorio |
| Aceptación | Términos y DPA: **sin registrar fecha ni revisar** (pendiente; ver `docs/PENDIENTES_MANUALES.md`) | Ídem | Ídem |

## 2. Registro de vulnerabilidades técnicas

| Fecha | Fuente | Paquete | Severidad | Alcance | Decisión | Estado |
|---|---|---|---|---|---|---|
| 2026-10-15 | `npm audit` | `tinypool` (vía `vitest` 3.x) | Crítica | Solo desarrollo y CI; no llega al bundle (`npm audit --omit=dev` = 0, reverificado el 2026-10-20) | Aceptar temporalmente; migrar a `vitest` 5 cuando Dependabot lo proponga y las pruebas pasen | Abierta |
| 2026-10-15 | `npm audit` | `@vitest/mocker` | Moderada | Solo desarrollo | Igual que la anterior | Abierta |
