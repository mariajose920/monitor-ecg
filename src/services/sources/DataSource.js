/**
 * Interfaz común de las fuentes de datos (sin Vue ni reactividad).
 *
 * Eventos:
 *  - 'samples' (batch): { t: Float64Array (ms, continuo), v: Float32Array, leadsOff: Uint8Array, bpmDevice: Float32Array, n }
 *  - 'status'  (estado, info): 'idle'|'connecting'|'streaming'|'signal-lost'|'disconnected'|'error'
 *      info.reason en 'disconnected': 'usuario' | 'desconexion' | 'error-lectura' | 'fin-datos'
 *  - 'event'   ({ type: 'device-reset'|'invalid-data'|..., ... })
 *  - 'error'   (Error)
 */
export const SOURCE_STATES = Object.freeze(['idle', 'connecting', 'streaming', 'signal-lost', 'disconnected', 'error'])

export class DataSource {
  constructor({ id, kind, profile }) {
    this.id = id
    this.kind = kind
    this.profile = profile
    this.status = 'idle'
    this._listeners = new Map()
  }

  static isSupported() {
    return true
  }

  on(evt, fn) {
    if (!this._listeners.has(evt)) this._listeners.set(evt, new Set())
    this._listeners.get(evt).add(fn)
    return () => this.off(evt, fn)
  }

  off(evt, fn) {
    this._listeners.get(evt)?.delete(fn)
  }

  emit(evt, ...args) {
    const set = this._listeners.get(evt)
    if (!set) return
    for (const fn of [...set]) {
      try {
        fn(...args)
      } catch (err) {
        if (evt !== 'error') this.emit('error', err)
      }
    }
  }

  setStatus(status, info = {}) {
    this.status = status
    this.emit('status', status, info)
  }

  /** Pide permisos / abre el transporte. */
  async connect() {}
  async start() {}
  async stop() {}
  /** Cierre ordenado e idempotente. */
  async disconnect() {}

  removeAllListeners() {
    this._listeners.clear()
  }
}
