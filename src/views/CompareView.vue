<script setup>
import { ref, computed, shallowRef, markRaw, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import MonitoreoPicker from '@/components/compare/MonitoreoPicker.vue'
import CommunityPicker from '@/components/community/CommunityPicker.vue'
import { useComunidadStore } from '@/stores/comunidad.js'
import ExportWarningDialog from '@/components/common/ExportWarningDialog.vue'
import DataClassBadge from '@/components/common/DataClassBadge.vue'
import { useMonitoreosStore } from '@/stores/monitoreos.js'
import { nombreMonitoreo, participantesVisibles } from '@/services/monitoreos/catalog.js'
import { informeComparacionPdf, informeComparacionCsv } from '@/services/report/informes.js'
import { renderizarGraficoJpeg } from '@/services/report/reportChart.js'
import { downloadBytes, downloadText, exportFilename } from '@/services/export/csvExporter.js'
import { audit } from '@/services/audit/auditService.js'
import SignalChart from '@/components/common/SignalChart.vue'
import SyncControls from '@/components/compare/SyncControls.vue'
import CompareMetrics from '@/components/compare/CompareMetrics.vue'
import { useSettingsStore } from '@/stores/settings.js'
import { useUsersStore } from '@/stores/users.js'
import { useAuthStore } from '@/stores/auth.js'
import { useChannelsStore } from '@/stores/channels.js'
import { generateReferenceEcg, PqrstGenerator, mvToAdc } from '@/data/referenceEcg.js'
import { readSignalFile, parseSignalCsv } from '@/services/export/csvImporter.js'
import { obtenerSenal } from '@/services/monitoreos/senalAcceso.js'
import { getRuntime } from '@/services/acquisition/channelRegistry.js'
import { prepareSignal, computeLag, computeMetrics, trimValidSegment } from '@/services/compare/compareSignals.js'
import { notify } from '@/services/notifications/notifier.js'

/** RF11–RF14: comparación de la señal experimental con una referencia. */
const settings = useSettingsStore()
const users = useUsersStore()
const auth = useAuthStore()
const channels = useChannelsStore()
const monitoreos = useMonitoreosStore()
const route = useRoute()
const FS = 250
const MAX_S = 30

// ---- Referencia (RF11)
const refTipo = ref('sintetica')
const refBpm = ref(72)
const refCsv = shallowRef(null) // { values, t, fs, nombre, comentarios }

// ---- Experimental
const expTipo = ref('simulada')
const expCsv = shallowRef(null)
const sesionSel = ref('')
const participanteSel = ref('')
const refSesion = ref('')
const refCanal = ref('')
const sesiones = computed(() => monitoreos.utilizables)
const comunidad = useComunidadStore()
const exportandoInforme = ref(null)
const canalSel = ref('')

// ---- Sincronización (RF14)
const metodo = ref(settings.sincronizacion.metodoPorDefecto)
const manualMs = ref(0)
const bloqueado = computed(() => !settings.sincronizacion.permitirCambioUsuario && !auth.isAdmin)
const maxLagMs = computed(() => settings.sincronizacion.xcorr.maxLagMs)

const preparado = shallowRef(null) // { ref, exp, nombres }
const resultado = shallowRef(null)
const error = ref('')
const calculando = ref(false)

onMounted(async () => {
  try {
    await monitoreos.refrescar()
  } catch {
    notify('No se pudieron leer los monitoreos guardados.', { tipo: 'error' })
  }
  // Enlaces desde Monitoreos: ?a=<id>&b=<id> (A = referencia, B = experimental)
  const qa = String(route.query.a ?? '')
  const qb = String(route.query.b ?? '')
  const unico = (id) => {
    const s = sesiones.value.find((x) => x.id === id)
    return s ? { id, canal: participantesVisibles(s, monitoreos.ctx)[0]?.canalIndex ?? '' } : null
  }
  const A = unico(qa)
  const B = unico(qb)
  if (A) {
    refTipo.value = 'monitoreo'
    refSesion.value = A.id
    refCanal.value = A.canal
  }
  if (B) {
    expTipo.value = 'sesion'
    sesionSel.value = B.id
    participanteSel.value = B.canal
  }
})

const ctxAcceso = computed(() => ({ usuarioId: monitoreos.ctx.usuarioId, esAdmin: monitoreos.ctx.esAdmin }))
const canalesVivos = computed(() => channels.channels.filter((c) => ['streaming', 'leads-off', 'signal-lost'].includes(c.estado)))

async function cargarCsv(e, destino) {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    const d = await readSignalFile(file)
    const obj = markRaw({ values: d.v, t: d.t, leadsOff: d.leadsOff, fs: d.fs, nombre: file.name.slice(0, 60), csv: true, comentarios: d.comentarios, filas: d.filas, invalidas: d.invalidas })
    if (destino === 'ref') refCsv.value = obj
    else expCsv.value = obj
    notify(`CSV válido: ${d.filas} filas (${d.invalidas} descartadas), fs ≈ ${d.fs ? d.fs.toFixed(0) : '?'} Hz.`, { tipo: 'ok' })
  } catch (err) {
    notify(err.message, { tipo: 'error' })
  } finally {
    e.target.value = ''
  }
}

