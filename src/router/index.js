import { createRouter, createWebHistory } from 'vue-router'
import { requireAdmin, requireUser, setupOnlyOnce } from './guards.js'

// Todas las vistas con lazy loading (SEC-04 para las de administración).
const routes = [
  { path: '/', name: 'inicio', component: () => import('@/views/HomeView.vue'), meta: { title: 'Inicio' } },
  { path: '/usuarios', name: 'usuarios', component: () => import('@/views/UserSelectView.vue'), meta: { title: 'Participantes' } },
  { path: '/monitor', name: 'monitor', component: () => import('@/views/MonitorView.vue'), meta: { title: 'Monitor', requiresUser: true, allowAdmin: true } },
  { path: '/comparar', name: 'comparar', component: () => import('@/views/CompareView.vue'), meta: { title: 'Comparar' } },
  { path: '/sesiones', name: 'sesiones', component: () => import('@/views/SessionsView.vue'), meta: { title: 'Sesiones', requiresUser: true, allowAdmin: true } },
  { path: '/sesiones/:id', name: 'sesion-detalle', component: () => import('@/views/SessionDetailView.vue'), meta: { title: 'Detalle de sesión', requiresUser: true, allowAdmin: true } },
  { path: '/aprende/:tema?', name: 'aprende', component: () => import('@/views/LearnView.vue'), meta: { title: 'Aprende' } },
  { path: '/privacidad', name: 'privacidad', component: () => import('@/views/PrivacyView.vue'), meta: { title: 'Aviso de privacidad' } },
  { path: '/admin/setup', name: 'admin-setup', component: () => import('@/views/admin/AdminLoginView.vue'), meta: { title: 'Configurar administrador' } },
  { path: '/admin/acceso', name: 'admin-login', component: () => import('@/views/admin/AdminLoginView.vue'), meta: { title: 'Acceso administrador' } },
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

router.beforeEach(setupOnlyOnce)
router.beforeEach(requireAdmin)
router.beforeEach(requireUser)
router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Monitor ECG` : 'Monitor ECG'
})

export default router
