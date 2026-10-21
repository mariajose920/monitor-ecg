<script setup>
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import AccountMenu from '@/components/account/AccountMenu.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useAccountStore } from '@/stores/account.js'
import { useUsersStore } from '@/stores/users.js'
import { useAuthStore } from '@/stores/auth.js'
import { useSessionStore } from '@/stores/session.js'

const users = useUsersStore()
const cuenta = useAccountStore()
const auth = useAuthStore()
const session = useSessionStore()
const route = useRoute()

const abierto = ref(false)
const oculto = ref(false)
const botonMenu = ref(null)
const raiz = ref(null)
let ultimoY = 0

watch(() => route.fullPath, () => {
  abierto.value = false
  oculto.value = false
})

/** El encabezado se esconde al bajar y reaparece al subir (nunca con el menú abierto). */
function alScroll() {
  const y = window.scrollY
  if (abierto.value || y < 64) oculto.value = false
  else if (y > ultimoY + 8) oculto.value = true
  else if (y < ultimoY - 8) oculto.value = false
  ultimoY = y
}

function cerrarConEscape(e) {
  if (e.key === 'Escape' && abierto.value) {
    abierto.value = false
    botonMenu.value?.focus()
  }
}

function cerrarAlPulsarFuera(e) {
  if (abierto.value && raiz.value && !raiz.value.contains(e.target)) abierto.value = false
}

onMounted(() => {
  window.addEventListener('scroll', alScroll, { passive: true })
  document.addEventListener('keydown', cerrarConEscape)
  document.addEventListener('pointerdown', cerrarAlPulsarFuera)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', alScroll)
  document.removeEventListener('keydown', cerrarConEscape)
  document.removeEventListener('pointerdown', cerrarAlPulsarFuera)
})

const enlaces = [
  { to: '/', texto: 'Inicio' },
  { to: '/pacientes', texto: 'Pacientes' },
  { to: '/monitor', texto: 'Monitor' },
  { to: '/monitoreos', texto: 'Monitoreos' },
  { to: '/comparar', texto: 'Comparar' },
  { to: '/aprende', texto: 'Aprende' },
]

const destinoAdmin = computed(() => (auth.isAdmin ? '/admin' : auth.requiereMfa ? '/admin/mfa' : '/admin/acceso'))
</script>

<template>
  <header ref="raiz" :class="['aeline-header', { oculto }]" @focusin="oculto = false">
    <div class="header-inner">
      <!-- Marca estilo Aeline (Izquierda): Ícono orgánico + Logotipo -->
      <RouterLink to="/" class="aeline-brand" aria-label="Cardio Monitor, inicio">
        <div class="brand-heart-icon">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            <path d="M7 12h2.5l1.5-3 2 6 1.5-3H17" stroke="#ffffff" stroke-width="2" />
          </svg>
        </div>
        <span class="brand-title">Cardio<span class="brand-accent">Monitor</span></span>
      </RouterLink>

      <!-- Menú central estilo Aeline: enlaces limpios y orgánicos -->
      <nav class="aeline-nav" aria-label="Navegación principal">
        <RouterLink
          v-for="e in enlaces"
          :key="e.to"
          :to="e.to"
          class="aeline-link"
        >
          {{ e.texto }}
        </RouterLink>
        <RouterLink
          v-if="auth.mostrarBotonAdmin"
          :to="destinoAdmin"
          class="aeline-link nav-admin"
          :class="{ 'admin-activo': auth.isAdmin }"
          data-testid="enlace-admin"
        >
          Admin
        </RouterLink>
      </nav>

      <!-- Bloque derecho: Botón CTA tipo píldora verde lima (como "Get Involved") + Cuenta -->
      <div class="aeline-right">
        <!-- Indicador de grabación en vivo si está activa -->
        <span v-if="session.activa" class="live-pill" role="status" title="Monitoreo activo">
          <span class="live-pulse"></span>
          <span class="live-text">Grabando</span>
        </span>

        <!-- Botón de acción principal estilo Aeline ("Get Involved") -->
        <RouterLink to="/monitor" class="btn-cta-aeline" data-testid="nav-cta-monitoreo">
          <span>Medir pulso</span>
        </RouterLink>

        <!-- Menú de cuenta / usuario -->
        <div class="account-wrap">
          <AccountMenu />
        </div>

        <!-- Botón menú móvil -->
        <button
          ref="botonMenu"
          type="button"
          class="mobile-toggle-btn"
          :aria-expanded="abierto"
          aria-label="Abrir menú"
          @click="abierto = !abierto"
        >
          <AppIcon :name="abierto ? 'x' : 'sliders'" :size="20" />
        </button>
      </div>
    </div>

    <!-- Menú móvil desplegable -->
    <div v-if="abierto" class="mobile-menu" role="dialog" aria-label="Menú móvil">
      <nav class="mobile-nav">
        <RouterLink
          v-for="e in enlaces"
          :key="e.to"
          :to="e.to"
          class="mobile-link"
          @click="abierto = false"
        >
          {{ e.texto }}
        </RouterLink>
        <RouterLink
          v-if="auth.mostrarBotonAdmin"
          :to="destinoAdmin"
          class="mobile-link"
          @click="abierto = false"
        >
          Admin
        </RouterLink>
      </nav>
      <div class="mobile-action">
        <RouterLink to="/monitor" class="btn primary" @click="abierto = false">
          Medir pulso
        </RouterLink>
      </div>
    </div>
  </header>
