/**
 * Gestión de incidentes y debilidades de seguridad (ISO/IEC 27001:2013, A.16.1.1–A.16.1.7).
 * Lógica pura (sin efectos secundarios) para poder probarla con Vitest. La persistencia la
 * hace stores/incidents.js (secureStorage cifrado + réplica opcional en Supabase).
 *
 * Reglas:
 *  - A.16.1.2 / A.16.1.3: cualquier persona (participante o admin) puede notificar un evento o
 *    un punto débil. Nunca se piden datos de salud: la descripción es texto corto y se rechaza
 *    si parece contener valores de ECG/BPM/edad/peso o identificadores personales (RUT, correo).
 *  - A.16.1.4: el administrador evalúa y clasifica (evento → incidente o descartado).
 *  - A.16.1.5 / A.16.1.6: respuesta y lección aprendida obligatoria para cerrar.
 *  - A.12.4.4: todas las marcas de tiempo en ISO-8601 UTC.
 */

export const INCIDENT_TYPES = Object.freeze({
  acceso: 'Acceso no autorizado o sospechoso',
  fuga: 'Posible fuga de datos (CSV, pantalla, equipo)',
  integridad: 'Datos o auditoría alterados',
  disponibilidad: 'Caída o pérdida de servicio/datos',
  debilidad: 'Punto débil observado (A.16.1.3)',
  otro: 'Otro evento de seguridad',
})

export const SEVERITIES = Object.freeze(['baja', 'media', 'alta'])
export const STATES = Object.freeze(['abierto', 'en_analisis', 'cerrado', 'descartado'])

/** Transiciones permitidas del ciclo de vida (A.16.1.4 / A.16.1.5). */
export const TRANSITIONS = Object.freeze({
  abierto: ['en_analisis', 'descartado'],
  en_analisis: ['cerrado', 'descartado'],
  cerrado: [],
  descartado: [],
})

export const DESC_MIN = 10
export const DESC_MAX = 500
export const NOTE_MAX = 500

// Heurística de minimización: la notificación no debe incluir datos personales ni de salud.
const PATRON_RUT = /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/
const PATRON_CORREO = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/
const PATRON_SALUD = /\b\d{2,3}\s*(bpm|lpm|kg)\b/i

/**
 * Valida el borrador de una notificación.
 * @returns {string|null} mensaje de error o null si es válida
 */
export function validateIncident(draft) {
  if (!draft || typeof draft !== 'object') return 'Notificación vacía'
  if (!Object.hasOwn(INCIDENT_TYPES, draft.tipo)) return 'Tipo de incidente inválido'
  if (!SEVERITIES.includes(draft.severidad)) return 'Severidad inválida'
  const d = typeof draft.descripcion === 'string' ? draft.descripcion.trim() : ''
  if (d.length < DESC_MIN) return `Describe el evento (mínimo ${DESC_MIN} caracteres)`
  if (d.length > DESC_MAX) return `La descripción admite como máximo ${DESC_MAX} caracteres`
  if (PATRON_RUT.test(d) || PATRON_CORREO.test(d)) return 'No incluyas RUT, correos ni otros datos personales'
  if (PATRON_SALUD.test(d)) return 'No incluyas valores de salud (BPM, peso…) en la notificación'
  return null
}

/**
 * Crea un incidente a partir de un borrador validado.
 * @param {object} draft { tipo, severidad, descripcion }
 * @param {object} o { reportadoPor: 'admin'|'participant'|'system', now?: Date, id?: string }
 */
export function createIncident(draft, { reportadoPor = 'participant', now = new Date(), id } = {}) {
  const err = validateIncident(draft)
  if (err) throw new Error(err)
  const ts = now.toISOString()
  return {
    id: id ?? (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `inc-${now.getTime()}`),
    creadoUtc: ts,
    actualizadoUtc: ts,
    tipo: draft.tipo,
    severidad: draft.severidad,
    descripcion: draft.descripcion.trim(),
    reportadoPor: ['admin', 'participant', 'system'].includes(reportadoPor) ? reportadoPor : 'participant',
    estado: 'abierto',
    historial: [{ ts, estado: 'abierto' }],
    respuesta: '',
    leccion: '',
  }
}

