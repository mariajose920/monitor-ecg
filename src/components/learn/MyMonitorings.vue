<script setup>
import { ref, computed, onMounted, shallowRef, markRaw, watch } from 'vue'
import { useRoute } from 'vue-router'
import SignalChart from '@/components/common/SignalChart.vue'
import MonitoreoPicker from '@/components/compare/MonitoreoPicker.vue'
import ExportWarningDialog from '@/components/common/ExportWarningDialog.vue'
import { useMonitoreosStore } from '@/stores/monitoreos.js'
import { useSettingsStore } from '@/stores/settings.js'
import { useExportMonitoreos } from '@/composables/useExportMonitoreos.js'
import { cargarYAnalizar, datosGrafico } from '@/services/monitoreos/senal.js'
import { explicarMonitoreo } from '@/services/monitoreos/analysis.js'
import { participantesVisibles, actividadPrincipal } from '@/services/monitoreos/catalog.js'
import { notify } from '@/services/notifications/notifier.js'

/** Aprende → Mis monitoreos: lectura guiada de un monitoreo guardado (picos, RR, BPM, actividad y calidad PPG). */
const route = useRoute()
const monitoreos = useMonitoreosStore()
const settings = useSettingsStore()
const exportador = useExportMonitoreos()

const sesionId = ref('')
const canal = ref('')
const cargando = ref(false)
const error = ref('')
const vista = shallowRef(null)
const exportando = ref(null)
const ocupado = ref(false)

const lista = computed(() => monitoreos.utilizables)
const sesion = computed(() => lista.value.find((s) => s.id === sesionId.value) ?? null)
const partes = computed(() => (sesion.value ? participantesVisibles(sesion.value, monitoreos.ctx) : []))
const series = [{ label: 'Señal (cuentas ADC)', color: '--signal' }]
const seriesRr = [{ label: 'Intervalo RR (ms)', color: '--signal-ref' }]

onMounted(async () => {
  await monitoreos.refrescar().catch(() => {})
  const q = String(route.query.id ?? '')
  const s = lista.value.find((x) => x.id === q)
  if (s) {
    sesionId.value = q
    canal.value = participantesVisibles(s, monitoreos.ctx)[0]?.canalIndex ?? ''
  }
})

watch([sesionId, canal], () => analizar())

async function analizar() {
  vista.value = null
  error.value = ''
  const p = partes.value.find((x) => x.canalIndex === Number(canal.value))
  if (!sesion.value || !p || canal.value === '') return
  cargando.value = true
  try {
    const { sig, analisis } = await cargarYAnalizar(sesion.value, p)
    const g = datosGrafico(sig, analisis)
    const rrX = new Float64Array(Math.max(0, analisis.picos.length - 1))
    const rrY = []
    for (let k = 1; k < analisis.picos.length; k++) {
      rrX[k - 1] = analisis.picos[k].tS
      const d = (analisis.picos[k].tS - analisis.picos[k - 1].tS) * 1000
      rrY.push(d >= 273 && d <= 2000 ? Math.round(d) : null)
    }
    const act = actividadPrincipal(sesion.value, [p])
    const rango = act && settings.parametros.bpm.usarPorActividad ? settings.rangoPara(act) : settings.parametros.bpm.global
    vista.value = markRaw({
      ...g,
      analisis,
      rr: [rrX, rrY],
      participante: p,
      explicaciones: explicarMonitoreo(analisis, { actividad: act, rango }),
    })
  } catch (e) {
    error.value = `No se pudo analizar el monitoreo: ${e.message}`
  } finally {
    cargando.value = false
  }
}

async function descargar() {
  const { formato } = exportando.value
  ocupado.value = true
  try {
    await exportador.informe(sesion.value, vista.value.participante, { formato })
    exportando.value = null
  } catch (e) {
    notify(`No se pudo generar el informe: ${e.message}`, { tipo: 'error' })
  } finally {
    ocupado.value = false
  }
}

