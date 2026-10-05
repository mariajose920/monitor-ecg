/** Remuestreo lineal de una señal uniforme de fsIn a fsOut. */
export function resample(values, fsIn, fsOut) {
  const n = values.length
  if (n === 0 || fsIn === fsOut) return Float32Array.from(values)
  const dur = (n - 1) / fsIn
  const m = Math.floor(dur * fsOut) + 1
  const out = new Float32Array(m)
  for (let j = 0; j < m; j++) {
    const x = (j * fsIn) / fsOut
    const i = Math.floor(x)
    const f = x - i
    out[j] = i + 1 < n ? values[i] * (1 - f) + values[i + 1] * f : values[n - 1]
  }
  return out
}

/**
 * Remuestreo a partir de marcas de tiempo no uniformes (ms) a fsOut.
 * Útil para CSV con `t_ms` irregular.
 */
export function resampleByTime(tMs, values, fsOut) {
  const n = values.length
  if (n === 0) return new Float32Array(0)
  const t0 = tMs[0]
  const dur = tMs[n - 1] - t0
  const step = 1000 / fsOut
  const m = Math.floor(dur / step) + 1
  const out = new Float32Array(m)
  let i = 0
  for (let j = 0; j < m; j++) {
    const t = t0 + j * step
    while (i + 1 < n && tMs[i + 1] < t) i++
    if (i + 1 >= n) {
      out[j] = values[n - 1]
    } else {
      const span = tMs[i + 1] - tMs[i]
      const f = span > 0 ? (t - tMs[i]) / span : 0
      out[j] = values[i] * (1 - Math.min(1, Math.max(0, f))) + values[i + 1] * Math.min(1, Math.max(0, f))
    }
  }
  return out
}

/** Estima la frecuencia de muestreo a partir de la mediana de los Δt (ms). */
export function estimateFs(tMs) {
  if (tMs.length < 2) return null
  const d = []
  const lim = Math.min(tMs.length, 2001)
  for (let i = 1; i < lim; i++) d.push(tMs[i] - tMs[i - 1])
  d.sort((a, b) => a - b)
  const med = d[d.length >> 1]
  return med > 0 ? 1000 / med : null
}
