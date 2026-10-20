import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth.js'
import { useUsersStore } from './users.js'
import { secureStorage } from '@/services/storage/index.js'
import { auditLog, audit } from '@/services/audit/auditService.js'
import { createIncident, transitionIncident, isOpen, mezclarIncidentes } from '@/services/security/incidents.js'
import {
  POLICY_VERSION, needsPolicyAcceptance, accessReviewStatus, clockSkew,
  computeSecurityMetrics, evaluateObjectives,
} from '@/services/security/isms.js'
import { pushIncident, fetchServerTime, cloudEnabled, cloudCuenta, fetchIncidentesNube, actualizarIncidenteNube } from '@/services/cloud/cloudSync.js'
import { conRenovacionTotp } from '@/services/security/adminRenovacion.js'
import { getPref, setPref } from '@/utils/prefs.js'
import { validarEvidencia, resumenEvidencias } from '@/services/security/evidencias.js'

const KEY_INCIDENTS = 'isms:incidentes'
const KEY_EVIDENCIAS = 'isms:evidencias'
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
  const evidencias = ref([])

  const debeAceptarPolitica = computed(() => needsPolicyAcceptance(politica.value))
  const revision = computed(() => accessReviewStatus(ultimaRevisionUtc.value))
  const abiertos = computed(() => incidentes.value.filter(isOpen))

  async function load() {
    const list = await secureStorage.getItem(KEY_INCIDENTS)
    incidentes.value = Array.isArray(list) ? list : []
    const ev = await secureStorage.getItem(KEY_EVIDENCIAS)
    evidencias.value = Array.isArray(ev) ? ev : []
    cargado.value = true
    sincronizarNube().catch(() => {})
  }

  /**
   * C-09: trae los incidentes de la nube (el administrador ve todos; cada persona, los suyos con su estado y respuesta) y los
   * fusiona con la copia local; sube los que quedaron pendientes. El servidor manda en el ciclo de vida.
   */
  async function sincronizarNube() {
    if (!cloudEnabled || !cloudCuenta.value) return false
    const nube = await fetchIncidentesNube()
    if (!nube) return false
    const { lista, porSubir } = mezclarIncidentes(incidentes.value, nube)
    incidentes.value = lista
    await persist()
    for (const inc of porSubir) pushIncident(inc)
    return true
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
    let nuevo = transitionIncident(incidentes.value[idx], estado, notas) // valida la transición antes de llamar al servidor
    if (cloudEnabled && cloudCuenta.value && incidentes.value[idx].subido !== false) {
      // El servidor valida y registra (INCIDENT_UPDATED); si el TOTP caducó, pide un código nuevo y reintenta.
      const r = await conRenovacionTotp(() => actualizarIncidenteNube(id, estado, { respuesta: nuevo.respuesta, leccion: nuevo.leccion }))
      if (r) nuevo = { ...nuevo, estado: r.estado, respuesta: r.respuesta, leccion: r.leccion, actualizadoUtc: r.actualizadoUtc ?? nuevo.actualizadoUtc }
    }
    const copia = [...incidentes.value]
    copia[idx] = nuevo
    incidentes.value = copia
    await persist()
    await audit('INCIDENT_UPDATED', 'admin', { id, estado })
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

  /**
   * C-10: registra que se realizó la auditoría interna (9.2) o la revisión por la dirección (9.3), con fecha y responsable.
   * No guarda resultados. Queda en el almacén local cifrado y en la auditoría (local y, con cuenta, en la nube vía registrar_evento).
   */
  async function registrarEvidencia(datos) {
    useAuthStore().assertAdmin()
    await ensureLoaded()
    const v = validarEvidencia(datos)
    if (!v.ok) throw new Error(Object.values(v.errores)[0])
    const ev = { ...v.valores, registradaUtc: new Date().toISOString() }
    evidencias.value = [...evidencias.value, ev].slice(-200)
    await secureStorage.setItem(KEY_EVIDENCIAS, evidencias.value)
    await audit('ISMS_EVIDENCE_RECORDED', 'admin', { tipo: ev.tipo, fecha: ev.fecha, responsable: ev.responsable, referencia: ev.referencia })
    return ev
  }
  const resumenEv = computed(() => resumenEvidencias(evidencias.value))

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
    evidencias.value = []
    cargado.value = false
    politica.value = getPref('politicaAceptada', null)
    ultimaRevisionUtc.value = getPref('revisionAccesosUtc', null)
  }

  return {
    incidentes, abiertos, politica, ultimaRevisionUtc, reloj, debeAceptarPolitica, revision,
    load, ensureLoaded, sincronizarNube, report, update, acceptPolicy, recordAccessReview, checkClock, metrics, reset,
    evidencias, resumenEv, registrarEvidencia,
  }
})
