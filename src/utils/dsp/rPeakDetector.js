import { bpmFromRR } from './bpm.js'

/**
 * Detector de picos R incremental tipo Pan-Tompkins simplificado (coste O(1) por muestra):
 *  1) eliminación de línea base (EMA lenta) + paso bajo por media móvil de fs/50 muestras
 *     (cero exacto en 50 Hz: suprime la red eléctrica y el ruido blanco de alta frecuencia),
 *  2) derivada central + cuadrado (energía de pendiente: el QRS es mucho más empinado que P y T),
 *  3) integración en ventana móvil (~120 ms),
 *  4) umbral adaptativo = fracción de un máximo reciente que decae lentamente (como el firmware),
 *  5) período refractario (por defecto 250 ms ≈ 240 lpm máx).
 *
 * Es independiente de la escala (cuentas de ADC o mV).
 */
export class RPeakDetector {
  constructor({ fs = 250, refractoryMs = 250, warmupMs = 600, thresholdFactor = 0.3, mwiMs = 120 } = {}) {
    this.fs = fs
    this.refractoryMs = refractoryMs
    this.warmupMs = warmupMs
    this.thresholdFactor = thresholdFactor
    this.mwiLen = Math.max(4, Math.round((mwiMs / 1000) * fs))
    this.baseAlpha = 1 / (0.8 * fs) // constante de tiempo ~0,8 s
    // Decaimiento del máximo: vida media ~2 s
    this.decay = Math.pow(0.5, 1 / (2 * fs))
    this._mwiBuf = new Float32Array(this.mwiLen)
    this.smLen = Math.max(1, Math.round(fs / 50))
    this._smBuf = new Float32Array(this.smLen)
    this.reset()
  }

  reset() {
    this.baseline = null
    this._smBuf.fill(0)
    this._smIdx = 0
    this._smSum = 0
    this._smCount = 0
    this._y1 = 0
    this._y2 = 0
    this._mwiBuf.fill(0)
    this._mwiIdx = 0
    this._mwiSum = 0
    this.peakLevel = 0
    this.above = false
    this.firstT = null
    this.lastBeatT = null
    this.rr = [] // últimos intervalos RR (ms)
  }

  /**
   * Procesa una muestra. Devuelve true si se detectó un latido en esta muestra.
   * @param {number} tMs tiempo de la muestra (ms)
   * @param {number} x valor
   */
  push(tMs, x) {
    if (this.firstT === null) this.firstT = tMs
    if (this.baseline === null) this.baseline = x
    this.baseline += this.baseAlpha * (x - this.baseline)
    const hp = x - this.baseline
    // Paso bajo (media móvil)
    this._smSum += hp - this._smBuf[this._smIdx]
    this._smBuf[this._smIdx] = hp
    this._smIdx = (this._smIdx + 1) % this.smLen
    if (this._smCount < this.smLen) this._smCount++
    const y = this._smSum / this._smCount
    // Derivada central (y[n] − y[n−2])
    const d = y - this._y2
    this._y2 = this._y1
    this._y1 = y
    const e = d * d
    // Ventana móvil de integración
    this._mwiSum += e - this._mwiBuf[this._mwiIdx]
    this._mwiBuf[this._mwiIdx] = e
    this._mwiIdx = (this._mwiIdx + 1) % this.mwiLen
    const mwi = this._mwiSum / this.mwiLen

    if (mwi > this.peakLevel) this.peakLevel = mwi
    else this.peakLevel *= this.decay
    const threshold = this.thresholdFactor * this.peakLevel

    let beat = false
    if (mwi > threshold && !this.above) {
      this.above = true
      const warm = tMs - this.firstT >= this.warmupMs
      const outRefractory = this.lastBeatT === null || tMs - this.lastBeatT > this.refractoryMs
      if (warm && outRefractory && threshold > 0) {
        if (this.lastBeatT !== null) {
          const rr = tMs - this.lastBeatT
          if (rr >= 273 && rr <= 2000) {
            this.rr.push(rr)
            if (this.rr.length > 8) this.rr.shift()
          }
        }
        this.lastBeatT = tMs
        beat = true
      }
    } else if (mwi < threshold * 0.6) {
      this.above = false
    }
    return beat
  }

