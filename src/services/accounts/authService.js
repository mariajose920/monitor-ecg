import { supabase, cloudEnabled } from '@/services/cloud/supabaseClient.js'
import { captchaEnabled, getCaptchaToken } from '@/services/cloud/captcha.js'
import { createRateLimiter, CLIENT_LIMITS } from '@/utils/rateLimiter.js'
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

export async function iniciarSesion({ correo, password }) {
  const v = validarLogin({ correo, password })
  if (!v.ok) throw new AuthError('Revisa los datos ingresados.', v.errores)
  exigirNube()
  if (!lim.login.tryAcquire()) throw new AuthError(MSG_LIMITE)
  const { data, error } = await supabase.auth.signInWithPassword({ email: normalizarCorreo(correo), password })
  if (error || !data?.user) throw new AuthError(MSG_CREDENCIALES)
  return data.user
}

export async function registrar({ correo, password, confirmar, acepta }) {
  const v = validarRegistro({ correo, password, confirmar, acepta })
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
    options: { emailRedirectTo: `${window.location.origin}/acceso`, ...(captchaToken ? { captchaToken } : {}) },
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
}

export async function cerrarSesionNube() {
  if (cloudEnabled) await supabase.auth.signOut()
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
