/**
 * Validación de cuenta (A.9.2.1, A.9.4.3): correo y contraseña. Lógica pura, probada con Vitest.
 * Los mensajes de error de autenticación son genéricos para no revelar si un correo existe (A.9.4.2).
 */
export const PASSWORD_MIN = 10
export const DECLARACION_VERSION = '2.0'
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

/**
 * Contraseñas muy comunes (C-13). La comprobación es local (nada sale del navegador): se compara la contraseña, y su "base" sin
 * números ni símbolos en los extremos, contra esta lista. No sustituye a la protección de contraseñas filtradas del proveedor.
 */
export const CONTRASENAS_COMUNES = Object.freeze([
  'password', 'passw0rd', 'contrasena', 'contrasenia', 'clave', 'claveclave', 'qwerty', 'qwertyuiop', 'asdfgh', 'asdfghjkl', 'zxcvbn',
  'zxcvbnm', 'abcdef', 'abcdefgh', 'abcdefghij', 'iloveyou', 'tequiero', 'teamo', 'admin', 'administrador', 'administrator', 'welcome',
  'bienvenido', 'bienvenida', 'letmein', 'monkey', 'dragon', 'master', 'login', 'princess', 'sunshine', 'football', 'futbol', 'barcelona',
  'realmadrid', 'colocolo', 'chile', 'santiago', 'universidad', 'estudiante', 'profesor', 'docente', 'hola', 'holamundo', 'holahola',
  'secreto', 'secret', 'super', 'superman', 'batman', 'pokemon', 'ecg', 'monitor', 'monitorecg', 'corazon', 'miclave', 'micontrasena',
  'passwordpassword', 'contrasenacontrasena', 'unodostres', 'abc', 'abcabc', 'test', 'testing', 'prueba', 'usuario', 'user', 'invitado',
])

const quitarAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** ¿Es una contraseña simple? (lista común, un solo carácter repetido, secuencias o patrón repetido). */
export function esContrasenaComun(pw) {
  const p = quitarAcentos(String(pw ?? '').toLowerCase())
  if (!p) return false
  const base = p.replace(/^[^a-z]+/, '').replace(/[^a-z]+$/, '')
  if (CONTRASENAS_COMUNES.includes(p) || CONTRASENAS_COMUNES.includes(base)) return true
  const repetida = (s) => s.length >= 3 && (/^(.)\1+$/.test(s) || /^(.{1,4})\1{2,}$/.test(s)) // "zzzzzz", "abcabcabc", "123123123"
  if (repetida(p) || repetida(base)) return true
  const solo = p.replace(/[^a-z0-9]/g, '')
  const secuencias = ['0123456789', '1234567890', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiopasdfghjklzxcvbnm']
  if (solo.length >= 6 && secuencias.some((s) => s.includes(solo) || [...s].reverse().join('').includes(solo))) return true
  return false
}

/** Reglas: ≥ 10 caracteres, letras y números, sin espacios en los extremos, sin contener el correo y no ser una contraseña común. */
export function validarPassword(pw, correo = '') {
  const p = String(pw ?? '')
  if (p.length < PASSWORD_MIN) return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`
  if (p.length > PASSWORD_MAX) return `La contraseña admite como máximo ${PASSWORD_MAX} caracteres.`
  if (p !== p.trim()) return 'La contraseña no puede empezar ni terminar con espacios.'
  if (!/[A-Za-zÀ-ɏ]/.test(p) || !/\d/.test(p)) return 'Combina letras y números.'
  const local = normalizarCorreo(correo).split('@')[0]
  if (local.length >= 4 && p.toLowerCase().includes(local)) return 'La contraseña no debe contener tu correo.'
  if (esContrasenaComun(p)) return 'Esa contraseña es demasiado común o predecible. Elige otra más larga y distinta.'
  return null
}

/** Valida el formulario de registro. @returns {{ok:boolean, errores:Record<string,string>}} */
export function validarRegistro({ correo, password, confirmar, acepta, mayorEdad = false }) {
  const errores = {}
  const ec = validarCorreo(correo)
  if (ec) errores.correo = ec
  const ep = validarPassword(password, correo)
  if (ep) errores.password = ep
  if (!errores.password && password !== confirmar) errores.confirmar = 'Las contraseñas no coinciden.'
  if (!acepta) errores.acepta = 'Debes aceptar el aviso de privacidad para crear la cuenta.'
  if (mayorEdad !== true) errores.mayorEdad = 'Debes declarar que eres mayor de 18 años. La aplicación no está dirigida a menores.'
  return { ok: Object.keys(errores).length === 0, errores }
}

export function validarLogin({ correo, password }) {
  const errores = {}
  const ec = validarCorreo(correo)
  if (ec) errores.correo = ec
  if (!password) errores.password = 'Escribe tu contraseña.'
  return { ok: Object.keys(errores).length === 0, errores }
}
