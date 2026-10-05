import { describe, it, expect } from 'vitest'
import { hashPin, verifyPin, constantTimeEqual, validateNewPin, PBKDF2_ITER } from '@/services/security/pinHash.js'
import {
  registerFailure, isLocked, initialLockState, newAdminSession, isSessionValid, touchSession,
  INACTIVIDAD_MS, SESION_MAX_MS, BLOQUEO_BASE_MS, BLOQUEO_MAX_MS,
} from '@/services/security/lockout.js'
import { createSecureStorage, createKeyProvider, memoryKv } from '@/services/storage/secureStorage.js'
import { createAuditLog, memoryAuditStore, sanitizeDetails, canonicalJson } from '@/services/audit/auditLog.js'
import { safeRedirect, ADMIN_REDIRECT_WHITELIST } from '@/router/guards.js'

describe('hash del PIN (SEC-06..08)', () => {
  it('usa PBKDF2-SHA256 con 600 000 iteraciones y sal aleatoria', async () => {
    const r = await hashPin('Clave-Segura-2026')
    expect(r).toMatchObject({ v: 1, alg: 'PBKDF2-SHA256', iter: PBKDF2_ITER })
    expect(PBKDF2_ITER).toBe(600000)
    const r2 = await hashPin('Clave-Segura-2026')
    expect(r2.salt).not.toBe(r.salt)
    expect(r2.hash).not.toBe(r.hash)
    expect(JSON.stringify(r)).not.toContain('Clave-Segura-2026')
  })

  it('verifica el PIN correcto y rechaza el incorrecto', async () => {
    const r = await hashPin('Laboratorio#7', { iterations: 2000 })
    expect(await verifyPin('Laboratorio#7', r)).toBe(true)
    expect(await verifyPin('Laboratorio#8', r)).toBe(false)
    expect(await verifyPin('Laboratorio#7', { ...r, alg: 'MD5' })).toBe(false)
  })

  it('comparación en tiempo constante', () => {
    expect(constantTimeEqual(Uint8Array.from([1, 2, 3]), Uint8Array.from([1, 2, 3]))).toBe(true)
    expect(constantTimeEqual(Uint8Array.from([1, 2, 3]), Uint8Array.from([1, 2, 4]))).toBe(false)
    expect(constantTimeEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 2, 0]))).toBe(false)
  })

  it('rechaza PIN cortos o triviales', () => {
    expect(validateNewPin('1234567')).not.toBeNull()
    expect(validateNewPin('12345678')).not.toBeNull()
    expect(validateNewPin('00000000')).not.toBeNull()
    expect(validateNewPin('password')).not.toBeNull()
    expect(validateNewPin('98765432')).not.toBeNull()
    expect(validateNewPin('aaaaaaaaa')).not.toBeNull()
    expect(validateNewPin('83920571')).toBeNull()
    expect(validateNewPin('Lab-ECG-2026')).toBeNull()
  })
})

describe('bloqueo y sesión de admin (SEC-09, SEC-10)', () => {
  it('bloquea tras 5 fallos con backoff 5, 10, 20… máx. 60 min', () => {
    let s = initialLockState()
    const now = 1_000_000
    for (let i = 0; i < 4; i++) {
      const r = registerFailure(s, now)
      expect(r.bloqueado).toBe(false)
      s = r.state
    }
    let r = registerFailure(s, now)
    expect(r.bloqueado).toBe(true)
    expect(r.duracionMs).toBe(BLOQUEO_BASE_MS)
    expect(isLocked(r.state, now + 1000)).toBe(true)
    expect(isLocked(r.state, now + BLOQUEO_BASE_MS + 1)).toBe(false)
    s = r.state
    const duraciones = []
    for (let ciclo = 0; ciclo < 5; ciclo++) {
      for (let i = 0; i < 5; i++) r = registerFailure(s = r.state, now)
      duraciones.push(r.duracionMs)
    }
    expect(duraciones).toEqual([10, 20, 40, 60, 60].map((m) => m * 60000))
    expect(Math.max(...duraciones)).toBe(BLOQUEO_MAX_MS)
  })

  it('la sesión expira por inactividad (10 min) y por máximo absoluto (60 min)', () => {
    const t0 = 0
    let s = newAdminSession(t0)
    expect(isSessionValid(s, t0 + INACTIVIDAD_MS - 1)).toBe(true)
    expect(isSessionValid(s, t0 + INACTIVIDAD_MS + 1)).toBe(false)
    for (let t = 5 * 60000; t < SESION_MAX_MS; t += 5 * 60000) s = touchSession(s, t)
    expect(isSessionValid(s, SESION_MAX_MS - 1)).toBe(true)
    expect(isSessionValid(s, SESION_MAX_MS + 1)).toBe(false)
  })

  it('redirect solo a destinos de la lista blanca (anti open-redirect)', () => {
    expect(safeRedirect('admin-auditoria', ADMIN_REDIRECT_WHITELIST, 'admin')).toBe('admin-auditoria')
    expect(safeRedirect('https://evil.example', ADMIN_REDIRECT_WHITELIST, 'admin')).toBe('admin')
    expect(safeRedirect(['admin'], ADMIN_REDIRECT_WHITELIST, 'admin')).toBe('admin')
  })
})

