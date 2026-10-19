import { bpmFromRR } from './bpm.js'

/**
 * Procesamiento de fotopletismografia (PPG) por camara del celular con flash.
 * Funciones puras y clases sin DOM: se prueban con senales sinteticas.
 * Privacidad: solo recibe tres numeros por fotograma (promedios R, G, B de una region central);
 * nunca ve ni guarda imagenes.
 */

export const PPG_FS = 30
export const PPG_BAND = Object.freeze([0.7, 4]) // Hz (42 a 240 lpm)

/** Biquad (RBJ cookbook) de 2.o orden, Butterworth (Q = 1/sqrt 2). */
export class Biquad {
  constructor(type, fc, fs, q = Math.SQRT1_2) {
    const w0 = (2 * Math.PI * fc) / fs
    const cos = Math.cos(w0)
    const alpha = Math.sin(w0) / (2 * q)
    let b0, b1, b2
    if (type === 'lowpass') {
      b0 = (1 - cos) / 2
      b1 = 1 - cos
      b2 = (1 - cos) / 2
    } else {
      b0 = (1 + cos) / 2
      b1 = -(1 + cos)
      b2 = (1 + cos) / 2
    }
    const a0 = 1 + alpha
    this.b0 = b0 / a0
    this.b1 = b1 / a0
    this.b2 = b2 / a0
    this.a1 = (-2 * cos) / a0
    this.a2 = (1 - alpha) / a0
    this.reset()
  }

  reset() {
    this.x1 = this.x2 = this.y1 = this.y2 = 0
  }

  push(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2
    this.x2 = this.x1
    this.x1 = x
    this.y2 = this.y1
    this.y1 = y
    return y
  }
}

/** Pasa-banda 0,7-4 Hz sobre una serie completa (uso offline y pruebas). */
export function bandpassPpg(values, fs = PPG_FS, [lo, hi] = PPG_BAND) {
  const hp = new Biquad('highpass', lo, fs)
  const lp = new Biquad('lowpass', hi, fs)
  const out = new Float32Array(values.length)
  for (let i = 0; i < values.length; i++) out[i] = lp.push(hp.push(values[i]))
  return out
}

/**
 * Detector incremental de latidos sobre la senal ya filtrada (picos hacia arriba).
 * Maximo local con umbral adaptativo (fraccion de la envolvente), periodo refractario y
 * refinamiento parabolico del instante del pico. Misma interfaz que RPeakDetector.
 */
export class PpgPeakDetector {
  constructor({ fs = PPG_FS, refractoryMs = 300, warmupMs = 2500, thresholdFactor = 0.35 } = {}) {
    this.fs = fs
    this.refractoryMs = refractoryMs
    this.warmupMs = warmupMs
    this.thresholdFactor = thresholdFactor
    this.decay = Math.pow(0.5, 1 / (3 * fs)) // vida media de la envolvente ~3 s
    this.reset()
  }

  reset() {
    this.env = 0
    this.s1 = 0 // x[n-1]
    this.s2 = 0 // x[n-2]
    this.t1 = 0
    this.t2 = 0
    this.n = 0
    this.firstT = null
    this.lastBeatT = null
    this.rr = []
  }

  /** @returns {boolean} true si se detecto un latido (en la muestra anterior). */
  push(tMs, x) {
    if (this.firstT === null) this.firstT = tMs
    const ax = Math.abs(x)
    this.env = ax > this.env ? ax : this.env * this.decay
    let beat = false
    // Pico en n-1: x[n-2] < x[n-1] >= x[n]
    if (this.n >= 2 && this.s1 > this.s2 && this.s1 >= x) {
      const thr = this.thresholdFactor * this.env
      const warm = this.t1 - this.firstT >= this.warmupMs
      if (warm && this.s1 > thr && thr > 0) {
        // Interpolacion parabolica
        const den = this.s2 - 2 * this.s1 + x
        const off = den !== 0 ? (0.5 * (this.s2 - x)) / den : 0
        const tPeak = this.t1 + Math.max(-0.5, Math.min(0.5, off)) * (1000 / this.fs)
        if (this.lastBeatT === null || tPeak - this.lastBeatT > this.refractoryMs) {
          if (this.lastBeatT !== null) {
            const rr = tPeak - this.lastBeatT
            if (rr >= 273 && rr <= 2000) {
              this.rr.push(rr)
              if (this.rr.length > 10) this.rr.shift()
            } else {
              this.rr = [] // hueco o latido perdido: reinicia la serie de RR
            }
          }
          this.lastBeatT = tPeak
          beat = true
        }
        // Un pico espurio dentro del periodo refractario se ignora.
      }
    }
    this.s2 = this.s1
    this.t2 = this.t1
    this.s1 = x
    this.t1 = tMs
    this.n++
    return beat
  }

