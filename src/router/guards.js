import { useAuthStore } from '@/stores/auth.js'
import { useUsersStore } from '@/stores/users.js'
import { useAccountStore } from '@/stores/account.js'

/** Lista blanca de destinos tras el login de admin (evita open redirect, SEC-02). */
export const ADMIN_REDIRECT_WHITELIST = Object.freeze(['admin', 'admin-auditoria'])
/** Lista blanca de destinos tras iniciar sesión en /acceso (incluye el panel admin: ahí se exige el TOTP). */
export const ACCESO_REDIRECT_WHITELIST = Object.freeze(['pacientes', 'admin', 'admin-auditoria', 'monitor', 'monitoreos', 'comparar'])
/** Lista blanca de destinos tras elegir usuario. */
export const USER_REDIRECT_WHITELIST = Object.freeze(['monitor', 'monitoreos', 'comparar'])

export function safeRedirect(value, whitelist, fallback) {
  return typeof value === 'string' && whitelist.includes(value) ? value : fallback
}

/** requireAdmin: rutas con meta.requiresAdmin exigen sesión de admin válida. */
export async function requireAdmin(to) {
  if (!to.matched.some((r) => r.meta.requiresAdmin)) return true
  const auth = useAuthStore()
  const redirect = safeRedirect(to.name, ADMIN_REDIRECT_WHITELIST, 'admin')
  if (auth.nube) {
    // Con nube: cuenta con rol asignado + segundo factor (aal2). La verdad la impone el servidor (es_admin()).
    const cuenta = useAccountStore()
    await cuenta.init()
    if (!cuenta.iniciada || !auth.adminRegistrado) return { name: 'acceso', query: { redirect } }
    if (!auth.isAdminSessionValid()) return { name: 'admin-mfa', query: { redirect } }
    return true
  }
  if (auth.isAdminSessionValid()) return true
  return { name: auth.hasCredential ? 'admin-login' : 'admin-setup', query: { redirect } }
}

/** requireUser: rutas con meta.requiresUser exigen un participante activo (RF01/RF02) o admin. */
export async function requireUser(to) {
  if (!to.matched.some((r) => r.meta.requiresUser)) return true
  const users = useUsersStore()
  await users.ensureLoaded()
  if (users.activeUser) return true
  if (useAuthStore().isAdminSessionValid() && to.meta.allowAdmin) return true
  return { name: 'pacientes', query: { redirect: safeRedirect(to.name, USER_REDIRECT_WHITELIST, 'monitor') } }
}

/** Con nube no existe login de admin aparte: /admin/acceso y /admin/setup llevan a /acceso. */
export function adminLoginSoloSinNube(to) {
  if (to.name !== 'admin-login' && to.name !== 'admin-setup') return true
  if (!useAuthStore().nube) return true
  const redirect = safeRedirect(to.query.redirect, ACCESO_REDIRECT_WHITELIST, null)
  return { name: 'acceso', query: redirect ? { redirect } : {}, replace: true }
}

/** /admin/mfa: solo con nube, con sesión de cuenta y rol de administrador asignado. */
export async function requireAdminMfa(to) {
  if (to.name !== 'admin-mfa') return true
  const auth = useAuthStore()
  if (!auth.nube) return { name: 'admin-login' }
  const cuenta = useAccountStore()
  await cuenta.init()
  if (!cuenta.iniciada) return { name: 'acceso', query: { redirect: 'admin' } }
  if (!auth.adminRegistrado) return { name: 'inicio' }
  return true
}

/** Evita que la vista de setup se use cuando ya existe credencial. */
export function setupOnlyOnce(to) {
  if (to.name !== 'admin-setup') return true
  const auth = useAuthStore()
  auth.refreshLock()
  return auth.hasCredential ? { name: 'admin-login' } : true
}
