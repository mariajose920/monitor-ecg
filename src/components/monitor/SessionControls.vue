<script setup>
import { ref, onBeforeUnmount, computed } from 'vue'
import { useSessionStore } from '@/stores/session.js'
import { useChannelsStore } from '@/stores/channels.js'
import { useAlertsStore } from '@/stores/alerts.js'
import { notify } from '@/services/notifications/notifier.js'
import { formatDuracion } from '@/utils/time.js'

/** RF08/RF09: iniciar, detener y marcar eventos de la sesión de medición. */
const session = useSessionStore()
const channels = useChannelsStore()
const alerts = useAlertsStore()
const ahora = ref(Date.now())
const timer = setInterval(() => (ahora.value = Date.now()), 1000)
onBeforeUnmount(() => clearInterval(timer))

const duracion = computed(() => (session.activa ? formatDuracion(ahora.value - session.inicioMs) : '--:--'))
const ocupado = ref(false)

async function iniciar() {
  ocupado.value = true
  try {
    await session.iniciar(channels.channels)
    notify('Sesión de medición iniciada: grabando.', { tipo: 'ok' })
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
    notify('Sesión finalizada y guardada.', { tipo: 'ok' })
  } finally {
    ocupado.value = false
  }
}

function marcar() {
  session.addEvent(null, 'marca')
  notify('Marca registrada en la sesión.', { tipo: 'info', duracionMs: 2000 })
}
</script>

<template>
  <section class="card controles" aria-label="Control de la sesión de medición">
    <div class="row">
      <strong>Sesión:</strong>
      <span :class="['chip', session.activa ? 'ok' : 'neutral']">{{ session.activa ? '● Activa' : '○ Sin sesión' }}</span>
      <span class="mono" aria-label="Duración">{{ duracion }}</span>
      <span v-if="session.activa" class="muted small">{{ session.actual.participantes.filter((p) => !p.estadoFinal).length }} participante(s) grabando</span>
    </div>
    <div class="row">
      <button v-if="!session.activa" class="btn primary" :disabled="ocupado" @click="iniciar">Iniciar sesión de medición</button>
      <template v-else>
        <button class="btn" @click="marcar">Marcar evento</button>
        <button class="btn danger" :disabled="ocupado" @click="detener">Detener sesión</button>
      </template>
      <button class="btn ghost" :aria-pressed="alerts.silenciado" @click="alerts.toggleSilencio()">
        {{ alerts.silenciado ? '🔕 Sonido silenciado' : '🔔 Sonido de alertas' }}
      </button>
      <RouterLink v-if="!session.activa && session.ultima" :to="`/sesiones/${session.ultima.id}`" class="btn ghost">Ver última sesión</RouterLink>
    </div>
  </section>
</template>

<style scoped>
.controles {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: var(--gap);
}
</style>
