/**
 * Filtros simples para visualizar y comparar (nunca alteran el dato guardado).
 */

/** Paso alto de 1er orden (elimina deriva de línea base). fc en Hz. */
export function highPass(values, fs, fc = 0.5) {
  const n = values.length
  const out = new Float32Array(n)
  if (n === 0) return out
  const rc = 1 / (2 * Math.PI * fc)
  const dt = 1 / fs
  const a = rc / (rc + dt)
  out[0] = 0
  for (let i = 1; i < n; i++) out[i] = a * (out[i - 1] + values[i] - values[i - 1])
  return out
}

/** Notch IIR de 2º orden (biquad) en f0 Hz (50 Hz por defecto, red eléctrica en Chile). */
export function notch(values, fs, f0 = 50, q = 30) {
  const n = values.length
  const out = new Float32Array(n)
  if (f0 >= fs / 2) {
    out.set(values)
    return out
  }
  const w0 = (2 * Math.PI * f0) / fs
  const alpha = Math.sin(w0) / (2 * q)
  const cos = Math.cos(w0)
  const a0 = 1 + alpha
  const b0 = 1 / a0
  const b1 = (-2 * cos) / a0
  const b2 = 1 / a0
  const a1 = (-2 * cos) / a0
  const a2 = (1 - alpha) / a0
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < n; i++) {
    const x = values[i]
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    out[i] = y
    x2 = x1; x1 = x; y2 = y1; y1 = y
  }
  return out
}

/** Media móvil centrada de `len` muestras. */
export function movingAverage(values, len = 3) {
  const n = values.length
  const out = new Float32Array(n)
  const h = Math.floor(len / 2)
  for (let i = 0; i < n; i++) {
    let s = 0
    let c = 0
    for (let k = i - h; k <= i + h; k++) {
      if (k >= 0 && k < n) {
        s += values[k]
        c++
      }
    }
    out[i] = s / c
  }
  return out
}