const f = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '--' : Math.round(v))
</script>

<template>
  <article class="card mis">
    <h2>Mis monitoreos <span class="chip neutral">Aprende con tus datos</span></h2>
    <p class="muted">Elige un monitoreo guardado y recórrelo paso a paso: dónde están los latidos, cómo se obtiene el BPM, cómo influye la actividad y qué tan buena fue la señal del sensor.</p>

    <MonitoreoPicker id-base="aprende" titulo="Elegir medición para la guía" :lista="lista" :ctx="monitoreos.ctx" v-model:sesion-id="sesionId" v-model:canal="canal" />

    <p v-if="cargando" class="muted" role="status">Analizando…</p>
    <p v-if="error" class="alert danger" role="alert">{{ error }}</p>

    <template v-if="vista">
      <h3>1. La señal y sus latidos</h3>
      <p class="muted small">Los puntos rojos son los picos detectados en un tramo de hasta 30 s sin pérdidas de contacto.</p>
      <SignalChart :data="vista.data" :series="series" :marcas="vista.marcas" :height="260" y-label="ADC" />

      <h3>2. Los números</h3>
      <div class="grid cols-3 kpis" aria-live="polite">
        <div class="card"><span class="muted small">Picos detectados</span><strong class="mono" data-testid="kpi-picos">{{ vista.analisis.picos.length }}</strong></div>
        <div class="card"><span class="muted small">BPM (mediana; mín.–máx.)</span><strong class="mono">{{ f(vista.analisis.bpm.medio) }} ({{ f(vista.analisis.bpm.min) }}–{{ f(vista.analisis.bpm.max) }})</strong></div>
        <div class="card"><span class="muted small">RR medio · SDNN</span><strong class="mono">{{ f(vista.analisis.rrStats.medioMs) }} ms · {{ f(vista.analisis.rrStats.sdnnMs) }} ms</strong></div>
        <div class="card"><span class="muted small">Calidad de la señal</span><strong>{{ vista.analisis.calidad.nivel }} ({{ vista.analisis.calidad.puntaje }}/100)</strong></div>
      </div>

      <template v-if="vista.rr[0].length > 1">
        <h3>3. Intervalos RR en el tiempo</h3>
        <p class="muted small">Cada punto es el tiempo entre dos latidos. Si la línea sube, el corazón va más lento; si baja, más rápido.</p>
        <SignalChart :data="vista.rr" :series="seriesRr" :height="200" y-label="ms" />
      </template>

      <h3>4. Qué significa cada cosa</h3>
      <section v-for="e in vista.explicaciones" :key="e.id" class="exp" :data-testid="`exp-${e.id}`">
        <h4>{{ e.titulo }}</h4>
        <p>{{ e.texto }}</p>
      </section>

      <p class="alert warn small">Esto es educativo: no diagnostica ni reemplaza a un profesional de salud.</p>

      <div class="row">
        <button class="btn" @click="exportando = { formato: 'pdf' }">Descargar informe PDF</button>
        <button class="btn" @click="exportando = { formato: 'csv' }">Descargar informe CSV</button>
        <RouterLink :to="`/monitoreos/${sesionId}`" class="btn ghost">Ver detalle del monitoreo</RouterLink>
      </div>
    </template>

    <ExportWarningDialog
      v-if="exportando"
      :ocupado="ocupado"
      :boton="exportando.formato === 'pdf' ? 'Entiendo, descargar PDF' : 'Entiendo, descargar CSV'"
      detalle="El informe va seudonimizado (Usuario N), sin alias ni datos opcionales."
      @confirmar="descargar"
      @cancelar="exportando = null"
    />
  </article>
</template>

<style scoped>
.mis {
  max-width: 960px;
}

.kpis .card {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.exp {
  margin-bottom: 8px;
}

.exp h4 {
  margin: 0 0 2px;
}
</style>
