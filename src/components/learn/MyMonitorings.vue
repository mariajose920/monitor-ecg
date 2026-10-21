<script setup>
import { ref, computed, onMounted, shallowRef, markRaw, watch } from 'vue'
import { useRoute } from 'vue-router'
import SignalChart from '@/components/common/SignalChart.vue'
import MonitoreoPicker from '@/components/compare/MonitoreoPicker.vue'
import CommunityPicker from '@/components/community/CommunityPicker.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useComunidadStore } from '@/stores/comunidad.js'
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

const comunidad = useComunidadStore()
/** 'mios' = Mis monitoreos · 'comunidad' = monitoreos públicos de otras cuentas (solo lectura). */
const fuente = ref('mios')
const lista = computed(() => (fuente.value === 'comunidad' ? comunidad.lista : monitoreos.utilizables))
const ctxActual = computed(() => (fuente.value === 'comunidad' ? { usuarioId: 'publico', esAdmin: false } : monitoreos.ctx))
watch(fuente, () => { sesionId.value = ''; canal.value = '' })
const sesion = computed(() => lista.value.find((s) => s.id === sesionId.value) ?? null)
const partes = computed(() => (sesion.value ? participantesVisibles(sesion.value, ctxActual.value) : []))
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
    <div class="mis-header">
      <h2>
        <span>Mis monitoreos</span>
        <span class="chip neutral">Análisis clínico y formativo</span>
      </h2>
      <p class="resumen">
        Selecciona un registro guardado para realizar un análisis guiado: morfología de la bioseñal, detección de ondas sistólicas, cálculo de frecuencia cardíaca e interpretación técnica.
      </p>
    </div>

    <div class="tabs origin-tabs" role="group" aria-label="Origen de los monitoreos">
      <button
        type="button"
        :class="['tab-pill', { active: fuente === 'mios' }]"
        :aria-pressed="fuente === 'mios'"
        data-testid="tab-mios"
        @click="fuente = 'mios'"
      >
        <AppIcon name="user" :size="15" />
        <span>Registros personales</span>
      </button>
      <button
        type="button"
        :class="['tab-pill', { active: fuente === 'comunidad' }]"
        :aria-pressed="fuente === 'comunidad'"
        data-testid="tab-comunidad"
        @click="fuente = 'comunidad'"
      >
        <AppIcon name="globe" :size="15" />
        <span>Base de datos comunitaria</span>
      </button>
    </div>

    <CommunityPicker v-if="fuente === 'comunidad'" id-base="aprendec" v-model:sesion-id="sesionId" v-model:canal="canal" />
    <MonitoreoPicker v-else id-base="aprende" titulo="Seleccionar registro para análisis" :lista="lista" :ctx="monitoreos.ctx" v-model:sesion-id="sesionId" v-model:canal="canal" />

    <p v-if="cargando" class="muted" role="status">Procesando y analizando registro…</p>
    <p v-if="error" class="alert danger" role="alert">{{ error }}</p>

    <template v-if="vista">
      <!-- Punto 1: Trazo y detección de complejos -->
      <section class="point-section">
        <div class="point-header">
          <span class="point-badge">1</span>
          <div>
            <h3>Registro electrocardiográfico y marcadores sistólicos</h3>
            <p class="muted small">
              Los marcadores rojos identifican los picos R (ECG) o deflexiones sistólicas (PPG) detectados en un segmento continuo de hasta 30 segundos sin pérdidas de contacto.
            </p>
          </div>
        </div>
        <SignalChart :data="vista.data" :series="series" :marcas="vista.marcas" :height="260" y-label="ADC" />
      </section>

      <!-- Punto 2: Métricas y parámetros biométricos -->
      <section class="point-section">
        <div class="point-header">
          <span class="point-badge">2</span>
          <div>
            <h3>Parámetros biométricos y métricas calculadas</h3>
            <p class="muted small">
              Cuantificación matemática y parámetros estadísticos derivados del intervalo analizado.
            </p>
          </div>
        </div>
        <div class="grid cols-4 kpis" aria-live="polite">
          <div class="card kpi-card">
            <div class="kpi-label">
              <AppIcon name="activity" :size="15" />
              <span>Complejos detectados</span>
            </div>
            <strong class="mono kpi-val" data-testid="kpi-picos">{{ vista.analisis.picos.length }}</strong>
            <span class="kpi-sub">Picos R / sistólicos</span>
          </div>
          <div class="card kpi-card">
            <div class="kpi-label">
              <AppIcon name="heart" :size="15" />
              <span>Frecuencia Cardíaca</span>
            </div>
            <strong class="mono kpi-val">{{ f(vista.analisis.bpm.medio) }} <span class="kpi-unit">BPM</span></strong>
            <span class="kpi-sub">Rango: {{ f(vista.analisis.bpm.min) }} – {{ f(vista.analisis.bpm.max) }} BPM</span>
          </div>
          <div class="card kpi-card">
            <div class="kpi-label">
              <AppIcon name="clock" :size="15" />
              <span>Intervalo RR · SDNN</span>
            </div>
            <strong class="mono kpi-val">{{ f(vista.analisis.rrStats.medioMs) }} <span class="kpi-unit">ms</span></strong>
            <span class="kpi-sub">SDNN: {{ f(vista.analisis.rrStats.sdnnMs) }} ms (HRV)</span>
          </div>
          <div class="card kpi-card">
            <div class="kpi-label">
              <AppIcon name="shield" :size="15" />
              <span>Calidad de adquisición</span>
            </div>
            <strong class="kpi-val" :class="vista.analisis.calidad.nivel">{{ vista.analisis.calidad.nivel.toUpperCase() }}</strong>
            <span class="kpi-sub">Puntaje técnico: {{ vista.analisis.calidad.puntaje }}/100</span>
          </div>
        </div>
      </section>

      <!-- Punto 3: Tacograma (si hay suficientes intervalos) -->
      <section v-if="vista.rr[0].length > 1" class="point-section">
        <div class="point-header">
          <span class="point-badge">3</span>
          <div>
            <h3>Tacograma y variabilidad de intervalos RR</h3>
            <p class="muted small">
              Evolución temporal del intervalo interlatido (ms). Una pendiente ascendente refleja desaceleración fisiológica del ritmo (aumento del RR); una pendiente descendente indica aceleración sistólica.
            </p>
          </div>
        </div>
        <SignalChart :data="vista.rr" :series="seriesRr" :height="200" y-label="ms" />
      </section>

      <!-- Punto 4: Interpretación técnica y correlación fisiológica -->
      <section class="point-section">
        <div class="point-header">
          <span class="point-badge">{{ vista.rr[0].length > 1 ? '4' : '3' }}</span>
          <div>
            <h3>Interpretación técnica y correlación fisiológica</h3>
            <p class="muted small">
              Análisis detallado de los parámetros observados y recomendaciones técnicas de adquisición.
            </p>
          </div>
        </div>

        <div class="explicaciones-grid">
          <section
            v-for="e in vista.explicaciones"
            :key="e.id"
            class="exp-card"
            :data-testid="`exp-${e.id}`"
          >
            <div class="exp-card-header">
              <span class="exp-icon-dot"></span>
              <h4>{{ e.titulo }}</h4>
            </div>
            <p class="exp-body">{{ e.texto }}</p>
          </section>
        </div>
      </section>

      <p class="alert warn small legal-alert">
        <AppIcon name="alert-triangle" :size="18" />
        <span><strong>Aviso clínico-educativo:</strong> Esta plataforma tiene propósitos formativos, experimentales y de investigación académica. Los valores calculados no constituyen diagnóstico clínico ni reemplazan la evaluación médica profesional.</span>
      </p>

      <div class="action-buttons-row">
        <button class="btn primary" @click="exportando = { formato: 'pdf' }">
          <AppIcon name="download" :size="16" />
          <span>Descargar informe PDF</span>
        </button>
        <button class="btn secondary" @click="exportando = { formato: 'csv' }">
          <AppIcon name="download" :size="16" />
          <span>Descargar datos CSV</span>
        </button>
        <RouterLink :to="`/monitoreos/${sesionId}`" class="btn ghost">
          <AppIcon name="monitor" :size="16" />
          <span>Ver registro completo</span>
        </RouterLink>
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
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  padding: 32px 36px;
}