  /** BPM = mediana de los ultimos RR, filtro de sanidad 30-220; null si no hay latidos recientes. */
  getBpm(nowMs, staleMs = 4000) {
    if (this.lastBeatT === null || nowMs - this.lastBeatT > staleMs) return null
    if (this.rr.length < 3) return null
    return bpmFromRR(this.rr.slice(-7))
  }
}

/** Periodicidad de la senal (0..1): maximo de la autocorrelacion normalizada en lags de 30-220 lpm. */
export function periodicity(buf, n, fs = PPG_FS) {
  if (n < fs * 3) return 0
  let mean = 0
  for (let i = 0; i < n; i++) mean += buf[i]
  mean /= n
  let e0 = 0
  for (let i = 0; i < n; i++) e0 += (buf[i] - mean) ** 2
  if (!(e0 > 0)) return 0
  const lagMin = Math.floor((fs * 60) / 220)
  const lagMax = Math.min(n - 2, Math.ceil((fs * 60) / 30))
  let best = 0
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let s = 0
    for (let i = 0; i + lag < n; i++) s += (buf[i] - mean) * (buf[i + lag] - mean)
    // Compensa la menor superposicion de lags grandes
    const r = (s / e0) * (n / (n - lag))
    if (r > best) best = r
  }
  return Math.max(0, Math.min(1, best))
}

/** Estados de calidad mostrados al usuario (con color + texto, nunca solo color). */
export const CALIDAD_PPG = Object.freeze({
  calibrando: { id: 'calibrando', texto: 'Calibrando...', consejo: 'Mantén el dedo quieto unos segundos.' },
  'sin-dedo': { id: 'sin-dedo', texto: 'Ajusta el dedo', consejo: 'Cubre por completo la cámara y el flash con la yema del dedo.' },
  ajusta: { id: 'ajusta', texto: 'Ajusta el dedo', consejo: 'Cubre cámara y flash; si hay luz que se cuela, acomoda el dedo.' },
  presion: { id: 'presion', texto: 'Muy fuerte presión', consejo: 'Afloja un poco: apoya el dedo con presión suave, sin apretar.' },
  movimiento: { id: 'movimiento', texto: 'Movimiento detectado', consejo: 'Quédate quieto y apoya el brazo en una mesa.' },
  debil: { id: 'debil', texto: 'Señal débil', consejo: 'Mantén el dedo quieto; calienta las manos si están frías.' },
  buena: { id: 'buena', texto: 'Señal buena', consejo: 'Perfecto, sigue así sin moverte.' },
})

/**
 * Cadena completa: (R,G,B) por fotograma a 30 Hz -> senal PPG filtrada, dedo presente, calidad y BPM.
 * Reglas (valores empiricos con flash; el rojo domina cuando el dedo cubre camara y flash):
 *  - dedo: R >= 70 y R > 1,5 G y R > 1,5 B, con histeresis (8 fotogramas para entrar, 6 para salir).
 *  - presion alta/dedo mal apoyado: indice de perfusion (AC/DC) < 0,10 %.
 *  - movimiento: salto relativo del rojo > 6 % en ~0,2 s.
 *  - saturacion: R >= 252 (sobreexposicion) -> "ajusta".
 *  - calidad buena: periodicidad >= 0,5 (SNR >= 0 dB) y sin movimiento.
 */
export class PpgProcessor {
  constructor({ fs = PPG_FS } = {}) {
    this.fs = fs
    this.hp = new Biquad('highpass', PPG_BAND[0], fs)
    this.lp = new Biquad('lowpass', PPG_BAND[1], fs)
    this.detector = new PpgPeakDetector({ fs })
    this.win = new Float32Array(Math.round(fs * 6)) // 6 s de senal filtrada
    this.raw = new Float32Array(Math.round(fs * 0.5))
    this.reset()
  }

  reset() {
    this.hp.reset()
    this.lp.reset()
    this.detector.reset()
    this.win.fill(0)
    this.raw.fill(0)
    this.wi = 0
    this.wn = 0
    this.ri = 0
    this.rn = 0
    this.dc = null
    this.onCount = 0
    this.offCount = 0
    this.fingerOn = false
    this.sinceOn = 0
    this.amp = 0
    this.pi = 0
    this.snrDb = -Infinity
    this.period = 0
    this.motion = 0
    this.estado = 'sin-dedo'
    this._k = 0
  }

