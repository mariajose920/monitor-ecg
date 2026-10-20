<script setup>
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import AccountMenu from '@/components/account/AccountMenu.vue'
import { useAccountStore } from '@/stores/account.js'
import { useUsersStore } from '@/stores/users.js'
import { useAuthStore } from '@/stores/auth.js'
import { useSessionStore } from '@/stores/session.js'
import { setPref } from '@/utils/prefs.js'

/**
 * Encabezado adaptable en 3 niveles (solo CSS, sin JS de medición, sin parpadeos):
 *  1) >= 1360 px: una fila con ícono + texto.
 *  2) 900–1759 px: compacto en dos filas (rejilla horizontal de 2 filas) con ícono + texto pequeño.
 *  3) < 600 px: solo íconos (nombre accesible = texto) y un último botón "Menú" con un desplegable corto.
 * Cada vínculo existe una sola vez en el árbol de accesibilidad: lo que no cabe en la fila pasa al desplegable
 * y el resto del nivel queda con display:none (nunca hay duplicados visibles).
 */
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

/** Íconos de trazo (24x24, currentColor). Rutas SVG fijas: no se usa v-html. */
const ICONOS = {
  inicio: ['M3 11l9-8 9 8', 'M5 10v10h5v-6h4v6h5V10'],
  pacientes: ['M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M22 20v-2a4 4 0 0 0-3-3.9', 'M16 3.1a4 4 0 0 1 0 7.8'],
  monitor: ['M22 12h-4l-3 9L9 3l-3 9H2'],
  monitoreos: ['M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2', 'M9 2h6v4H9z', 'M9 12h6', 'M9 16h6'],
  comparar: ['M8 3L4 7l4 4', 'M4 7h16', 'M16 21l4-4-4-4', 'M20 17H4'],
  aprende: ['M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z', 'M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z'],
  admin: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M9 12l2 2 4-4'],
  mas: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
}

/**
 * fila: en qué anchos (nivel 3) el vínculo va en la fila de íconos: 'no' | 'siempre' | '375' | '480'.
 * pop: en qué anchos (nivel 3) está en el desplegable: null | 'siempre' | '375' | '480' (complementario de fila).
 */
const enlaces = [
  { to: '/', texto: 'Inicio', icono: 'inicio', fila: 'no', pop: 'siempre' },
  { to: '/pacientes', texto: 'Pacientes', icono: 'pacientes', fila: 'no', pop: 'siempre' },
  { to: '/monitor', texto: 'Monitor', icono: 'monitor', fila: 'siempre', pop: null },
  { to: '/monitoreos', texto: 'Monitoreos', icono: 'monitoreos', fila: '375', pop: '375' },
  { to: '/comparar', texto: 'Comparar', icono: 'comparar', fila: '480', pop: '480' },
  { to: '/aprende', texto: 'Aprende', icono: 'aprende', fila: '480', pop: '480' },
]
const enPopover = enlaces.filter((e) => e.pop)

