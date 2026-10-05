/**
 * Acumula muestras de un canal y las entrega en bloques de ~2 s (500 muestras a 250 Hz)
 * para persistirlas cifradas en una sola escritura (sección 6.2-7). Las escrituras se
 * encadenan para conservar el orden y no bloquean el render.
 */
export class SessionRecorder {
  /**
   * @param {object} o
   * @param {number} [o.chunkSize=500]
   * @param {(chunk:object)=>Promise<void>} o.onChunk
   * @param {(err:Error)=>void} [o.onError]
   */
  constructor({ chunkSize = 500, onChunk, onError = () => {} }) {
    this.chunkSize = chunkSize
    this.onChunk = onChunk
    this.onError = onError
    this.seq = 0
    this.t0 = null
    this.total = 0
    this._reset()
    this._chain = Promise.resolve()
  }

  _reset() {
    this.t = []
    this.raw = []
    this.lo = []
    this.bpm = []
  }

  /** Agrega un lote de la fuente. El tiempo se guarda relativo al inicio de la grabación (ms). */
  append(batch) {
    const n = batch.n
    for (let k = 0; k < n; k++) {
      if (this.t0 === null) this.t0 = batch.t[k]
      this.t.push(Math.round(batch.t[k] - this.t0))
      this.raw.push(Math.round(batch.v[k]))
      this.lo.push(batch.leadsOff[k])
      this.bpm.push(Math.round((batch.bpmDevice?.[k] ?? 0) * 10) / 10)
      if (this.t.length >= this.chunkSize) this._emit()
    }
    this.total += n
  }

  _emit() {
    if (!this.t.length) return
    const chunk = { seq: this.seq++, t: this.t, raw: this.raw, lo: this.lo, bpm: this.bpm }
    this._reset()
    this._chain = this._chain.then(() => this.onChunk(chunk)).catch((e) => this.onError(e))
  }

  /** Persiste lo pendiente y espera a que terminen todas las escrituras. */
  async flush() {
    this._emit()
    await this._chain
  }
}