.mis-header {
  margin-bottom: 20px;
}

.mis-header h2 {
  font-size: 1.65rem;
  font-weight: 800;
  color: #0f172a;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin: 0 0 8px;
}

.resumen {
  font-size: 1.02rem;
  line-height: 1.6;
  color: #64748b;
  margin: 0;
}

.origin-tabs {
  margin: 16px 0 20px;
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 8px;
}

.tab-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border-radius: var(--radius-pill);
  font-size: 0.9rem;
  font-weight: 600;
  border: 1px solid var(--border);
  background: var(--bg-elev);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-pill:hover {
  color: var(--text);
  border-color: rgba(225, 29, 72, 0.25);
  background: #ffffff;
}

.tab-pill.active {
  color: var(--accent);
  background: #ffffff;
  border-color: rgba(225, 29, 72, 0.35);
  box-shadow: 0 2px 8px rgba(225, 29, 72, 0.1);
  font-weight: 700;
}

.point-section {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid rgba(226, 232, 240, 0.7);
}

.point-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 16px;
}

.point-badge {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(225, 29, 72, 0.1);
  color: var(--accent);
  font-weight: 800;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(225, 29, 72, 0.1);
}

.point-header h3 {
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 4px;
}

.point-header p {
  margin: 0;
  color: #64748b;
  font-size: 0.92rem;
  line-height: 1.5;
}

.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
}

.kpi-card {
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px 20px;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
  border-color: rgba(225, 29, 72, 0.2);
}

.kpi-label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #64748b;
  font-size: 0.85rem;
  font-weight: 600;
}

.kpi-val {
  font-size: 1.45rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.2;
}

.kpi-val.buena {
  color: #059669;
}

.kpi-val.media {
  color: #d97706;
}

.kpi-val.baja {
  color: var(--accent);
}

.kpi-unit {
  font-size: 0.85rem;
  font-weight: 600;
  color: #64748b;
  margin-left: 2px;
}

.kpi-sub {
  font-size: 0.8rem;
  color: #94a3b8;
}

.explicaciones-grid {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 14px;
}

.exp-card {
  background: #f8fafc;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-left: 4px solid var(--accent);
  border-radius: var(--radius-sm);
  padding: 18px 22px;
  transition: all 0.2s ease;
}

.exp-card:hover {
  border-color: rgba(225, 29, 72, 0.35);
  border-left-color: var(--accent);
  background: #ffffff;
  box-shadow: var(--shadow-sm);
}

.exp-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.exp-icon-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}

.exp-card-header h4 {
  font-size: 1.05rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.exp-body {
  font-size: 0.95rem;
  line-height: 1.65;
  color: #334155;
  margin: 0;
}

.legal-alert {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 28px;
  padding: 14px 18px;
  border-radius: var(--radius-sm);
}

.action-buttons-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 24px;
}

.action-buttons-row .btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 768px) {
  .mis {
    padding: 20px;
  }

  .mis-header h2 {
    font-size: 1.35rem;
  }

  .kpis {
    grid-template-columns: 1fr;
  }
}
</style>
