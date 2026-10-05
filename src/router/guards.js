import { useAuthStore } from '@/stores/auth.js'
import { useUsersStore } from '@/stores/users.js'

/** Lista blanca de destinos tras el login de admin (evita open redirect, SEC-02). */
export const ADMIN_REDIRECT_WHITELIST = Object.freeze(['admin', 'admin-auditoria'])
/** Lista blanca de destinos tras elegir usuario. */
export const USER_REDIRECT_WHITELIST = Object.freeze(['monitor', 'sesiones', 'comparar'])

export function safeRedirect(value, whitelist, fallback) {
  return typeof value === 'string' && whitelist.includes(value) ? value : fallback
}

/** requireAdmin: rutas con meta.requiresAdmin exigen sesión de admin válida. */
export function requireAdmin(to) {
  if (!to.matched.some((r) => r.meta.requiresAdmin)) return true
  const auth = useAuthStore()
  if (auth.isAdminSessionValid()) return true
  const redirect = safeRedirect(to.name, ADMIN_REDIRECT_WHITELIST, 'admin')
  return { name: auth.hasCredential ? 'admin-login' : 'admin-setup', query: { redirect } }
}

/** requireUser: rutas con meta.requiresUser exigen un participante activo (RF01/RF02) o admin. */
export async function requireUser(to) {
  if (!to.matched.some((r) => r.meta.requiresUser)) return true
  const users = useUsersStore()
  await users.ensureLoaded()
  if (users.activeUser) return true
  if (useAuthStore().isAdminSessionValid() && to.meta.allowAdmin) return true
  return { name: 'usuarios', query: { redirect: safeRedirect(to.name, USER_REDIRECT_WHITELIST, 'monitor') } }
}

/** Evita que la vista de setup se use cuando ya existe credencial. */
export function setupOnlyOnce(to) {
  if (to.name !== 'admin-setup') return true
  const auth = useAuthStore()
  auth.refreshLock()
  return auth.hasCredential ? { name: 'admin-login' } : true
}