const destinoAdmin = computed(() => (auth.isAdmin ? '/admin' : auth.requiereMfa ? '/admin/mfa' : '/admin/acceso'))

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
  <header ref="raiz" :class="['app-header', { oculto }]" @focusin="oculto = false">
    <div class="container bar">
      <RouterLink to="/" class="brand" aria-label="Monitor ECG, inicio" title="Monitor ECG, inicio">
        <svg viewBox="0 0 64 32" width="40" height="20" aria-hidden="true">
          <path d="M2 18h12l3-6 5 14 6-24 5 16h29" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
        </svg>
        <span class="brand-txt">Monitor ECG</span>
      </RouterLink>

      <div class="status">
        <span v-if="session.activa" class="chip ok chip-rec" role="status"><span class="chip-ico" aria-hidden="true">●</span><span class="chip-txt">Grabando</span></span>
        <RouterLink v-else-if="session.pendiente" to="/monitor" class="chip warn chip-rec" data-testid="chip-sin-guardar"><span class="chip-ico" aria-hidden="true">◐</span><span class="chip-txt">Monitoreo sin guardar</span></RouterLink>
        <RouterLink to="/pacientes" :class="['chip', 'chip-usuario', users.activeUser ? 'info' : 'neutral']" data-testid="usuario-activo" aria-live="polite">
          <span class="chip-ico" aria-hidden="true">👤</span>
          <span class="punto" aria-hidden="true">{{ users.activeUser ? '●' : '○' }}</span>
          <span class="chip-txt">
            <template v-if="users.activeUser"><span class="sr-only">Paciente activo: </span>{{ users.activeUser.etiqueta }}</template>
            <template v-else>Sin paciente · Elegir</template>
          </span>
        </RouterLink>
        <RouterLink :to="cuenta.iniciada ? '/pacientes' : '/acceso'" :class="['chip', 'chip-cuenta', cuenta.iniciada ? 'ok' : 'neutral']" data-testid="chip-cuenta">
          <span class="chip-ico" aria-hidden="true">🔐</span>
          <span class="punto" aria-hidden="true">{{ cuenta.iniciada ? '●' : '○' }}</span>
          <span class="chip-txt">{{ cuenta.iniciada ? 'Con cuenta' : 'Sin cuenta' }}</span>
        </RouterLink>
        <span v-if="auth.isAdmin" class="chip warn chip-admin"><span class="chip-ico" aria-hidden="true">🔑</span><span class="chip-txt">Admin</span></span>
      </div>

      <nav id="nav-principal" class="nav" aria-label="Principal">
        <RouterLink v-for="e in enlaces" :key="e.to" :to="e.to" :class="['nav-link', `f-${e.fila}`]" :title="e.texto">
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path v-for="d in ICONOS[e.icono]" :key="d" :d="d" /></svg>
          <span class="txt">{{ e.texto }}</span>
        </RouterLink>
        <RouterLink v-if="auth.mostrarBotonAdmin" :to="destinoAdmin" :class="['nav-link', 'f-siempre', 'nav-admin', { 'admin-activo': auth.isAdmin }]" data-testid="enlace-admin" title="Admin">
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path v-for="d in ICONOS.admin" :key="d" :d="d" /></svg>
          <span class="txt">Admin<span v-if="auth.isAdmin" class="sr-only"> (sesión de administrador activa)</span></span>
        </RouterLink>

        <button
          ref="botonMenu"
          type="button"
          class="mas-btn"
          :aria-expanded="abierto"
          aria-controls="panel-mas"
          aria-label="Menú"
          title="Menú: más opciones"
          @click="abierto = !abierto"
        >
          <svg class="ico ico-mas" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path v-for="d in ICONOS.mas" :key="d" :d="d" /></svg>
        </button>

        <div id="panel-mas" :class="['mas', { abierto }]">
          <div class="mas-links">
            <RouterLink v-for="e in enPopover" :key="e.to" :to="e.to" :class="['mas-link', `p-${e.pop}`]">
              <svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path v-for="d in ICONOS[e.icono]" :key="d" :d="d" /></svg>
              <span>{{ e.texto }}</span>
            </RouterLink>
          </div>
          <AccountMenu />
          <button v-if="auth.isAdmin" type="button" class="btn small" @click="auth.logout()">Cerrar sesión admin</button>
          <button type="button" class="btn small ghost" @click="alternarTema">{{ etiquetaTema }}</button>
        </div>
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
  transition: transform 0.2s ease;
}

.app-header.oculto {
  transform: translateY(-100%);
}

@media (prefers-reduced-motion: reduce) {
  .app-header {
    transition: none;
  }
}

.bar {
  position: relative;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--accent);
  font-weight: 800;
  text-decoration: none;
  font-size: 1.1rem;
  white-space: nowrap;
}

.ico {
  width: 20px;
  height: 20px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ico-mas {
  stroke-width: 3.5;
}

.status {
  display: flex;
  gap: 6px;
  align-items: center;
}

.status a.chip {
  text-decoration: none;
}

.chip-txt {
  white-space: nowrap;
}

.punto {
  display: none;
}

.nav-link {
  color: var(--text-muted);
  text-decoration: none;
  font-weight: 600;
  display: flex;
  align-items: center;
  border-radius: var(--radius-sm);
  white-space: nowrap;
}

.nav-link.router-link-exact-active,
.nav-link.router-link-active:not([href="/"]),
.nav-link:hover {
  color: var(--text);
  background: var(--bg-elev-2);
}

.nav-admin.admin-activo {
  color: var(--warn);
}

.mas-btn {
  display: none;
}

.mas {
  display: contents; /* niveles 1 y 2: los controles extra son celdas de la propia rejilla/fila */
}

.mas-links {
  display: none;
}

/* ---------- Nivel 1: una fila, ícono + texto (>= 1760 px) ---------- */
@media (min-width: 1760px) {
  .bar {
    display: flex;
    flex-wrap: wrap; /* red de seguridad: si algo no cabe pasa a otra línea en vez de superponerse */
    align-items: center;
    gap: 4px 10px;
    min-height: 56px;
  }

  .status {
    order: 3;
  }

  .nav {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px;
    margin-left: auto;
    min-width: 0;
  }

  .nav-link {
    gap: 6px;
    padding: 8px 10px;
    min-height: var(--touch);
  }

  .nav :deep(.cuenta) {
    flex-wrap: nowrap;
    margin-left: 6px;
  }

  .nav :deep(.btn) {
    white-space: nowrap;
  }

  .nav :deep(.correo) {
    max-width: 150px;
  }

  .app-header.oculto {
    transform: none;
  }
}

/* ---------- Nivel 2: compacto en dos filas (600–1759 px) ---------- */
@media (min-width: 900px) and (max-width: 1759px) {
  .bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'brand nav'
      'status nav';
    align-items: center;
    column-gap: 14px;
    row-gap: 4px;
    padding-top: 6px;
    padding-bottom: 6px;
  }

  .brand {
    grid-area: brand;
    font-size: 1rem;
  }

  .status {
    grid-area: status;
    flex-wrap: wrap;
    gap: 4px;
  }

  .status .chip {
    font-size: 0.75rem;
    padding: 1px 8px;
  }

  .nav {
    grid-area: nav;
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: repeat(2, minmax(40px, auto));
    grid-auto-columns: minmax(0, auto);
    align-items: stretch;
    justify-items: stretch;
    gap: 2px 4px;
  }

  .nav-link {
    flex-direction: column;
    justify-content: center;
    gap: 1px;
    padding: 3px 8px;
    font-size: 0.75rem;
    line-height: 1.15;
  }

  .nav-link .ico {
    width: 17px;
    height: 17px;
  }

  .nav :deep(.cuenta) {
    justify-content: center;
    align-self: center;
  }

  .nav :deep(.correo) {
    display: none;
  }

  .nav :deep(.btn.small) {
    min-height: 36px;
    padding: 3px 8px;
    font-size: 0.75rem;
    white-space: nowrap;
    width: 100%;
  }

  .app-header.oculto {
    transform: translateY(-100%);
  }
}

