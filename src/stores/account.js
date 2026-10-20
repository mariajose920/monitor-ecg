import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { cloudEnabled, cloudCuenta, eliminarMiCuenta, deleteAllMyCloudData, reanudarAuditoriaNube } from '@/services/cloud/cloudSync.js'
import * as authService from '@/services/accounts/authService.js'
import { resumenLocal, vincularDatosLocales, vinculacionOcultaEnEsteEquipo } from '@/services/accounts/linkLocal.js'
import { setDataNamespace, clearDataNamespace } from '@/services/storage/index.js'
import { audit } from '@/services/audit/auditService.js'
import { nubeActivada, nubeDecidida, cargarOptIn, fijarOptIn, olvidarOptIn, limpiarOptInEnMemoria } from '@/services/cloud/nubeOptIn.js'
import { subirTodoGuardado, marcarTodoFueraDeNube } from '@/services/cloud/subidaMonitoreo.js'
import { valorInicialCompartido, borrarTokens } from '@/services/cloud/almacenSesion.js'
import { purgeOlderThan } from '@/services/storage/sessionRepository.js'
import { ventanaReauthVigente, REAUTH_VENTANA_MS } from '@/services/security/reauth.js'
import { useUsersStore } from './users.js'
import { useMonitoreosStore } from './monitoreos.js'
import { useSessionStore } from './session.js'
import { useChannelsStore } from './channels.js'
import { useComunidadStore } from './comunidad.js'
import { useAuthStore } from './auth.js'
import { useSettingsStore } from './settings.js'

/**
 * Cuenta de la persona (Supabase Auth). Sin cuenta: modo "solo en este dispositivo" (todo local cifrado,
 * nada va a la nube). Con cuenta: los datos locales viven en un espacio propio de la cuenta (setDataNamespace) y,
 * SOLO si la persona activa "Guardar mis datos en la nube" (apagado por defecto, C-03), se copian a la nube.
 * Equipo compartido (C-07): el token vive en sessionStorage, hay cierre por inactividad y al salir se quitan los datos del equipo.
 */
