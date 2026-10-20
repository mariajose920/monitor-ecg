import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loadUsers, saveUsers, nextUserNumber } from '@/services/storage/userRepository.js'
import { deleteByUser, listSessions, getSession, saveSession as saveSessionLocal } from '@/services/storage/sessionRepository.js'
import { pushSession, deleteCloudSessions, deleteCloudChunks, pushPaciente, deletePaciente, fetchPacientes, cloudCuenta } from '@/services/cloud/cloudSync.js'
import { audit } from '@/services/audit/auditService.js'
import { nubeDatosActiva, retirarConsentimientoNube } from '@/services/cloud/cloudSync.js'
import { mezclarPacienteNube } from '@/services/cloud/datosNube.js'
import {
  CONSENT_VERSION, CONSENT_SCOPE, consentimientoVigente, declaracionVigente, crearDeclaracion, crearConsentimiento,
} from '@/services/privacidad/consentimiento.js'
import { ALIAS_RE, validarAlias } from '@/services/privacidad/alias.js'
import { newId } from '@/utils/ids.js'
import { RANGOS_EDAD, NIVELES_ACTIVIDAD } from '@/data/activities.js'
import { normalizarEtiquetaLegada as normalizarEtiqueta, etiquetaDe } from '@/services/users/etiquetas.js'

// Versión del texto de consentimiento (SEC-17, C-02): vive en services/privacidad/consentimiento.js; si cambia, se vuelve a pedir.
export { CONSENT_VERSION, CONSENT_SCOPE, consentimientoVigente, declaracionVigente, ALIAS_RE }
const ACTIVE_KEY = 'ecg.activeUser'

/** Valida los datos opcionales (SEC-20). Devuelve { perfil } o { error }. */
export function validarPerfil(p) {
  const rangoEdad = p?.rangoEdad || null
  if (rangoEdad !== null && !RANGOS_EDAD.includes(rangoEdad)) return { error: 'Rango de edad inválido' }
  let pesoKg = p?.pesoKg
  if (pesoKg === '' || pesoKg === undefined || pesoKg === null) pesoKg = null
  else {
    const s = String(pesoKg).trim()
    if (!/^\d{2,3}(\.\d)?$/.test(s)) return { error: 'El peso debe ser un número con 1 decimal como máximo' }
    pesoKg = Number(s)
    if (pesoKg < 30 || pesoKg > 250) return { error: 'El peso debe estar entre 30 y 250 kg' }
  }
  const nivelActividad = p?.nivelActividad || null
  if (nivelActividad !== null && !NIVELES_ACTIVIDAD.some((n) => n.id === nivelActividad)) return { error: 'Nivel de actividad inválido' }
  return { perfil: { rangoEdad, pesoKg, nivelActividad } }
}

const cloudCuentaId = () => cloudCuenta.value?.id ?? null

