/**
 * Lógica pura de bloqueo y sesión del administrador (SEC-09, SEC-10). Sin efectos secundarios,
 * para poder probarla con Vitest.
 */
export const MAX_INTENTOS = 5
export const BLOQUEO_BASE_MS = 5 * 60 * 1000
export const BLOQUEO_MAX_MS = 60 * 60 * 1000
export const INACTIVIDAD_MS = 10 * 60 * 1000
export const SESION_MAX_MS = 60 * 60 * 1000

export function initialLockState() {
  return { failedAttempts: 0, lockedUntil: 0, ciclos: 0 }
}

export function isLocked(state, now) {
  return !!state && state.lockedUntil > now
}

/** Registra un fallo. Devuelve { state, bloqueado, duracionMs }. */
export function registerFailure(state, now) {
  const s = { ...initialLockState(), ...state }
  s.failedAttempts += 1
  if (s.failedAttempts >= MAX_INTENTOS) {
    const dur = Math.min(BLOQUEO_BASE_MS * 2 ** s.ciclos, BLOQUEO_MAX_MS)
    s.lockedUntil = now + dur
    s.ciclos += 1
    s.failedAttempts = 0
    return { state: s, bloqueado: true, duracionMs: dur }
  }
  return { state: s, bloqueado: false, duracionMs: 0 }
}

export function registerSuccess() {
  return initialLockState()
}

/** Crea una sesión de administrador. */
export function newAdminSession(now) {
  return { expiresAt: now + INACTIVIDAD_MS, hardExpiresAt: now + SESION_MAX_MS }
}

/** Renueva por actividad sin superar el máximo absoluto. */
export function touchSession(sess, now) {
  if (!isSessionValid(sess, now)) return sess
  return { ...sess, expiresAt: Math.min(now + INACTIVIDAD_MS, sess.hardExpiresAt) }
}

export function isSessionValid(sess, now) {
  return !!sess && Number.isFinite(sess.expiresAt) && Number.isFinite(sess.hardExpiresAt) &&
    now < sess.expiresAt && now < sess.hardExpiresAt
}
