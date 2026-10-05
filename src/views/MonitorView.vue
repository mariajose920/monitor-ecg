<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import SafetyBanner from '@/components/layout/SafetyBanner.vue'
import CapabilityNotice from '@/components/common/CapabilityNotice.vue'
import DataClassBadge from '@/components/common/DataClassBadge.vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import SessionControls from '@/components/monitor/SessionControls.vue'
import ChannelGrid from '@/components/monitor/ChannelGrid.vue'
import { useChannelsStore } from '@/stores/channels.js'
import { useUsersStore } from '@/stores/users.js'
import { useSessionStore } from '@/stores/session.js'
import { MAX_CHANNELS } from '@/data/defaultSettings.js'
import { notify } from '@/services/notifications/notifier.js'

const channels = useChannelsStore()
const users = useUsersStore()
const session = useSessionStore()
const pendiente = ref(null)
const confirmado = ref(false)
const SAFETY_KEY = 'ecg.safetyAck'

onMounted(() => {
  if (!channels.channels.length) {
    const id = channels.addChannel()
    if (users.activeUserId) {
      try {
        channels.setUsuario(id, users.activeUserId)
      } catch {
        /* ya asignado en otro canal */
      }
    }
  }
})

function agregar() {
  try {
    channels.addChannel()
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  }
}

/** SEC-21 / I6: confirmación de seguridad eléctrica (una vez por sesión del navegador) antes de Web Serial. */
function conectar(canal) {
  if (canal.fuente === 'serial' && sessionStorage.getItem(SAFETY_KEY) !== '1') {
    pendiente.value = canal
    confirmado.value = false
    return
  }
  channels.connect(canal.id)
}

function aceptarSeguridad() {
  sessionStorage.setItem(SAFETY_KEY, '1')
  const c = pendiente.value
  pendiente.value = null
  // El clic en "Conectar" es el gesto de usuario que exige requestPort() (SEC-35).
  if (c) channels.connect(c.id)
}

// useConfirmLeave: evita perder una sesión activa al navegar o cerrar.
onBeforeRouteLeave(() => {
  if (session.activa) return window.confirm('Hay una sesión de medición activa. Si sales, seguirá grabando en segundo plano. ¿Salir de todos modos?')
  return true
})

function beforeUnload(e) {
  if (session.activa) {
    e.preventDefault()
    e.returnValue = ''
  }
}
window.addEventListener('beforeunload', beforeUnload)
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
</script>

<template>
  <section>
    <div class="page-header">
      <h1>Monitor en tiempo real</h1>
      <DataClassBadge level="sensitive" texto="Datos de salud" />
    </div>
    <SafetyBanner />
    <CapabilityNotice />
    <p class="muted">
      Flujo: <RouterLink to="/usuarios">elige o crea participantes</RouterLink> → configura cada canal (fuente + participante) →
      conecta → <strong>inicia la sesión</strong> para grabar. La vista previa en vivo no se guarda.
    </p>

    <SessionControls />

    <div class="row barra">
      <button class="btn" :disabled="!channels.puedeAgregar" @click="agregar">+ Agregar canal</button>
      <span class="muted small">{{ channels.channels.length }}/{{ MAX_CHANNELS }} canales · {{ channels.conectados }} conectado(s)</span>
    </div>

    <ChannelGrid @conectar="conectar" />

    <BaseDialog v-if="pendiente" titulo="Antes de conectar el sensor" @cerrar="pendiente = null">
      <SafetyBanner />
      <p>
        Confirma que el Arduino/ESP32 está alimentado por <strong>batería</strong> o conectado mediante un
        <strong>módulo Bluetooth aislado</strong> si los electrodos están puestos, o que el computador está desenchufado de la red.
      </p>
      <label class="check">
        <input v-model="confirmado" type="checkbox">
        Entiendo el riesgo y la conexión es segura.
      </label>
      <template #acciones>
        <button class="btn ghost" @click="pendiente = null">Cancelar</button>
        <button class="btn primary" :disabled="!confirmado" @click="aceptarSeguridad">Conectar</button>
      </template>
    </BaseDialog>
  </section>
</template>

<style scoped>
.barra {
  margin-bottom: var(--gap);
}
</style>