</template>

<style scoped>
.aeline-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border);
  transition: transform 0.25s ease;
}

.aeline-header.oculto {
  transform: translateY(-100%);
}

.header-inner {
  width: 100%;
  max-width: var(--maxw);
  margin: 0 auto;
  padding: 0 28px;
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
}

/* Marca estilo Aeline */
.aeline-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  flex-shrink: 0;
}

.brand-heart-icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: linear-gradient(135deg, #e11d48 0%, #be123c 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  box-shadow: 0 4px 14px rgba(225, 29, 72, 0.35);
}

.brand-title {
  font-size: 1.3rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--text);
}

.brand-accent {
  color: var(--accent);
}

/* Enlaces centrales estilo Aeline */
.aeline-nav {
  display: flex;
  align-items: center;
  gap: 32px;
}

@media (max-width: 1024px) {
  .aeline-nav {
    display: none;
  }
}

.aeline-link {
  color: #475569;
  text-decoration: none;
  font-size: 0.94rem;
  font-weight: 600;
  padding: 8px 4px;
  position: relative;
  transition: color 0.18s ease;
  white-space: nowrap;
}

.aeline-link:hover {
  color: var(--text);
}

.aeline-link.router-link-exact-active,
.aeline-link.router-link-active:not([href="/"]) {
  color: var(--text);
  font-weight: 700;
}

.aeline-link.router-link-exact-active::after,
.aeline-link.router-link-active:not([href="/"])::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 4px;
  right: 4px;
  height: 3px;
  background: var(--accent);
  border-radius: 3px;
}

.nav-admin.admin-activo {
  color: var(--warn);
}

/* Bloque derecho */
.aeline-right {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

/* Botón CTA píldora estilo Aeline / Cardio Monitor */
.btn-cta-aeline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 42px;
  padding: 0 24px;
  border-radius: var(--radius-pill);
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  font-size: 0.92rem;
  font-weight: 800;
  text-decoration: none;
  letter-spacing: -0.01em;
  box-shadow: 0 4px 18px rgba(225, 29, 72, 0.28);
  transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
  white-space: nowrap;
}

.btn-cta-aeline:hover {
  transform: translateY(-2px);
  filter: brightness(1.05);
  box-shadow: 0 6px 24px rgba(225, 29, 72, 0.42);
}

.btn-cta-aeline:active {
  transform: translateY(0);
}

/* Chip de grabación en vivo */
.live-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  background: #fff1f2;
  border: 1px solid rgba(225, 29, 72, 0.25);
  color: var(--accent);
  font-size: 0.82rem;
  font-weight: 700;
}

.live-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  animation: pulse-ring 1.5s infinite;
}

@keyframes pulse-ring {
  0% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(225, 29, 72, 0.7); }
  70% { transform: scale(1.1); box-shadow: 0 0 0 6px rgba(225, 29, 72, 0); }
  100% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(225, 29, 72, 0); }
}

.account-wrap {
  display: flex;
  align-items: center;
}

/* Botón menú móvil */
.mobile-toggle-btn {
  display: none;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg-elev);
  color: var(--text);
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

@media (max-width: 1024px) {
  .mobile-toggle-btn {
    display: flex;
  }
}

.mobile-menu {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--bg-elev);
  border-bottom: 1px solid var(--border);
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: var(--shadow-hover);
}

.mobile-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mobile-link {
  color: var(--text);
  text-decoration: none;
  font-size: 1rem;
  font-weight: 600;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease;
}

.mobile-link:hover,
.mobile-link.router-link-exact-active {
  background: var(--bg-elev-2);
  color: var(--accent);
}

.mobile-action {
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
</style>
