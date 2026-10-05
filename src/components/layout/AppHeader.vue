<script setup>
import { ref, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useUsersStore } from '@/stores/users.js'
import { useAuthStore } from '@/stores/auth.js'
import { useSessionStore } from '@/stores/session.js'
import { setPref } from '@/utils/prefs.js'

const users = useUsersStore()
const auth = useAuthStore()
const session = useSessionStore()
const route = useRoute()
const abierto = ref(false)

watch(() => route.fullPath, () => (abierto.value = false))

const enlaces = [
  { to: '/', texto: 'Inicio' },
  { to: '/usuarios', texto: 'Participantes' },
  { to: '/monitor', texto: 'Monitor' },
  { to: '/sesiones', texto: 'Sesiones' },
  { to: '/comparar', texto: 'Comparar' },
  { to: '/aprende', texto: 'Aprende' },
]

const temaOscuro = ref(document.documentElement.dataset.theme !== 'light')
const etiquetaTema = computed(() => (temaOscuro.value ? 'Tema claro' : 'Tema oscuro'))

function alternarTema() {
  temaOscuro.value = !temaOscuro.value
  const t = temaOscuro.value ? 'dark' : 'light'
  document.documentElement.dataset.theme = t
  setPref('tema', t)
}
</script>

<template>
  <header class="app-header">
    <div class="container bar">
      <RouterLink to="/" class="brand" aria-label="Monitor ECG, inicio">
        <svg viewBox="0 0 64 32" width="40" height="20" aria-hidden="true">
          <path d="M2 18h12l3-6 5 14 6-24 5 16h29" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
        </svg>
        <span>Monitor ECG</span>
      </RouterLink>

      <div class="status">
        <span v-if="session.activa" class="chip ok" role="status">● Sesión activa</span>
        <RouterLink v-if="users.activeUser" to="/usuarios" class="chip info" title="Participante activo">
          👤 {{ users.activeUser.etiqueta }}
        </RouterLink>
        <span v-if="auth.isAdmin" class="chip warn">🔑 Admin</span>
      </div>

      <button
        class="btn ghost menu-btn"
        :aria-expanded="abierto"
        aria-controls="nav-principal"
        @click="abierto = !abierto"
      >
        <span aria-hidden="true">☰</span><span class="sr-only">Menú</span>
      </button>

      <nav id="nav-principal" :class="['nav', { abierto }]" aria-label="Principal">
        <RouterLink v-for="e in enlaces" :key="e.to" :to="e.to" class="nav-link">{{ e.texto }}</RouterLink>
        <RouterLink v-if="auth.isAdmin" to="/admin" class="nav-link">Administración</RouterLink>
        <RouterLink v-else to="/admin/acceso" class="nav-link">Admin</RouterLink>
        <button v-if="auth.isAdmin" class="btn small" @click="auth.logout()">Cerrar sesión admin</button>
        <button class="btn small ghost" @click="alternarTema">{{ etiquetaTema }}</button>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  background: var(--bg-elev);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 20;
}

.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-height: 56px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--accent);
  font-weight: 800;
  text-decoration: none;
  font-size: 1.1rem;
}

.status {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-left: auto;
}

.status a.chip {
  text-decoration: none;
}

.menu-btn {
  font-size: 1.3rem;
}

@media (max-width: 420px) {
  .brand span {
    display: none;
  }
}

.nav {
  display: none;
  flex-basis: 100%;
  flex-direction: column;
  gap: 2px;
  padding-bottom: 8px;
}

.nav.abierto {
  display: flex;
}

.nav-link {
  color: var(--text-muted);
  text-decoration: none;
  font-weight: 600;
  padding: 10px 12px;
  min-height: var(--touch);
  display: flex;
  align-items: center;
  border-radius: var(--radius-sm);
}

.nav-link.router-link-exact-active,
.nav-link:hover {
  color: var(--text);
  background: var(--bg-elev-2);
}

@media (min-width: 1100px) {
  .menu-btn {
    display: none;
  }

  .status {
    margin-left: 0;
    order: 3;
  }

  .nav {
    display: flex;
    flex-direction: row;
    flex-basis: auto;
    margin-left: auto;
    padding: 0;
    align-items: center;
  }
}
</style>