  /**
   * BPM calculado (mediana de los últimos RR) o null si no hay picos en `staleMs`.
   * @param {number} nowMs tiempo actual de la señal
   */
  getBpm(nowMs, staleMs = 3000) {
    if (this.lastBeatT === null || nowMs - this.lastBeatT > staleMs) return null
    if (this.rr.length < 2) return null
    return bpmFromRR(this.rr.slice(-5))
  }
}

/**
 * Detección OFFLINE de picos R sobre una señal completa (comparación RF14, revisión):
 * mismo principio (pendiente² integrada) pero con umbral global robusto, de modo que también
 * se detecta el primer latido. Cada pico se refina al máximo de la señal sin línea base.
 * @param {ArrayLike<number>} values
 * @param {number} fs
 * @returns {number[]} índices de los picos R
 */
export function detectRPeaks(values, fs = 250) {
  const n = values.length
  if (n < fs) return []
  // 1) Línea base: media móvil centrada de ~0,6 s
  const hp = new Float32Array(n)
  const wb = Math.max(3, Math.round(0.3 * fs))
  let sum = 0
  let lo = 0
  let hi = -1
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - wb)
    const b = Math.min(n - 1, i + wb)
    while (hi < b) sum += values[++hi]
    while (lo < a) sum -= values[lo++]
    hp[i] = values[i] - sum / (hi - lo + 1)
  }
  // 2) Paso bajo (media móvil centrada de fs/50 muestras: cero en 50 Hz) y energía de pendiente
  const sl = Math.max(1, Math.round(fs / 50))
  const sm = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    let c = 0
    for (let k = i - (sl >> 1); k < i - (sl >> 1) + sl; k++) {
      if (k >= 0 && k < n) {
        s += hp[k]
        c++
      }
    }
    sm[i] = s / c
  }
  const e = new Float32Array(n)
  for (let i = 1; i < n - 1; i++) e[i] = (sm[i + 1] - sm[i - 1]) ** 2
  const half = Math.max(2, Math.round(0.06 * fs))
  const mwi = new Float32Array(n)
  sum = 0
  lo = 0
  hi = -1
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half)
    const b = Math.min(n - 1, i + half)
    while (hi < b) sum += e[++hi]
    while (lo < a) sum -= e[lo++]
    mwi[i] = sum / (hi - lo + 1)
  }
  // 3) Umbral robusto: fracción del percentil 99
  const sorted = Float32Array.from(mwi).sort()
  const thr = 0.3 * sorted[Math.floor(0.99 * (n - 1))]
  if (!(thr > 0)) return []
  // 4) Regiones sobre el umbral → máximo de hp; período refractario de 250 ms
  const refr = Math.round(0.25 * fs)
  const peaks = []
  let i = 0
  while (i < n) {
    if (mwi[i] <= thr) {
      i++
      continue
    }
    let j = i
    while (j < n && mwi[j] > thr) j++
    let best = i
    for (let k = Math.max(0, i - half); k < Math.min(n, j + half); k++) if (hp[k] > hp[best]) best = k
    const last = peaks[peaks.length - 1]
    if (last === undefined || best - last > refr) peaks.push(best)
    else if (hp[best] > hp[last]) peaks[peaks.length - 1] = best
    i = j
  }
  return peaks
}

/** BPM medio a partir de índices de picos. */
export function bpmFromPeaks(peaks, fs = 250) {
  if (!peaks || peaks.length < 2) return null
  const rr = []
  for (let i = 1; i < peaks.length; i++) rr.push(((peaks[i] - peaks[i - 1]) * 1000) / fs)
  return bpmFromRR(rr)
}
