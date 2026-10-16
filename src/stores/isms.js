import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth.js'
import { useUsersStore } from './users.js'
import { secureStorage } from '@/services/storage/index.js'
import { auditLog, audit } from '@/services/audit/auditService.js'
import { createIncident, transitionIncident, isOpen } from '@/services/security/incidents.js'
import {
  POLICY_VERSION, needsPolicyAcceptance, accessReviewStatus, clockSkew,
  computeSecurityMetrics, evaluateObjectives,
} from '@/services/security/isms.js'
import { pushIncident, fetchServerTime, cloudEnabled } from '@/services/cloud/cloudSync.js'
import { getPref, setPref } from '@/utils/prefs.js'

const KEY_INCIDENTS = 'isms:incidentes'
const MAX_INCIDENTS = 500

/**
 * Store del SGSI (ISO/IEC 27001:2013):
 *  - Incidentes y puntos débiles (A.16.1.2–A.16.1.6): cifrados en secureStorage y replicados en
 *    Supabase si hay nube. Notificar: cualquiera. Evaluar/cerrar: solo admin (assertAdmin).
 *  - Aceptación de la política por el admin (A.7.2.2) y revisión de accesos (A.9.2.5): metadatos
 *    no sensibles en prefs (fecha UTC y versión).
 *  - Reloj (A.12.4.4) e indicadores (9.1).
 */
export const useIsmsStore = defineStore('isms', () => {
  const incidentes = ref([])
  const cargado = ref(false)
  const politica = ref(getPref('politicaAceptada', null))
  const ultimaRevisionUtc = ref(getPref('revisionAccesosUtc', null))
  const reloj = ref(null) // { ok, skewMs, comprobadoUtc } | null

  const debeAceptarPolitica = computed(() => needsPolicyAcceptance(politica.value))
  const revision = computed(() => accessReviewStatus(ultimaRevisionUtc.value))
  const abiertos = computed(() => incidentes.value.filter(isOpen))

  async function load() {
    const list = await secureStorage.getItem(KEY_INCIDENTS)
    incidentes.value = Array.isArray(list) ? list : []
    cargado.value = true
  }

  async function ensureLoaded() {
    if (!cargado.value) await load()
  }

  async function persist() {
    await secureStorage.setItem(KEY_INCIDENTS, incidentes.value.slice(-MAX_INCIDENTS))
  }

  /** A.16.1.2 / A.16.1.3: notificación por participante o admin. */
  async function report(draft) {
    await ensureLoaded()
    const actorAdmin = useAuthStore().isAdmin
    const inc = createIncident(draft, { reportadoPor: actorAdmin ? 'admin' : 'participant' })
    incidentes.value = [...incidentes.value, inc]
    await persist()
    const u = useUsersStore().activeUser
    const actor = actorAdmin ? 'admin' : u ? `participant:${u.etiqueta}` : 'system'
    await audit('INCIDENT_REPORTED', actor, { id: inc.id, tipo: inc.tipo, severidad: inc.severidad })
    pushIncident(inc)
    return inc
  }

  /** A.16.1.4 / A.16.1.5 / A.16.1.6: evaluación, respuesta y cierre (solo admin). */
  async function update(id, estado, notas = {}) {
    useAuthStore().assertAdmin()
    await ensureLoaded()
    const idx = incidentes.value.findIndex((i) => i.id === id)
    if (idx < 0) throw new Error('Incidente no encontrado')
    const nuevo = transitionIncident(incidentes.value[idx], estado, notas)
    const copia = [...incidentes.value]
    copia[idx] = nuevo
    incidentes.value = copia
    await persist()
    await audit('INCIDENT_UPDATED', 'admin', { id, estado })
    pushIncident(nuevo)
    return nuevo
  }

  /** A.7.2.2: el admin declara haber leído y aceptado la política vigente. */
  async function acceptPolicy() {
    useAuthStore().assertAdmin()
    politica.value = { version: POLICY_VERSION, aceptadaUtc: new Date().toISOString() }
    setPref('politicaAceptada', politica.value)
    await audit('POLICY_ACCEPTED', 'admin', { version: POLICY_VERSION })
  }

  /** A.9.2.5: registra la revisión de derechos de acceso con su resultado. */
  async function recordAccessReview(resumen) {
    useAuthStore().assertAdmin()
    ultimaRevisionUtc.value = new Date().toISOString()
    setPref('revisionAccesosUtc', ultimaRevisionUtc.value)
    await audit('ACCESS_REVIEW_DONE', 'admin', resumen)
  }

  /** A.12.4.4: compara el reloj local con la hora del servidor (si hay nube). */
  async function checkClock() {
    if (!cloudEnabled) {
      reloj.value = null
      return null
    }
    const server = await fetchServerTime().catch(() => null)
    const r = clockSkew(Date.now(), server)
    reloj.value = r ? { ...r, comprobadoUtc: new Date().toISOString() } : null
    if (r && !r.ok) await audit('CLOCK_SKEW', 'system', { desfaseMs: r.skewMs })
    return reloj.value
  }

  /** 9.1: indicadores calculados sobre la auditoría local y los incidentes. */
  async function metrics() {
    useAuthStore().assertAdmin()
    await ensureLoaded()
    const [entradas, integridad] = await Promise.all([auditLog.list(), auditLog.verify()])
    const m = computeSecurityMetrics({
      audit: entradas,
      integridad,
      incidentes: incidentes.value,
      ultimaRevisionUtc: ultimaRevisionUtc.value,
      politica: politica.value,
    })
    return { metricas: m, objetivos: evaluateObjectives(m) }
  }

  function reset() {
    incidentes.value = []
    cargado.value = false
    politica.value = getPref('politicaAceptada', null)
    ultimaRevisionUtc.value = getPref('revisionAccesosUtc', null)
  }

  return {
    incidentes, abiertos, politica, ultimaRevisionUtc, reloj, debeAceptarPolitica, revision,
    load, ensureLoaded, report, update, acceptPolicy, recordAccessReview, checkClock, metrics, reset,
  }
})