describe('secureStorage AES-GCM (SEC-24..27)', () => {
  function crear() {
    const kv = memoryKv()
    const keyKv = memoryKv()
    const errores = []
    const ss = createSecureStorage({ kv, keyProvider: createKeyProvider(keyKv), onIntegrityError: (k) => errores.push(k) })
    return { kv, keyKv, ss, errores }
  }

  it('cifra con formato {v, iv, ct} e IV distinto en cada escritura', async () => {
    const { kv, ss } = crear()
    await ss.setItem('users', [{ etiqueta: 'Usuario 1', pesoKg: 70 }])
    const rec1 = kv._map.get('users')
    expect(Object.keys(rec1).sort()).toEqual(['ct', 'iv', 'v'])
    expect(JSON.stringify(rec1)).not.toContain('Usuario 1')
    await ss.setItem('users', [{ etiqueta: 'Usuario 1', pesoKg: 70 }])
    expect(kv._map.get('users').iv).not.toBe(rec1.iv)
    expect(await ss.getItem('users')).toEqual([{ etiqueta: 'Usuario 1', pesoKg: 70 }])
  })

  it('fallo seguro ante manipulación o cambio de ranura (AAD)', async () => {
    const { kv, ss, errores } = crear()
    await ss.setItem('a', { x: 1 })
    const rec = kv._map.get('a')
    const ct = rec.ct.split('')
    ct[5] = ct[5] === 'A' ? 'B' : 'A'
    kv._map.set('a', { ...rec, ct: ct.join('') })
    expect(await ss.getItem('a')).toBeNull()
    expect(errores).toContain('a')
    await ss.setItem('b', { y: 2 })
    kv._map.set('c', kv._map.get('b'))
    expect(await ss.getItem('c')).toBeNull()
  })

  it('wipe borra datos y clave (crypto-shredding)', async () => {
    const { kv, keyKv, ss } = crear()
    await ss.setItem('k', { z: 3 })
    expect(keyKv._map.size).toBe(1)
    await ss.wipe()
    expect(kv._map.size).toBe(0)
    expect(keyKv._map.size).toBe(0)
  })
})

describe('auditoría con cadena de hashes (SEC-38..42)', () => {
  it('encadena, verifica y detecta una entrada alterada', async () => {
    const store = memoryAuditStore()
    const log = createAuditLog({ store })
    await log.log('ADMIN_SETUP', 'admin')
    await log.log('PARAM_CHANGED', 'admin', { field: 'bpm.global.min', old: 50, new: 55 })
    await log.log('EXPORT_CSV', 'participant:Usuario 1', { scope: 'propia', rows: 10 })
    expect(await log.verify()).toEqual({ ok: true, count: 3 })
    store._entries()[1].details.new = 40
    const v = await log.verify()
    expect(v.ok).toBe(false)
    expect(v.brokenAt).toBe(2)
  })

  it('no registra datos de salud ni credenciales', () => {
    const d = sanitizeDetails({ bpm: 80, edad: 30, peso: 70, pin: '1234', hash: 'x', usuario: 'Usuario 2', anidado: { ecg: [1, 2], ok: true } })
    expect(d).toEqual({ usuario: 'Usuario 2', anidado: { ok: true } })
  })

  it('rechaza eventos desconocidos y rota conservando el ancla', async () => {
    const store = memoryAuditStore()
    const log = createAuditLog({ store, maxEntries: 3 })
    await expect(log.log('HACK', 'x')).rejects.toThrow()
    for (let i = 0; i < 5; i++) await log.log('SERIAL_CONNECTED', 'system', { i })
    const all = await log.list()
    expect(all.length).toBe(3)
    expect(all[0].seq).toBe(3)
    expect(await log.verify()).toMatchObject({ ok: true })
  })

  it('JSON canónico independiente del orden de claves', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }))
  })
})
