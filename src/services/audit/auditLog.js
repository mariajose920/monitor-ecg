import { bytesToHex } from '@/utils/base64.js'

/**
 * ENGANCHE ISO/IEC 27001:2013 (A.12.4.1, A.12.4.2, A.12.4.3, A.16.1.7): registro de auditoría
 * append-only con cadena de hashes SHA-256 (SEC-38..SEC-42). Marcas de tiempo ISO-8601 UTC (A.12.4.4).
 * hash = SHA-256(JSON canónico de { seq, ts, event, actor, details, prevHash }).
 * Detecta alteraciones (no las impide: riesgo residual R11 aceptado en un sistema solo-frontend).
 */

export const AUDIT_EVENTS = Object.freeze([
  'ADMIN_SETUP', 'ADMIN_LOGIN_OK', 'ADMIN_LOGIN_FAIL', 'ADMIN_LOCKED', 'ADMIN_LOGOUT', 'ADMIN_SESSION_EXPIRED',
  'ADMIN_PIN_CHANGED', 'PARAM_CHANGED', 'USER_CREATED', 'CONSENT_GIVEN', 'CONSENT_WITHDRAWN', 'USER_DATA_DELETED',
  'ALL_DATA_WIPED', 'CLOUD_ADMIN_LOGIN', 'CLOUD_ADMIN_LOGOUT', 'RETENTION_PURGE', 'EXPORT_CSV', 'SERIAL_CONNECTED', 'SERIAL_DISCONNECTED', 'SERIAL_LOST',
  'SERIAL_INVALID_DATA', 'DEVICE_RESET', 'INTEGRITY_ERROR', 'AUDIT_EXPORTED',
  // Eventos adicionales del documento de arquitectura
  'SESSION_STARTED', 'SESSION_ENDED', 'ALERT_TRIGGERED',
  // SGSI ISO/IEC 27001:2013 (A.16.1, A.7.2.2, A.9.2.5, A.12.4.4)
  'INCIDENT_REPORTED', 'INCIDENT_UPDATED', 'POLICY_ACCEPTED', 'ACCESS_REVIEW_DONE', 'CLOCK_SKEW',
  // Seguridad eléctrica antes de Web Serial (SUG-09) y supresión en la nube (SUG-06, A.18.1.4)
  'ELECTRICAL_SAFETY_ACK', 'CLOUD_DATA_DELETED',
])

export const GENESIS = '0'.repeat(64)
export const MAX_ENTRIES = 5000
export const MAX_AGE_DAYS = 180

// SEC-40: nunca registrar valores de ECG, BPM, edad, peso, PIN ni hashes de credenciales.
const CLAVES_PROHIBIDAS = /^(bpm|bpms|ecg|ecgraw|ecg_raw|valor|valores|edad|age|peso|weight|pesokg|pin|hash|salt|credencial|perfil)$/i

export function sanitizeDetails(details) {
  if (details === null || details === undefined) return {}
  if (typeof details !== 'object' || Array.isArray(details)) return {}
  const out = {}
  for (const [k, v] of Object.entries(details)) {
    if (CLAVES_PROHIBIDAS.test(k)) continue
    if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
      out[k] = typeof v === 'string' ? v.slice(0, 200) : v
    } else if (typeof v === 'object' && !Array.isArray(v)) {
      out[k] = sanitizeDetails(v)
    } else if (Array.isArray(v)) {
      out[k] = v.slice(0, 20).map((x) => (typeof x === 'object' ? sanitizeDetails(x) : x))
    }
  }
  return out
}

/** JSON canónico: claves ordenadas recursivamente. */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return bytesToHex(new Uint8Array(buf))
}

export async function computeHash(entry) {
  const { seq, ts, event, actor, details, prevHash } = entry
  return sha256Hex(canonicalJson({ seq, ts, event, actor, details, prevHash }))
}

/**
 * @param {object} deps
 * @param {object} deps.store { getAll(), add(entry), deleteUpTo(seq), getMeta(k), setMeta(k,v), clear() }
 * @param {()=>Date} [deps.now]
 */
export function createAuditLog({ store, now = () => new Date(), maxEntries = MAX_ENTRIES, maxAgeDays = MAX_AGE_DAYS }) {
  let queue = Promise.resolve()
  const enqueue = (fn) => {
    const p = queue.then(fn, fn)
    queue = p.catch(() => {})
    return p
  }

  async function lastEntry() {
    const all = await store.getAll()
    return all.length ? all[all.length - 1] : null
  }

  function log(event, actor = 'system', details = {}) {
    return enqueue(async () => {
      if (!AUDIT_EVENTS.includes(event)) throw new Error(`Evento de auditoría desconocido: ${event}`)
      const last = await lastEntry()
      const anchor = (await store.getMeta('anchor')) ?? GENESIS
      const lastSeq = last ? last.seq : ((await store.getMeta('lastSeq')) ?? 0)
      const entry = {
        seq: lastSeq + 1,
        ts: now().toISOString(),
        event,
        actor: String(actor),
        details: sanitizeDetails(details),
        prevHash: last ? last.hash : anchor,
      }
      entry.hash = await computeHash(entry)
      await store.add(entry)
      await store.setMeta('lastSeq', entry.seq)
      await rotate()
      return entry
    })
  }

  /** SEC-42: conserva ≤ maxEntries y ≤ maxAgeDays; guarda el hash de la última descartada como ancla. */
  async function rotate() {
    const all = await store.getAll()
    const limite = now().getTime() - maxAgeDays * 86400000
    let cut = -1
    for (let i = 0; i < all.length; i++) {
      const old = Date.parse(all[i].ts) < limite
      const exceso = all.length - i > maxEntries
      if (old || exceso) cut = i
      else break
    }
    if (cut >= 0) {
      await store.setMeta('anchor', all[cut].hash)
      await store.deleteUpTo(all[cut].seq)
    }
  }

  async function list() {
    return store.getAll()
  }

  /** Verifica la cadena. @returns {{ok:true,count:number}|{ok:false,brokenAt:number,count:number}} */
  async function verify() {
    const all = await store.getAll()
    let prev = (await store.getMeta('anchor')) ?? GENESIS
    for (const e of all) {
      if (e.prevHash !== prev) return { ok: false, brokenAt: e.seq, count: all.length }
      const h = await computeHash(e)
      if (h !== e.hash) return { ok: false, brokenAt: e.seq, count: all.length }
      prev = e.hash
    }
    return { ok: true, count: all.length }
  }

  /** Reinicia el log (tras "Borrar todo") y registra el primer evento del nuevo log. */
  function reset(firstEvent, actor, details) {
    return enqueue(async () => {
      await store.clear()
    }).then(() => (firstEvent ? log(firstEvent, actor, details) : null))
  }

  return { log, list, verify, rotate, reset }
}

/** Almacén en memoria (pruebas). */
export function memoryAuditStore() {
  let entries = []
  const meta = new Map()
  return {
    async getAll() { return entries.map((e) => ({ ...e })) },
    async add(e) { entries.push({ ...e }) },
    async deleteUpTo(seq) { entries = entries.filter((e) => e.seq > seq) },
    async getMeta(k) { return meta.get(k) },
    async setMeta(k, v) { meta.set(k, v) },
    async clear() { entries = []; meta.clear() },
    _entries: () => entries,
  }
}
