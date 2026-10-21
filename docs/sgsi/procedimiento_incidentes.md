# Procedimiento de gestión de incidentes de seguridad de la información

> **Código:** SGSI-INC-01 · **Versión:** 2.0 · **Fecha:** 2026-10-20 · **Clasificación:** Interno
> **Referencias:** ISO/IEC 27001:2013 A.16.1.1 – A.16.1.7, A.6.1.3 · Implementación: `src/services/security/incidents.js`, `src/stores/isms.js`, `/seguridad#reportar`, `src/components/security/MisIncidentes.vue`, Administración → SGSI y → Soporte y moderación, tabla `public.incidentes`, `admin_actualizar_incidente` y `reportar_monitoreo` (`supabase/schema.sql`)

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
- Se guarda cifrada en el equipo, se audita (`INCIDENT_REPORTED`) y, si hay nube, se inserta en `incidentes`: el alta solo es válida como `abierto` y sin respuesta ni lección, el servidor fija la fecha y el reportante y rechaza RUT, correos y valores de salud; el reportante ve su estado y la respuesta en Seguridad → «Mis notificaciones»; el admin ve todos (se fusionan con la copia local y manda el servidor); nadie borra.
- **Contenido público que identifique a alguien:** cualquier cuenta lo reporta con «Reportar este monitoreo» en Comunidad (motivo de 3 a 200 caracteres, máx. 5 al día); el administrador lo revisa en Administración → Soporte y moderación y puede descartarlo, marcarlo revisado o **retirar la publicación** con motivo (pasa a privado y no puede volver a publicarse). Evento `CONTENT_REPORTED`, `CONTENT_REPORT_REVIEWED` o `CONTENT_REMOVED`.
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
| 2. Contener | Según tipo: cerrar sesiones, cambiar la contraseña de la cuenta (cierra las demás sesiones), eliminar el factor TOTP y retirar el rol de administrador (**Administración → Administradores → Retirar rol**, con TOTP nuevo y efecto inmediato; contingencia: `delete from administradores` del dueño del proyecto; ver `recuperacion_acceso_admin.md`), retirar una publicación, cambiar el PIN solo en modo sin nube, pausar exportaciones, "Borrar todo" en un equipo comprometido | Inmediato |
| 3. Erradicar / recuperar | Corregir la causa (código, configuración RLS, cabeceras); restaurar desde la nube o exportación | Según impacto |
| 4. Cerrar | Registrar respuesta aplicada y lección aprendida en la app | Al terminar |

## 4. Aprendizaje (A.16.1.6)

La lección aprendida es obligatoria para cerrar. El RS revisa los incidentes cerrados en cada hito y, si procede, abre una no conformidad (10.1) o actualiza la apreciación de riesgos (8.2).

## 5. Comunicación externa y autoridades (A.6.1.3)

- Si hay **datos personales afectados**, el docente evalúa la notificación a los titulares y, cuando la Ley 21.719 lo exija, a la Agencia de Protección de Datos Personales. **Pendiente:** la plantilla de notificación y el plazo legal exacto se definen con asesoría legal (C-28); la app no avisa automáticamente al responsable cuando entra un incidente grave, por lo que el administrador revisa el contador de abiertos de la pestaña SGSI (se refresca cada minuto).
- Incidentes de ciberseguridad relevantes: CSIRT de Gobierno (referencia), y el proveedor afectado (Supabase/Vercel) por sus canales de soporte.

## 6. Evidencias (A.16.1.7)

- Exportar la auditoría (`/admin/auditoria` → "Exportar log (JSON)") con el resultado de integridad y conservar el archivo sin modificar.
- En la nube, usar Administración → Auditoría → pestaña «Nube» (`admin_leer_auditoria`, filtros, paginación, exportación) y «Verificar cadena» (`verificar_cadena_auditoria()`); los incidentes no admiten DELETE. Los accesos del administrador a datos de un titular quedan en `ADMIN_DATA_ACCESS` y en `accesos_admin`.
- Los intentos de inicio de sesión fallidos de las cuentas no se registran en la auditoría de la app: se revisan en los registros de Auth del panel de Supabase, trimestralmente (manual).
- Registrar fecha y hora UTC, quién recogió la evidencia y dónde se guarda (cadena de custodia simple).

## 7. Simulacro (A.16.1, A.17.1.3)

El simulacro propuesto (monitoreo público con datos identificables: reporte, retiro, evaluación de severidad, decisión sobre notificación y cierre con lección) está **pendiente de ejecución**. Plantilla de registro en `auditoria_interna_y_revision.md` §4.
