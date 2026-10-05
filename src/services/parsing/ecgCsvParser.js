/**
 * Parser estricto en flujo del protocolo del firmware: `t_ms,ecg_raw,leads_off,bpm`
 * (SEC-34, corrige los bugs 7, 8, 9 y 10 del diagnóstico).
 *
 * - Cabecera exacta: se ignora.
 * - Línea máx. 64 caracteres; si el resto pendiente sin '\n' supera 1024, se vacía (anti-agotamiento de memoria).
 * - Regex completa; conversión con Number() + Number.isFinite (nada de parseInt sin radix).
 * - Rangos: t_ms 0..4294967295 monótono no decreciente (si retrocede = reinicio de la placa),
 *   ecg_raw 0..(2^bits−1), leads_off ∈ {0,1}, bpm 0..300.
 * - La primera línea tras abrir el puerto se descarta siempre (puede venir cortada).
 * - Las líneas inválidas se descartan y se cuentan. Si superan el 5 % en una ventana de 5 s
 *   (1250 líneas a 250 Hz) se emite el evento 'invalid-data'.
 *
 * El tiempo de salida es CONTINUO y relativo al primer dato (ms): ante un reinicio de la placa
 * (millis() vuelve a 0) se reinicia la base de tiempo sin romper la monotonía del eje X.
 */

export const CSV_HEADER = 't_ms,ecg_raw,leads_off,bpm'
// Regex anclada con cuantificadores acotados y longitud previa ≤ 64: sin riesgo de ReDoS (falso positivo de safe-regex).
// eslint-disable-next-line security/detect-unsafe-regex
export const LINE_RE = /^(\d{1,10}),(\d{1,4}),([01]),(\d{1,3}(?:\.\d{1,2})?)$/
export const MAX_LINE_LENGTH = 64
export const MAX_PENDING = 1024
export const T_MS_MAX = 4294967295
export const BPM_MAX = 300
export const INVALID_WINDOW_LINES = 1250
export const INVALID_RATIO_LIMIT = 0.05

/**
 * Valida y convierte una línea (sin salto de línea).
 * @returns {{ok:true,tMs:number,raw:number,leadsOff:number,bpm:number}|{ok:false,reason:string}}
 */
export function parseLine(line, { maxRaw = 1023 } = {}) {
  if (typeof line !== 'string') return { ok: false, reason: 'tipo' }
  if (line.length > MAX_LINE_LENGTH) return { ok: false, reason: 'longitud' }
  const m = LINE_RE.exec(line)
  if (!m) return { ok: false, reason: 'formato' }
  const tMs = Number(m[1])
  const raw = Number(m[2])
  const leadsOff = Number(m[3])
  const bpm = Number(m[4])
  if (!Number.isFinite(tMs) || tMs < 0 || tMs > T_MS_MAX) return { ok: false, reason: 't_ms' }
  if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw < 0 || raw > maxRaw) return { ok: false, reason: 'ecg_raw' }
  if (leadsOff !== 0 && leadsOff !== 1) return { ok: false, reason: 'leads_off' }
  if (!Number.isFinite(bpm) || bpm < 0 || bpm > BPM_MAX) return { ok: false, reason: 'bpm' }
  return { ok: true, tMs, raw, leadsOff, bpm }
}

/** BPM fisiológicamente mostrable (30–220); fuera de eso se muestra "--". */
export function bpmMostrable(bpm) {
  return Number.isFinite(bpm) && bpm >= 30 && bpm <= 220 ? bpm : null
}

export class EcgStreamParser {
  /**
   * @param {object} opts
   * @param {number} [opts.maxRaw=1023] valor máximo del ADC según el perfil
   * @param {number} [opts.periodMs=4] periodo nominal (250 Hz)
   * @param {boolean} [opts.skipFirstLine=true]
   * @param {(batch:object)=>void} [opts.onBatch]
   * @param {(ev:{type:string,[k:string]:any})=>void} [opts.onEvent]
   */
  constructor({ maxRaw = 1023, periodMs = 4, skipFirstLine = true, onBatch, onEvent } = {}) {
    this.maxRaw = maxRaw
    this.periodMs = periodMs
    this.skipFirstLineOpt = skipFirstLine
    this.onBatch = onBatch || (() => {})
    this.onEvent = onEvent || (() => {})
    this._cap = 256
    this._allocScratch(this._cap)
    this.reset()
  }

