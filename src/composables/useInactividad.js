import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAccountStore } from '@/stores/account.js'
import { useSessionStore } from '@/stores/session.js'
import { notify } from '@/services/notifications/notifier.js'
import { crearControlInactividad } from '@/services/security/inactividad.js'

/**
 * Cierre por inactividad de la sesión de CUENTA (C-07). Monta una vez en App.vue. Con cuenta iniciada: tras 15 min sin actividad
 * (clic, tecla, toque, desplazamiento) cierra la sesión, y en un equipo compartido quita del equipo los datos de la cuenta.
 * Avisa 1 minuto antes. Una medición en curso cuenta como actividad. Sin cuenta no hace nada.
 */
export function useInactividad() {
  const cuenta = useAccountStore()
  const sesion = useSessionStore()
  const router = useRouter()
  const aviso = ref(false)
  const segundos = ref(0)
  let timer = null
  let control = null

  const eventos = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll']
  const alActividad = () => control?.actividad()

  async function vencer() {
    aviso.value = false
    try {
      await cuenta.cerrarPorInactividad()
      notify('Cerramos tu sesión por inactividad (15 min).', { tipo: 'aviso', duracionMs: 9000 })
      router.push({ name: 'acceso' })
    } catch {
      notify('No se pudo cerrar la sesión por inactividad.', { tipo: 'error' })
    }
  }

  function armar() {
    desarmar()
    control = crearControlInactividad({
      ocupado: () => sesion.activa,
      alAviso: (s) => {
        aviso.value = true
        segundos.value = s
      },
      alRecuperar: () => (aviso.value = false),
      alVencer: vencer,
    })
    for (const e of eventos) window.addEventListener(e, alActividad, { passive: true, capture: true })
    timer = setInterval(() => control?.tic(), 1000)
  }

  function desarmar() {
    clearInterval(timer)
    timer = null
    for (const e of eventos) window.removeEventListener(e, alActividad, { capture: true })
    control = null
    aviso.value = false
  }

  function seguir() {
    control?.actividad()
    aviso.value = false
  }

  onMounted(() => {
    watch(() => cuenta.iniciada, (si) => (si ? armar() : desarmar()), { immediate: true })
  })
  onBeforeUnmount(desarmar)
  return { aviso, segundos, seguir }
}
