<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import SafetyBanner from '@/components/layout/SafetyBanner.vue'
import CapabilityNotice from '@/components/common/CapabilityNotice.vue'
import DataClassBadge from '@/components/common/DataClassBadge.vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import SessionControls from '@/components/monitor/SessionControls.vue'
import PendingMonitoringPanel from '@/components/monitoreos/PendingMonitoringPanel.vue'
import QuickUserDialog from '@/components/users/QuickUserDialog.vue'
import { getPref, setPref } from '@/utils/prefs.js'
import ChannelGrid from '@/components/monitor/ChannelGrid.vue'
import { useChannelsStore } from '@/stores/channels.js'
import { useUsersStore } from '@/stores/users.js'
import { useSessionStore } from '@/stores/session.js'
import { MAX_CHANNELS } from '@/data/defaultSettings.js'
import { notify } from '@/services/notifications/notifier.js'
import { audit } from '@/services/audit/auditService.js'

const channels = useChannelsStore()
const users = useUsersStore()
const session = useSessionStore()
const pendiente = ref(null)
const panel = ref(null)
const confirmado = ref(false)
const SAFETY_KEY = 'ecg.safetyAck'
const nuevoUsuario = ref(false)

/** Asigna el usuario al primer canal libre (fuera de una sesión) y lo recuerda como último elegido. */
function elegirUsuario(id) {
  if (!id) {
    users.clearActive()
    return
  }
  users.selectUser(id)
  setPref('ultimoUsuario', id)
  if (channels.channels.some((c) => c.usuarioId === id)) return
  const libre = channels.channels.find((c) => !session.participa(c.id))
  if (!libre) return
  try {
    channels.setUsuario(libre.id, id)
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  }
}

function alCambiarSelector(e) {
  if (e.target.value === '__nuevo__') {
    e.target.value = users.activeUserId || ''
    nuevoUsuario.value = true
  } else elegirUsuario(e.target.value)
}

function usuarioCreado(u) {
  nuevoUsuario.value = false
  elegirUsuario(u.id)
}

onMounted(async () => {
  await users.ensureLoaded()
  if (!users.activeUserId) {
    const ultimo = getPref('ultimoUsuario', null)
    if (ultimo && users.byId(ultimo)) users.selectUser(ultimo)
  }
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

/**
 * La grabación empieza sola: en cuanto hay una fuente recibiendo datos y un usuario asignado.
 * Así "Finalizar" siempre ofrece guardar, descartar o decidir después. Si hay un borrador sin resolver
 * no se inicia otro (primero se guarda o se descarta).
 */
const listoParaGrabar = computed(() => channels.channels.some((c) => c.usuarioId && (c.estado === 'streaming' || c.estado === 'leads-off')))
watch(listoParaGrabar, async (listo) => {
  if (!listo || session.activa || session.pendiente) return
  try {
    await session.iniciar(channels.channels)
    notify('Grabando automáticamente. Presiona Finalizar para guardar o descartar.', { tipo: 'ok', duracionMs: 4000 })
  } catch {
    /* aún no hay datos suficientes: se reintenta cuando cambie el estado */
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
  if (!confirmado.value) return
  sessionStorage.setItem(SAFETY_KEY, '1')
  const c = pendiente.value
  pendiente.value = null
  // SUG-09: el acuse queda en la auditoría (sin datos de salud).
  const actor = users.activeUser ? `participant:${users.activeUser.etiqueta}` : 'system'
  audit('ELECTRICAL_SAFETY_ACK', actor, { canal: c?.id ?? null, version: 'v1' })
  // El clic en "Conectar" es el gesto de usuario que exige requestPort() (SEC-35).
  if (c) channels.connect(c.id)
}

// useConfirmLeave: evita perder una sesión activa al navegar o cerrar.
onBeforeRouteLeave(() => {
  if (session.activa) return window.confirm('Hay un monitoreo activo. Si sales, seguirá grabando en segundo plano. ¿Salir de todos modos?')
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
      <h1>Monitor</h1>
      <DataClassBadge level="sensitive" texto="Datos de salud" />
    </div>
    <SafetyBanner />
    <CapabilityNotice />
    <p class="muted">
      Aquí solo se mide. Usuarios, historial y comparaciones están en <RouterLink to="/usuarios">Usuarios</RouterLink> y
      <RouterLink to="/monitoreos">Monitoreos</RouterLink>.
    </p>

    <section class="card quien" aria-label="Usuario que se mide">
      <div class="field">
        <label for="quien-se-mide">¿Quién se mide?</label>
        <select id="quien-se-mide" :value="users.activeUserId || ''" :disabled="session.activa" data-testid="quien-se-mide" @change="alCambiarSelector">
          <option value="">— Elige un usuario —</option>
          <option v-for="u in users.users" :key="u.id" :value="u.id">{{ u.etiqueta }}{{ u.alias ? ' · ' + u.alias : '' }}</option>
          <option value="__nuevo__">+ Nuevo usuario</option>
        </select>
        <p class="hint">Puedes conectar la fuente y ver la señal sin usuario; para iniciar y guardar un monitoreo necesitas uno.</p>
      </div>
    </section>

    <SessionControls @guardar="panel?.abrir()" />
    <PendingMonitoringPanel v-if="session.pendiente" :id="session.pendiente.id" :key="session.pendiente.id" ref="panel" />

    <div class="row barra">
      <button class="btn" :disabled="!channels.puedeAgregar" @click="agregar">+ Agregar canal</button>
      <span class="muted small">{{ channels.channels.length }}/{{ MAX_CHANNELS }} canales · {{ channels.conectados }} conectado(s)</span>
    </div>

    <ChannelGrid @conectar="conectar" />

    <QuickUserDialog v-if="nuevoUsuario" @creado="usuarioCreado" @cerrar="nuevoUsuario = false" />

    <BaseDialog v-if="pendiente" titulo="Antes de conectar el sensor" @cerrar="pendiente = null">
      <SafetyBanner />
      <p>
        Confirma que el Arduino/ESP32 está alimentado por <strong>batería</strong> o conectado mediante un
        <strong>módulo Bluetooth aislado</strong> si los electrodos están puestos, o que el computador está desenchufado de la red.
      </p>
      <ul class="small">
        <li>Usa un portátil a batería: <strong>nunca</strong> con el cargador enchufado mientras los electrodos están puestos.</li>
        <li>No lo uses en personas con marcapasos u otro implante electrónico.</li>
        <li>Este acuse se registra en la auditoría (sin datos de salud).</li>
      </ul>
      <label class="check">
        <input v-model="confirmado" type="checkbox" data-testid="safety-ack">
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
.quien {
  margin-bottom: var(--gap);
}

.barra {
  margin-bottom: var(--gap);
}
</style>
