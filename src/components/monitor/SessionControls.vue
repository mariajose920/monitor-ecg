<script setup>
import { ref, onBeforeUnmount, computed } from 'vue'
import { useSessionStore } from '@/stores/session.js'
import { useChannelsStore } from '@/stores/channels.js'
import { useAlertsStore } from '@/stores/alerts.js'
import { notify } from '@/services/notifications/notifier.js'
import { formatDuracion } from '@/utils/time.js'
import AppIcon from '@/components/common/AppIcon.vue'

/** Flujo: elegir usuario → conectar fuente → iniciar → detener → guardar (RF08/RF09). */
const session = useSessionStore()
const channels = useChannelsStore()
const alerts = useAlertsStore()
const ahora = ref(Date.now())
const timer = setInterval(() => (ahora.value = Date.now()), 1000)
onBeforeUnmount(() => clearInterval(timer))

const emit = defineEmits(['guardar'])

const duracion = computed(() => (session.activa ? formatDuracion(ahora.value - session.inicioMs) : '--:--'))
const ocupado = ref(false)

const pasos = computed(() => {
  const hayUsuario = channels.channels.some((c) => c.usuarioId)
  const hayFuente = channels.conectados > 0
  const pend = !!session.pendiente
  return [
    { n: 1, texto: 'Elegir usuario', hecho: hayUsuario || session.activa || pend },
    { n: 2, texto: 'Conectar fuente', hecho: hayFuente || session.activa || pend },
    { n: 3, texto: 'Iniciar', hecho: session.activa || pend },
    { n: 4, texto: 'Detener', hecho: pend },
    { n: 5, texto: 'Guardar', hecho: false },
  ]
})
const actual = computed(() => (pasos.value.find((p) => !p.hecho)?.n ?? 5))
const puedeIniciar = computed(() => !session.activa && !session.pendiente)

async function iniciar() {
  ocupado.value = true
  try {
    await session.iniciar(channels.channels)
    notify('Monitoreo iniciado: grabando.', { tipo: 'ok' })
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  } finally {
    ocupado.value = false
  }
}

async function detener() {
  ocupado.value = true
  try {
    await session.detener()
    notify('Monitoreo detenido. Guárdalo o descártalo.', { tipo: 'info' })
  } finally {
    ocupado.value = false
  }
}

function marcar() {
  session.addEvent(null, 'marca')
  notify('Marca registrada en el monitoreo.', { tipo: 'info', duracionMs: 2000 })
}
</script>

<template>
  <section class="card controles" aria-label="Control del monitoreo">
    <ol class="pasos" aria-label="Pasos del monitoreo">
      <li v-for="p in pasos" :key="p.n" :class="{ hecho: p.hecho, actual: actual === p.n }" :aria-current="actual === p.n ? 'step' : undefined">
        <span class="num" aria-hidden="true">{{ p.hecho ? '✓' : p.n }}</span>
        <span>{{ p.texto }}<span v-if="p.hecho" class="sr-only"> (hecho)</span></span>
      </li>
    </ol>

    <div class="row">
      <strong>Monitoreo:</strong>
      <span :class="['chip', session.activa ? 'danger' : session.pendiente ? 'warn' : 'neutral']" role="status">
        {{ session.activa ? '● Grabando' : session.pendiente ? '◐ Sin guardar' : '○ Sin monitoreo' }}
      </span>
      <span class="mono" aria-label="Duración">{{ duracion }}</span>
      <span v-if="session.activa" class="muted small">{{ session.actual.participantes.filter((p) => !p.estadoFinal).length }} participante(s) grabando</span>
    </div>
    <div class="row">
      <button v-if="puedeIniciar" class="btn primary" :disabled="ocupado" data-testid="iniciar-monitoreo" @click="iniciar">Iniciar monitoreo</button>
      <template v-else-if="session.activa">
        <button class="btn" @click="marcar">Marcar evento</button>
        <button class="btn danger" :disabled="ocupado" data-testid="detener-monitoreo" @click="detener">Detener monitoreo</button>
      </template>
      <button v-if="session.pendiente" class="btn primary" data-testid="guardar-monitoreo" @click="emit('guardar')">Guardar monitoreo</button>
      <button class="btn ghost" :aria-pressed="alerts.silenciado" @click="alerts.toggleSilencio()">
        <AppIcon :name="alerts.silenciado ? 'bell-off' : 'bell'" :size="16" />
        <span>{{ alerts.silenciado ? 'Sonido silenciado' : 'Sonido de alertas' }}</span>
      </button>
    </div>
    <p v-if="session.pendiente" class="muted small">Guarda o descarta el monitoreo anterior para poder iniciar otro.</p>
    <p v-else-if="!session.activa" class="muted small">La vista en vivo no se graba hasta que pulses «Iniciar monitoreo».</p>
  </section>
</template>

<style scoped>
.controles {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: var(--gap);
}

.pasos {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin: 0;
  padding: 0;
}

.pasos li {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-weight: 600;
  font-size: 0.92rem;
}

.pasos li.hecho {
  color: #0284c7;
}

.pasos li.actual {
  color: var(--text);
  font-weight: 700;
}

.num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid currentColor;
  font-size: 0.8rem;
  transition: all 0.2s ease;
}

.pasos li.hecho .num {
  background: #f0f9ff;
  border-color: #0284c7;
  color: #0284c7;
  font-weight: 800;
}

.pasos li.actual .num {
  background: var(--accent);
  color: var(--accent-contrast);
  border-color: var(--accent);
  font-weight: 800;
}
</style>
