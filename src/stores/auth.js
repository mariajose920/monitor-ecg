import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as adminAuth from '@/services/security/adminAuth.js'
import { isLocked } from '@/services/security/lockout.js'
import { audit } from '@/services/audit/auditService.js'

/**
 * Rol actual (SEC-01): 'participant' por defecto o 'admin' con sesión válida.
 * Estado: { role, adminSessionExpiresAt, failedAttempts, lockedUntil }.
 */
export const useAuthStore = defineStore('auth', () => {
  const role = ref(adminAuth.isAdminActive() ? 'admin' : 'participant')
  const adminSessionExpiresAt = ref(adminAuth.getSession()?.expiresAt ?? null)
  const lockState = ref(adminAuth.getLockState())
  const hasCredential = ref(adminAuth.hasCredential())
  const isAdmin = computed(() => role.value === 'admin')
  const failedAttempts = computed(() => lockState.value.failedAttempts)
  const lockedUntil = computed(() => lockState.value.lockedUntil)

  let watchTimer = null
  let listenersInstalled = false

  function refreshLock() {
    lockState.value = adminAuth.getLockState()
    hasCredential.value = adminAuth.hasCredential()
  }

  function isLockedNow() {
    return isLocked(lockState.value, Date.now())
  }

  /** Verifica la sesión; si expiró, la cierra (SEC-10). */
  function isAdminSessionValid() {
    const ok = adminAuth.isAdminActive()
    if (!ok && role.value === 'admin') expire()
    return ok
  }

  /** Doble barrera (SEC-03): toda acción privilegiada de Pinia la invoca. */
  function assertAdmin() {
    if (!isAdminSessionValid()) throw new Error('Acción reservada al administrador: inicia sesión de administrador.')
  }

  function onActivity() {
    if (role.value !== 'admin') return
    const s = adminAuth.touch()
    if (s) adminSessionExpiresAt.value = s.expiresAt
    else isAdminSessionValid()
  }

  function installListeners() {
    if (listenersInstalled || typeof window === 'undefined') return
    listenersInstalled = true
    window.addEventListener('pointerdown', onActivity, { passive: true })
    window.addEventListener('keydown', onActivity)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') isAdminSessionValid()
      onActivity()
    })
  }

  function startWatch() {
    installListeners()
    if (watchTimer) clearInterval(watchTimer)
    watchTimer = setInterval(() => {
      if (role.value === 'admin') isAdminSessionValid()
    }, 5000)
  }

  function startSession() {
    const s = adminAuth.startSession()
    role.value = 'admin'
    adminSessionExpiresAt.value = s.expiresAt
    startWatch()
  }

  async function setup(pin) {
    await adminAuth.setupPin(pin)
    refreshLock()
    await audit('ADMIN_SETUP', 'admin')
    startSession()
    await audit('ADMIN_LOGIN_OK', 'admin')
  }

  async function login(pin) {
    const r = await adminAuth.verify(pin)
    refreshLock()
    if (r.ok) {
      startSession()
      await audit('ADMIN_LOGIN_OK', 'admin')
    } else if (!r.locked || r.justLocked) {
      await audit('ADMIN_LOGIN_FAIL', 'system')
      if (r.justLocked) await audit('ADMIN_LOCKED', 'system', { hastaUtc: new Date(r.lockedUntil).toISOString() })
    }
    return r
  }

  /** Reautenticación para acciones destructivas (SEC-11). */
  async function reauth(pin) {
    if (!isAdminSessionValid()) return false
    const r = await adminAuth.verify(pin)
    refreshLock()
    if (!r.ok) {
      if (!r.locked || r.justLocked) await audit('ADMIN_LOGIN_FAIL', 'admin', { contexto: 'reautenticacion' })
      if (r.justLocked) {
        await audit('ADMIN_LOCKED', 'system', { hastaUtc: new Date(r.lockedUntil).toISOString() })
        logout()
      }
      return false
    }
    return true
  }

  async function changePin(actual, nuevo) {
    assertAdmin()
    const r = await adminAuth.changePin(actual, nuevo)
    refreshLock()
    if (r.ok) await audit('ADMIN_PIN_CHANGED', 'admin')
    else if (!r.error) await audit('ADMIN_LOGIN_FAIL', 'admin', { contexto: 'cambio-pin' })
    return r
  }

  function clearSessionState() {
    role.value = 'participant'
    adminSessionExpiresAt.value = null
    if (watchTimer) clearInterval(watchTimer)
    watchTimer = null
  }

  function logout() {
    const era = role.value === 'admin'
    adminAuth.logout()
    clearSessionState()
    if (era) audit('ADMIN_LOGOUT', 'admin')
  }

  function expire() {
    adminAuth.logout()
    clearSessionState()
    audit('ADMIN_SESSION_EXPIRED', 'system')
  }

  if (role.value === 'admin') startWatch()

  return {
    role, isAdmin, adminSessionExpiresAt, failedAttempts, lockedUntil, hasCredential,
    isAdminSessionValid, assertAdmin, setup, login, reauth, changePin, logout, refreshLock, isLockedNow,
  }
})
