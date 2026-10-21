<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useSessionStore } from '@/stores/session.js'
import { useExportMonitoreos } from '@/composables/useExportMonitoreos.js'
import { getSession } from '@/services/storage/sessionRepository.js'
import { notify } from '@/services/notifications/notifier.js'

/**
 * Menú de acciones del monitoreo dentro del canal: iniciar, marcar, captura, pausar,
 * guardar, descargar, descartar y finalizar. Los datos siguen seudonimizados (SEC-43).
 */
defineProps({
  canal: { type: Object, required: true },
  congelado: { type: Boolean, default: false },
})

const emit = defineEmits(['capturar', 'alternarPausa'])

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
  document.addEventListener('pointerdown', fueraClick)
  document.addEventListener('keydown', teclas)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', fueraClick)
  document.removeEventListener('keydown', teclas)
})

function marcar() {
  cerrar()
  session.addEvent(session.actual?.canales?.[0] || 'canal', 'nota', { texto: 'Marca manual' })
  notify('Evento marcado.', { tipo: 'info' })
}

function guardar() {
  cerrar()
  session.pedirGuardar()
}

async function descargar() {
  cerrar()
  if (!session.pendiente) return
  ocupado.value = true
  try {
    const s = await getSession(session.pendiente.id)
    if (s) await exportar.exportarCSV([s])
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  } finally {
    ocupado.value = false
  }
}
</script>

<template>
  <div v-if="hayAcciones" ref="raiz" class="acciones">
    <button
      ref="boton"
      class="btn small ghost btn-acciones"
      type="button"
      :aria-expanded="abierto"
      aria-haspopup="menu"
      data-testid="boton-acciones-monitoreo"
      @click="alternar"
    >
      <AppIcon name="sliders" :size="14" />
      <span>Acciones</span>
    </button>
    <ul v-if="abierto" class="menu" role="menu" aria-label="Acciones del monitoreo">
      <template v-if="session.activa">
        <li role="none">
          <button role="menuitem" type="button" @click="cerrar(); emit('capturar')">
            <AppIcon name="camera" :size="14" />
            <span>Tomar captura (PNG)</span>
          </button>
        </li>
        <li role="none">
          <button role="menuitem" type="button" @click="cerrar(); emit('alternarPausa')">
            <AppIcon :name="congelado ? 'play' : 'pause'" :size="14" />
            <span>{{ congelado ? 'Reanudar visualización' : 'Pausar / congelar' }}</span>
          </button>
        </li>
        <li role="none">
          <button role="menuitem" type="button" @click="marcar">
            <AppIcon name="flag" :size="14" />
            <span>Marcar evento</span>
          </button>
        </li>
      </template>
      <template v-if="hayPendiente">
        <li role="none">
          <button role="menuitem" type="button" data-testid="accion-guardar" @click="guardar">
            <AppIcon name="save" :size="14" />
            <span>Guardar monitoreo</span>
          </button>
        </li>
        <li role="none">
          <button role="menuitem" type="button" data-testid="accion-descargar" @click="descargar">
            <AppIcon name="download" :size="14" />
            <span>Descargar CSV</span>
          </button>
        </li>
      </template>
    </ul>
  </div>
</template>

<style scoped>
.acciones {
  position: relative;
  display: inline-block;
}

.btn-acciones {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  z-index: 30;
  min-width: 210px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px;
  margin: 0;
  list-style: none;
  box-shadow: var(--shadow);
}

.menu button {
  width: 100%;
  text-align: left;
  background: none;
  border: 0;
  color: var(--text);
  font: inherit;
  font-size: 0.88rem;
  padding: 8px 12px;
  border-radius: calc(var(--radius-sm) - 2px);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.menu button:hover,
.menu button:focus-visible {
  background: var(--bg-elev-2);
}
</style>
