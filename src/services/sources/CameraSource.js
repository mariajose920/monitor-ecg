import { DataSource } from './DataSource.js'
import { PpgProcessor, PpgPeakDetector, PPG_FS } from '@/utils/dsp/ppgCamera.js'

/**
 * Fuente "Camara del celular" (PPG con flash). Implementa la interfaz DataSource y emite lotes
 * con el mismo formato interno que las demas fuentes: { t, v, leadsOff, bpmDevice, n }.
 *
 * PRIVACIDAD (A.18.1.4): los fotogramas se dibujan en un canvas diminuto SOLO para promediar
 * los canales R, G, B de una region central; no se almacenan, no se envian y no se muestran.
 * Al desconectar (o al ocultarse la pestana) se detienen las pistas y se apaga el flash.
 *
 * Eventos extra ('event'): { type: 'torch-unavailable' } | { type: 'camera-denied', motivo }.
 */
export const CAMERA_CENTER = 0.25 // lado de la region central (fraccion del ancho/alto)
const GRID_MS = 1000 / PPG_FS
const MID = 512 // centro del "ADC" virtual de 10 bits
const TARGET_AMP = 180 // amplitud objetivo (cuentas) de la senal normalizada

export class CameraSource extends DataSource {
  constructor({ id, profile }) {
    super({ id, kind: 'camera', profile })
    this.fs = profile.fs
    this.proc = new PpgProcessor({ fs: this.fs })
    this.stream = null
    this.track = null
    this.video = null
    this.canvas = null
    this.ctx = null
    this.timer = null
    this.vfc = null
    this.torchOn = false
    this.torchSupported = false
    this.t0 = 0
    this.gridI = 0
    this.prev = null
    this.gain = 1
    this.env = 0
    this.stats = { invalid: 0 }
    this._closing = false
    this._onVis = () => {
      if (document.visibilityState === 'hidden') this.disconnect('segundo-plano')
    }
    this._onHide = () => this.disconnect('segundo-plano')
  }

  static isSupported() {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && (typeof window === 'undefined' || window.isSecureContext !== false)
  }

  /** Detector que usa el runtime del canal (misma interfaz que RPeakDetector). */
  createDetector() {
    return new PpgPeakDetector({ fs: this.fs })
  }

  /** Calidad en vivo para el asistente (consulta, no reactivo). */
  get quality() {
    return { ...this.proc.quality(), torch: this.torchOn, torchSupported: this.torchSupported }
  }

