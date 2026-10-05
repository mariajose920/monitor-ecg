/** Normalización z-score (media 0, desviación 1). */
export function zscore(values) {
  const n = values.length
  const out = new Float32Array(n)
  if (n === 0) return out
  let mean = 0
  for (let i = 0; i < n; i++) mean += values[i]
  mean /= n
  let v = 0
  for (let i = 0; i < n; i++) v += (values[i] - mean) ** 2
  const sd = Math.sqrt(v / n) || 1
  for (let i = 0; i < n; i++) out[i] = (values[i] - mean) / sd
  return out
}

/** Normalización min-max a [0, 1]. */
export function minmax(values) {
  const n = values.length
  const out = new Float32Array(n)
  if (n === 0) return out
  let mn = Infinity
  let mx = -Infinity
  for (let i = 0; i < n; i++) {
    if (values[i] < mn) mn = values[i]
    if (values[i] > mx) mx = values[i]
  }
  const r = mx - mn || 1
  for (let i = 0; i < n; i++) out[i] = (values[i] - mn) / r
  return out
}

export function normalize(values, metodo = 'zscore') {
  return metodo === 'minmax' ? minmax(values) : zscore(values)
}
