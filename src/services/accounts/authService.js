import { supabase, cloudEnabled } from '@/services/cloud/supabaseClient.js'
import { captchaEnabled, getCaptchaToken } from '@/services/cloud/captcha.js'
import { createRateLimiter, CLIENT_LIMITS } from '@/utils/rateLimiter.js'
import { guardarEquipoCompartido, borrarTokens } from '@/services/cloud/almacenSesion.js'
import { DECLARACION_VERSION } from './validation.js'
import {
  validarLogin, validarRegistro, validarCorreo, validarPassword, normalizarCorreo,
  MSG_CREDENCIALES, MSG_REGISTRO_ENVIADO, MSG_RECUPERAR_ENVIADO,
} from './validation.js'

/**
 * Cuentas con Supabase Auth (correo + contraseña). Las sesiones las gestiona supabase-js
 * (persistSession); aquí NUNCA se guardan tokens ni contraseñas. Errores genéricos: no se revela
 * si un correo existe (A.9.4.2). Límite de intentos en el cliente (el servidor aplica los suyos).
 */
const lim = {
  login: createRateLimiter(CLIENT_LIMITS.authLogin),
  registro: createRateLimiter(CLIENT_LIMITS.authRegister),
  reset: createRateLimiter(CLIENT_LIMITS.authReset),
  reauth: createRateLimiter(CLIENT_LIMITS.authLogin),
}
const MSG_LIMITE = 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.'
const MSG_NUBE = 'Las cuentas no están disponibles en esta copia de la aplicación (la nube no está configurada). Puedes usarla sin cuenta.'

export class AuthError extends Error {
  constructor(message, campos = {}) {
    super(message)
    this.campos = campos
  }
}

function exigirNube() {
  if (!cloudEnabled) throw new AuthError(MSG_NUBE)
}

/**
 * @param {{correo:string, password:string, equipoCompartido?:boolean}} o  equipoCompartido decide dónde vive el token (C-07):
 *   true = sessionStorage (muere al cerrar la pestaña); false = localStorage. Se fija ANTES de iniciar sesión.
 */
export async function iniciarSesion({ correo, password, equipoCompartido }) {
  const v = validarLogin({ correo, password })
  if (!v.ok) throw new AuthError('Revisa los datos ingresados.', v.errores)
  exigirNube()
  if (!lim.login.tryAcquire()) throw new AuthError(MSG_LIMITE)
  if (typeof equipoCompartido === 'boolean') guardarEquipoCompartido(equipoCompartido)
  const { data, error } = await supabase.auth.signInWithPassword({ email: normalizarCorreo(correo), password })
  if (error || !data?.user) throw new AuthError(MSG_CREDENCIALES)
  return data.user
}

export async function registrar({ correo, password, confirmar, acepta, mayorEdad }) {
  const v = validarRegistro({ correo, password, confirmar, acepta, mayorEdad })
  if (!v.ok) throw new AuthError('Revisa los datos ingresados.', v.errores)
  exigirNube()
  if (!lim.registro.tryAcquire()) throw new AuthError(MSG_LIMITE)
  let captchaToken
  if (captchaEnabled) {
    try {
      captchaToken = await getCaptchaToken()
    } catch {
      throw new AuthError('No se pudo completar la verificación anti-bots. Inténtalo de nuevo.')
    }
  }
  await supabase.auth.signUp({
    email: normalizarCorreo(correo),
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/acceso`,
      // C-18: la declaración de mayoría de edad queda registrada en la cuenta (versión del texto y fecha).
      data: { mayor_edad: true, declaracion_version: DECLARACION_VERSION, declaracion_fecha: new Date().toISOString() },
      ...(captchaToken ? { captchaToken } : {}),
    },
  })
  // Mensaje genérico siempre (aunque el correo ya exista o haya un error): no revela si existe una cuenta.
  return MSG_REGISTRO_ENVIADO
}

export async function solicitarRecuperacion(correo) {
  const ec = validarCorreo(correo)
  if (ec) throw new AuthError(ec, { correo: ec })
  exigirNube()
  if (!lim.reset.tryAcquire()) throw new AuthError(MSG_LIMITE)
  await supabase.auth.resetPasswordForEmail(normalizarCorreo(correo), { redirectTo: `${window.location.origin}/restablecer` })
  return MSG_RECUPERAR_ENVIADO
}

export async function fijarNuevaPassword(password, confirmar, correo = '') {
  const ep = validarPassword(password, correo)
  if (ep) throw new AuthError(ep, { password: ep })
  // eslint-disable-next-line security/detect-possible-timing-attacks -- comparación local de dos campos del mismo formulario
  if (password !== confirmar) throw new AuthError('Las contraseñas no coinciden.', { confirmar: 'Las contraseñas no coinciden.' })
  exigirNube()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw new AuthError('No se pudo cambiar la contraseña. Vuelve a solicitar el enlace de recuperación.')
  // C-05 / H-03: tras cambiar la contraseña se cierran TODAS las demás sesiones de la cuenta (un token robado deja de servir).
  // Un fallo aquí no revierte el cambio, pero no se oculta: la persona puede cerrar sesión en los demás equipos.
  try {
    await supabase.auth.signOut({ scope: 'others' })
  } catch {
    /* la contraseña ya cambió; las otras sesiones caducarán con su refresh token */
  }
}

/**
 * C-13: reautenticación para acciones sensibles (cambiar contraseña, eliminar datos en la nube o la cuenta). Verifica la contraseña
 * ACTUAL con el servidor (mismo mensaje genérico que el acceso). No guarda la contraseña.
 */
export async function reautenticar({ correo, password }) {
  if (!password) throw new AuthError('Escribe tu contraseña actual.', { password: 'Escribe tu contraseña actual.' })
  exigirNube()
  if (!lim.reauth.tryAcquire()) throw new AuthError(MSG_LIMITE)
  const { data, error } = await supabase.auth.signInWithPassword({ email: normalizarCorreo(correo), password })
  if (error || !data?.user) throw new AuthError('La contraseña actual no es correcta.', { password: 'La contraseña actual no es correcta.' })
  return true
}

/** Cambio de contraseña con la sesión abierta: exige la contraseña actual y que la nueva sea distinta. */
export async function cambiarPassword({ correo, actual, nueva, confirmar }) {
  if (nueva && actual && nueva === actual) throw new AuthError('La contraseña nueva debe ser distinta de la actual.', { password: 'La contraseña nueva debe ser distinta de la actual.' })
  const ep = validarPassword(nueva, correo)
  if (ep) throw new AuthError(ep, { password: ep })
  await reautenticar({ correo, password: actual })
  await fijarNuevaPassword(nueva, confirmar, correo)
}

export async function cerrarSesionNube() {
  if (cloudEnabled) {
    try {
      await supabase.auth.signOut()
    } finally {
      borrarTokens() // el cierre de sesión borra los tokens de ambos almacenes aunque el servidor no responda
    }
  }
}

export async function sesionActual() {
  if (!cloudEnabled) return null
  const { data } = await supabase.auth.getSession()
  const u = data.session?.user
  if (!u || u.is_anonymous === true) return null
  return { id: u.id, email: u.email ?? '' }
}

/** Suscripción a cambios de sesión (expiración, otra pestaña, enlace de recuperación). */
export function escucharAuth(cb) {
  if (!cloudEnabled) return () => {}
  const { data } = supabase.auth.onAuthStateChange((evento, session) => {
    setTimeout(() => cb(evento, session?.user && !session.user.is_anonymous ? { id: session.user.id, email: session.user.email ?? '' } : null), 0)
  })
  return () => data.subscription.unsubscribe()
}