async function cargarEjemploRef() {
  const r = await fetch('/referencias/ejemplo_referencia.csv')
  if (!r.ok) throw new Error('No se pudo cargar el CSV de ejemplo')
  const d = parseSignalCsv(await r.text(), { maxRaw: 1023 })
  return { values: d.v, t: d.t, fs: d.fs, nombre: 'ejemplo_referencia.csv (sintética, incluida)' }
}

/** Obtiene la señal experimental cruda (≤ 30 s, solo tramo sin leads-off). */
async function obtenerExperimental() {
  if (expTipo.value === 'simulada') {
    // Señal "de sensor" simulada con ruido, deriva y un desfase conocido de 180 ms (demostración RF14).
    const gen = new PqrstGenerator({ fs: FS, bpm: refBpm.value, ruido: 0.05, deriva: 0.15, variabilidad: 0.005, red50: 0.03, seed: 11 })
    const n = 20 * FS
    const v = new Float32Array(n)
    const retraso = 45 // 180 ms: la señal "del sensor" llega retrasada
    for (let i = 0; i < n; i++) v[i] = mvToAdc(i < retraso ? 0 : gen.next())
    return { values: v, fs: FS, nombre: 'Simulada (ruido + desfase 180 ms)' }
  }
  if (expTipo.value === 'csv') {
    if (!expCsv.value) throw new Error('Carga un CSV experimental')
    return recortar(expCsv.value)
  }
  if (expTipo.value === 'vivo') {
    const rt = getRuntime(Number(canalSel.value))
    if (!rt) throw new Error('Elige un canal conectado')
    const n = rt.ring.size
    const t = new Float64Array(n)
    const v = new Float32Array(n)
    const lo = new Uint8Array(n)
    rt.ring.toLinear(t, v, lo)
    return recortar({ values: v, t, leadsOff: lo, fs: rt.profile.fs, nombre: `Canal ${canalSel.value} (congelado)` })
  }
  return cargarMonitoreo(sesionSel.value, participanteSel.value) // 'sesion' y 'comunidad'
}

/** Señal de un monitoreo guardado (tramo continuo ≤ 30 s sin leads-off). */
async function cargarMonitoreo(sesionId, canal) {
  const propio = sesiones.value.find((x) => x.id === sesionId)
  const s = propio ?? comunidad.lista.find((x) => x.id === sesionId)
  if (!s || canal === '') throw new Error('Elige un monitoreo y un paciente/canal')
  const ctxS = propio ? ctxAcceso.value : { usuarioId: 'publico', esAdmin: false }
  const p = participantesVisibles(s, ctxS).find((x) => x.canalIndex === Number(canal))
  if (!p) throw new Error('No tienes acceso a ese canal del monitoreo')
  const sig = await obtenerSenal(s.id, Number(canal))
  return recortar({
    values: sig.raw, t: sig.t, leadsOff: sig.lo, fs: p.fs || FS,
    nombre: nombreMonitoreo(s), usuario: propio ? users.byId(p.usuarioId)?.etiqueta ?? 'Paciente eliminado' : 'Paciente anónimo (comunidad)', monitoreo: true,
  })
}

