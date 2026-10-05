import { hashPin, verifyPin, validateNewPin, isValidRecord } from './pinHash.js'
import {
  initialLockState, isLocked, registerFailure, registerSuccess,
  newAdminSession, touchSession, isSessionValid,
} from './lockout.js'

/**
 * ENGANCHE ISO (RF25, SEC-06..SEC-12). Autenticación del administrador en el cliente.
 * IMPORTANTE (sección 4.0 del documento ISO): disuade el uso casual, no detiene a quien
 * controla el navegador. La credencial (hash) y el bloqueo van en localStorage; la sesión
 * solo en sessionStorage (se pierde al cerrar la pestaña).
 */
const CRED_KEY = 'ecg.admin.cred'
const LOCK_KEY = 'ecg.admin.lock'
const SESSION_KEY = 'ecg.admin.session'

function readJson(storage, key) {
  try {
    const raw = storage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function hasCredential() {
  return isValidRecord(readJson(localStorage, CRED_KEY))
}

export function getLockState() {
  const s = readJson(localStorage, LOCK_KEY)
  return s && Number.isFinite(s.failedAttempts) ? { ...initialLockState(), ...s } : initialLockState()
}

function saveLockState(s) {
  localStorage.setItem(LOCK_KEY, JSON.stringify(s))
}

/** Primer uso: crea la credencial. Falla si ya existe. */
export async function setupPin(pin) {
  if (hasCredential()) throw new Error('Ya existe una credencial de administrador')
  const err = validateNewPin(pin)
  if (err) throw new Error(err)
  const rec = await hashPin(pin)
  localStorage.setItem(CRED_KEY, JSON.stringify(rec))
  saveLockState(initialLockState())
}

/**
 * Verifica el PIN aplicando el bloqueo progresivo.
 * @returns {Promise<{ok:boolean, locked?:boolean, lockedUntil?:number, justLocked?:boolean, remaining?:number}>}
 */
export async function verify(pin) {
  const now = Date.now()
  const lock = getLockState()
  if (isLocked(lock, now)) return { ok: false, locked: true, lockedUntil: lock.lockedUntil }
  const rec = readJson(localStorage, CRED_KEY)
  const ok = await verifyPin(pin, rec)
  if (ok) {
    saveLockState(registerSuccess())
    return { ok: true }
  }
  const r = registerFailure(lock, Date.now())
  saveLockState(r.state)
  return {
    ok: false,
    locked: r.bloqueado,
    justLocked: r.bloqueado,
    lockedUntil: r.state.lockedUntil,
    remaining: r.bloqueado ? 0 : 5 - r.state.failedAttempts,
  }
}

export function startSession() {
  const s = newAdminSession(Date.now())
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
  return s
}

export function getSession() {
  return readJson(sessionStorage, SESSION_KEY)
}

export function isAdminActive() {
  return isSessionValid(getSession(), Date.now())
}

/** Renueva la sesión por actividad (pointerdown/keydown/visibilitychange). */
export function touch() {
  const s = getSession()
  if (!isSessionValid(s, Date.now())) return null
  const t = touchSession(s, Date.now())
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(t))
  return t
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY)
}

/** Cambio de PIN: exige el actual (SEC-12). */
export async function changePin(actual, nuevo) {
  const r = await verify(actual)
  if (!r.ok) return r
  const err = validateNewPin(nuevo)
  if (err) return { ok: false, error: err }
  const rec = await hashPin(nuevo)
  localStorage.setItem(CRED_KEY, JSON.stringify(rec))
  return { ok: true }
}

/** "Olvidé el PIN": solo se puede restablecer borrando todo (lo invoca el flujo de borrado total). */
export function removeCredential() {
  localStorage.removeItem(CRED_KEY)
  localStorage.removeItem(LOCK_KEY)
  sessionStorage.removeItem(SESSION_KEY)
}
