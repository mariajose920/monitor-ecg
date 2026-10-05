import { getDb } from '@/services/storage/db.js'
import { createAuditLog } from './auditLog.js'
import { pushAudit } from '@/services/cloud/cloudSync.js'

/** Adaptador IndexedDB del log de auditoría (almacenes 'audit' y 'meta'). */
function idbAuditStore() {
  return {
    async getAll() {
      return (await getDb()).getAll('audit') // ordenado por seq (keyPath)
    },
    async add(entry) {
      // add() (no put): falla si el seq ya existe → solo inserción
      await (await getDb()).add('audit', entry)
    },
    async deleteUpTo(seq) {
      const db = await getDb()
      await db.delete('audit', IDBKeyRange.upperBound(seq))
    },
    async getMeta(k) {
      return (await getDb()).get('meta', `audit.${k}`)
    },
    async setMeta(k, v) {
      await (await getDb()).put('meta', v, `audit.${k}`)
    },
    async clear() {
      const db = await getDb()
      await db.clear('audit')
      await db.delete('meta', 'audit.anchor')
      await db.delete('meta', 'audit.lastSeq')
    },
  }
}

export const auditLog = createAuditLog({ store: idbAuditStore() })

/**
 * Registra un evento sin romper el flujo de la app si IndexedDB falla.
 * @param {string} event uno de AUDIT_EVENTS
 * @param {string} actor 'admin' | 'participant:Usuario N' | 'system'
 * @param {object} [details] sin datos de salud (se sanean igualmente)
 */
export async function audit(event, actor = 'system', details = {}) {
  try {
    const entry = await auditLog.log(event, actor, details)
    pushAudit(event, actor, entry?.details ?? entry?.detalles ?? {})
    return entry
  } catch {
    return null
  }
}
