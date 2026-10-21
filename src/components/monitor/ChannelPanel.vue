<script setup>
import { computed, ref } from 'vue'
import EcgChart from './EcgChart.vue'
import ConnectionStatus from './ConnectionStatus.vue'
import BpmDisplay from './BpmDisplay.vue'
import RangeIndicator from './RangeIndicator.vue'
import ActivitySelector from './ActivitySelector.vue'
import LeadsOffAlert from './LeadsOffAlert.vue'
import SimulatorControls from './SimulatorControls.vue'
import ChannelActions from './ChannelActions.vue'
import QuickUserDialog from '@/components/users/QuickUserDialog.vue'
import { prefiereCamara } from '@/data/dispositivo.js'
import CameraWizard from '@/components/camera/CameraWizard.vue'
import { useChannelsStore, MENSAJE_PERFIL } from '@/stores/channels.js'
import { useUsersStore } from '@/stores/users.js'
import { useSettingsStore } from '@/stores/settings.js'
import { useSessionStore } from '@/stores/session.js'
import { SOURCE_KINDS } from '@/services/sources/sourceFactory.js'
import { DEVICE_PROFILES } from '@/data/deviceProfiles.js'
import { readSignalFile } from '@/services/export/csvImporter.js'
import { notify } from '@/services/notifications/notifier.js'
import { generarCaptura } from '@/services/report/snapshotService.js'
import CapturePreviewDialog from './CapturePreviewDialog.vue'
import AppIcon from '@/components/common/AppIcon.vue'

/**
 * Un canal (RF07): fuente, perfil y usuario propios; gráfico, BPM, rango y estado.
 * SEC-05: solo muestra el seudónimo del usuario (nunca edad, peso ni datos opcionales).
 * Soporta pausar/congelar la visualización y capturar imágenes PNG en cualquier momento.
 */
const props = defineProps({ canal: { type: Object, required: true }, enfocado: { type: Boolean, default: false } })
const emit = defineEmits(['conectar', 'enfocar'])

const channels = useChannelsStore()
const users = useUsersStore()
const settings = useSettingsStore()
const session = useSessionStore()
const cargandoCsv = ref(false)
const guiaCamara = ref(false)
const nuevoUsuario = ref(false)
const movil = prefiereCamara()
/** En el celular con cámara se ocultan fuente y perfil: el sensor externo va en un apartado secundario. */
const modoCamaraMovil = computed(() => movil && props.canal.fuente === 'camera')

const finalizando = ref(false)
const congelado = ref(false)
const capturaActual = ref(null)
const tomandoCaptura = ref(false)
const chartRef = ref(null)

function alternarPausa() {
  congelado.value = !congelado.value
  notify(
    congelado.value
      ? 'Visualización pausada (pantalla congelada).'
      : 'Visualización reanudada en tiempo real.',
    { tipo: 'info', duracionMs: 2500 },
  )
}

async function tomarCaptura() {
  tomandoCaptura.value = true
  try {
    const u = props.canal.usuarioId ? users.byId(props.canal.usuarioId)?.etiqueta : 'Participante'
    const datosVisibles = chartRef.value?.obtenerDatosVisibles?.()
    const res = await generarCaptura({
      canal: props.canal,
      usuarioEtiqueta: u,
      ventanaSeg: ventana.value,
      datosVisibles,
    })
    capturaActual.value = res
    if (session.activa) {
      session.addEvent(props.canal.id, 'captura', {
        bpm: props.canal.bpmCalculado,
        actividad: props.canal.actividad,
      })
    }
    notify('¡Captura de frecuencia cardíaca generada!', { tipo: 'ok' })
  } catch (err) {
    notify(err.message || 'No se pudo generar la captura.', { tipo: 'error' })
  } finally {
    tomandoCaptura.value = false
  }
}

/**
 * Finalizar: apaga la fuente y siempre explica qué pasó con el monitoreo.
 *  - Si hay una grabación en curso: la detiene y abre la ventana Guardar / Descartar / Decidir después.
 *  - Si quedó un borrador pendiente: vuelve a abrir esa ventana.
 *  - Si no se grabó nada (no había usuario): lo avisa.
 */