function recortar(d) {
  return trimValidSegment(d, { maxSeconds: MAX_S, minSeconds: 3, defaultFs: FS })
}

async function obtenerReferencia(duracionS) {
  if (refTipo.value === 'sintetica') {
    const r = generateReferenceEcg({ fs: FS, durationS: duracionS, bpm: refBpm.value })
    return { values: r.valores, fs: FS, nombre: `Sintética interna ${refBpm.value} BPM (didáctica)` }
  }
  if (refTipo.value === 'ejemplo') return cargarEjemploRef()
  if (refTipo.value === 'monitoreo' || refTipo.value === 'comunidad') return cargarMonitoreo(refSesion.value, refCanal.value)
  if (!refCsv.value) throw new Error('Carga un CSV de referencia')
  return refCsv.value
}

async function comparar() {
  error.value = ''
  calculando.value = true
  try {
    const exp = await obtenerExperimental()
    const durExp = exp.values.length / (exp.fs || FS)
    const ref = await obtenerReferencia(Math.ceil(durExp) + 1)
    const norm = settings.sincronizacion.normalizacion
    const pr = prepareSignal({ values: ref.values, t: ref.t ?? null, fs: ref.fs, fsOut: FS, normalizacion: norm })
    const pe = prepareSignal({ values: exp.values, t: exp.t ?? null, fs: exp.fs, fsOut: FS, normalizacion: norm })
    const n = Math.min(pr.length, pe.length)
    const seguro = (d) => (d.csv ? 'CSV cargado' : d.nombre)
    preparado.value = markRaw({
      ref: pr.subarray(0, n),
      exp: pe.subarray(0, n),
      nombres: [ref.nombre, exp.nombre],
      fuentes: [
        { rol: 'A (referencia)', nombre: seguro(ref), usuario: ref.usuario ?? null },
        { rol: 'B (experimental)', nombre: seguro(exp), usuario: exp.usuario ?? null },
      ],
    })
    if (metodo.value !== 'manual') autoAlinear(false)
    else recalcular()
  } catch (e) {
    error.value = e.message
    preparado.value = null
    resultado.value = null
  } finally {
    calculando.value = false
  }
}

function autoAlinear(pasarAManual = true) {
  if (!preparado.value) return
  const m = metodo.value === 'manual' ? 'xcorr' : metodo.value
  const { lag } = computeLag(preparado.value.ref, preparado.value.exp, FS, m, { maxLagMs: maxLagMs.value })
  manualMs.value = Math.round((lag * 1000) / FS)
  if (pasarAManual && !bloqueado.value) metodo.value = 'manual'
  recalcular()
}

function recalcular() {
  const p = preparado.value
  if (!p) return
  const lag = metodo.value === 'manual'
    ? Math.round((manualMs.value * FS) / 1000)
    : computeLag(p.ref, p.exp, FS, metodo.value, { maxLagMs: maxLagMs.value }).lag
  if (metodo.value !== 'manual') manualMs.value = Math.round((lag * 1000) / FS)
  const m = computeMetrics(p.ref, p.exp, lag, FS)
  const n = p.ref.length
  const x = new Float64Array(n)
  const yr = new Array(n)
  const ye = new Array(n)
  for (let i = 0; i < n; i++) {
    x[i] = i / FS
    yr[i] = p.ref[i]
    const j = i + lag
    ye[i] = j >= 0 && j < p.exp.length ? p.exp[j] : null
  }
  resultado.value = markRaw({ metricas: m, data: [x, yr, ye] })
}

watch(metodo, () => preparado.value && recalcular())
watch(manualMs, () => metodo.value === 'manual' && preparado.value && recalcular())

