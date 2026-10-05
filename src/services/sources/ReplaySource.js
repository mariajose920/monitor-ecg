import { DataSource } from './DataSource.js'

/**
 * Reproduce una señal guardada o un CSV (`t_ms,ecg_raw,leads_off,bpm`) a velocidad real
 * (o acelerada). Al terminar se puede repetir en bucle o finalizar (motivo 'fin-datos').
 */
export class ReplaySource extends DataSource {
  /**
   * @param {object} o
   * @param {{t:Float64Array,v:Float32Array,leadsOff?:Uint8Array,bpm?:Float32Array}} o.data
   * @param {boolean} [o.loop=true]
   * @param {number} [o.speed=1]
   */
  constructor({ id, profile, data, loop = true, speed = 1 }) {
    super({ id, kind: 'replay', profile })
    if (!data || !data.v || data.v.length < 2) throw new Error('No hay datos para reproducir')
    this.data = data
    this.loop = loop
    this.speed = speed
    this.timer = null
    this.pos = 0
    this.offset = 0 // desplazamiento acumulado entre vueltas
  }

  async connect() {
    this.setStatus('connecting')
  }

  async start() {
    if (this.timer) return
    const t = this.data.t
    this.tStart = performance.now()
    this.dataT0 = t[0]
    this.timer = setInterval(() => this._tick(), 40)
    this.setStatus('streaming')
  }

  _tick() {
    const { t, v, leadsOff, bpm } = this.data
    const elapsed = (performance.now() - this.tStart) * this.speed
    const out = { t: [], v: [], lo: [], bpm: [] }
    let guard = 0
    while (guard++ < 2000) {
      if (this.pos >= v.length) {
        if (!this.loop) {
          this._flush(out)
          this.disconnect('fin-datos')
          return
        }
        this.offset += t[t.length - 1] - this.dataT0 + (t[1] - t[0])
        this.pos = 0
      }
      const rel = t[this.pos] - this.dataT0 + this.offset
      if (rel > elapsed) break
      out.t.push(rel)
      out.v.push(v[this.pos])
      out.lo.push(leadsOff ? leadsOff[this.pos] : 0)
      out.bpm.push(bpm ? bpm[this.pos] : 0)
      this.pos++
    }
    this._flush(out)
  }

  _flush(out) {
    const n = out.v.length
    if (!n) return
    this.emit('samples', {
      t: Float64Array.from(out.t),
      v: Float32Array.from(out.v),
      leadsOff: Uint8Array.from(out.lo),
      bpmDevice: Float32Array.from(out.bpm),
      n,
    })
  }

  async stop() {
    await this.disconnect('usuario')
  }

  async disconnect(reason = 'usuario') {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (this.status !== 'disconnected') this.setStatus('disconnected', { reason })
  }
}