async function finalizar() {
  finalizando.value = true
  congelado.value = false
  try {
    if (session.activa && enSesion.value) {
      await session.detener()
    } else if (session.pendiente) {
      session.pedirGuardar()
    } else if (!props.canal.usuarioId) {
      notify('No se grabó nada porque no había un usuario elegido. Elige «¿Quién se mide?» antes de medir para poder guardar.', { tipo: 'aviso', duracionMs: 7000 })
    }
    await channels.disconnect(props.canal.id)
  } catch (e) {
    notify(e.message || 'No se pudo finalizar.', { tipo: 'error' })
  } finally {
    finalizando.value = false
  }
}

const idp = `canal-${props.canal.id}`
const activo = computed(() => ['connecting', 'streaming', 'leads-off', 'signal-lost'].includes(props.canal.estado))
const enSesion = computed(() => session.participa(props.canal.id))
const rango = computed(() => settings.rangoPara(props.canal.actividad))
const ventana = computed(() => settings.parametros.adquisicion.ventanaVisualSeg)
/** Alternativa textual del gráfico para lectores de pantalla (WCAG 1.1.1 y 1.4.1). */
const descripcionGrafico = computed(() => {
  const c = props.canal
  const partes = [c.bpmCalculado == null ? 'BPM sin dato válido' : `${c.bpmCalculado} BPM`]
  if (c.leadsOff) partes.push('electrodos desconectados')
  if (c.rango && c.rango !== 'sin-dato') partes.push(`${c.rango} del rango`)
  if (c.enAlerta) partes.push('en alerta')
  if (congelado.value) partes.push('pantalla pausada')
  return partes.join(', ')
})
const fuentes = SOURCE_KINDS.map((f) => ({ ...f, ok: f.soportado() }))
const perfiles = Object.values(DEVICE_PROFILES).filter((p) => p.id !== 'simulador' && p.id !== 'camara-movil')

const usuariosDisponibles = computed(() =>
  users.users.filter((u) => u.id === props.canal.usuarioId || !channels.channels.some((c) => c.usuarioId === u.id)),
)

function usuarioCreado(u) {
  nuevoUsuario.value = false
  try {
    channels.setUsuario(props.canal.id, u.id)
    users.selectUser(u.id)
  } catch (err) {
    notify(err.message, { tipo: 'error' })
  }
}

function cambiarUsuario(e) {
  if (e.target.value === '__nuevo__') {
    e.target.value = props.canal.usuarioId || ''
    nuevoUsuario.value = true
    return
  }
  try {
    channels.setUsuario(props.canal.id, e.target.value || null)
  } catch (err) {
    notify(err.message, { tipo: 'error' })
    e.target.value = props.canal.usuarioId || ''
  }
}

async function cargarCsv(e) {
  const file = e.target.files?.[0]
  if (!file) return
  cargandoCsv.value = true
  try {
    const d = await readSignalFile(file, { maxRaw: 2 ** DEVICE_PROFILES[props.canal.perfilId].adcBits - 1 })
    if (d.formato !== 'firmware') throw new Error('Para reproducir se necesita el formato t_ms,ecg_raw,leads_off,bpm')
    channels.setReplayData(props.canal.id, { t: d.t, v: d.v, leadsOff: d.leadsOff, bpm: d.bpm }, file.name.slice(0, 40))
    notify(`CSV cargado: ${d.filas} filas válidas, ${d.invalidas} descartadas.`, { tipo: 'ok' })
  } catch (err) {
    notify(err.message, { tipo: 'error' })
  } finally {
    cargandoCsv.value = false
    e.target.value = ''
  }
}

async function cargarEjemplo() {
  try {
    const r = await fetch('/referencias/ejemplo_referencia.csv')
    if (!r.ok) throw new Error('No se pudo cargar el ejemplo')
    const { parseSignalCsv } = await import('@/services/export/csvImporter.js')
    const d = parseSignalCsv(await r.text(), { maxRaw: 1023 })
    channels.setReplayData(props.canal.id, { t: d.t, v: d.v, leadsOff: d.leadsOff, bpm: d.bpm }, 'ejemplo_referencia.csv')
  } catch (err) {
    notify(err.message, { tipo: 'error' })
  }
}
</script>

