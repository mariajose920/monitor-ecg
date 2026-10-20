import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  esAal2, normalizarCodigo, validarCodigo, estadoAdmin, esQrSeguro, MFA_LIMITE, INACTIVIDAD_ADMIN_NUBE_MS,
  MSG_MFA_GENERICO,
} from '@/services/security/adminMfa.js'
import { createRateLimiter } from '@/utils/rateLimiter.js'
import { newAdminSession, touchSession, isSessionValid } from '@/services/security/lockout.js'
import { AUDIT_EVENTS } from '@/services/audit/auditLog.js'
import { safeRedirect, ACCESO_REDIRECT_WHITELIST, ADMIN_REDIRECT_WHITELIST } from '@/router/guards.js'

describe('segundo factor del administrador (A.9.4.2)', () => {
  it('solo aal2 cuenta como segundo factor verificado', () => {
    expect(esAal2('aal2')).toBe(true)
    for (const x of ['aal1', '', null, undefined, 'AAL2']) expect(esAal2(x)).toBe(false)
  })

  it('valida y normaliza el código TOTP', () => {
    expect(normalizarCodigo('123 456')).toBe('123456')
    expect(validarCodigo('123 456')).toBeNull()
    for (const malo of ['', '12345', '1234567', 'abcdef', '12a456', null]) expect(validarCodigo(malo), String(malo)).toBeTruthy()
  })

  it('el mensaje de fallo es genérico (no distingue código vencido de incorrecto)', () => {
    expect(MSG_MFA_GENERICO).not.toMatch(/no existe|usuario/i)
  })

  it('con nube: el botón depende del rol y los privilegios exigen aal2', () => {
    expect(estadoAdmin({ nube: true, registrado: false, aal: 'aal2' })).toEqual({ mostrarBoton: false, privilegios: false, requiereMfa: false })
    expect(estadoAdmin({ nube: true, registrado: true, aal: 'aal1' })).toEqual({ mostrarBoton: true, privilegios: false, requiereMfa: true })
    expect(estadoAdmin({ nube: true, registrado: true, aal: 'aal2' })).toEqual({ mostrarBoton: true, privilegios: true, requiereMfa: false })
    expect(estadoAdmin({ nube: true, registrado: true, aal: 'aal2', sesionVigente: false }).privilegios).toBe(false)
  })

  it('sin nube el acceso lo decide el PIN local (el enlace siempre se muestra, sin privilegios por sí mismo)', () => {
    expect(estadoAdmin({ nube: false, registrado: false, aal: null })).toEqual({ mostrarBoton: true, privilegios: false, requiereMfa: false })
  })

  it('solo acepta QR en forma de SVG data-URI', () => {
    expect(esQrSeguro('data:image/svg+xml;utf-8,<svg></svg>')).toBe(true)
    for (const x of ['https://x/qr.png', 'javascript:alert(1)', 'data:text/html,<script>', '', null]) expect(esQrSeguro(x)).toBe(false)
  })

  it('limita los intentos de código en el cliente', () => {
    const lim = createRateLimiter({ ...MFA_LIMITE, now: () => 0 })
    const r = Array.from({ length: MFA_LIMITE.max + 1 }, () => lim.tryAcquire())
    expect(r.slice(0, -1).every(Boolean)).toBe(true)
    expect(r.at(-1)).toBe(false)
  })

  it('la sesión privilegiada con nube caduca a los 15 minutos de inactividad', () => {
    expect(INACTIVIDAD_ADMIN_NUBE_MS).toBe(15 * 60_000)
    const s = newAdminSession(0, INACTIVIDAD_ADMIN_NUBE_MS)
    expect(isSessionValid(s, 14 * 60_000)).toBe(true)
    expect(isSessionValid(s, 15 * 60_000)).toBe(false)
    const t = touchSession(s, 10 * 60_000)
    expect(isSessionValid(t, 24 * 60_000)).toBe(true)
    expect(isSessionValid(t, 25 * 60_000 + 1)).toBe(false)
  })
})

describe('listas blancas de redirección', () => {
  it('descarta destinos fuera de la lista (sin open redirect)', () => {
    expect(safeRedirect('admin', ACCESO_REDIRECT_WHITELIST, 'pacientes')).toBe('admin')
    expect(safeRedirect('https://evil.example', ACCESO_REDIRECT_WHITELIST, 'pacientes')).toBe('pacientes')
    expect(safeRedirect('//evil.example', ACCESO_REDIRECT_WHITELIST, 'pacientes')).toBe('pacientes')
    expect(safeRedirect('admin-mfa', ADMIN_REDIRECT_WHITELIST, 'admin')).toBe('admin')
    expect(safeRedirect(['admin'], ACCESO_REDIRECT_WHITELIST, 'pacientes')).toBe('pacientes')
  })
})

describe('auditoría y SQL del administrador con MFA', () => {
  it('los eventos nuevos existen y se conservan los anteriores', () => {
    for (const e of ['ADMIN_ACCOUNT_LOGIN', 'ADMIN_MFA_ENROLLED', 'ADMIN_MFA_VERIFIED', 'ADMIN_MFA_FAILED', 'ADMIN_ROLE_GRANTED', 'ADMIN_ROLE_REVOKED', 'ADMIN_RECOVERY_REQUESTED', 'ACCESS_REVIEW_DONE', 'ADMIN_LOGIN_OK', 'LOCAL_DATA_LINKED']) {
      expect(AUDIT_EVENTS).toContain(e)
    }
    expect(new Set(AUDIT_EVENTS).size).toBe(AUDIT_EVENTS.length)
  })

  const leer = (...r) => { try { return readFileSync(resolve(process.cwd(), ...r), 'utf8') } catch { return null } }
  const mig = leer('..', 'supabase', 'migracion_admin_mfa.sql')
  const sch = leer('..', 'supabase', 'schema.sql')
  const eventosSql = (sql) => [...(/auditoria_tipo_lista_blanca check \(tipo in \(([\s\S]*?)\)\) not valid/.exec(sql)?.[1] ?? '').matchAll(/'([A-Z_]+)'/g)].map((m) => m[1])

  it.skipIf(!mig)('la migración histórica ya no fija la lista blanca (vive en tipos_evento, ver schema.spec.js)', () => {
    expect(eventosSql(mig)).toEqual([])
    expect(AUDIT_EVENTS.length).toBeGreaterThan(40)
  })

  it.skipIf(!mig || !sch)('es_admin() exige aal2, search_path fijo y sin acceso anónimo (migración y esquema)', () => {
    for (const sql of [mig, sch]) {
      expect(sql).toMatch(/create or replace function public\.es_admin_registrado\(\)/)
      expect(sql).toMatch(/\(select auth\.jwt\(\) ->> 'aal'\), ''\) = 'aal2'/)
      expect(sql).toMatch(/revoke all on function public\.es_admin\(\) from public, anon/)
      expect(sql).toMatch(/grant execute on function public\.es_admin_registrado\(\) to authenticated/)
      expect(sql).toMatch(/admin_listar_administradores\(\)[\s\S]*?set search_path = public/)
      expect(sql).toMatch(/revoke insert, update, delete on public\.administradores from anon, authenticated/)
    }
  })

  it('el cliente no usa v-html para el QR', () => {
    const v = readFileSync('src/views/admin/AdminMfaView.vue', 'utf8')
    expect(v).not.toMatch(/v-html/)
  })

})