export const useUsersStore = defineStore('users', () => {
  const users = ref([])
  const loaded = ref(false)
  const activeUserId = ref(sessionStorage.getItem(ACTIVE_KEY))
  let loading = null

  const activeUser = computed(() => users.value.find((u) => u.id === activeUserId.value) || null)

  async function load() {
    users.value = (await loadUsers()).map(normalizarEtiqueta)
    loaded.value = true
    if (activeUserId.value && !users.value.some((u) => u.id === activeUserId.value)) clearActive()
  }

  async function ensureLoaded() {
    if (loaded.value) return
    if (!loading) loading = load().finally(() => (loading = null))
    await loading
  }

  async function persist() {
    await saveUsers(JSON.parse(JSON.stringify(users.value)))
  }

  function byId(id) {
    return users.value.find((u) => u.id === id) || null
  }

  function labelOf(id) {
    const u = byId(id)
    if (!u) return 'Paciente eliminado'
    return u.alias ? `${u.etiqueta} · ${u.alias}` : u.etiqueta
  }

  /**
   * RF01/SEC-13: el sistema genera "Paciente N"; alias opcional (solo en este dispositivo).
   * C-18: sin menores; se exige la declaración de que la persona medida es mayor de edad.
   */
  async function createUser(alias = '', { declaraMayorEdad = false } = {}) {
    await ensureLoaded()
    if (declaraMayorEdad !== true) throw new Error('Confirma que la persona medida es mayor de 18 años. Esta aplicación no mide menores de edad.')
    const a = String(alias || '').trim()
    const errAlias = validarAlias(a)
    if (errAlias) throw new Error(errAlias)
    const numero = await nextUserNumber(users.value)
    const ahora = new Date().toISOString()
    const u = {
      id: newId(),
      numero,
      etiqueta: etiquetaDe(numero),
      alias: a || null,
      perfil: null,
      consentimiento: null,
      declaracion: crearDeclaracion({ por: cloudCuentaId() }),
      creadoEn: ahora,
      actualizadoEn: ahora,
    }
    users.value.push(u)
    await persist()
    await audit(cloudCuenta.value ? 'PATIENT_CREATED' : 'USER_CREATED', 'system', { usuario: u.etiqueta })
    pushPaciente(u, { alConflictoEtiqueta: () => renumerar(u) })
    return u
  }

  /** C-21: el servidor ya tenía esa etiqueta en la cuenta (23505): se toma el número siguiente y se reintenta. */
  async function renumerar(u, intentos = 0) {
    if (intentos >= 3 || !users.value.includes(u)) return
    u.numero = await nextUserNumber(users.value)
    u.etiqueta = etiquetaDe(u.numero)
    u.actualizadoEn = new Date().toISOString()
    await persist()
    pushPaciente(u, { alConflictoEtiqueta: () => renumerar(u, intentos + 1) })
  }

  /** RF02: elegir un identificador = sesión de participante, sin contraseña. */
  function selectUser(id) {
    if (!byId(id)) return
    activeUserId.value = id
    sessionStorage.setItem(ACTIVE_KEY, id)
  }

  function clearActive() {
    activeUserId.value = null
    sessionStorage.removeItem(ACTIVE_KEY)
  }

  /** C-18: pacientes anteriores a la versión 2.0 no tienen la declaración; hasta darla no se suben a la nube ni se publican. */
  async function declararMayorEdad(id) {
    const u = byId(id)
    if (!u) return
    u.declaracion = crearDeclaracion({ por: cloudCuentaId() })
    u.actualizadoEn = new Date().toISOString()
    await persist()
    pushPaciente(u)
    await audit('PATIENT_UPDATED', `participant:${u.etiqueta}`, { usuario: u.etiqueta, campo: 'declaracion' })
  }

  /** C-02: el consentimiento registra quién lo otorga (cuenta), el canal, la declaración de mayoría de edad y el alcance. */
  async function giveConsent(id) {
    const u = byId(id)
    if (!u) return
    u.consentimiento = crearConsentimiento(u, { cuentaId: cloudCuentaId(), nube: nubeDatosActiva() })
    u.actualizadoEn = new Date().toISOString()
    await persist()
    pushPaciente(u)
    await audit('CONSENT_GIVEN', `participant:${u.etiqueta}`, { version: CONSENT_VERSION })
  }

  /** SEC-18: retirar el consentimiento borra de inmediato los datos opcionales. */
  async function withdrawConsent(id) {
    const u = byId(id)
    if (!u) return
    u.consentimiento = null
    u.perfil = null
    u.actualizadoEn = new Date().toISOString()
    await persist()
    // La retirada llega a la nube aunque la nube esté apagada ahora (solo actualiza una fila ya existente); el servidor, además, pasa a
    // privado todo lo público de ese paciente (trigger tg_paciente_perfil).
    retirarConsentimientoNube(u)
    // Retirar el consentimiento retira los datos del paciente Y pasa a privado lo que se había publicado (C-04).
    for (const sesion of await listSessions({ usuarioId: id })) {
      if (sesion.compartirPerfil || sesion.perfilCompartido || sesion.visibilidad === 'publico') {
        const limpia = { ...sesion, compartirPerfil: false, visibilidad: 'privado' }
        delete limpia.perfilCompartido
        delete limpia.consentPublicacion
        await saveSessionLocal(limpia)
        pushSession(limpia)
      }
    }
    await audit('CONSENT_WITHDRAWN', `participant:${u.etiqueta}`)
  }

  async function updateProfile(id, datos) {
    const u = byId(id)
    if (!u) throw new Error('Usuario no encontrado')
    if (!consentimientoVigente(u)) throw new Error('Se requiere el consentimiento informado vigente (versión ' + CONSENT_VERSION + ') para guardar datos opcionales.')
    const r = validarPerfil(datos)
    if (r.error) throw new Error(r.error)
    u.perfil = r.perfil
    u.actualizadoEn = new Date().toISOString()
    await persist()
    pushPaciente(u)
  }

  /** Edita el alias (el seudónimo "Paciente N" no cambia). El alias SOLO existe en este dispositivo: no se sube y no entra en el detalle de auditoría. */
  async function updateAlias(id, alias, actor = null) {
    const u = byId(id)
    if (!u) throw new Error('Usuario no encontrado')
    const a = String(alias || '').trim()
    const err = validarAlias(a)
    if (err) throw new Error(err)
    u.alias = a || null
    await persist()
    if (cloudCuenta.value) await audit('PATIENT_UPDATED', actor ?? `participant:${u.etiqueta}`, { usuario: u.etiqueta, campo: 'alias' })
    await audit('USER_UPDATED', actor ?? `participant:${u.etiqueta}`, { usuario: u.etiqueta, campo: 'alias' })
  }

  /** SEC-30: "Eliminar mis datos" (perfil, opcionales, mediciones y consentimiento). */
  async function deleteUserData(id, actor = null) {
    const u = byId(id)
    if (!u) return
    const afectadas = await listSessions({ usuarioId: id })
    await deleteByUser(id)
    // Réplica del borrado en la nube (derecho de supresión, SEC-30).
    for (const antes of afectadas) {
      const despues = await getSession(antes.id)
      if (!despues) deleteCloudSessions([antes.id])
      else {
        pushSession(despues)
        for (const p of antes.participantes.filter((x) => x.usuarioId === id)) deleteCloudChunks(antes.id, p.canalIndex)
      }
    }
    users.value = users.value.filter((x) => x.id !== id)
    await persist()
    deletePaciente(id)
    if (cloudCuenta.value) await audit('PATIENT_DELETED', actor ?? `participant:${u.etiqueta}`, { usuario: u.etiqueta })
    await audit('USER_DATA_DELETED', actor ?? `participant:${u.etiqueta}`, { usuario: u.etiqueta })
    if (activeUserId.value === id) clearActive()
  }

/** Con cuenta Y la nube activada: une los pacientes de la nube con los locales (gana el más reciente) y sube los locales nuevos. */
  async function sincronizarConNube() {
    if (!nubeDatosActiva()) return
    await ensureLoaded()
    const nube = await fetchPacientes()
    const porId = new Map(users.value.map((u) => [u.id, u]))
    for (const n of nube) {
      const l = porId.get(n.id)
      if (!l) users.value.push(normalizarEtiqueta(mezclarPacienteNube(null, n)))
      else if (n.actualizadoEn > l.actualizadoEn) Object.assign(l, normalizarEtiqueta(mezclarPacienteNube(l, n)))
      else if (n.actualizadoEn < l.actualizadoEn) pushPaciente(l)
    }
    const idsNube = new Set(nube.map((n) => n.id))
    for (const l of users.value) if (!idsNube.has(l.id)) pushPaciente(l)
    await persist()
  }

  function reset() {
    users.value = []
    loaded.value = false
    clearActive()
  }

  return {
    users, loaded, activeUserId, activeUser, load, ensureLoaded, sincronizarConNube, byId, labelOf, createUser, selectUser,
    clearActive, declararMayorEdad, giveConsent, withdrawConsent, updateProfile, updateAlias, deleteUserData, reset,
  }
})