/* ---------- Nivel 3: solo íconos en una fila (< 900 px) ---------- */
@media (max-width: 899px) {
  .bar {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 0;
    min-height: 52px;
    padding-left: 8px;
    padding-right: 8px;
  }

  .brand {
    flex: 0 0 44px;
    min-width: 44px;
    min-height: 44px;
    justify-content: center;
  }

  .brand svg {
    width: 36px;
  }

  .brand-txt,
  .nav-link .txt,
  .chip-txt {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .status {
    flex: none;
    gap: 0;
  }

  .status .chip {
    position: relative;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    font-size: 1.15rem;
  }

  .status .chip-admin {
    display: none; /* el vínculo Admin de la fila ya muestra el estado */
  }

  .status .chip.router-link-exact-active {
    background: var(--bg-elev-2);
  }

  .punto {
    display: block;
    position: absolute;
    top: 6px;
    right: 6px;
    font-size: 0.6rem;
    line-height: 1;
  }

  .nav {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    align-items: center;
  }

  .nav-link {
    flex: 1 1 44px;
    min-width: 44px;
    min-height: 44px;
    justify-content: center;
    padding: 0;
    position: relative;
  }

  .nav-link .ico {
    width: 24px;
    height: 24px;
  }

  .nav-link.router-link-exact-active::after,
  .nav-link.router-link-active:not([href="/"])::after {
    content: '';
    position: absolute;
    left: 20%;
    right: 20%;
    bottom: 2px;
    height: 3px;
    border-radius: 2px;
    background: var(--accent);
  }

  .f-no,
  .f-375,
  .f-480 {
    display: none;
  }

  .mas-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1 1 44px;
    min-width: 44px;
    min-height: 44px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  .mas-btn[aria-expanded='true'] {
    background: var(--bg-elev-2);
    color: var(--text);
  }

  .mas {
    display: none;
    position: absolute;
    top: 100%;
    right: 8px;
    z-index: 30;
    width: min(300px, calc(100vw - 16px));
    max-height: calc(100dvh - 70px);
    overflow-y: auto;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  .mas.abierto {
    display: flex;
  }

  .mas-links {
    display: flex;
    flex-direction: column;
  }

  .mas-link {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 0 10px;
    color: var(--text);
    text-decoration: none;
    font-weight: 600;
    border-radius: var(--radius-sm);
  }

  .mas-link:hover,
  .mas-link.router-link-exact-active {
    background: var(--bg-elev-2);
  }

  .mas-link.router-link-exact-active {
    box-shadow: inset 3px 0 0 var(--accent);
  }

  .p-375,
  .p-480 {
    display: flex;
  }

  .mas :deep(.cuenta) {
    flex-direction: column;
    align-items: stretch;
  }

  .mas :deep(.correo) {
    max-width: 100%;
  }

  .mas :deep(.btn) {
    justify-content: center;
    min-height: 44px;
  }
}

@media (min-width: 375px) and (max-width: 599px) {
  .f-375 {
    display: flex;
  }

  .p-375 {
    display: none;
  }
}

@media (min-width: 480px) and (max-width: 599px) {
  .f-480 {
    display: flex;
  }

  .p-480 {
    display: none;
  }
}
</style>