/** Informe PDF/CSV de la comparación (seudonimizado). */
async function descargarInforme() {
  const formato = exportandoInforme.value
  exportandoInforme.value = null
  try {
    const p = preparado.value
    const r = resultado.value
    if (!p || !r) throw new Error('Primero realiza una comparación.')
    const generadoEn = new Date()
    const parametros = { metodo: metodo.value, normalizacion: settings.sincronizacion.normalizacion, fsHz: FS, maxLagMs: maxLagMs.value }
    const base = { fuentes: p.fuentes, metricas: r.metricas, parametros, generadoEn }
    const etiqueta = users.activeUser?.etiqueta ?? 'admin'
    if (formato === 'pdf') {
      let grafico = null
      try {
        const [x, a, b] = r.data
        grafico = renderizarGraficoJpeg({
          series: [
            { x, y: a, color: '#1f6fd1', etiqueta: 'Señal A (referencia)' },
            { x, y: b, color: '#0b7a4c', etiqueta: 'Señal B (experimental)' },
          ],
          etiquetaY: 'z-score',
        })
      } catch {
        grafico = null
      }
      downloadBytes(informeComparacionPdf({ ...base, grafico }), exportFilename(etiqueta, generadoEn, { prefijo: 'comparacion', ext: 'pdf' }))
    } else {
      const [x, a, b] = r.data
      downloadText(informeComparacionCsv({ ...base, datos: { x, a, b } }), exportFilename(etiqueta, generadoEn, { prefijo: 'comparacion', ext: 'csv' }))
    }
    await audit('EXPORT_REPORT', monitoreos.actor(), { tipo: formato === 'pdf' ? 'comparacion-pdf' : 'comparacion-csv', pseudonymized: true })
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  }
}

const series = computed(() => [
  { label: `Referencia: ${preparado.value?.nombres[0] ?? ''}`, color: '--signal-ref' },
  { label: `Experimental: ${preparado.value?.nombres[1] ?? ''}`, color: '--signal' },
])
</script>