  _allocScratch(cap) {
    this._t = new Float64Array(cap)
    this._v = new Float32Array(cap)
    this._lo = new Uint8Array(cap)
    this._bpm = new Float32Array(cap)
    this._cap = cap
  }

  /** Reinicia el estado (llamar en cada apertura del puerto: bug 7). */
  reset() {
    this.pending = ''
    this.skipNext = this.skipFirstLineOpt
    this.lastDeviceT = null
    this.base = null // t_ms del dispositivo correspondiente a outOffset
    this.outOffset = 0
    this.lastOut = null
    this.stats = { valid: 0, invalid: 0, overflow: 0, headers: 0, resets: 0, skipped: 0 }
    this._winTotal = 0
    this._winInvalid = 0
    this._invalidNotified = false
  }

  /** Procesa un fragmento de texto recibido (puede contener líneas parciales). */
  push(text) {
    if (!text) return
    let data = this.pending + text
    let n = 0
    let start = 0
    for (;;) {
      const nl = data.indexOf('\n', start)
      if (nl === -1) break
      let line = data.slice(start, nl)
      start = nl + 1
      if (line.endsWith('\r')) line = line.slice(0, -1)
      n = this._handleLine(line, n)
    }
    this.pending = data.slice(start)
    if (this.pending.length > MAX_PENDING) {
      // Flujo sin saltos de línea: se descarta para no agotar memoria.
      this.pending = ''
      this.stats.overflow++
      this._countLine(false)
    }
    if (n > 0) this._emit(n)
  }

  _handleLine(line, n) {
    if (line.length === 0) return n
    if (this.skipNext) {
      this.skipNext = false
      this.stats.skipped++
      if (line === CSV_HEADER) this.stats.headers++
      return n
    }
    if (line === CSV_HEADER) {
      this.stats.headers++
      return n
    }
    const r = parseLine(line, { maxRaw: this.maxRaw })
    if (!r.ok) {
      this._countLine(false)
      return n
    }
    // Monotonía de t_ms: si retrocede, la placa se reinició (DTR del UNO).
    let tOut
    if (this.base === null) {
      this.base = r.tMs
      this.outOffset = 0
    } else if (r.tMs < this.lastDeviceT) {
      this.stats.resets++
      this.outOffset = (this.lastOut ?? 0) + this.periodMs
      this.base = r.tMs
      this.onEvent({ type: 'device-reset', previo: this.lastDeviceT, nuevo: r.tMs })
    }
    tOut = this.outOffset + (r.tMs - this.base)
    this.lastDeviceT = r.tMs
    this.lastOut = tOut

    if (n >= this._cap) this._grow()
    this._t[n] = tOut
    this._v[n] = r.raw
    this._lo[n] = r.leadsOff
    this._bpm[n] = r.bpm
    this.stats.valid++
    this._countLine(true)
    return n + 1
  }

  _grow() {
    const old = { t: this._t, v: this._v, lo: this._lo, bpm: this._bpm }
    this._allocScratch(this._cap * 2)
    this._t.set(old.t)
    this._v.set(old.v)
    this._lo.set(old.lo)
    this._bpm.set(old.bpm)
  }

  _countLine(valid) {
    if (!valid) {
      this.stats.invalid++
      this._winInvalid++
    }
    this._winTotal++
    if (this._winTotal >= INVALID_WINDOW_LINES) {
      const ratio = this._winInvalid / this._winTotal
      if (ratio > INVALID_RATIO_LIMIT) {
        this.onEvent({ type: 'invalid-data', ratio, primeraVez: !this._invalidNotified })
        this._invalidNotified = true
      }
      this._winTotal = 0
      this._winInvalid = 0
    }
  }

  _emit(n) {
    this.onBatch({
      t: this._t.slice(0, n),
      v: this._v.slice(0, n),
      leadsOff: this._lo.slice(0, n),
      bpmDevice: this._bpm.slice(0, n),
      n,
    })
  }
}
