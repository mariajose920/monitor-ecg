# Procedimiento de gestión de incidentes de seguridad de la información

> **Código:** SGSI-INC-01 · **Versión:** 1.0 · **Fecha:** 2026-10-15 · **Clasificación:** Interno
> **Referencias:** ISO/IEC 27001:2013 A.16.1.1 – A.16.1.7, A.6.1.3 · Implementación: `src/services/security/incidents.js`, `src/stores/isms.js`, `/seguridad#reportar`, Administración → SGSI, tabla `public.incidentes`

## 1. Responsabilidades (A.16.1.1)

| Rol | Responsabilidad |
|---|---|
| Cualquier persona (participante, admin, equipo) | Notificar eventos y puntos débiles lo antes posible |
| Administrador | Evaluar, contener y registrar la respuesta en la app |
| Responsable de seguridad (RS) | Coordinar, decidir escalamiento, documentar lecciones aprendidas |
| Docente (dirección) | Decidir notificaciones externas (titulares, autoridad) |

## 2. Notificación (A.16.1.2, A.16.1.3)

- Canal principal: **formulario "Reportar un incidente o punto débil"** en `/seguridad` (enlace en el pie de todas las páginas). Tipos: acceso, fuga, integridad, disponibilidad, **debilidad** (A.16.1.3), otro. Severidad estimada: baja / media / alta.
- La descripción admite 10–500 caracteres y **rechaza** RUT, correos y valores de salud (minimización, A.18.1.4).
- Se guarda cifrada en el equipo, se audita (`INCIDENT_REPORTED`) y, si hay nube, se inserta en `incidentes` (RLS: el reportante ve lo suyo; el admin ve todo; nadie borra).
- Canal alternativo si la app no está disponible: correo del equipo al RS y al docente.
- **No** se debe probar ni explotar una debilidad para "confirmarla".

## 3. Evaluación, respuesta y cierre (A.16.1.4, A.16.1.5)

```
abierto ──► en_analisis ──► cerrado   (exige respuesta + lección aprendida)
   │              │
   └──────────────┴──► descartado     (no es incidente de seguridad)
```

| Paso | Acciones | Plazo orientativo |
|---|---|---|
| 1. Evaluar | ¿Afecta C, I o D de un activo de §1.4? ¿Hay datos personales? Pasar a `en_analisis` o `descartado` | Alta: < 24 h; media: < 72 h; baja: próximo hito |
| 2. Contener | Según tipo: cerrar sesiones, cambiar la contraseña de la cuenta, eliminar el factor TOTP y revocar admin (`delete from administradores`, efecto inmediato; ver `recuperacion_acceso_admin.md`), cambiar el PIN solo en modo sin nube, pausar exportaciones, "Borrar todo" en un equipo comprometido | Inmediato |
| 3. Erradicar / recuperar | Corregir la causa (código, configuración RLS, cabeceras); restaurar desde la nube o exportación | Según impacto |
| 4. Cerrar | Registrar respuesta aplicada y lección aprendida en la app | Al terminar |

## 4. Aprendizaje (A.16.1.6)

La lección aprendida es obligatoria para cerrar. El RS revisa los incidentes cerrados en cada hito y, si procede, abre una no conformidad (10.1) o actualiza la apreciación de riesgos (8.2).

## 5. Comunicación externa y autoridades (A.6.1.3)

- Si hay **datos personales afectados**, el docente evalúa la notificación a los titulares y, cuando la Ley 21.719 lo exija, a la Agencia de Protección de Datos Personales.
- Incidentes de ciberseguridad relevantes: CSIRT de Gobierno (referencia), y el proveedor afectado (Supabase/Vercel) por sus canales de soporte.

## 6. Evidencias (A.16.1.7)

- Exportar la auditoría (`/admin/auditoria` → "Exportar log (JSON)") con el resultado de integridad y conservar el archivo sin modificar.
- En la nube, consultar `auditoria` e `incidentes` (sin UPDATE/DELETE desde la app).
- Registrar fecha y hora UTC, quién recogió la evidencia y dónde se guarda (cadena de custodia simple).