<template>
  <section>
    <div class="page-header">
      <h1>Comparar señales</h1>
    </div>
    <p class="muted">
      Pipeline: filtro (paso alto 0,5 Hz + notch 50 Hz) → remuestreo a 250 Hz → normalización
      ({{ settings.sincronizacion.normalizacion }}) → sincronización → métricas. Se comparan como máximo {{ MAX_S }} s
      continuos sin electrodos desconectados.
    </p>

    <div class="grid cols-2">
      <fieldset class="card">
        <legend>Señal A: referencia (RF11)</legend>
        <label class="check"><input v-model="refTipo" type="radio" value="sintetica"> Sintética interna PQRST (didáctica)</label>
        <div v-if="refTipo === 'sintetica'" class="field">
          <label for="ref-bpm">BPM de la referencia</label>
          <input id="ref-bpm" v-model.number="refBpm" type="number" min="40" max="180">
        </div>
        <label class="check"><input v-model="refTipo" type="radio" value="ejemplo"> CSV de ejemplo incluido (public/referencias)</label>
        <label class="check"><input v-model="refTipo" type="radio" value="monitoreo"> Monitoreo guardado</label>
        <MonitoreoPicker v-if="refTipo === 'monitoreo'" id-base="ref" :lista="sesiones" :ctx="ctxAcceso" v-model:sesion-id="refSesion" v-model:canal="refCanal" />
        <label class="check"><input v-model="refTipo" type="radio" value="comunidad"> Comunidad (públicos)</label>
        <CommunityPicker v-if="refTipo === 'comunidad'" id-base="refc" v-model:sesion-id="refSesion" v-model:canal="refCanal" />
        <label class="check"><input v-model="refTipo" type="radio" value="csv"> Cargar CSV validado (p. ej. PhysioNet convertido)</label>
        <div v-if="refTipo === 'csv'" class="field">
          <input id="ref-csv" type="file" accept=".csv,text/csv" aria-label="CSV de referencia" @change="cargarCsv($event, 'ref')">
          <p class="hint">Formatos: <span class="mono">t_ms,valor</span> o <span class="mono">t_ms,ecg_raw,leads_off,bpm</span>, o un CSV exportado por esta app (monitoreo o historial). Máx. 5 MB. Las líneas "#" son metadatos de origen.</p>
          <p v-if="refCsv" class="small">Cargado: {{ refCsv.nombre }} · {{ refCsv.filas }} filas<template v-if="refCsv.comentarios?.length"> · {{ refCsv.comentarios[0] }}</template></p>
        </div>
        <p class="alert info small">La referencia sintética es didáctica, no un registro clínico validado. Para una validación real, carga un registro certificado y cita su origen.</p>
      </fieldset>

      <fieldset class="card">
        <legend>Señal B: experimental</legend>
        <label class="check"><input v-model="expTipo" type="radio" value="simulada"> Sensor simulado (con ruido y desfase conocido)</label>
        <label class="check"><input v-model="expTipo" type="radio" value="sesion"> Monitoreo guardado</label>
        <MonitoreoPicker v-if="expTipo === 'sesion'" id-base="exp" :lista="sesiones" :ctx="ctxAcceso" v-model:sesion-id="sesionSel" v-model:canal="participanteSel" />
        <label class="check"><input v-model="expTipo" type="radio" value="comunidad"> Comunidad (públicos)</label>
        <CommunityPicker v-if="expTipo === 'comunidad'" id-base="expc" v-model:sesion-id="sesionSel" v-model:canal="participanteSel" />
        <label class="check"><input v-model="expTipo" type="radio" value="vivo"> Congelar un canal en vivo</label>
        <div v-if="expTipo === 'vivo'" class="field">
          <select id="exp-canal" v-model="canalSel" aria-label="Canal en vivo">
            <option value="">—</option>
            <option v-for="c in canalesVivos" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>
        </div>
        <label class="check"><input v-model="expTipo" type="radio" value="csv"> Cargar CSV</label>
        <div v-if="expTipo === 'csv'" class="field">
          <input type="file" accept=".csv,text/csv" aria-label="CSV experimental" @change="cargarCsv($event, 'exp')">
          <p v-if="expCsv" class="small">Cargado: {{ expCsv.nombre }}</p>
        </div>
      </fieldset>
    </div>

    <SyncControls
      v-model:metodo="metodo"
      v-model:manual-ms="manualMs"
      :max-lag-ms="maxLagMs"
      :bloqueado="bloqueado"
      class="sync"
      @auto="autoAlinear(true)"
    />

    <div class="row">
      <button class="btn primary" :disabled="calculando" @click="comparar">{{ calculando ? 'Calculando…' : 'Comparar' }}</button>
    </div>
    <p v-if="error" class="alert danger" role="alert">{{ error }}</p>

    <template v-if="resultado">
      <CompareMetrics :m="resultado.metricas" :metodo="metodo" class="res" />
      <div class="card">
        <h2>Señales superpuestas (RF13)</h2>
        <SignalChart :data="resultado.data" :series="series" :height="300" y-label="z-score" />
      </div>
      <div class="card">
        <h2>Informe de la comparación</h2>
        <p class="muted small">Seudonimizado: solo Usuario N, métricas y parámetros. <DataClassBadge level="sensitive" /></p>
        <div class="row">
          <button class="btn" data-testid="informe-comparacion-pdf" @click="exportandoInforme = 'pdf'">Descargar PDF</button>
          <button class="btn" data-testid="informe-comparacion-csv" @click="exportandoInforme = 'csv'">Descargar CSV</button>
        </div>
      </div>
    </template>
  <ExportWarningDialog
      v-if="exportandoInforme"
      :boton="exportandoInforme === 'pdf' ? 'Entiendo, descargar PDF' : 'Entiendo, descargar CSV'"
      detalle="El informe contiene métricas y parámetros de la comparación, sin alias ni datos opcionales."
      @confirmar="descargarInforme"
      @cancelar="exportandoInforme = null"
    />
  </section>
</template>

<style scoped>
fieldset.card {
  border: 1px solid var(--border);
}

legend {
  font-weight: 700;
  padding: 0 6px;
}

.sync {
  margin: var(--gap) 0;
}

.res {
  margin: var(--gap) 0;
}
</style>
