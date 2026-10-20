import { createRouter, createWebHistory } from 'vue-router'
import { requireAdmin, requireAdminMfa, adminLoginSoloSinNube, requireUser, setupOnlyOnce } from './guards.js'

// Todas las vistas con lazy loading (SEC-04 para las de administración).
const routes = [
  { path: '/', name: 'inicio', component: () => import('@/views/HomeView.vue'), meta: { title: 'Inicio' } },
  { path: '/pacientes', name: 'pacientes', component: () => import('@/views/UserSelectView.vue'), meta: { title: 'Pacientes' } },
  { path: '/usuarios', redirect: (to) => ({ path: '/pacientes', query: to.query }) },
  { path: '/acceso', name: 'acceso', component: () => import('@/views/account/LoginView.vue'), meta: { title: 'Iniciar sesión' } },
  { path: '/registro', name: 'registro', component: () => import('@/views/account/RegisterView.vue'), meta: { title: 'Crear cuenta' } },
  { path: '/cuenta', name: 'cuenta', component: () => import('@/views/account/CuentaView.vue'), meta: { title: 'Mi cuenta' } },
  { path: '/recuperar', name: 'recuperar', component: () => import('@/views/account/RecoverView.vue'), meta: { title: 'Recuperar contraseña' } },
  { path: '/restablecer', name: 'restablecer', component: () => import('@/views/account/ResetPasswordView.vue'), meta: { title: 'Nueva contraseña' } },
  { path: '/monitor', name: 'monitor', component: () => import('@/views/MonitorView.vue'), meta: { title: 'Monitor' } },
  { path: '/comparar', name: 'comparar', component: () => import('@/views/CompareView.vue'), meta: { title: 'Comparar' } },
  { path: '/monitoreos', name: 'monitoreos', component: () => import('@/views/SessionsView.vue'), meta: { title: 'Monitoreos', requiresUser: true, allowAdmin: true } },
  { path: '/monitoreos/:id', name: 'monitoreo-detalle', component: () => import('@/views/SessionDetailView.vue'), meta: { title: 'Detalle del monitoreo', requiresUser: true, allowAdmin: true } },
  // Compatibilidad con enlaces anteriores
  { path: '/sesiones', redirect: '/monitoreos' },
  { path: '/sesiones/:id', redirect: (to) => `/monitoreos/${to.params.id}` },
  { path: '/aprende/:tema?', name: 'aprende', component: () => import('@/views/LearnView.vue'), meta: { title: 'Aprende' } },
  { path: '/privacidad', name: 'privacidad', component: () => import('@/views/PrivacyView.vue'), meta: { title: 'Aviso de privacidad' } },
  { path: '/seguridad', name: 'seguridad', component: () => import('@/views/SecurityView.vue'), meta: { title: 'Política de seguridad' } },
  { path: '/admin/setup', name: 'admin-setup', component: () => import('@/views/admin/AdminLoginView.vue'), meta: { title: 'Configurar administrador' } },
  { path: '/admin/acceso', name: 'admin-login', component: () => import('@/views/admin/AdminLoginView.vue'), meta: { title: 'Acceso administrador' } },
  { path: '/admin/mfa', name: 'admin-mfa', component: () => import('@/views/admin/AdminMfaView.vue'), meta: { title: 'Segundo factor' } },
  { path: '/admin', name: 'admin', component: () => import('@/views/admin/AdminView.vue'), meta: { title: 'Administración', requiresAdmin: true } },
  { path: '/admin/auditoria', name: 'admin-auditoria', component: () => import('@/views/admin/AuditView.vue'), meta: { title: 'Auditoría', requiresAdmin: true } },
  { path: '/:pathMatch(.*)*', name: 'no-encontrado', component: () => import('@/views/NotFoundView.vue'), meta: { title: 'No encontrado' } },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, saved) {
    return saved || { top: 0 }
  },
})

router.beforeEach(adminLoginSoloSinNube)
router.beforeEach(requireAdminMfa)
router.beforeEach(setupOnlyOnce)
router.beforeEach(requireAdmin)
router.beforeEach(requireUser)
router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Monitor ECG` : 'Monitor ECG'
})

export default router
