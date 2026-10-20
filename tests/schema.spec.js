import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { AUDIT_EVENTS } from '@/services/audit/auditLog.js'

/** La lista blanca de tipos de auditoría del servidor debe coincidir con AUDIT_EVENTS (A.12.4.1). */
function leerSchema() {
  for (const ruta of ['../supabase/schema.sql', './supabase/schema.sql']) {
    const url = new URL(ruta, `file://${process.cwd().replace(/\\/g, '/')}/`)
    if (existsSync(url)) return readFileSync(url, 'utf8')
  }
  return null
}

describe('schema.sql ↔ AUDIT_EVENTS', () => {
  const sql = leerSchema()
  const bloque = sql ? /auditoria_tipo_lista_blanca check \(tipo in \(([\s\S]*?)\)\) not valid/.exec(sql)?.[1] : null

  it.skipIf(!sql)('encuentra la lista blanca en el esquema', () => {
    expect(bloque).toBeTruthy()
  })

  it.skipIf(!sql)('contiene exactamente los eventos de la aplicación', () => {
    const enSql = [...bloque.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1])
    expect([...enSql].sort()).toEqual([...AUDIT_EVENTS].sort())
  })

  it('los eventos de cuentas, pacientes y visibilidad existen', () => {
    for (const e of ['ACCOUNT_REGISTERED', 'ACCOUNT_LOGIN', 'ACCOUNT_LOGOUT', 'ACCOUNT_PASSWORD_RESET', 'PATIENT_CREATED', 'PATIENT_UPDATED', 'PATIENT_DELETED', 'VISIBILITY_CHANGED', 'LOCAL_DATA_LINKED']) {
      expect(AUDIT_EVENTS).toContain(e)
    }
  })

  it('los eventos nuevos de monitoreos existen', () => {
    for (const e of ['CAMERA_STARTED', 'CAMERA_STOPPED', 'CAMERA_DENIED', 'TORCH_UNAVAILABLE', 'USER_UPDATED', 'SESSION_SAVED', 'SESSION_UPDATED', 'SESSION_DISCARDED', 'SESSION_DELETED', 'EXPORT_REPORT']) {
      expect(AUDIT_EVENTS).toContain(e)
    }
  })
})
