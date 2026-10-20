import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { createRateLimiter, CLIENT_LIMITS } from '../src/utils/rateLimiter.js'
import { resolveCaptchaConfig, captchaEnabled } from '../src/services/cloud/captcha.js'
import { AUDIT_EVENTS } from '../src/services/audit/auditLog.js'

describe('createRateLimiter (SUG-04/SUG-05)', () => {
  it('permite hasta max y luego bloquea dentro de la ventana', () => {
    let t = 0
    const rl = createRateLimiter({ max: 3, windowMs: 1000, now: () => t })
    expect([rl.tryAcquire(), rl.tryAcquire(), rl.tryAcquire()]).toEqual([true, true, true])
    expect(rl.tryAcquire()).toBe(false)
    expect(rl.remaining()).toBe(0)
    expect(rl.retryAfterMs()).toBe(1000)
  })

  it('libera permisos al deslizar la ventana', () => {
    let t = 0
    const rl = createRateLimiter({ max: 2, windowMs: 1000, now: () => t })
    rl.tryAcquire()
    t = 500
    rl.tryAcquire()
    t = 1000
    expect(rl.remaining()).toBe(1)
    expect(rl.tryAcquire()).toBe(true)
    expect(rl.tryAcquire()).toBe(false)
    t = 1500
    expect(rl.tryAcquire()).toBe(true)
  })

  it('reset vacía el historial y rechaza parámetros inválidos', () => {
    const rl = createRateLimiter({ max: 1, windowMs: 1000, now: () => 0 })
    rl.tryAcquire()
    rl.reset()
    expect(rl.tryAcquire()).toBe(true)
    expect(() => createRateLimiter({ max: 0, windowMs: 1000 })).toThrow()
    expect(() => createRateLimiter({ max: 1, windowMs: -1 })).toThrow()
  })

  it('los límites del cliente no cortan el flujo normal (5 canales, bloques de 2 s)', () => {
    const bloquesPorMinuto = 5 * (60 / 2)
    expect(CLIENT_LIMITS.chunk.max).toBeGreaterThanOrEqual(bloquesPorMinuto * 2)
    expect(CLIENT_LIMITS.chunk.windowMs).toBe(60_000)
  })
})

describe('CAPTCHA opcional (SUG-04)', () => {
  it('sin variables de entorno queda deshabilitado', () => {
    expect(captchaEnabled).toBe(false)
  })

  it('valida proveedor y clave de sitio', () => {
    expect(resolveCaptchaConfig('turnstile', '0x4AAAAAAAAbcdefghij')).toMatchObject({ provider: 'turnstile' })
    expect(resolveCaptchaConfig('HCAPTCHA', '10000000-ffff-ffff-ffff-000000000001')).toMatchObject({ provider: 'hcaptcha' })
    expect(resolveCaptchaConfig('recaptcha', '0x4AAAAAAAAbcdefghij')).toBeNull()
    expect(resolveCaptchaConfig('turnstile', '')).toBeNull()
    expect(resolveCaptchaConfig('turnstile', 'clave con espacios <script>')).toBeNull()
    expect(resolveCaptchaConfig('__proto__', '0x4AAAAAAAAbcdefghij')).toBeNull()
  })
})

describe('supabase/schema.sql (SUG-05, SUG-14)', () => {
  // En este equipo supabase/ está junto a monitor-ecg-vue/; en GitHub, en la raíz del repositorio.
  const ruta = [new URL('../supabase/schema.sql', import.meta.url), new URL('../../supabase/schema.sql', import.meta.url)].find((u) => existsSync(u))
  const disponible = Boolean(ruta)
  const sql = disponible ? readFileSync(ruta, 'utf8') : ''

  it.skipIf(!disponible)('la lista blanca de auditoría (tabla tipos_evento) coincide con AUDIT_EVENTS', () => {
    const bloque = sql.match(/insert into public\.tipos_evento \(tipo, origen\) values([\s\S]*?)on conflict/)
    expect(bloque).not.toBeNull()
    const tipos = [...bloque[1].matchAll(/\('([A-Z_]+)',/g)].map((m) => m[1]).sort()
    expect(tipos).toEqual([...AUDIT_EVENTS].sort())
  })

  it.skipIf(!disponible)('los cuerpos $$ están balanceados y los literales de incidentes van entre comillas', () => {
    expect((sql.match(/\$\$/g) || []).length % 2).toBe(0)
    expect(sql).not.toMatch(/as \$ /)
    expect(sql).toMatch(/tipo in \('acceso', 'fuga'/)
    expect(sql).toMatch(/default 'abierto'/)
  })

  it.skipIf(!disponible)('define cuotas, purga y supresión de datos propios', () => {
    for (const s of ['tg_cuota_sesiones', 'tg_cuota_bloques', 'tg_auditoria_servidor', 'tg_cuota_incidentes', 'borrar_mis_datos', 'bloques_seq_max']) {
      expect(sql).toContain(s)
    }
    // 5400 bloques de 2 s = 3 h por canal: mayor que la sesión de laboratorio típica
    expect(5400 * 2).toBeGreaterThanOrEqual(3 * 3600)
  })
})
