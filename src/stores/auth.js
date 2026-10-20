import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as adminAuth from '@/services/security/adminAuth.js'
import { isLocked } from '@/services/security/lockout.js'
import { audit } from '@/services/audit/auditService.js'
import { cloudEnabled, ensureCloudSession } from '@/services/cloud/cloudSync.js'
import * as adminMfa from '@/services/security/adminMfa.js'
import { newAdminSession, touchSession, isSessionValid } from '@/services/security/lockout.js'

/**
 * Rol actual (SEC-01): 'participant' por defecto o 'admin' con sesión válida.
 * Estado: { role, adminSessionExpiresAt, failedAttempts, lockedUntil }.
 *
 * Dos mecanismos excluyentes:
 *  - CON nube: el administrador es una cuenta normal con rol asignado (es_admin_registrado) y segundo
 *    factor TOTP (aal2). Los privilegios solo existen con aal2 y se pierden a los 15 min de inactividad
 *    o al cerrar la sesión de la cuenta (A.9.2.3, A.9.4.2). El PIN local NO interviene.
 *  - SIN nube: administrador local con PIN (limitación documentada en docs/sgsi/control_acceso.md).
 */
export const useAuthStore = defineStore('auth', () => {
  const nube = cloudEnabled
  const role = ref(!nube && adminAuth.isAdminActive() ? 'admin' : 'participant')
  const adminSessionExpiresAt = ref(nube ? null : (adminAuth.getSession()?.expiresAt ?? null))
  // Estado de la cuenta con nube (solo en memoria; la verdad la tiene el servidor).
  const adminRegistrado = ref(false)
  const aal = ref(null)
  let sesionNube = null // { expiresAt, hardExpiresAt, inactividadMs }
  // true tras salir del modo admin o caducar: un token aal2 aún vigente NO reabre el modo; hace falta un código nuevo.
  let modoCerrado = false
  /** El enlace "Admin" se muestra si hay rol asignado (con nube) o siempre (sin nube: PIN local). */
  const mostrarBotonAdmin = computed(() => adminMfa.estadoAdmin({ nube, registrado: adminRegistrado.value, aal: aal.value }).mostrarBoton)
  const requiereMfa = computed(() => nube && adminRegistrado.value && !isAdmin.value)
  /** Con nube, la reautenticación y el acceso usan un código TOTP; sin nube, el PIN. */
  const metodoReauth = nube ? 'totp' : 'pin'
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
    const ok = nube
      ? adminRegistrado.value && adminMfa.esAal2(aal.value) && isSessionValid(sesionNube, Date.now())
      : adminAuth.isAdminActive()
    if (!ok && role.value === 'admin') expire()
    return ok
  }

  /** Doble barrera (SEC-03): toda acción privilegiada de Pinia la invoca. */
  function assertAdmin() {
    if (!isAdminSessionValid()) throw new Error('Acción reservada al administrador: inicia sesión de administrador.')
  }

  function onActivity() {
    if (role.value !== 'admin') return
    if (nube) {
      if (!isSessionValid(sesionNube, Date.now())) return void isAdminSessionValid()
      sesionNube = touchSession(sesionNube, Date.now())
      adminSessionExpiresAt.value = sesionNube.expiresAt
      return
    }
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
    if (nube) {
      sesionNube = newAdminSession(Date.now(), adminMfa.INACTIVIDAD_ADMIN_NUBE_MS)
      role.value = 'admin'
      adminSessionExpiresAt.value = sesionNube.expiresAt
      startWatch()
      return
    }
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
  async function reauth(secreto) {
    if (!isAdminSessionValid()) return false
    if (nube) return reauthTotp(secreto)
    const r = await adminAuth.verify(secreto)
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

  /** Reautenticación con un NUEVO código TOTP (acciones destructivas, A.9.4.2). */
  async function reauthTotp(codigo) {
    const f = await adminMfa.factorTotpVerificado()
    if (!f) return false
    const r = await adminMfa.verificarCodigo(f.id, codigo)
    if (r.ok) return true
    await audit('ADMIN_MFA_FAILED', 'admin', { contexto: 'reautenticacion', limitado: !!r.limitado })
    return false
  }

  // ---------- Administrador con cuenta (nube) ----------
  /** Consulta al servidor el rol y el nivel aal de la sesión actual y ajusta el modo admin. */
  async function refrescarNube(forzarInicio = false) {
    if (!nube) return
    let registrado = false
    let nivel = null
    try {
      if (await ensureCloudSession()) registrado = await adminMfa.esAdminRegistrado()
    } catch {
      registrado = false
    }
    if (registrado) nivel = await adminMfa.nivelAal().catch(() => null)
    adminRegistrado.value = registrado
    aal.value = nivel
    if (registrado && adminMfa.esAal2(nivel)) {
      if (forzarInicio) modoCerrado = false
      if (role.value !== 'admin' && !modoCerrado) startSession()
    } else if (role.value === 'admin') {
      clearSessionState()
    }
  }

  /** Tras verificar el TOTP (inscripción o subida a aal2). */
  async function completarMfa(contexto) {
    await refrescarNube(true)
    await audit('ADMIN_MFA_VERIFIED', 'admin', { contexto })
  }

  /** Tras el inicio de sesión de la cuenta: registra el acceso de una cuenta con rol (solo si lo tiene). */
  async function alIniciarSesionCuenta() {
    await refrescarNube()
    if (adminRegistrado.value) await audit('ADMIN_ACCOUNT_LOGIN', 'system', { aal: aal.value ?? 'aal1' })
  }

  /** Cierra el modo admin y olvida el rol (cierre de sesión de la cuenta). */
  function cerrarNube() {
    adminRegistrado.value = false
    aal.value = null
    sesionNube = null
    modoCerrado = false
    if (role.value === 'admin') clearSessionState()
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
    if (nube) {
      // Salir del modo admin sin cerrar la cuenta: se exigirá un nuevo código TOTP para volver.
      sesionNube = null
      modoCerrado = true
      clearSessionState()
      if (era) audit('ADMIN_LOGOUT', 'admin')
      return
    }
    adminAuth.logout()
    clearSessionState()
    if (era) audit('ADMIN_LOGOUT', 'admin')
  }

  function expire() {
    if (nube) {
      sesionNube = null
      modoCerrado = true
    } else adminAuth.logout()
    clearSessionState()
    audit('ADMIN_SESSION_EXPIRED', 'system')
  }

  if (role.value === 'admin') startWatch()

  return {
    nube, adminRegistrado, aal, mostrarBotonAdmin, requiereMfa, metodoReauth, refrescarNube, completarMfa, alIniciarSesionCuenta, cerrarNube,
    role, isAdmin, adminSessionExpiresAt, failedAttempts, lockedUntil, hasCredential,
    isAdminSessionValid, assertAdmin, setup, login, reauth, changePin, logout, refreshLock, isLockedNow,
  }
})
