<script setup>
import { ref, onMounted, shallowRef, markRaw, computed } from 'vue'
import SignalChart from '@/components/common/SignalChart.vue'
import SaveMonitoringDialog from './SaveMonitoringDialog.vue'
import { getSession } from '@/services/storage/sessionRepository.js'
import { cargarYAnalizar, datosGrafico } from '@/services/monitoreos/senal.js'
import { useMonitoreosStore } from '@/stores/monitoreos.js'
import { useUsersStore } from '@/stores/users.js'
import { notify } from '@/services/notifications/notifier.js'
import { formatDuracion } from '@/utils/time.js'

/** Vista previa del monitoreo detenido que aún no se guardó (borrador) con "Guardar" y "Descartar". */
const props = defineProps({ id: { type: String, required: true } })
const emit = defineEmits(['resuelto'])
const monitoreos = useMonitoreosStore()
const users = useUsersStore()
const sesion = ref(null)
const grafico = shallowRef(null)
const abierto = ref(false)
const ocupado = ref(false)

const part = computed(() => sesion.value?.participantes?.[0] ?? null)
const resumen = computed(() => part.value?.resumen ?? null)
const series = [{ label: 'Señal (cuentas ADC)', color: '--signal' }]

onMounted(async () => {
  sesion.value = await getSession(props.id)
  if (!sesion.value) return
  try {
    const { sig, analisis } = await cargarYAnalizar(sesion.value, part.value)
    grafico.value = markRaw(datosGrafico(sig, analisis))
  } catch {
    grafico.value = null
  }
  abierto.value = true
})

defineExpose({ abrir: () => (abierto.value = true) })

async function guardar(valores) {
  ocupado.value = true
  try {
    await monitoreos.guardar(props.id, valores)
    abierto.value = false
    notify('Monitoreo guardado. Ya puedes verlo, compararlo y aprender con él.', { tipo: 'ok', enlace: { to: `/monitoreos/${props.id}`, texto: 'Ver monitoreo' } })
    emit('resuelto')
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  } finally {
    ocupado.value = false
  }
}

async function descartar() {
  ocupado.value = true
  try {
    await monitoreos.descartar(props.id)
    abierto.value = false
    notify('Monitoreo descartado.', { tipo: 'info' })
    emit('resuelto')
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  } finally {
    ocupado.value = false
  }
}
</script>

<template>
  <section v-if="sesion" class="card pendiente" aria-labelledby="pend-titulo" data-testid="monitoreo-pendiente">
    <h2 id="pend-titulo">Vista previa: monitoreo sin guardar</h2>
    <p class="muted">
      Este monitoreo es un <strong>borrador</strong>: solo existe en este navegador (cifrado) y no aparece en Comparar ni en Aprende hasta que lo guardes.
    </p>
    <p v-if="resumen" class="small">
      {{ users.byId(part.usuarioId)?.etiqueta ?? 'Usuario' }} · duración <strong class="mono">{{ formatDuracion(resumen.duracionMs) }}</strong>
      · BPM medio <strong class="mono">{{ resumen.bpmMedio ?? '--' }}</strong> ({{ resumen.bpmMin ?? '--' }}–{{ resumen.bpmMax ?? '--' }})
      · {{ resumen.muestras }} muestras
    </p>
    <SignalChart v-if="grafico" :data="grafico.data" :series="series" :marcas="grafico.marcas" :height="220" y-label="ADC" />
    <div class="row acciones">
      <button class="btn primary" data-testid="abrir-guardar" @click="abierto = true">Guardar monitoreo</button>
      <button class="btn danger" @click="abierto = true">Descartar…</button>
    </div>
    <SaveMonitoringDialog v-if="abierto" :sesion="sesion" :ocupado="ocupado" @guardar="guardar" @descartar="descartar" @cerrar="abierto = false" />
  </section>
</template>

<style scoped>
.pendiente {
  border-color: var(--warn);
  margin-bottom: var(--gap);
}

.acciones {
  margin-top: 8px;
}
</style>