  async connect() {
    this.setStatus('connecting')
    if (!CameraSource.isSupported()) {
      const err = new Error('Este navegador no permite usar la cámara (se requiere HTTPS y un navegador compatible).')
      this.emit('event', { type: 'camera-denied', motivo: 'no-soportado' })
      this.setStatus('error')
      throw err
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 30, max: 30 } },
      })
    } catch (e) {
      const motivo = e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'permiso-denegado' : e?.name === 'NotFoundError' ? 'sin-camara' : 'error'
      this.emit('event', { type: 'camera-denied', motivo })
      this.setStatus('error')
      const msg = motivo === 'permiso-denegado'
        ? 'Permiso de cámara denegado. Actívalo en los ajustes del navegador para este sitio y vuelve a intentar.'
        : motivo === 'sin-camara'
          ? 'No se encontró una cámara en este dispositivo.'
          : 'No se pudo abrir la cámara. Cierra otras apps que la estén usando.'
      throw new Error(msg)
    }
    this.track = this.stream.getVideoTracks()[0]
    this.track.addEventListener('ended', () => this.disconnect('desconexion'))
    await this._tryTorch()

    // <video> fuera de pantalla (clase CSS, sin estilos en linea): no se muestra al usuario.
    const v = document.createElement('video')
    v.className = 'camera-hidden-video'
    v.setAttribute('playsinline', '')
    v.setAttribute('aria-hidden', 'true')
    v.muted = true
    v.srcObject = this.stream
    document.body.appendChild(v)
    this.video = v
    try {
      await v.play()
    } catch (e) {
      await this._teardown()
      this.emit('event', { type: 'camera-denied', motivo: 'reproduccion' })
      this.setStatus('error')
      throw new Error('No se pudo iniciar la cámara.', { cause: e })
    }
    this.canvas = makeCanvas(16, 16)
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })
    document.addEventListener('visibilitychange', this._onVis)
    window.addEventListener('pagehide', this._onHide)
  }

  async _tryTorch() {
    try {
      const caps = this.track.getCapabilities?.() ?? {}
      this.torchSupported = !!caps.torch
      if (this.torchSupported) {
        await this.track.applyConstraints({ advanced: [{ torch: true }] })
        this.torchOn = true
        return
      }
    } catch {
      this.torchOn = false
    }
    this.torchOn = false
    this.emit('event', { type: 'torch-unavailable' })
  }

  /** Reintento manual del flash (botón "Encender flash"). @returns {Promise<boolean>} */
  async encenderFlash() {
    try {
      if (!this.track) return false
      const caps = this.track.getCapabilities?.() ?? {}
      this.torchSupported = !!caps.torch
      if (!this.torchSupported) return false
      await this.track.applyConstraints({ advanced: [{ torch: true }] })
      this.torchOn = true
      return true
    } catch {
      this.torchOn = false
      return false
    }
  }

  async start() {
    if (this.timer || this.vfc !== null || !this.video) return
    this.t0 = performance.now()
    this.gridI = 0
    this.prev = null
    this.proc.reset()
    this.setStatus('streaming')
    const loop = () => {
      this._frame()
      this.vfc = this.video?.requestVideoFrameCallback ? this.video.requestVideoFrameCallback(loop) : null
    }
    if (this.video.requestVideoFrameCallback) this.vfc = this.video.requestVideoFrameCallback(loop)
    else this.timer = setInterval(() => this._frame(), GRID_MS)
  }

  /** Promedia R, G, B de la region central del fotograma actual. */
  _readRgb() {
    const vw = this.video.videoWidth
    const vh = this.video.videoHeight
    if (!vw || !vh || !this.ctx) return null
    const sw = Math.max(2, Math.floor(vw * CAMERA_CENTER))
    const sh = Math.max(2, Math.floor(vh * CAMERA_CENTER))
    this.ctx.drawImage(this.video, Math.floor((vw - sw) / 2), Math.floor((vh - sh) / 2), sw, sh, 0, 0, 16, 16)
    const d = this.ctx.getImageData(0, 0, 16, 16).data
    let r = 0
    let g = 0
    let b = 0
    const n = d.length / 4
    for (let i = 0; i < d.length; i += 4) {
      r += d[i]
      g += d[i + 1]
      b += d[i + 2]
    }
    return { r: r / n, g: g / n, b: b / n }
  }

  _frame() {
    if (this.status !== 'streaming') return
    let rgb
    try {
      rgb = this._readRgb()
    } catch {
      this.stats.invalid++
      return
    }
    if (!rgb) return
    const now = performance.now() - this.t0
    const cur = { t: now, ...rgb }
    const prev = this.prev
    this.prev = cur
    if (!prev) return
    // Hueco largo (> 0,5 s): se reinicia la rejilla en lugar de inventar datos
    if (cur.t - prev.t > 500) {
      this.gridI = Math.ceil(cur.t / GRID_MS)
      this.proc.reset()
      return
    }
    // Remuestreo a rejilla fija de 30 Hz por interpolacion lineal (el movil puede dar 15-30 fps)
    const ts = []
    const vs = []
    const lo = []
    const bp = []
    while (this.gridI * GRID_MS <= cur.t) {
      const tg = this.gridI * GRID_MS
      if (tg >= prev.t) {
        const a = (tg - prev.t) / Math.max(1e-6, cur.t - prev.t)
        const r = prev.r + a * (cur.r - prev.r)
        const g = prev.g + a * (cur.g - prev.g)
        const b = prev.b + a * (cur.b - prev.b)
        const o = this.proc.push(tg, r, g, b)
        ts.push(tg)
        if (!o.fingerOn) {
          vs.push(MID)
          lo.push(1)
          bp.push(0)
          this.env = 0
        } else {
          // Normalizacion automatica a ~TARGET_AMP cuentas (envolvente lenta)
          const ax = Math.abs(o.v)
          this.env = ax > this.env ? ax : this.env * 0.995
          const gain = this.env > 1e-6 ? TARGET_AMP / this.env : 1
          this.gain += 0.05 * (gain - this.gain)
          vs.push(Math.max(1, Math.min(1022, MID + o.v * this.gain)))
          lo.push(0)
          const bpm = this.proc.getBpm(tg)
          bp.push(bpm ? Math.round(bpm * 10) / 10 : 0)
        }
      }
      this.gridI++
    }
    const n = ts.length
    if (n) this.emit('samples', { t: Float64Array.from(ts), v: Float32Array.from(vs), leadsOff: Uint8Array.from(lo), bpmDevice: Float32Array.from(bp), n })
  }

  async stop() {
    await this.disconnect('usuario')
  }

  async _teardown() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (this.vfc !== null && this.video?.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(this.vfc)
    this.vfc = null
    document.removeEventListener('visibilitychange', this._onVis)
    window.removeEventListener('pagehide', this._onHide)
    // Apaga el flash antes de soltar la pista
    try {
      if (this.track && this.torchOn) await this.track.applyConstraints({ advanced: [{ torch: false }] })
    } catch {
      /* la pista puede estar ya detenida */
    }
    this.torchOn = false
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.track = null
    if (this.video) {
      this.video.pause()
      this.video.srcObject = null
      this.video.remove()
      this.video = null
    }
    this.ctx = null
    this.canvas = null
    this.prev = null
  }

  async disconnect(reason = 'usuario') {
    if (this._closing) return
    this._closing = true
    try {
      await this._teardown()
    } finally {
      this._closing = false
    }
    if (this.status !== 'disconnected') this.setStatus('disconnected', { reason })
  }
}

/** Canvas pequeno: OffscreenCanvas si existe, si no <canvas> sin insertar en el DOM. */
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
