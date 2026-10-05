import { pearson } from './metrics.js'

/**
 * Correlación cruzada normalizada con retardo acotado.
 * r(lag) = Pearson(a[i], b[i + lag]) sobre el solapamiento.
 * Un lag positivo significa que `b` está RETRASADA `lag` muestras respecto de `a`.
 *
 * @param {ArrayLike<number>} a señal de referencia
 * @param {ArrayLike<number>} b señal a alinear
 * @param {number} maxLag retardo máximo en muestras (±)
 * @param {number} [minOverlap] solapamiento mínimo
 * @returns {{lag:number, r:number}}
 */
export function crossCorrelate(a, b, maxLag, minOverlap = 16, tolerancia = 0.05) {
  const rs = []
  let best = { lag: 0, r: -Infinity }
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const r = correlationAtLag(a, b, lag, minOverlap)
    rs.push(r)
    if (r !== null && r > best.r) best = { lag, r }
  }
  if (best.r === -Infinity) return { lag: 0, r: 0 }
  // Señales casi periódicas (ECG) tienen máximos locales separados ~1 RR con correlación parecida:
  // entre los máximos locales que quedan a menos de `tolerancia` del mejor, se elige el de menor |desfase|.
  let elegido = best
  for (let k = 0; k < rs.length; k++) {
    const r = rs[k]
    if (r === null || r < best.r - tolerancia) continue
    const izq = k > 0 && rs[k - 1] !== null ? rs[k - 1] : -Infinity
    const der = k < rs.length - 1 && rs[k + 1] !== null ? rs[k + 1] : -Infinity
    if (r >= izq && r >= der) {
      const lag = k - maxLag
      if (Math.abs(lag) < Math.abs(elegido.lag)) elegido = { lag, r }
    }
  }
  return elegido
}

/** Pearson entre a[i] y b[i+lag] sobre el solapamiento (null si es insuficiente). */
export function correlationAtLag(a, b, lag, minOverlap = 16) {
  const { x, y } = overlap(a, b, lag)
  if (x.length < minOverlap) return null
  return pearson(x, y)
}

/** Devuelve los tramos solapados de a[i] y b[i+lag]. */
export function overlap(a, b, lag) {
  const start = Math.max(0, -lag)
  const end = Math.min(a.length, b.length - lag)
  const len = Math.max(0, end - start)
  const x = new Float32Array(len)
  const y = new Float32Array(len)
  for (let k = 0; k < len; k++) {
    x[k] = a[start + k]
    y[k] = b[start + k + lag]
  }
  return { x, y }
}
