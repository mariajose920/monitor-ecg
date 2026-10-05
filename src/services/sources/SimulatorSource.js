import { DataSource } from './DataSource.js'
import { PqrstGenerator, mvToAdc } from '@/data/referenceEcg.js'

/**
 * Simulador de ECG PQRST a 250 Hz (I7, SEC-56): demo y pruebas sin hardware, multicanal y móvil.
 * Emite lotes cada ~40 ms con marcas de tiempo exactas (t = i · 4 ms) calculadas a partir del
 * tiempo transcurrido, de modo que una pestaña en segundo plano (timers ralentizados) no
 * distorsiona la señal.
 *
 * Controles: setBpm(), setLeadsOff(bool), pausarDatos(bool) (simula pérdida de señal → watchdog),
 * simularDesconexion() (RF09: como desenchufar el cable).
 */
export class SimulatorSource extends DataSource {
  constructor({ id, profile, bpm = 72, ruido = 0.02, variabilidad = 0.04, seed }) {
    super({ id, kind: 'simulator', profile })
    this.fs = profile.fs
    this.gen = new PqrstGenerator({ fs: this.fs, bpm, ruido, variabilidad, deriva: 0.05, seed: seed ?? Math.floor(Math.random() * 1e9) })
    this.timer = null
    this.sent = 0
    this.t0 = 0
    this.leadsOff = false
    this.pausado = false
    this._bpmFirmware = 0
  }

  async connect() {
    this.setStatus('connecting')
  }

  async start() {
    if (this.timer) return
    this.t0 = performance.now()
    this.sent = 0
    this.timer = setInterval(() => this._tick(), 40)
    this.setStatus('streaming')
  }

  setBpm(bpm) {
    this.gen.bpm = Math.max(30, Math.min(220, Number(bpm) || 72))
  }

  setRuido(r) {
    this.gen.ruido = Math.max(0, Math.min(0.5, Number(r) || 0))
  }

  setLeadsOff(v) {
    this.leadsOff = !!v
  }

  pausarDatos(v) {
    this.pausado = !!v
  }

  simularDesconexion() {
    this.disconnect('desconexion')
  }

  _tick() {
    const due = Math.floor(((performance.now() - this.t0) / 1000) * this.fs)
    let n = due - this.sent
    if (n <= 0) return
    if (n > this.fs * 2) {
      // Pestaña dormida mucho tiempo: no generar más de 2 s de golpe
      this.sent = due - this.fs * 2
      n = this.fs * 2
    }
    const t = new Float64Array(n)
    const v = new Float32Array(n)
    const lo = new Uint8Array(n)
    const bpm = new Float32Array(n)
    const periodo = 1000 / this.fs
    for (let k = 0; k < n; k++) {
      const i = this.sent + k
      const mv = this.gen.next()
      t[k] = i * periodo
      if (this.leadsOff) {
        // Con electrodos sueltos el AD8232 satura: valor crudo real, marcado como leads-off
        v[k] = mvToAdc(3 + 0.5 * Math.random(), this.profile)
        lo[k] = 1
      } else {
        v[k] = mvToAdc(mv, this.profile)
        lo[k] = 0
      }
      this._bpmFirmware = this.gen.bpmInstantaneo
      bpm[k] = this.leadsOff ? 0 : Math.round(this._bpmFirmware * 10) / 10
    }
    this.sent += n
    if (!this.pausado) this.emit('samples', { t, v, leadsOff: lo, bpmDevice: bpm, n })
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