export const useAccountStore = defineStore('account', () => {
  const cuenta = ref(null) // { id, email } | null
  const listo = ref(false)
  const recuperando = ref(false)
  /** Resumen de datos locales sin cuenta que se podrían vincular: { pacientes, monitoreos, detalle } | null */
  const vinculable = ref(null)
  /** ¿Se inició sesión como "equipo compartido"? (token en sessionStorage, borrado al salir, vinculación apagada) */
  const equipoCompartido = ref(valorInicialCompartido())
  const reauthEn = ref(0)
  const iniciada = computed(() => !!cuenta.value)
  const disponible = cloudEnabled
  let desuscribir = null
  let saliendoAMano = false

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
        await users.sincronizarConNube() // solo hace algo si la nube está activada para la cuenta
      } catch {
        /* sin conexión: se sigue con la copia local de la cuenta */
      }
      // SEC-32 / C-16: la retención local también se aplica al espacio de la cuenta que se acaba de abrir.
      try {
        const dias = useSettingsStore().retencionDias
        const n = await purgeOlderThan(dias)
        if (n > 0) await audit('RETENTION_PURGE', 'system', { sesiones: n, dias })
      } catch {
        /* la purga se reintenta al iniciar la aplicación */
      }
    }
  }

  async function revisarVinculable() {
    // C-15: en un equipo compartido la vinculación está apagada por defecto (se puede abrir a mano desde Mi cuenta) y se puede ocultar.
    if (equipoCompartido.value || vinculacionOcultaEnEsteEquipo()) {
      vinculable.value = null
      return
    }
    try {
      const r = await resumenLocal()
      vinculable.value = r.pacientes || r.monitoreos ? r : null
    } catch {
      vinculable.value = null
    }
  }

  let inicio = null
  /** Idempotente y seguro ante llamadas simultáneas (main.js y los guards del router). */
  function init() {
    inicio ??= iniciar()
    return inicio
  }

  async function iniciar() {
    if (listo.value) return
    try {
      const actual = await authService.sesionActual()
      if (actual) {
        cuenta.value = actual
        cloudCuenta.value = actual
        equipoCompartido.value = valorInicialCompartido()
        cargarOptIn(actual.id)
        setDataNamespace(actual.id)
        // Restaurar sesión: consulta al servidor si es administrador registrado y su nivel aal.
        await useAuthStore().refrescarNube()
        reanudarAuditoriaNube()
      }
      desuscribir = authService.escucharAuth(async (evento, user) => {
        if (evento === 'PASSWORD_RECOVERY') recuperando.value = true
        // Cierre espontáneo (token vencido o cerrado en otra pestaña): mismo criterio que "equipo compartido" (C-07).
        if (evento === 'SIGNED_OUT' && cuenta.value && !saliendoAMano) await cerrarLocal(equipoCompartido.value)
        if (evento === 'SIGNED_IN' && user && !cuenta.value) {
          cuenta.value = user
          cloudCuenta.value = user
          cargarOptIn(user.id)
          await cambiarEspacio(user.id)
          await useAuthStore().refrescarNube()
        }
      })
    } catch {
      cuenta.value = null
    } finally {
      listo.value = true
    }
  }

  /** @param {{correo:string, password:string, equipoCompartido?:boolean}} datos */
  async function iniciarSesion(datos) {
    const user = await authService.iniciarSesion(datos)
    if (typeof datos.equipoCompartido === 'boolean') equipoCompartido.value = datos.equipoCompartido
    cuenta.value = { id: user.id, email: user.email ?? '' }
    cloudCuenta.value = cuenta.value
    cargarOptIn(user.id) // por defecto APAGADA hasta que la persona la active
    await cambiarEspacio(user.id)
    await audit('ACCOUNT_LOGIN', 'system', { equipoCompartido: equipoCompartido.value })
    reanudarAuditoriaNube() // reenvía los eventos que quedaron pendientes por falta de red
    await useAuthStore().alIniciarSesionCuenta()
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
    // El cambio se hace con la sesión abierta: las demás sesiones de la cuenta se cerraron en el servidor (C-05).
    await audit('ACCOUNT_PASSWORD_RESET', 'system', { fase: 'cambio' })
    await audit('ACCOUNT_PASSWORD_CHANGED', 'system', { otrasSesionesCerradas: true })
  }

  // ---------- C-13: reautenticación para acciones sensibles ----------
  const reauthVigente = () => ventanaReauthVigente({ desde: reauthEn.value, ahora: Date.now(), ventanaMs: REAUTH_VENTANA_MS })

  /** Verifica la contraseña actual; abre una ventana de 5 min en memoria (nunca se guarda la contraseña). */
  async function reautenticar(password) {
    if (!cuenta.value) throw new authService.AuthError('Inicia sesión primero.')
    await authService.reautenticar({ correo: cuenta.value.email, password })
    reauthEn.value = Date.now()
    return true
  }

  function exigirReauth() {
    if (!reauthVigente()) throw new authService.AuthError('Confirma tu contraseña para continuar.')
  }

  /** Cambio de contraseña con la sesión abierta: contraseña actual + nueva (política ≥10 y sin comunes). */
  async function cambiarPassword({ actual, nueva, confirmar }) {
    await authService.cambiarPassword({ correo: cuenta.value?.email ?? '', actual, nueva, confirmar })
    reauthEn.value = Date.now()
    await audit('ACCOUNT_PASSWORD_CHANGED', 'system', { otrasSesionesCerradas: true, desde: 'cuenta' })
  }

  // ---------- C-03: la nube es opcional ----------
  /**
   * Activa/desactiva "Guardar mis datos en la nube" de esta cuenta. Al activar se traen/suben pacientes (con declaración);
   * lo ya guardado se sube solo si se pide (subirGuardado). Al desactivar no se borra nada: borrar es una acción aparte (borrarDatosNube).
   * @returns {Promise<{subidos:number, fallidos:number, sinDeclaracion:number}|null>}
   */
  async function configurarNube(activo, { subirGuardado = false, onProgreso = () => {} } = {}) {
    if (!cuenta.value) throw new Error('Inicia sesión para usar la nube.')
    fijarOptIn(cuenta.value.id, activo === true)
    await audit('CLOUD_SYNC_CHANGED', 'system', { activo: activo === true })
    if (!activo) return null
    const users = useUsersStore()
    await users.ensureLoaded()
    try {
      await users.sincronizarConNube()
    } catch {
      /* sin conexión: se reintenta al iniciar */
    }
    return subirGuardado ? subirTodoGuardado(onProgreso) : null
  }

  async function cerrarLocal(borrarDatos) {
    const uid = cuenta.value?.id
    cuenta.value = null
    cloudCuenta.value = null
    vinculable.value = null
    reauthEn.value = 0
    useAuthStore().cerrarNube() // cerrar la cuenta cierra el modo admin (A.9.2.6)
    if (uid && borrarDatos) {
      await clearDataNamespace(uid)
      olvidarOptIn(uid)
    }
    limpiarOptInEnMemoria()
    borrarTokens()
    await cambiarEspacio(null)
  }

  /** @param {{borrarDatosDelEquipo?:boolean}} o  por defecto: lo que corresponde a la modalidad (equipo compartido = quitar los datos) */
  async function cerrarSesion({ borrarDatosDelEquipo = equipoCompartido.value } = {}) {
    if (useSessionStore().activa) throw new Error('Detén el monitoreo en curso antes de cerrar sesión.')
    saliendoAMano = true
    try {
      await audit('ACCOUNT_LOGOUT', 'system', { datosQuitadosDelEquipo: borrarDatosDelEquipo })
      await authService.cerrarSesionNube()
      await cerrarLocal(borrarDatosDelEquipo)
    } finally {
      saliendoAMano = false
    }
  }

  /** Cierre por inactividad (15 min): igual que cerrar sesión; en equipo compartido quita los datos del equipo. */
  async function cerrarPorInactividad() {
    if (!cuenta.value) return
    saliendoAMano = true
    try {
      await audit('SESSION_IDLE_TIMEOUT', 'system', { datosQuitadosDelEquipo: equipoCompartido.value })
      await authService.cerrarSesionNube()
      await cerrarLocal(equipoCompartido.value)
    } finally {
      saliendoAMano = false
    }
  }

  /** C-15: vincula SOLO los pacientes elegidos (y sus monitoreos) creados en este dispositivo sin cuenta. */
  async function vincular({ pacientesIds, quitarCopia = false, onProgreso } = {}) {
    const r = await vincularDatosLocales({ pacientesIds, quitarCopia, onProgreso })
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

  /** Borra todos los datos en la nube (pacientes, monitoreos, incidentes) sin eliminar la cuenta. Exige reautenticación reciente. */
  async function borrarDatosNube() {
    exigirReauth()
    const r = await deleteAllMyCloudData()
    await marcarTodoFueraDeNube()
    await audit('CLOUD_DATA_DELETED', 'system', { sesiones: r?.sesiones ?? 0, pacientes: r?.pacientes ?? 0 })
    return r
  }

  /** Elimina la cuenta y todos sus datos (nube + este equipo). Exige reautenticación reciente. */
  async function eliminarCuenta() {
    if (useSessionStore().activa) throw new Error('Detén el monitoreo en curso antes de eliminar la cuenta.')
    exigirReauth()
    const uid = cuenta.value?.id
    await audit('ACCOUNT_DELETED', 'system')
    saliendoAMano = true
    try {
      await eliminarMiCuenta()
      cuenta.value = null
      cloudCuenta.value = null
      useAuthStore().cerrarNube()
      if (uid) {
        await clearDataNamespace(uid)
        olvidarOptIn(uid)
      }
      limpiarOptInEnMemoria()
      borrarTokens()
      await cambiarEspacio(null)
    } finally {
      saliendoAMano = false
    }
  }

  function detener() {
    desuscribir?.()
  }

  return {
    cuenta, listo, recuperando, vinculable, iniciada, disponible, equipoCompartido, nubeActivada, nubeDecidida, reauthEn, init, iniciarSesion,
    registrar, recuperar, fijarPassword, reautenticar, reauthVigente, cambiarPassword, configurarNube, cerrarSesion, cerrarPorInactividad,
    vincular, descartarVinculacion, revisarVinculable, borrarDatosNube, eliminarCuenta, detener,
  }
})
