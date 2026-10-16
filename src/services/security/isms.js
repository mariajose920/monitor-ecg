/**
 * Funciones puras del SGSI (ISO/IEC 27001:2013) usadas por el panel de administración:
 *  - Aceptación de la política de uso por el admin (A.7.2.2 concienciación, 7.3).
 *  - Revisión periódica de los derechos de acceso (A.9.2.5).
 *  - Sincronización del reloj frente a una fuente acordada (A.12.4.4).
 *  - Indicadores de seguimiento y medición (cláusula 9.1) ligados a docs/sgsi/objetivos_seguridad.md.
 */
import { isOpen } from './incidents.js'

/** Versión vigente de la política de seguridad y uso aceptable (docs/sgsi/politica_seguridad.md). */
export const POLICY_VERSION = '1.0-2013'
export const ACCESS_REVIEW_DAYS = 90
export const CLOCK_SKEW_MAX_MS = 2 * 60 * 1000
const DIA_MS = 86400000

/** true si el admin aún no aceptó la versión vigente de la política. */
export function needsPolicyAcceptance(registro, version = POLICY_VERSION) {
  return !registro || registro.version !== version || !Number.isFinite(Date.parse(registro.aceptadaUtc))
}

/** Estado de la revisión de accesos: { vencida, diasDesde } (null = nunca revisado). */
export function accessReviewStatus(ultimaUtc, now = Date.now(), plazoDias = ACCESS_REVIEW_DAYS) {
  const t = Date.parse(ultimaUtc ?? '')
  if (!Number.isFinite(t)) return { vencida: true, diasDesde: null }
  const dias = Math.floor((now - t) / DIA_MS)
  return { vencida: dias >= plazoDias, diasDesde: dias }
}

/**
 * Desfase del reloj local frente a la hora del servidor (fuente única acordada: `now()` de
 * PostgreSQL en Supabase, sincronizado por NTP). Acepta ISO-8601 o fecha HTTP.
 * @returns {{ok:boolean, skewMs:number}|null} null si la hora del servidor no es válida
 */
export function clockSkew(localMs, serverTime, maxMs = CLOCK_SKEW_MAX_MS) {
  const server = Date.parse(serverTime ?? '')
  if (!Number.isFinite(server) || !Number.isFinite(localMs)) return null
  const skewMs = localMs - server
  // Se tolera 1 s extra por la latencia de la petición.
  return { ok: Math.abs(skewMs) <= maxMs + 1000, skewMs }
}

/**
 * Indicadores de seguridad (9.1). Entradas ya leídas; no hace E/S.
 * @param {object} o
 * @param {Array} o.audit entradas del log local { ts, event }
 * @param {{ok:boolean}} [o.integridad] resultado de auditLog.verify()
 * @param {Array} [o.incidentes]
 * @param {string} [o.ultimaRevisionUtc]
 * @param {object} [o.politica] { version, aceptadaUtc }
 * @param {number} [o.now]
 * @param {number} [o.ventanaDias=30]
 */
export function computeSecurityMetrics({ audit = [], integridad = null, incidentes = [], ultimaRevisionUtc = null, politica = null, now = Date.now(), ventanaDias = 30 }) {
  const desde = now - ventanaDias * DIA_MS
  const recientes = audit.filter((e) => Date.parse(e.ts) >= desde)
  const contar = (ev) => recientes.filter((e) => e.event === ev).length
  const abiertos = incidentes.filter(isOpen)
  const revision = accessReviewStatus(ultimaRevisionUtc, now)
  return {
    ventanaDias,
    loginsFallidos: contar('ADMIN_LOGIN_FAIL'),
    bloqueos: contar('ADMIN_LOCKED'),
    erroresIntegridad: contar('INTEGRITY_ERROR'),
    exportaciones: contar('EXPORT_CSV'),
    integridadAuditoria: integridad ? (integridad.ok ? 'OK' : 'ROTA') : 'sin verificar',
    incidentesAbiertos: abiertos.length,
    incidentesAltaAbiertos: abiertos.filter((i) => i.severidad === 'alta').length,
    incidentesTotales: incidentes.length,
    revisionAccesosVencida: revision.vencida,
    diasDesdeRevision: revision.diasDesde,
    politicaAceptada: !needsPolicyAcceptance(politica),
  }
}

/**
 * Evalúa los indicadores contra las metas de docs/sgsi/objetivos_seguridad.md.
 * @returns {Array<{id:string, texto:string, cumple:boolean}>}
 */
export function evaluateObjectives(m) {
  return [
    { id: 'OBJ-1', texto: 'Integridad de la auditoría = OK', cumple: m.integridadAuditoria === 'OK' },
    { id: 'OBJ-2', texto: 'Sin incidentes de severidad alta abiertos', cumple: m.incidentesAltaAbiertos === 0 },
    { id: 'OBJ-3', texto: `≤ 10 inicios de sesión fallidos en ${m.ventanaDias} días`, cumple: m.loginsFallidos <= 10 },
    { id: 'OBJ-4', texto: `Revisión de accesos hace < ${ACCESS_REVIEW_DAYS} días`, cumple: !m.revisionAccesosVencida },
    { id: 'OBJ-5', texto: 'Política vigente aceptada por el administrador', cumple: m.politicaAceptada },
    { id: 'OBJ-6', texto: 'Sin errores de integridad del almacenamiento cifrado', cumple: m.erroresIntegridad === 0 },
  ]
}
