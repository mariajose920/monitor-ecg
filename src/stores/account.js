import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { cloudEnabled, cloudCuenta, eliminarMiCuenta, deleteAllMyCloudData } from '@/services/cloud/cloudSync.js'
import * as authService from '@/services/accounts/authService.js'
import { resumenLocal, vincularDatosLocales } from '@/services/accounts/linkLocal.js'
import { setDataNamespace, clearDataNamespace } from '@/services/storage/index.js'
import { audit } from '@/services/audit/auditService.js'
import { useUsersStore } from './users.js'
import { useMonitoreosStore } from './monitoreos.js'
import { useSessionStore } from './session.js'
import { useChannelsStore } from './channels.js'
import { useComunidadStore } from './comunidad.js'

/**
 * Cuenta de la persona (Supabase Auth). Sin cuenta: modo "solo en este dispositivo" (todo local cifrado,
 * nada va a la nube). Con cuenta: los datos locales viven en un espacio propio de la cuenta
 * (setDataNamespace) y se sincronizan con la nube; al cerrar sesión se pueden quitar del equipo.
 */
export const useAccountStore = defineStore('account', () => {
  const cuenta = ref(null) // { id, email } | null
  const listo = ref(false)
  const recuperando = ref(false)
  /** Datos locales sin cuenta que se pueden vincular: { pacientes, monitoreos } | null */
  const vinculable = ref(null)
  const iniciada = computed(() => !!cuenta.value)
  const disponible = cloudEnabled
  let desuscribir = null

  async function cambiarEspacio(uid) {
    setDataNamespace(uid)
    const users = useUsersStore()
    users.reset()
    useMonitoreosStore().reset()
    useComunidadStore().reset()
    for (const c of useChannelsStore().channels) c.usuarioId = null
    await users.ensureLoaded()
    if (uid) {
      try {
        await users.sincronizarConNube()
      } catch {
        /* sin conexión: se sigue con la copia local de la cuenta */
      }
    }
  }

  async function revisarVinculable() {
    try {
      const r = await resumenLocal()
      vinculable.value = r.pacientes || r.monitoreos ? r : null
    } catch {
      vinculable.value = null
    }
  }

  async function init() {
    if (listo.value) return
    try {
      const actual = await authService.sesionActual()
      if (actual) {
        cuenta.value = actual
        cloudCuenta.value = actual
        setDataNamespace(actual.id)
      }
      desuscribir = authService.escucharAuth(async (evento, user) => {
        if (evento === 'PASSWORD_RECOVERY') recuperando.value = true
        if (evento === 'SIGNED_OUT' && cuenta.value) await cerrarLocal(false)
        if (evento === 'SIGNED_IN' && user && !cuenta.value) {
          cuenta.value = user
          cloudCuenta.value = user
          await cambiarEspacio(user.id)
        }
      })
    } catch {
      cuenta.value = null
    } finally {
      listo.value = true
    }
  }

  async function iniciarSesion(datos) {
    const user = await authService.iniciarSesion(datos)
    cuenta.value = { id: user.id, email: user.email ?? '' }
    cloudCuenta.value = cuenta.value
    await cambiarEspacio(user.id)
    await audit('ACCOUNT_LOGIN', 'system')
    await revisarVinculable()
  }

  async function registrar(datos) {
    const msg = await authService.registrar(datos)
    await audit('ACCOUNT_REGISTERED', 'system')
    return msg
  }

  async function recuperar(correo) {
    const msg = await authService.solicitarRecuperacion(correo)
    await audit('ACCOUNT_PASSWORD_RESET', 'system', { fase: 'solicitud' })
    return msg
  }

  async function fijarPassword(password, confirmar) {
    await authService.fijarNuevaPassword(password, confirmar, cuenta.value?.email ?? '')
    recuperando.value = false
    await audit('ACCOUNT_PASSWORD_RESET', 'system', { fase: 'cambio' })
  }

  async function cerrarLocal(borrarDatos) {
    const uid = cuenta.value?.id
    cuenta.value = null
    cloudCuenta.value = null
    vinculable.value = null
    if (uid && borrarDatos) await clearDataNamespace(uid)
    await cambiarEspacio(null)
  }

  /** @param {{borrarDatosDelEquipo?:boolean}} o  por defecto true (equipo compartido, A.11.2.7) */
  async function cerrarSesion({ borrarDatosDelEquipo = true } = {}) {
    if (useSessionStore().activa) throw new Error('Detén el monitoreo en curso antes de cerrar sesión.')
    await audit('ACCOUNT_LOGOUT', 'system', { datosQuitadosDelEquipo: borrarDatosDelEquipo })
    await authService.cerrarSesionNube()
    await cerrarLocal(borrarDatosDelEquipo)
  }

  async function vincular(onProgreso) {
    const r = await vincularDatosLocales(onProgreso)
    const users = useUsersStore()
    users.reset()
    useMonitoreosStore().reset()
    await users.ensureLoaded()
    await revisarVinculable()
    return r
  }

  function descartarVinculacion() {
    vinculable.value = null
  }

  /** Borra todos los datos en la nube (pacientes, monitoreos, incidentes) sin eliminar la cuenta. */
  async function borrarDatosNube() {
    return deleteAllMyCloudData()
  }

  /** Elimina la cuenta y todos sus datos (nube + este equipo). */
  async function eliminarCuenta() {
    if (useSessionStore().activa) throw new Error('Detén el monitoreo en curso antes de eliminar la cuenta.')
    const uid = cuenta.value?.id
    await audit('ACCOUNT_DELETED', 'system')
    await eliminarMiCuenta()
    cuenta.value = null
    cloudCuenta.value = null
    if (uid) await clearDataNamespace(uid)
    await cambiarEspacio(null)
  }

  function detener() {
    desuscribir?.()
  }

  return {
    cuenta, listo, recuperando, vinculable, iniciada, disponible, init, iniciarSesion, registrar, recuperar,
    fijarPassword, cerrarSesion, vincular, descartarVinculacion, revisarVinculable, borrarDatosNube, eliminarCuenta, detener,
  }
})