/**
 * Cambia de estado (solo administrador; la autorización se comprueba en el store).
 * Para cerrar exige respuesta y lección aprendida (A.16.1.5, A.16.1.6).
 */
export function transitionIncident(inc, nuevoEstado, { respuesta = '', leccion = '', now = new Date() } = {}) {
  if (!inc || !STATES.includes(inc.estado)) throw new Error('Incidente inválido')
  if (!TRANSITIONS[inc.estado].includes(nuevoEstado)) {
    throw new Error(`Transición no permitida: ${inc.estado} → ${nuevoEstado}`)
  }
  const resp = String(respuesta || inc.respuesta || '').trim().slice(0, NOTE_MAX)
  const lec = String(leccion || inc.leccion || '').trim().slice(0, NOTE_MAX)
  if (nuevoEstado === 'cerrado' && (!resp || !lec)) {
    throw new Error('Para cerrar indica la respuesta aplicada y la lección aprendida')
  }
  const ts = now.toISOString()
  return {
    ...inc,
    estado: nuevoEstado,
    respuesta: resp,
    leccion: lec,
    actualizadoUtc: ts,
    historial: [...(inc.historial || []), { ts, estado: nuevoEstado }],
  }
}

export function isOpen(inc) {
  return inc?.estado === 'abierto' || inc?.estado === 'en_analisis'
}

const RANGO_ESTADO = Object.freeze({ abierto: 0, en_analisis: 1, cerrado: 2, descartado: 2 })

function historialDeNube(n) {
  const h = [{ ts: n.creadoUtc, estado: 'abierto' }]
  if (n.estado !== 'abierto') h.push({ ts: n.actualizadoUtc, estado: n.estado })
  return h
}

/**
 * Fusiona los incidentes locales con los de la nube (C-09, A.16.1.2/A.16.1.4). El SERVIDOR es la fuente de verdad del
 * ciclo de vida (solo el administrador cambia el estado, y lo hace allí): si el incidente existe en la nube, su estado,
 * respuesta y lección sustituyen a los locales (la persona que reportó ve así la respuesta). Un incidente solo local se
 * conserva marcado como pendiente de subir (subido=false) para reintentarlo; uno ya subido que desapareció de la nube
 * (el reportante borró sus datos) se descarta de la caché.
 * @returns {{lista: object[], porSubir: object[]}}
 */
export function mezclarIncidentes(locales, nube) {
  const enNube = new Map((nube ?? []).map((n) => [n.id, n]))
  const lista = []
  const vistos = new Set()
  const porSubir = []
  for (const l of locales ?? []) {
    const n = enNube.get(l.id)
    vistos.add(l.id)
    if (!n) {
      if (l.subido === true) continue // desapareció del servidor
      lista.push({ ...l, subido: false })
      porSubir.push(l)
      continue
    }
    const avanzo = RANGO_ESTADO[n.estado] > RANGO_ESTADO[l.estado] || n.estado !== l.estado
    const historial = Array.isArray(l.historial) && l.historial.length ? l.historial : historialDeNube(n)
    lista.push({
      ...l,
      estado: n.estado,
      respuesta: n.respuesta || l.respuesta || '',
      leccion: n.leccion || l.leccion || '',
      actualizadoUtc: n.actualizadoUtc ?? l.actualizadoUtc,
      historial: avanzo && !historial.some((h) => h.estado === n.estado) ? [...historial, { ts: n.actualizadoUtc, estado: n.estado }] : historial,
      subido: true,
    })
  }
  for (const n of nube ?? []) {
    if (vistos.has(n.id)) continue
    const limpio = { ...n, historial: historialDeNube(n), subido: true }
    delete limpio.origen
    lista.push(limpio)
  }
  lista.sort((a, b) => String(a.creadoUtc).localeCompare(String(b.creadoUtc)))
  return { lista, porSubir }
}
