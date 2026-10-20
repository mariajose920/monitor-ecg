import { describe, it, expect } from 'vitest'
import {
  validarCorreo, validarPassword, validarRegistro, validarLogin, normalizarCorreo, PASSWORD_MIN,
  MSG_CREDENCIALES,
} from '@/services/accounts/validation.js'
import { createRateLimiter, CLIENT_LIMITS } from '@/utils/rateLimiter.js'

describe('validación de cuenta', () => {
  it('normaliza y valida el correo', () => {
    expect(normalizarCorreo('  Ana@Ejemplo.CL ')).toBe('ana@ejemplo.cl')
    expect(validarCorreo('ana@ejemplo.cl')).toBeNull()
    for (const malo of ['', 'ana', 'ana@', '@x.cl', 'a b@x.cl', 'ana@x', 'ana@x..cl', 'a<b>@x.cl']) {
      expect(validarCorreo(malo), malo).toBeTruthy()
    }
  })

  it('exige contraseñas de al menos 10 caracteres con letras y números', () => {
    expect(PASSWORD_MIN).toBe(10)
    expect(validarPassword('corta1')).toMatch(/al menos 10/)
    expect(validarPassword('soloLetrasLargas')).toMatch(/letras y números/)
    expect(validarPassword('1234567890123')).toMatch(/letras y números/)
    expect(validarPassword(' espacio12345')).toMatch(/espacios/)
    expect(validarPassword('x'.repeat(73) + '1')).toMatch(/máximo/)
    expect(validarPassword('claveSegura2026')).toBeNull()
  })

  it('rechaza contraseñas que contienen el correo', () => {
    expect(validarPassword('mariana1234567', 'mariana@ejemplo.cl')).toMatch(/correo/)
    expect(validarPassword('otraClave12345', 'mariana@ejemplo.cl')).toBeNull()
  })

  it('valida el formulario de registro completo', () => {
    const ok = validarRegistro({ correo: 'a@b.cl', password: 'claveSegura2026', confirmar: 'claveSegura2026', acepta: true, mayorEdad: true })
    expect(ok.ok).toBe(true)
    const mal = validarRegistro({ correo: 'x', password: 'claveSegura2026', confirmar: 'otra', acepta: false })
    expect(Object.keys(mal.errores).sort()).toEqual(['acepta', 'confirmar', 'correo', 'mayorEdad'])
  })

  it('valida el inicio de sesión y usa un mensaje genérico', () => {
    expect(validarLogin({ correo: '', password: '' }).ok).toBe(false)
    expect(validarLogin({ correo: 'a@b.cl', password: 'x' }).ok).toBe(true)
    expect(MSG_CREDENCIALES).not.toMatch(/no existe|no registrado/i)
  })

  it('limita los intentos de inicio de sesión en el cliente', () => {
    const lim = createRateLimiter({ ...CLIENT_LIMITS.authLogin, now: () => 0 })
    const resultados = Array.from({ length: CLIENT_LIMITS.authLogin.max + 1 }, () => lim.tryAcquire())
    expect(resultados.slice(-1)[0]).toBe(false)
    expect(resultados.slice(0, -1).every(Boolean)).toBe(true)
  })
})
