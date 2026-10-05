import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loadUsers, saveUsers, nextUserNumber } from '@/services/storage/userRepository.js'
import { deleteByUser, listSessions, getSession } from '@/services/storage/sessionRepository.js'
import { pushSession, deleteCloudSessions, deleteCloudChunks } from '@/services/cloud/cloudSync.js'
import { audit } from '@/services/audit/auditService.js'
import { newId } from '@/utils/ids.js'
import { RANGOS_EDAD, NIVELES_ACTIVIDAD } from '@/data/activities.js'

/** Versión del texto de consentimiento: si cambia, se vuelve a pedir (SEC-17). */
export const CONSENT_VERSION = '1.0'
export const CONSENT_SCOPE = Object.freeze(['age', 'weight', 'activity'])
export const ALIAS_RE = /^[A-Za-z0-9 _-]{1,20}$/
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

export function consentimientoVigente(u) {
  return !!u?.consentimiento && u.consentimiento.consentVersion === CONSENT_VERSION
}

export const useUsersStore = defineStore('users', () => {
  const users = ref([])
  const loaded = ref(false)
  const activeUserId = ref(sessionStorage.getItem(ACTIVE_KEY))
  let loading = null

  const activeUser = computed(() => users.value.find((u) => u.id === activeUserId.value) || null)

  async function load() {
    users.value = await loadUsers()
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
    if (!u) return 'Usuario eliminado'
    return u.alias ? `${u.etiqueta} · ${u.alias}` : u.etiqueta
  }

  /** RF01/SEC-13: el sistema genera "Usuario N"; alias opcional validado. */
  async function createUser(alias = '') {
    await ensureLoaded()
    const a = String(alias || '').trim()
    if (a && !ALIAS_RE.test(a)) throw new Error('Alias inválido: solo letras sin tilde, números, espacio, _ y - (máx. 20).')
    const numero = await nextUserNumber(users.value)
    const ahora = new Date().toISOString()
    const u = {
      id: newId(),
      numero,
      etiqueta: `Usuario ${numero}`,
      alias: a || null,
      perfil: null,
      consentimiento: null,
      creadoEn: ahora,
      actualizadoEn: ahora,
    }
    users.value.push(u)
    await persist()
    await audit('USER_CREATED', 'system', { usuario: u.etiqueta })
    return u
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

  async function giveConsent(id) {
    const u = byId(id)
    if (!u) return
    u.consentimiento = { userId: u.id, consentVersion: CONSENT_VERSION, acceptedAt: new Date().toISOString(), scope: [...CONSENT_SCOPE] }
    u.actualizadoEn = new Date().toISOString()
    await persist()
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
    await audit('CONSENT_WITHDRAWN', `participant:${u.etiqueta}`)
  }

  async function updateProfile(id, datos) {
    const u = byId(id)
    if (!u) throw new Error('Usuario no encontrado')
    if (!consentimientoVigente(u)) throw new Error('Se requiere consentimiento informado para guardar datos opcionales.')
    const r = validarPerfil(datos)
    if (r.error) throw new Error(r.error)
    u.perfil = r.perfil
    u.actualizadoEn = new Date().toISOString()
    await persist()
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
    await audit('USER_DATA_DELETED', actor ?? `participant:${u.etiqueta}`, { usuario: u.etiqueta })
    if (activeUserId.value === id) clearActive()
  }

  function reset() {
    users.value = []
    loaded.value = false
    clearActive()
  }

  return {
    users, loaded, activeUserId, activeUser, load, ensureLoaded, byId, labelOf, createUser, selectUser,
    clearActive, giveConsent, withdrawConsent, updateProfile, deleteUserData, reset,
  }
})