<template>
  <article :class="['card', 'canal', { alerta: canal.enAlerta }]" :aria-labelledby="`${idp}-titulo`">
    <header class="cab">
      <h2 :id="`${idp}-titulo`">{{ canal.nombre }}</h2>
      <ConnectionStatus :estado="canal.estado" :en-sesion="enSesion" />
      <span class="usuario chip info" :title="'Participante asignado'">
        <AppIcon name="user" :size="13" />
        <span>{{ canal.usuarioId ? users.byId(canal.usuarioId)?.etiqueta : 'Sin paciente' }}</span>
      </span>
      <div class="acciones">
        <button class="btn small ghost" :aria-pressed="enfocado" @click="emit('enfocar')">{{ enfocado ? 'Ver todos' : 'Ampliar' }}</button>
        <button class="btn small ghost" :disabled="activo" title="Quitar canal" @click="channels.removeChannel(canal.id)">Quitar</button>
      </div>
    </header>

    <p v-if="canal.motivoFin" class="alert warn">Medición finalizada: {{ canal.motivoFin }}. Los datos capturados se guardaron.</p>
    <p v-if="canal.error" class="alert danger" role="alert">{{ canal.error }}</p>
    <p v-if="canal.avisoPerfil" class="alert danger" role="alert" data-testid="aviso-perfil">
      <strong>{{ MENSAJE_PERFIL }}.</strong> Los valores recibidos superan el rango del ADC del perfil actual.
      Desconecta, cambia el perfil a «ESP32 (USB)» (12 bits) y vuelve a conectar.
    </p>
    <p v-if="canal.avisoDatos && !canal.avisoPerfil" class="alert warn">Datos del sensor no válidos (más del 5 %). ¿Puerto o baudios correctos?</p>

    <div v-if="!activo" class="config grid cols-2">
      <div v-if="!modoCamaraMovil" class="field">
        <label :for="`${idp}-fuente`">Fuente</label>
        <select :id="`${idp}-fuente`" :value="canal.fuente" @change="channels.configurar(canal.id, 'fuente', $event.target.value)">
          <option v-for="f in fuentes" :key="f.id" :value="f.id" :disabled="!f.ok">{{ f.nombre }}{{ f.ok ? '' : ' (no soportado)' }}</option>
        </select>
      </div>
      <div v-if="canal.fuente !== 'simulator' && canal.fuente !== 'camera'" class="field">
        <label :for="`${idp}-perfil`">Perfil de dispositivo</label>
        <select :id="`${idp}-perfil`" :value="canal.perfilId" @change="channels.configurar(canal.id, 'perfilId', $event.target.value)">
          <option v-for="p in perfiles" :key="p.id" :value="p.id">{{ p.nombre }} ({{ p.adcBits }} bits)</option>
        </select>
      </div>
      <div class="field">
        <label :for="`${idp}-usuario`">Participante</label>
        <select :id="`${idp}-usuario`" :value="canal.usuarioId || ''" :disabled="enSesion" @change="cambiarUsuario">
          <option value="">— Sin asignar —</option>
          <option v-for="u in usuariosDisponibles" :key="u.id" :value="u.id">{{ u.etiqueta }}</option>
          <option value="__nuevo__">+ Nuevo usuario</option>
        </select>
        <p v-if="!users.users.length" class="hint">
          No hay usuarios: elige «+ Nuevo usuario».
        </p>
      </div>
      <div v-if="canal.fuente === 'replay'" class="field">
        <label :for="`${idp}-csv`">CSV a reproducir (máx. 5 MB)</label>
        <input :id="`${idp}-csv`" type="file" accept=".csv,text/csv" :disabled="cargandoCsv" @change="cargarCsv">
        <p class="hint">
          {{ canal.replayNombre ? `Cargado: ${canal.replayNombre}` : 'Ningún archivo cargado.' }}
          <button class="btn small ghost" type="button" @click="cargarEjemplo">Usar CSV de ejemplo</button>
        </p>
      </div>
    </div>

    <details v-if="!activo && modoCamaraMovil" class="externo">
      <summary>Usar sensor externo (solo PC)</summary>
      <p class="muted small">Puerto serie (USB/HC-05) y reproducción de CSV requieren Chrome o Edge de escritorio.</p>
      <label :for="`${idp}-fuente-ext`">Fuente</label>
      <select :id="`${idp}-fuente-ext`" :value="canal.fuente" @change="channels.configurar(canal.id, 'fuente', $event.target.value)">
        <option v-for="f in fuentes" :key="f.id" :value="f.id" :disabled="!f.ok">{{ f.nombre }}{{ f.ok ? '' : ' (no soportado)' }}</option>
      </select>
    </details>

    <div class="row botones">
      <button v-if="!activo && canal.fuente === 'camera'" class="btn primary" data-testid="camara-guia" @click="guiaCamara = true">Medir con la cámara</button>
      <button v-else-if="!activo" class="btn cardio" @click="emit('conectar', canal)">
        {{ canal.fuente === 'serial' ? 'Conectar puerto serie' : 'Iniciar fuente' }}
      </button>
      <template v-else>
        <button v-if="session.pendiente" class="btn primary" type="button" data-testid="canal-guardar" @click="session.pedirGuardar()">
          <AppIcon name="save" :size="16" />
          <span>Guardar monitoreo</span>
        </button>
        <button
          class="btn secondary"
          type="button"
          :title="congelado ? 'Reanudar gráfica en tiempo real' : 'Pausar/congelar gráfica en pantalla'"
          @click="alternarPausa"
        >
          <AppIcon :name="congelado ? 'play' : 'pause'" :size="16" />
          <span>{{ congelado ? 'Reanudar' : 'Pausar' }}</span>
        </button>
        <button
          class="btn secondary"
          type="button"
          :disabled="tomandoCaptura"
          title="Tomar captura de la señal y frecuencia cardíaca actual"
          @click="tomarCaptura"
        >
          <AppIcon name="camera" :size="16" />
          <span>{{ tomandoCaptura ? 'Generando...' : 'Capturar' }}</span>
        </button>
        <ChannelActions :canal="canal" :congelado="congelado" @capturar="tomarCaptura" @alternar-pausa="alternarPausa" />
        <button class="btn danger" type="button" :disabled="finalizando" data-testid="canal-finalizar" @click="finalizar">Finalizar</button>
      </template>
    </div>

    <template v-if="activo">
      <LeadsOffAlert v-if="canal.leadsOff" />

      <EcgChart
        ref="chartRef"
        :channel-id="canal.id"
        :window-sec="ventana"
        :descripcion="descripcionGrafico"
        :congelado="congelado"
      />
      <div class="metricas">
        <BpmDisplay :calculado="canal.bpmCalculado" :dispositivo="canal.bpmDispositivo" :mostrar-dispositivo="canal.fuente !== 'simulator'" />
        <RangeIndicator :estado="canal.rango" :rango="rango" :en-alerta="canal.enAlerta" />
        <ActivitySelector :id="`${idp}-act`" :model-value="canal.actividad" @update:model-value="channels.setActividad(canal.id, $event)" />
        <div class="muted small calidad">
          {{ canal.muestrasSeg }} muestras/s · {{ canal.descartadas }} líneas descartadas
        </div>
      </div>
    </template>

    <QuickUserDialog v-if="nuevoUsuario" @creado="usuarioCreado" @cerrar="nuevoUsuario = false" />
    <CameraWizard v-if="guiaCamara" :canal="canal" @cerrar="guiaCamara = false" />
    <SimulatorControls v-if="canal.fuente === 'simulator'" :canal="canal" :conectado="activo" />
    <CapturePreviewDialog v-if="capturaActual" :captura="capturaActual" @cerrar="capturaActual = null" />
  </article>
</template>

<style scoped>
.canal {
  border-radius: var(--radius);
  padding: 24px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.canal.alerta {
  border-color: var(--danger);
  box-shadow: 0 0 0 2px var(--danger);
}

.cab {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.cab h2 {
  margin: 0;
}

.acciones {
  margin-left: auto;
  display: flex;
  gap: 4px;
}

.botones {
  margin-bottom: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.metricas {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr;
  align-items: end;
  margin-top: 8px;
}

@media (min-width: 600px) {
  .metricas {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.calidad {
  align-self: center;
}
</style>
