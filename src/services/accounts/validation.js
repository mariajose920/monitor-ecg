/**
 * Validación de cuenta (A.9.2.1, A.9.4.3): correo y contraseña. Lógica pura, probada con Vitest.
 * Los mensajes de error de autenticación son genéricos para no revelar si un correo existe (A.9.4.2).
 */
export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 72 // límite práctico de bcrypt en Supabase Auth
export const MSG_CREDENCIALES = 'Correo o contraseña incorrectos, o la cuenta aún no está confirmada.'
export const MSG_REGISTRO_ENVIADO = 'Si el correo es válido, te enviamos un mensaje para confirmar la cuenta. Revisa tu bandeja (y spam).'
export const MSG_RECUPERAR_ENVIADO = 'Si existe una cuenta con ese correo, te enviamos un enlace para fijar una nueva contraseña.'

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

export function normalizarCorreo(v) {
  return String(v ?? '').trim().toLowerCase()
}

/** @returns {string|null} mensaje de error o null si es válido */
export function validarCorreo(v) {
  const e = normalizarCorreo(v)
  if (!e) return 'Escribe tu correo.'
  const dominio = e.split('@')[1] ?? ''
  if (e.length > 254 || !EMAIL_RE.test(e) || dominio.includes('..') || dominio.startsWith('.') || dominio.startsWith('-')) return 'El correo no tiene un formato válido.'
  return null
}

/** Reglas: ≥ 10 caracteres, letras y números, sin espacios en los extremos, sin contener el correo. */
export function validarPassword(pw, correo = '') {
  const p = String(pw ?? '')
  if (p.length < PASSWORD_MIN) return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`
  if (p.length > PASSWORD_MAX) return `La contraseña admite como máximo ${PASSWORD_MAX} caracteres.`
  if (p !== p.trim()) return 'La contraseña no puede empezar ni terminar con espacios.'
  if (!/[A-Za-zÀ-ɏ]/.test(p) || !/\d/.test(p)) return 'Combina letras y números.'
  const local = normalizarCorreo(correo).split('@')[0]
  if (local.length >= 4 && p.toLowerCase().includes(local)) return 'La contraseña no debe contener tu correo.'
  return null
}

/** Valida el formulario de registro. @returns {{ok:boolean, errores:Record<string,string>}} */
export function validarRegistro({ correo, password, confirmar, acepta }) {
  const errores = {}
  const ec = validarCorreo(correo)
  if (ec) errores.correo = ec
  const ep = validarPassword(password, correo)
  if (ep) errores.password = ep
  if (!errores.password && password !== confirmar) errores.confirmar = 'Las contraseñas no coinciden.'
  if (!acepta) errores.acepta = 'Debes aceptar el aviso de privacidad para crear la cuenta.'
  return { ok: Object.keys(errores).length === 0, errores }
}

export function validarLogin({ correo, password }) {
  const errores = {}
  const ec = validarCorreo(correo)
  if (ec) errores.correo = ec
  if (!password) errores.password = 'Escribe tu contraseña.'
  return { ok: Object.keys(errores).length === 0, errores }
}
