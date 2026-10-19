<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useSessionStore } from '@/stores/session.js'
import { useExportMonitoreos } from '@/composables/useExportMonitoreos.js'
import { getSession } from '@/services/storage/sessionRepository.js'
import { notify } from '@/services/notifications/notifier.js'

/**
 * Menú de acciones del monitoreo dentro del canal: iniciar, marcar, detener y guardar,
 * guardar, descargar, descartar y finalizar. Los datos siguen seudonimizados (SEC-43).
 */
defineProps({ canal: { type: Object, required: true } })

const session = useSessionStore()
const exportar = useExportMonitoreos()

const abierto = ref(false)
const ocupado = ref(false)
const raiz = ref(null)
const boton = ref(null)

const hayPendiente = computed(() => !!session.pendiente)
const hayAcciones = computed(() => session.activa || hayPendiente.value)

function cerrar(devolverFoco = false) {
  abierto.value = false
  if (devolverFoco) nextTick(() => boton.value?.focus())
}
function alternar() {
  abierto.value = !abierto.value
  if (abierto.value) nextTick(() => raiz.value?.querySelector('[role="menuitem"]:not([disabled])')?.focus())
}
function fueraClick(e) {
  if (abierto.value && raiz.value && !raiz.value.contains(e.target)) cerrar()
}
function teclas(e) {
  if (!abierto.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    cerrar(true)
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const items = [...raiz.value.querySelectorAll('[role="menuitem"]:not([disabled])')]
    const i = items.indexOf(document.activeElement)
    const n = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
    items[n]?.focus()
    e.preventDefault()
  }
}
onMounted(() => {
  document.addEventListener('click', fueraClick)
  document.addEventListener('keydown', teclas)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', fueraClick)
  document.removeEventListener('keydown', teclas)
})

async function ejecutar(fn, { ok = null } = {}) {
  cerrar()
  ocupado.value = true
  try {
    await fn()
    if (ok) notify(ok, { tipo: 'ok' })
  } catch (e) {
    notify(e.message || 'No se pudo completar la acción.', { tipo: 'error' })
  } finally {
    ocupado.value = false
  }
}

const marcar = () => ejecutar(async () => session.addEvent(null, 'marca'), { ok: 'Marca registrada en el monitoreo.' })
const guardar = () => {
  cerrar()
  session.pedirGuardar()
}
const descargar = () =>
  ejecutar(async () => {
    const s = await getSession(session.pendiente.id)
    if (!s) throw new Error('No se encontró el monitoreo.')
    await exportar.csv([s])
  }, { ok: 'Descarga lista (CSV).' })
</script>

<template>
  <div v-if="hayAcciones" ref="raiz" class="acciones">
    <button
      ref="boton"
      class="btn"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="abierto"
      :disabled="ocupado"
      data-testid="canal-acciones"
      @click.stop="alternar"
    >
      <span aria-hidden="true">⋯</span> Acciones
    </button>
    <ul v-if="abierto" class="menu" role="menu" aria-label="Acciones del monitoreo">
      <template v-if="session.activa">
        <li role="none"><button role="menuitem" type="button" @click="marcar">⚑ Marcar evento</button></li>
      </template>
      <template v-if="hayPendiente">
        <li role="none"><button role="menuitem" type="button" data-testid="accion-guardar" @click="guardar">💾 Guardar monitoreo</button></li>
        <li role="none"><button role="menuitem" type="button" data-testid="accion-descargar" @click="descargar">⬇ Descargar CSV</button></li>
      </template>
    </ul>
  </div>
</template>

<style scoped>
.acciones {
  position: relative;
  display: inline-block;
}

.menu {
  position: absolute;
  z-index: 40;
  top: calc(100% + 6px);
  left: 0;
  min-width: 240px;
  margin: 0;
  padding: 6px;
  list-style: none;
  background: var(--surface-2, var(--card-bg, #1b2335));
  border: 1px solid var(--border, #33405a);
  border-radius: 12px;
  box-shadow: 0 10px 28px rgb(0 0 0 / 0.45);
}

.menu button {
  display: block;
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  text-align: left;
  font: inherit;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
}

.menu button:hover,
.menu button:focus-visible {
  background: rgb(255 255 255 / 0.08);
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.menu .peligro {
  color: var(--danger);
}
</style>
