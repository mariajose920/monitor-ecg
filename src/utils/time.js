/** Formatea una duración en ms como mm:ss o h:mm:ss. */
export function formatDuracion(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '--:--'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`
}

/** Fecha legible local (es-CL). */
export function formatFecha(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'medium' })
}

/** Marca compacta UTC para nombres de archivo: 2026-10-05T1530Z (SEC-47). */
export function stampUtc(date = new Date()) {
  const iso = date.toISOString() // 2026-10-05T15:30:12.000Z
  return `${iso.slice(0, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}Z`
}
