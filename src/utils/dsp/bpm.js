/** Límites fisiológicos plausibles (igual que el filtro del firmware). */
export const BPM_MIN_FISIO = 30
export const BPM_MAX_FISIO = 220

/**
 * BPM desde intervalos RR (ms) usando la mediana (robusta a falsos positivos).
 * Devuelve null si el resultado no es fisiológicamente plausible.
 */
export function bpmFromRR(rrMs) {
  const v = rrMs.filter((x) => Number.isFinite(x) && x > 0)
  if (v.length === 0) return null
  const s = [...v].sort((a, b) => a - b)
  const mid = s.length >> 1
  const med = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
  const bpm = 60000 / med
  return bpm >= BPM_MIN_FISIO && bpm <= BPM_MAX_FISIO ? bpm : null
}
