<script setup>
import { watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import ToastHost from '@/components/layout/ToastHost.vue'
import PwaPrompt from '@/components/pwa/PwaPrompt.vue'
import { useAuthStore } from '@/stores/auth.js'
import { notify } from '@/services/notifications/notifier.js'
import { getPref } from '@/utils/prefs.js'
import { useInactividad } from '@/composables/useInactividad.js'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const inactividad = useInactividad()

// Tema guardado (preferencia no sensible)
document.documentElement.dataset.theme = getPref('tema', 'dark')

// SEC-10: al expirar la sesión de admin se limpia el estado y se redirige a '/'.
watch(
  () => auth.isAdmin,
  (ahora, antes) => {
    if (antes && !ahora && route.matched.some((r) => r.meta.requiresAdmin)) {
      notify('La sesión de administrador terminó.', { tipo: 'info' })
      router.push('/')
    }
  },
)
</script>

<template>
  <a class="skip-link" href="#contenido">Saltar al contenido</a>
  <AppHeader />
  <main id="contenido" class="container page" tabindex="-1">
    <RouterView />
  </main>
  <AppFooter />
  <div v-if="inactividad.aviso.value" class="aviso-inactividad alert warn" role="alertdialog" aria-live="assertive" data-testid="aviso-inactividad">
    <p>Cerraremos tu sesión en {{ inactividad.segundos.value }} s por inactividad. Si hay un monitoreo sin guardar en un equipo compartido, se perderá.</p>
    <button class="btn primary" data-testid="seguir-conectada" @click="inactividad.seguir()">Seguir con la sesión abierta</button>
  </div>
  <ToastHost />
  <PwaPrompt />
</template>

<style>
#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.aviso-inactividad {
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  z-index: 200;
  max-width: 520px;
  box-shadow: 0 4px 16px rgb(0 0 0 / 35%);
}

#app > main {
  flex: 1;
}

.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  background: var(--accent);
  color: var(--accent-contrast);
  padding: 8px 12px;
  z-index: 100;
}

.skip-link:focus {
  left: 8px;
}
</style>
