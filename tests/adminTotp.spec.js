import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/security/adminMfa.js', () => ({
  factorTotpVerificado: vi.fn(async () => ({ id: 'f1' })),
  verificarCodigo: vi.fn(async (_id, codigo) => ({ ok: String(codigo).replace(/\s+/g, '') === '123456' })),
  validarCodigo: (c) => (/^\d{6}$/.test(String(c).replace(/\s+/g, '')) ? null : 'Escribe los 6 dígitos del código.'),
  MSG_MFA_GENERICO: 'Código incorrecto o vencido. Inténtalo de nuevo.',
  MSG_MFA_LIMITE: 'Demasiados intentos.',
}))

import { decodificarJwt, segundosDesdeTotp, totpVigente, esErrorPrivilegios, TOTP_VIGENCIA_S } from '@/services/security/adminTotp.js'
import { conRenovacionTotp, enviarCodigoRenovacion, cancelarRenovacion, renovacion } from '@/services/security/adminRenovacion.js'

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const AHORA = 1_760_000_000

describe('claim amr (C-05)', () => {
  it('decodifica el payload de un JWT y tolera basura', () => {
    const t = `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', aal: 'aal2', amr: [{ method: 'totp', timestamp: AHORA }] })}.firma`
    expect(decodificarJwt(t)).toMatchObject({ sub: 'u1', aal: 'aal2' })
    expect(decodificarJwt('no-es-un-jwt')).toBeNull()
    expect(decodificarJwt(null)).toBeNull()
    expect(decodificarJwt('a.%%%.c')).toBeNull()
  })

  it('el formato real son objetos {method, timestamp}; toma el TOTP más reciente', () => {
    const amr = [{ method: 'password', timestamp: AHORA - 10 }, { method: 'totp', timestamp: AHORA - 600 }, { method: 'totp', timestamp: AHORA - 100 }]
    expect(segundosDesdeTotp(amr, AHORA)).toBe(100)
  })

  it('vigente solo con TOTP de menos de 15 min', () => {
    expect(totpVigente([{ method: 'totp', timestamp: AHORA - 899 }], AHORA)).toBe(true)
    expect(totpVigente([{ method: 'totp', timestamp: AHORA - TOTP_VIGENCIA_S }], AHORA)).toBe(false)
    expect(totpVigente([{ method: 'totp', timestamp: AHORA - 1200 }], AHORA)).toBe(false)
  })

  it('sin TOTP, con password solamente o con la claim mal formada: no vigente', () => {
    expect(totpVigente([{ method: 'password', timestamp: AHORA }], AHORA)).toBe(false)
    expect(totpVigente([], AHORA)).toBe(false)
    expect(totpVigente(undefined, AHORA)).toBe(false)
    expect(totpVigente('totp', AHORA)).toBe(false)
    expect(totpVigente(['totp', null, { method: 'totp', timestamp: 'x' }, { method: 'totp' }], AHORA)).toBe(false)
  })

  it('una marca del futuro (reloj falso) no cuenta', () => {
    expect(totpVigente([{ method: 'totp', timestamp: AHORA + 3600 }], AHORA)).toBe(false)
  })

  it('reconoce el error de privilegios del servidor', () => {
    expect(esErrorPrivilegios({ code: '42501', message: 'x' })).toBe(true)
    expect(esErrorPrivilegios({ message: 'Privilegios insuficientes' })).toBe(true)
    expect(esErrorPrivilegios({ code: 'P0001', message: 'Cuota' })).toBe(false)
    expect(esErrorPrivilegios(null)).toBe(false)
  })
})

describe('renovación del segundo factor ante la caducidad', () => {
  beforeEach(() => {
    renovacion.abierta = false
    renovacion.error = ''
  })

  it('si la operación funciona no pide nada', async () => {
    const fn = vi.fn(async () => 'ok')
    expect(await conRenovacionTotp(fn)).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(renovacion.abierta).toBe(false)
  })

  it('un error que no es de privilegios se propaga sin pedir código', async () => {
    const fn = vi.fn(async () => { throw Object.assign(new Error('boom'), { code: 'XX' }) })
    await expect(conRenovacionTotp(fn)).rejects.toThrow('boom')
    expect(renovacion.abierta).toBe(false)
  })

  it('con 42501 abre el diálogo, un código bueno reintenta y funciona', async () => {
    let llamadas = 0
    const fn = vi.fn(async () => {
      llamadas++
      if (llamadas === 1) throw Object.assign(new Error('Privilegios insuficientes'), { code: '42501' })
      return 'hecho'
    })
    const p = conRenovacionTotp(fn)
    await vi.waitFor(() => expect(renovacion.abierta).toBe(true))
    expect(await enviarCodigoRenovacion('12')).toBe(false) // formato inválido: no llega al servidor
    expect(renovacion.error).toMatch(/6 dígitos/)
    expect(await enviarCodigoRenovacion('000000')).toBe(false) // incorrecto
    expect(renovacion.abierta).toBe(true)
    expect(await enviarCodigoRenovacion('123 456')).toBe(true)
    expect(await p).toBe('hecho')
    expect(fn).toHaveBeenCalledTimes(2)
    expect(renovacion.abierta).toBe(false)
  })

  it('si la persona cancela, la operación falla', async () => {
    const fn = vi.fn(async () => { throw Object.assign(new Error('Privilegios insuficientes'), { code: '42501' }) })
    const p = conRenovacionTotp(fn)
    await vi.waitFor(() => expect(renovacion.abierta).toBe(true))
    cancelarRenovacion()
    await expect(p).rejects.toThrow('Verificación cancelada.')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
