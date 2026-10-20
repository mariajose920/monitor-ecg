import { supabase, cloudEnabled } from '@/services/cloud/supabaseClient.js'
import { createRateLimiter } from '@/utils/rateLimiter.js'

/**
 * Administrador = cuenta normal + segundo factor TOTP (ISO/IEC 27001:2013 A.9.2.3, A.9.4.2).
 *  - `es_admin_registrado()` (servidor): el rol está asignado -> solo decide si se MUESTRA el botón Admin.
 *  - `es_admin()` (servidor, usada por RLS): rol Y sesión aal2 -> privilegios efectivos.
 * Este módulo contiene la lógica pura (probada con Vitest) y las llamadas a supabase.auth.mfa.
 * Nunca se guardan secretos TOTP ni códigos: el secreto solo se muestra durante la inscripción.
 */

/** Inactividad máxima de una sesión privilegiada con nube (A.9.4.2, A.9.2.5): 15 minutos. */
export const INACTIVIDAD_ADMIN_NUBE_MS = 15 * 60 * 1000
/** Límite de intentos de código en el cliente (el servidor aplica además sus límites de Auth). */
export const MFA_LIMITE = Object.freeze({ max: 5, windowMs: 10 * 60_000 })
export const MSG_MFA_GENERICO = 'Código incorrecto o vencido. Inténtalo de nuevo.'
export const MSG_MFA_LIMITE = 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.'
export const MSG_MFA_NO_DISPONIBLE = 'No se pudo completar la verificación. Inténtalo de nuevo más tarde.'

export const limitadorMfa = createRateLimiter(MFA_LIMITE)

/** ¿El nivel de aseguramiento de la sesión es el del segundo factor? */
export function esAal2(aal) {
  return aal === 'aal2'
}

/** Deja solo dígitos (los apps TOTP suelen mostrar "123 456"). */
export function normalizarCodigo(codigo) {
  return String(codigo ?? '').replace(/\s+/g, '')
}

/** @returns {string|null} mensaje de error o null si el código tiene el formato correcto */
export function validarCodigo(codigo) {
  return /^\d{6}$/.test(normalizarCodigo(codigo)) ? null : 'Escribe los 6 dígitos del código.'
}

/**
 * Estado derivado del administrador (lógica pura).
 * @param {{nube:boolean, registrado:boolean, aal:string|null, sesionVigente?:boolean}} e
 * @returns {{mostrarBoton:boolean, privilegios:boolean, requiereMfa:boolean}}
 */
export function estadoAdmin({ nube, registrado, aal, sesionVigente = true }) {
  // Sin nube el único mecanismo es el PIN local (siempre se muestra el enlace de acceso).
  if (!nube) return { mostrarBoton: true, privilegios: false, requiereMfa: false }
  const privilegios = !!registrado && esAal2(aal) && sesionVigente
  return { mostrarBoton: !!registrado, privilegios, requiereMfa: !!registrado && !privilegios }
}

/** Un SVG data-URI es seguro para <img src> (no se usa v-html). */
export function esQrSeguro(qr) {
  return typeof qr === 'string' && /^data:image\/svg\+xml[;,]/i.test(qr)
}

// ---------- Llamadas al servidor ----------
export async function esAdminRegistrado() {
  if (!cloudEnabled) return false
  const { data, error } = await supabase.rpc('es_admin_registrado')
  return !error && data === true
}

/** @returns {Promise<'aal1'|'aal2'|null>} nivel actual de la sesión */
export async function nivelAal() {
  if (!cloudEnabled) return null
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  return error ? null : (data?.currentLevel ?? null)
}

/** Factor TOTP ya verificado de la cuenta (o null). */
export async function factorTotpVerificado() {
  if (!cloudEnabled) return null
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) return null
  return (data?.totp ?? []).find((f) => f.status === 'verified') ?? null
}

/** Quita inscripciones TOTP que nunca se verificaron (evita residuos si se abandonó la inscripción). */
async function limpiarNoVerificados() {
  const { data } = await supabase.auth.mfa.listFactors()
  const pendientes = (data?.all ?? []).filter((f) => f.factor_type === 'totp' && f.status !== 'verified')
  for (const f of pendientes) await supabase.auth.mfa.unenroll({ factorId: f.id })
}

/** Inicia la inscripción de TOTP. @returns {{factorId:string, qr:string|null, secreto:string}} */
export async function iniciarInscripcion() {
  if (!cloudEnabled) throw new Error(MSG_MFA_NO_DISPONIBLE)
  await limpiarNoVerificados()
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `admin-${Date.now().toString(36)}` })
  if (error || !data) throw new Error(MSG_MFA_NO_DISPONIBLE)
  return { factorId: data.id, qr: esQrSeguro(data.totp?.qr_code) ? data.totp.qr_code : null, secreto: data.totp?.secret ?? '' }
}

/**
 * Verifica un código TOTP contra un factor (inscripción o subida a aal2 / reautenticación).
 * Respeta el límite de intentos del cliente; el mensaje de error es siempre genérico.
 * @returns {Promise<{ok:boolean, limitado?:boolean}>}
 */
export async function verificarCodigo(factorId, codigo) {
  if (!cloudEnabled) return { ok: false }
  if (!limitadorMfa.tryAcquire()) return { ok: false, limitado: true }
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: normalizarCodigo(codigo) })
  return { ok: !error }
}

/** Lista de administradores (id y fecha) para la revisión A.9.2.5. Solo con privilegios efectivos. */
export async function listarAdministradores() {
  if (!cloudEnabled) return []
  const { data, error } = await supabase.rpc('admin_listar_administradores')
  if (error) throw new Error('No se pudo obtener la lista (se requieren privilegios de administrador).')
  return data ?? []
}
