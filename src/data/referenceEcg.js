/**
 * Generador de ECG sintético PQRST (modelo de suma de gaussianas, inspirado en McSharry/ECGSYN).
 * Uso DIDÁCTICO: no es un registro clínico validado (ver RF11 y la carga de CSV).
 * También lo usa el simulador (SEC-56: datos sintéticos para desarrollo y pruebas).
 */

/** PRNG determinista (mulberry32) para que las pruebas sean reproducibles. */
export function mulberry32(seed = 1) {
  let a = seed >>> 0
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Ruido gaussiano (Box-Muller). */
export function gaussian(rand) {
  let u = 0
  while (u === 0) u = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}

/**
 * Ondas relativas al pico R (segundos): centro, ancho (sigma) y amplitud (mV).
 * La onda T se desplaza con el RR (aprox. Bazett: QT ∝ √RR).
 */
export const ONDAS = Object.freeze([
  { nombre: 'P', centro: -0.2, sigma: 0.025, amp: 0.12 },
  { nombre: 'Q', centro: -0.035, sigma: 0.01, amp: -0.12 },
  { nombre: 'R', centro: 0, sigma: 0.012, amp: 1.0 },
  { nombre: 'S', centro: 0.035, sigma: 0.012, amp: -0.25 },
  { nombre: 'T', centro: 0.28, sigma: 0.05, amp: 0.3, escalaRR: true },
])

/** Valor (mV) de un latido en el instante dt (s) relativo a su pico R. */
export function latido(dt, rrS) {
  let v = 0
  const k = Math.sqrt(Math.max(0.3, Math.min(2, rrS)))
  for (const o of ONDAS) {
    const c = o.escalaRR ? o.centro * k : o.centro
    const z = (dt - c) / o.sigma
    if (z > -6 && z < 6) v += o.amp * Math.exp(-0.5 * z * z)
  }
  return v
}

/**
 * Generador incremental de muestras (mV).
 * @param {object} o
 * @param {number} [o.fs=250]
 * @param {number} [o.bpm=72]
 * @param {number} [o.variabilidad=0.03] desviación relativa del RR
 * @param {number} [o.ruido=0.02] ruido blanco (mV)
 * @param {number} [o.deriva=0.05] amplitud de deriva de línea base (mV, 0,25 Hz)
 * @param {number} [o.red50=0] amplitud de interferencia de 50 Hz (mV)
 * @param {number} [o.seed=1]
 */
export class PqrstGenerator {
  constructor({ fs = 250, bpm = 72, variabilidad = 0.03, ruido = 0.02, deriva = 0.05, red50 = 0, seed = 1 } = {}) {
    this.fs = fs
    this.bpm = bpm
    this.variabilidad = variabilidad
    this.ruido = ruido
    this.deriva = deriva
    this.red50 = red50
    this.rand = mulberry32(seed)
    this.i = 0
    // Primer R a 0,35 s para que la primera P quede completa
    this.prevR = -10
    this.prevRR = 60 / bpm
    this.nextR = 0.35
    this.nextRR = this._drawRR()
    this.ultimoRR = this.nextRR
  }

  _drawRR() {
    const base = 60 / Math.max(20, Math.min(250, this.bpm))
    const rr = base * (1 + this.variabilidad * gaussian(this.rand))
    return Math.max(0.25, rr)
  }

  /** BPM instantáneo del último latido completo. */
  get bpmInstantaneo() {
    return 60 / this.ultimoRR
  }

  /** Devuelve la siguiente muestra en mV. */
  next() {
    const t = this.i / this.fs
    this.i++
    while (t >= this.nextR) {
      this.prevR = this.nextR
      this.prevRR = this.nextRR
      this.ultimoRR = this.nextRR
      this.nextRR = this._drawRR()
      this.nextR = this.prevR + this.nextRR
    }
    let v = latido(t - this.prevR, this.prevRR) + latido(t - this.nextR, this.nextRR)
    if (this.deriva) v += this.deriva * Math.sin(2 * Math.PI * 0.25 * t)
    if (this.red50) v += this.red50 * Math.sin(2 * Math.PI * 50 * t)
    if (this.ruido) v += this.ruido * gaussian(this.rand)
    return v
  }
}

/**
 * Genera una señal de referencia completa normalizada (mV), sin ruido por defecto.
 * @returns {{ fs:number, bpm:number, valores: Float32Array }}
 */
export function generateReferenceEcg({ fs = 250, durationS = 10, bpm = 72, variabilidad = 0, ruido = 0, deriva = 0, seed = 7 } = {}) {
  const gen = new PqrstGenerator({ fs, bpm, variabilidad, ruido, deriva, seed })
  const n = Math.round(durationS * fs)
  const valores = new Float32Array(n)
  for (let i = 0; i < n; i++) valores[i] = gen.next()
  return { fs, bpm, valores }
}

/**
 * Convierte mV a cuentas de ADC como lo haría el AD8232 (ganancia ~1100, salida centrada en 1,65 V).
 * Con el UNO (AREF 5 V, 10 bits) la línea base queda en ≈ 338 cuentas.
 */
export function mvToAdc(mv, { adcBits = 10, vref = 5, ganancia = 1100, offsetV = 1.65 } = {}) {
  const max = 2 ** adcBits - 1
  const volts = offsetV + (mv * ganancia) / 1000
  const c = Math.round((volts / vref) * max)
  return c < 0 ? 0 : c > max ? max : c
}
