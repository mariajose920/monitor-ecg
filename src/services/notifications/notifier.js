import { useToastsStore } from '@/stores/toasts.js'

/**
 * Notificaciones in-app (toasts con aria-live) y sonido opcional con Web Audio.
 * Sin Notification API del sistema operativo (no se envía nada fuera de la página).
 */
let audioCtx = null

export function notify(mensaje, { tipo = 'info', duracionMs = 5000, enlace = null } = {}) {
  try {
    useToastsStore().push({ mensaje, tipo, duracionMs, enlace })
  } catch {
    /* Pinia aún no inicializado */
  }
}

export function beep({ freq = 880, ms = 180 } = {}) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    audioCtx = audioCtx || new Ctx()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.frequency.value = freq
    gain.gain.value = 0.08
    osc.connect(gain).connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + ms / 1000)
  } catch {
    /* audio no disponible */
  }
}
