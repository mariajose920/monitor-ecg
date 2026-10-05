import { DataSource } from './DataSource.js'
import { EcgStreamParser } from '@/services/parsing/ecgCsvParser.js'
import { maxRaw } from '@/data/deviceProfiles.js'

/**
 * Fuente Web Serial (Arduino UNO/Nano, ESP32 por USB o HC-05 emparejado como COM).
 * Corrige los bugs 4, 5, 6, 7, 13 y 14 del diagnóstico:
 *  - Cierre ordenado: keepReading=false → reader.cancel() → await pipeTo → releaseLock (en el finally
 *    del bucle, que se espera) → port.close(). Idempotente y sin condiciones de carrera.
 *  - bufferSize 8192 (el por defecto de 255 B se desborda con el hilo principal ocupado).
 *  - Evento 'disconnect' de navigator.serial y error de reader.read() → estado 'disconnected'
 *    con motivo 'desconexion' (RF09).
 *  - El parser se reinicia en cada apertura (millis() vuelve a 0 al resetear el UNO por DTR).
 * SEC-35: baudios fijos 115200; requestPort() solo se invoca desde un gesto del usuario.
 */
export class SerialSource extends DataSource {
  static isSupported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator
  }

  constructor({ id, profile }) {
    super({ id, kind: 'serial', profile })
    this.port = null
    this.reader = null
    this.readableClosed = null
    this.loopPromise = null
    this.keepReading = false
    this._closing = null
    this.info = null
    this.parser = new EcgStreamParser({
      maxRaw: maxRaw(profile),
      periodMs: 1000 / profile.fs,
      onBatch: (b) => this.emit('samples', b),
      onEvent: (ev) => this.emit('event', ev),
    })
    this._onSerialDisconnect = (e) => {
      if (e.target === this.port || e.port === this.port) this._lost('desconexion')
    }
  }

  get stats() {
    return this.parser.stats
  }

  async connect() {
    if (!SerialSource.isSupported()) throw new Error('Este navegador no soporta Web Serial. Usa Chrome o Edge de escritorio.')
    if (this.port) return
    this.setStatus('connecting')
    let port
    try {
      port = await navigator.serial.requestPort()
    } catch (err) {
      this.setStatus('idle')
      if (err && err.name === 'NotFoundError') throw new Error('No se eligió ningún puerto.')
      throw err
    }
    try {
      await port.open({ baudRate: 115200, bufferSize: 8192 })
    } catch (err) {
      this.setStatus('error', { message: err?.message })
      throw new Error('No se pudo abrir el puerto (¿lo usa otra pestaña o el IDE de Arduino?).')
    }
    this.port = port
    try {
      const i = port.getInfo()
      this.info = { usbVendorId: i.usbVendorId ?? null, usbProductId: i.usbProductId ?? null }
    } catch {
      this.info = null
    }
    navigator.serial.addEventListener('disconnect', this._onSerialDisconnect)
  }

  async start() {
    if (!this.port || this.keepReading) return
    this.parser.reset()
    this.keepReading = true
    this.loopPromise = this._readLoop()
    this.setStatus('streaming')
  }

  async _readLoop() {
    const decoder = new TextDecoderStream()
    this.readableClosed = this.port.readable.pipeTo(decoder.writable)
    this.reader = decoder.readable.getReader()
    try {
      while (this.keepReading) {
        const { value, done } = await this.reader.read()
        if (done) break
        if (value) this.parser.push(value)
      }
      // El flujo terminó sin que lo pidiéramos: el dispositivo dejó de estar disponible.
      if (this.keepReading) queueMicrotask(() => this._lost('desconexion'))
    } catch (err) {
      if (this.keepReading) {
        // Error físico del puerto (cable desenchufado, etc.)
        queueMicrotask(() => this._lost('error-lectura', err))
      }
    } finally {
      try {
        this.reader.releaseLock()
      } catch {
        /* ya liberado */
      }
    }
  }

  _lost(reason, err) {
    if (this._closing) return
    if (err) this.emit('error', err)
    this.disconnect(reason === 'error-lectura' ? 'desconexion' : reason)
  }

  async stop() {
    await this.disconnect('usuario')
  }

  /** Cierre ordenado e idempotente (bugs 5 y 6). */
  disconnect(reason = 'usuario') {
    if (this._closing) return this._closing
    if (!this.port) {
      this.setStatus('disconnected', { reason })
      return Promise.resolve()
    }
    this._closing = (async () => {
      this.keepReading = false
      try {
        await this.reader?.cancel()
      } catch {
        /* el puerto puede estar ya perdido */
      }
      if (this.readableClosed) await this.readableClosed.catch(() => {})
      if (this.loopPromise) await this.loopPromise.catch(() => {})
      try {
        await this.port.close()
      } catch {
        /* puerto ya cerrado o perdido */
      }
      navigator.serial.removeEventListener('disconnect', this._onSerialDisconnect)
      this.port = null
      this.reader = null
      this.readableClosed = null
      this.loopPromise = null
      this.parser.reset()
      this.setStatus('disconnected', { reason })
    })()
    const p = this._closing
    p.finally(() => {
      this._closing = null
    })
    return p
  }
}
