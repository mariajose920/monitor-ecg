import { bytesToBase64, base64ToBytes } from '@/utils/base64.js'

/**
 * Hash del PIN de administrador con PBKDF2-SHA-256 (SEC-07) y comparación en
 * tiempo constante (SEC-08). Solo se guarda { v, alg, iter, salt, hash }.
 */
export const PBKDF2_ITER = 600000
export const PIN_MIN_LEN = 8
const TRIVIALES = new Set([
  '12345678', '123456789', '1234567890', '87654321', '00000000', '11111111', '99999999',
  'password', 'contraseña', 'contrasena', 'admin123', 'administrador', 'qwertyui', 'abcdefgh',
])

/** Valida un PIN nuevo (SEC-06). Devuelve un mensaje de error o null. */
export function validateNewPin(pin) {
  if (typeof pin !== 'string') return 'PIN inválido'
  if (pin.length < PIN_MIN_LEN) return `El PIN debe tener al menos ${PIN_MIN_LEN} caracteres`
  if (pin.length > 128) return 'El PIN es demasiado largo'
  if (TRIVIALES.has(pin.toLowerCase())) return 'Ese PIN es demasiado obvio'
  if (/^(.)\1+$/.test(pin)) return 'El PIN no puede repetir un único carácter'
  if (/^\d+$/.test(pin)) {
    // Secuencias numéricas ascendentes/descendentes
    let asc = true
    let desc = true
    for (let i = 1; i < pin.length; i++) {
      const d = pin.charCodeAt(i) - pin.charCodeAt(i - 1)
      if (d !== 1) asc = false
      if (d !== -1) desc = false
    }
    if (asc || desc) return 'El PIN no puede ser una secuencia'
  }
  return null
}

async function derive(pin, salt, iterations) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
  return new Uint8Array(bits)
}

/** Calcula el registro de credencial. */
export async function hashPin(pin, { iterations = PBKDF2_ITER, salt } = {}) {
  const s = salt ?? crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(pin, s, iterations)
  return { v: 1, alg: 'PBKDF2-SHA256', iter: iterations, salt: bytesToBase64(s), hash: bytesToBase64(hash) }
}

/** Comparación en tiempo constante: recorre todos los bytes sin salir antes. */
export function constantTimeEqual(a, b) {
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }
  return diff === 0
}

/** Verifica un PIN contra un registro guardado. */
export async function verifyPin(pin, record) {
  if (!isValidRecord(record) || typeof pin !== 'string') return false
  const salt = base64ToBytes(record.salt)
  const expected = base64ToBytes(record.hash)
  const got = await derive(pin, salt, record.iter)
  return constantTimeEqual(got, expected)
}

export function isValidRecord(r) {
  return (
    !!r && r.v === 1 && r.alg === 'PBKDF2-SHA256' && Number.isInteger(r.iter) && r.iter >= 1000 &&
    typeof r.salt === 'string' && typeof r.hash === 'string'
  )
}
