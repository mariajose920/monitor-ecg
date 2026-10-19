import { reactive, readonly } from 'vue'

/**
 * Instalación PWA y actualización de versión.
 * - Android/Chrome: captura beforeinstallprompt y lo dispara desde un botón propio.
 * - iOS Safari: no hay evento; se muestran instrucciones "Compartir -> Agregar a pantalla de inicio".
 * - Service worker: se registra solo en producción; si hay una versión nueva en espera se avisa.
 */
const estado = reactive({
  puedeInstalar: false,
  instalada: false,
  esIos: false,
  actualizacion: false,
  offlineListo: false,
})

let diferido = null
let registro = null
let pidioActualizar = false

function standalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function initPwa() {
  if (typeof window === 'undefined') return
  estado.instalada = standalone()
  const ua = navigator.userAgent || ''
  estado.esIos = /iphone|ipad|ipod/i.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    diferido = e
    estado.puedeInstalar = true
  })
  window.addEventListener('appinstalled', () => {
    estado.instalada = true
    estado.puedeInstalar = false
    diferido = null
  })
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        registro = reg
        estado.offlineListo = true
        if (reg.waiting && navigator.serviceWorker.controller) estado.actualizacion = true
        reg.addEventListener('updatefound', () => {
          const nuevo = reg.installing
          nuevo?.addEventListener('statechange', () => {
            if (nuevo.state === 'installed' && navigator.serviceWorker.controller) estado.actualizacion = true
          })
        })
      })
      .catch(() => {})
    let recargando = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (recargando || !pidioActualizar) return
      recargando = true
      window.location.reload()
    })
  }
}

export async function instalar() {
  if (!diferido) return false
  diferido.prompt()
  const r = await diferido.userChoice
  diferido = null
  estado.puedeInstalar = false
  return r.outcome === 'accepted'
}

export function aplicarActualizacion() {
  pidioActualizar = true
  registro?.waiting?.postMessage('SKIP_WAITING')
}

export function usePwaInstall() {
  return { estado: readonly(estado), instalar, aplicarActualizacion }
}
