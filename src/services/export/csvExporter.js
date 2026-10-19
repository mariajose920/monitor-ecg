import { stampUtc } from '@/utils/time.js'
import { shortId } from '@/utils/ids.js'

/**
 * Exportación CSV segura (SEC-43..SEC-47).
 *  - Seudonimizada por defecto: user_id (seudónimo), session_id, t_ms, ecg_raw, leads_off, bpm, activity.
 *  - Línea de clasificación al inicio.
 *  - Neutralización de inyección de fórmulas: celdas de texto que empiezan por = + - @ TAB CR → prefijo '.
 */

export function classificationLine(date = new Date()) {
  return `# CLASIFICACION: CONFIDENCIAL-SENSIBLE - Datos de salud seudonimizados - Uso exclusivamente academico - Exportado: ${date.toISOString()}`
}

/** Escapa una celda. Los números se escriben tal cual; los textos van entre comillas y neutralizados. */
export function escapeCsvCell(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? '1' : '0'
  let s = String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export function csvRow(cells) {
  return cells.map(escapeCsvCell).join(',')
}

/** Actividad vigente en tMs según la línea de tiempo [{tMs, valor}]. */
export function actividadEn(timeline, tMs) {
  let v = timeline?.[0]?.valor ?? ''
  for (const e of timeline || []) {
    if (e.tMs <= tMs) v = e.valor
    else break
  }
  return v
}

/**
 * Construye las filas CSV de una participación.
 * @param {object} o
 * @param {object} o.session metadatos de la sesión
 * @param {object} o.participante
 * @param {object} o.signal { t, raw, lo, bpm, n }
 * @param {string} o.etiqueta seudónimo ("Usuario 3")
 * @param {object|null} [o.opcionales] { rangoEdad, pesoKg } solo si el admin lo pidió y hay consentimiento
 * @param {number} [o.offsetMs] desfase del participante respecto del inicio de la sesión
 */
export function participantRows({ session, participante, signal, etiqueta, opcionales = null, offsetMs = 0 }) {
  const rows = []
  const sid = shortId(session.id)
  for (let i = 0; i < signal.n; i++) {
    const t = signal.t[i]
    const cells = [
      etiqueta,
      sid,
      t,
      signal.raw[i],
      signal.lo[i],
      signal.bpm[i],
      actividadEn(participante.actividad, t + offsetMs),
    ]
    if (opcionales) cells.push(opcionales.rangoEdad ?? '', opcionales.pesoKg ?? '')
    rows.push(csvRow(cells))
  }
  return rows
}

export function headerRow(includeOptional = false) {
  const h = ['user_id', 'session_id', 't_ms', 'ecg_raw', 'leads_off', 'bpm', 'activity']
  if (includeOptional) h.push('age_range', 'weight_kg')
  return h.join(',')
}

/** Ensambla el CSV completo con la línea de clasificación. */
export function buildCsv(rows, { includeOptional = false, date = new Date() } = {}) {
  return [classificationLine(date), headerRow(includeOptional), ...rows].join('\r\n') + '\r\n'
}

/** Nombre de archivo sin datos personales (SEC-47): ecg_Usuario3_2026-10-05T1530Z.csv */
export function exportFilename(etiqueta, date = new Date(), { prefijo = 'ecg', ext = 'csv' } = {}) {
  const limpio = String(etiqueta).replace(/[^A-Za-z0-9_-]/g, '')
  return `${prefijo}_${limpio || 'export'}_${stampUtc(date)}.${ext}`
}

/** Descarga un texto como archivo (Blob + URL de objeto revocada tras la descarga). */
export function downloadText(text, filename, type = 'text/csv;charset=utf-8') {
  downloadBlob(new Blob([text], { type }), filename)
}

/** Descarga bytes (p. ej. un PDF). */
export function downloadBytes(bytes, filename, type = 'application/pdf') {
  downloadBlob(new Blob([bytes], { type }), filename)
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
