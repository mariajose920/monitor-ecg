# Evaluación de proveedores y registro de vulnerabilidades

> **Código:** SGSI-REG-03 · **Versión:** 1.0-2013 · **Fecha:** 2026-10-15 · **Clasificación:** Interno
> **Propietario:** responsable del SGSI · **Revisión:** semestral (A.15.2.1) y en cada alerta de Dependabot
> **Referencias:** ISO/IEC 27001:2013 A.15.1.1, A.15.1.2, A.15.1.3, A.15.2.1, A.12.6.1

## 1. Fichas de proveedores críticos

| Campo | Supabase | Vercel | GitHub |
|---|---|---|---|
| Servicio | PostgreSQL + Auth (plan gratuito) | Hosting estático y CDN (plan Hobby) | Repositorio, Actions, Dependabot |
| Datos tratados | Sesiones y señales **seudonimizadas** (datos de salud), auditoría técnica, incidentes | Solo el bundle público; registros de acceso del proveedor | Código fuente, sin datos personales |
| Región | La elegida al crear el proyecto (verificar en *Project Settings → General*; anotar aquí) | Red global; funciones no usadas | EE. UU. |
| Garantías declaradas por el proveedor | Informe SOC 2 Tipo II, cifrado en reposo y TLS, DPA disponible | SOC 2 Tipo II, DPA disponible | SOC 2, DPA en términos de servicio |
| Límites relevantes | 500 MB de BD; pausa por inactividad; rate limit de Auth configurable | Ancho de banda del plan | Minutos de Actions |
| Controles propios | RLS en todas las tablas, cuotas por usuario, CAPTCHA opcional, solo clave publicable | CSP, HSTS, Permissions-Policy | Protección de rama, revisión de PR, gitleaks |
| Salida (reversibilidad) | Exportar CSV desde la app o `pg_dump`; modo 100 % local | Cualquier hosting estático (`dist/`) | Clonar repositorio |
| Aceptación | Términos y DPA aceptados por el docente: **pendiente de registrar fecha** | Ídem | Ídem |

## 2. Registro de vulnerabilidades técnicas

| Fecha | Fuente | Paquete | Severidad | Alcance | Decisión | Estado |
|---|---|---|---|---|---|---|
| 2026-10-15 | `npm audit` | `tinypool` (vía `vitest` 3.x) | Crítica | Solo desarrollo y CI; no llega al bundle (`npm audit --omit=dev` = 0) | Aceptar temporalmente; migrar a `vitest` 5 cuando Dependabot lo proponga y las pruebas pasen | Abierta |
| 2026-10-15 | `npm audit` | `@vitest/mocker` | Moderada | Solo desarrollo | Igual que la anterior | Abierta |