  _classify(r, g, b) {
    const ok = r >= 70 && r > 1.5 * g && r > 1.5 * b
    if (ok) {
      this.onCount++
      this.offCount = 0
    } else {
      this.offCount++
      this.onCount = 0
    }
    if (!this.fingerOn && this.onCount >= 8) {
      this.fingerOn = true
      this._resetSignal()
    } else if (this.fingerOn && this.offCount >= 6) {
      this.fingerOn = false
      this._resetSignal()
    }
  }

  _resetSignal() {
    this.hp.reset()
    this.lp.reset()
    this.detector.reset()
    this.win.fill(0)
    this.raw.fill(0)
    this.wi = this.wn = this.ri = this.rn = 0
    this.dc = null
    this.sinceOn = 0
    this.amp = 0
    this.pi = 0
    this.period = 0
    this.snrDb = -Infinity
    this.motion = 0
  }

  /**
   * @param {number} tMs instante (ms) en la rejilla de fs
   * @param {number} r @param {number} g @param {number} b promedios 0..255
   * @returns {{ v:number, fingerOn:boolean, beat:boolean, estado:string }}
   */
  push(tMs, r, g, b) {
    this._classify(r, g, b)
    if (!this.fingerOn) {
      this.estado = this.onCount > 0 ? 'ajusta' : 'sin-dedo'
      return { v: 0, fingerOn: false, beat: false, estado: this.estado }
    }
    this.sinceOn++
    // Linea base lenta (EMA ~1,5 s) para quitar el nivel DC sin transitorio de arranque
    if (this.dc === null) this.dc = r
    this.dc += (r - this.dc) / (1.5 * this.fs)
    // Movimiento: salto relativo del rojo respecto a 0,2 s atras
    const lag = Math.max(1, Math.round(0.2 * this.fs))
    if (this.rn >= lag) {
      const prev = this.raw[(this.ri - lag + this.raw.length) % this.raw.length]
      this.motion = Math.max(this.motion * 0.9, Math.abs(r - prev) / Math.max(1, this.dc))
    }
    this.raw[this.ri] = r
    this.ri = (this.ri + 1) % this.raw.length
    if (this.rn < this.raw.length) this.rn++
    // Filtro y inversion: la sangre absorbe rojo en la sistole -> el rojo baja con cada pulso
    const f = this.lp.push(this.hp.push(r - this.dc))
    const s = -f
    this.win[this.wi] = s
    this.wi = (this.wi + 1) % this.win.length
    if (this.wn < this.win.length) this.wn++
    const beat = this.detector.push(tMs, s)
    // Cada ~0,5 s: amplitud, perfusion y periodicidad
    if (++this._k % Math.round(this.fs / 2) === 0) this._updateQuality(r)
    if (this.sinceOn < 3 * this.fs) this.estado = 'calibrando'
    return { v: s, fingerOn: true, beat, estado: this.estado }
  }

  _updateQuality(r) {
    const n = this.wn
    const ordered = new Float32Array(n)
    const start = (this.wi - n + this.win.length) % this.win.length
    let sum2 = 0
    for (let i = 0; i < n; i++) {
      const x = this.win[(start + i) % this.win.length]
      ordered[i] = x
      sum2 += x * x
    }
    this.amp = Math.sqrt(sum2 / Math.max(1, n))
    this.pi = (this.amp / Math.max(1, this.dc)) * 100 // indice de perfusion aproximado (%)
    this.period = periodicity(ordered, n, this.fs)
    const p = Math.min(0.999, this.period)
    this.snrDb = this.period > 0 ? 10 * Math.log10(p / (1 - p)) : -Infinity
    if (this.sinceOn < 3 * this.fs) return
    if (r >= 252) this.estado = 'ajusta'
    else if (this.motion > 0.06) this.estado = 'movimiento'
    else if (this.pi < 0.1) this.estado = 'presion'
    else if (this.period >= 0.5) this.estado = 'buena'
    else this.estado = 'debil'
  }

  getBpm(nowMs) {
    return this.fingerOn ? this.detector.getBpm(nowMs) : null
  }

  /** Resumen para la interfaz (sin datos de imagen). */
  quality() {
    const base = CALIDAD_PPG[this.estado] || CALIDAD_PPG['sin-dedo']
    return {
      estado: base.id,
      texto: base.texto,
      consejo: base.consejo,
      fingerOn: this.fingerOn,
      snrDb: Number.isFinite(this.snrDb) ? Math.round(this.snrDb * 10) / 10 : null,
      pi: Math.round(this.pi * 100) / 100,
      movimiento: Math.round(this.motion * 1000) / 1000,
      buena: this.estado === 'buena',
    }
  }
}
