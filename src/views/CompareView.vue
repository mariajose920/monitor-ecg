<script setup>
import { ref, computed, shallowRef, markRaw, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import MonitoreoPicker from '@/components/compare/MonitoreoPicker.vue'
import CommunityPicker from '@/components/community/CommunityPicker.vue'
import { useComunidadStore } from '@/stores/comunidad.js'
import ExportWarningDialog from '@/components/common/ExportWarningDialog.vue'
import DataClassBadge from '@/components/common/DataClassBadge.vue'
import AppIcon from '@/components/common/AppIcon.vue'
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
import { PATOLOGIAS_PHYSIONET, MAPA_PATOLOGIAS } from '@/data/physionetDatabases.js'
import { generarSenalPatologia } from '@/data/physionetSignals.js'

/** RF11–RF14: comparación de la señal experimental con una referencia clínica (PhysioNet). */
const settings = useSettingsStore()
const users = useUsersStore()
const auth = useAuthStore()
const channels = useChannelsStore()
const monitoreos = useMonitoreosStore()
const route = useRoute()
const FS = 250
const MAX_S = 30

// ---- Referencia (RF11)
const refTipo = ref('physionet')
const refPatologia = ref('nsr')
const refBpm = ref(72)
const refCsv = shallowRef(null) // { values, t, fs, nombre, comentarios }

// ---- Experimental
const expTipo = ref('simulada')
const expPatologia = ref('afib')
const expCsv = shallowRef(null)
const sesionSel = ref('')
const participanteSel = ref('')
const refSesion = ref('')
const refCanal = ref('')
const sesiones = computed(() => monitoreos.utilizables)
const comunidad = useComunidadStore()
const exportandoInforme = ref(null)
const canalSel = ref('')

// Información reactiva de patologías seleccionadas
const patologiaRefInfo = computed(() => MAPA_PATOLOGIAS[refPatologia.value] ?? MAPA_PATOLOGIAS.nsr)
const patologiaExpInfo = computed(() => MAPA_PATOLOGIAS[expPatologia.value] ?? MAPA_PATOLOGIAS.afib)

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
  if (expTipo.value === 'physionet') {
    const s = generarSenalPatologia(expPatologia.value, MAX_S, FS)
    return {
      values: s.values,
      fs: FS,
      nombre: s.nombre,
      usuario: 'PhysioNet',
      comentarios: s.comentarios,
    }
  }
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
    rt.ring.toArray(t, v)
    if (n < FS * 3) throw new Error('Se necesitan al menos 3 s de señal viva')
    const nombre = channels.channels.find((c) => c.id === Number(canalSel.value))?.nombre ?? 'Canal'
    return recortar({ values: v, t, fs: FS, nombre: `En vivo: ${nombre}` })
  }
  if (expTipo.value === 'sesion' || expTipo.value === 'comunidad') return cargarMonitoreo(sesionSel.value, participanteSel.value)
  throw new Error('Tipo experimental no válido')
}

async function cargarMonitoreo(id, canalIndex) {
  if (!id) throw new Error('Elige un monitoreo')
  const s = sesiones.value.find((x) => x.id === id) ?? (await comunidad.obtenerPorId(id))
  if (!s) throw new Error('No se encontró el monitoreo')
  const p = s.participantes.find((x) => x.canalIndex === Number(canalIndex)) ?? s.participantes[0]
  if (!p) throw new Error('El monitoreo no tiene datos de canal')
  const d = await obtenerSenal(s, p.canalIndex)
  const maxMuestras = MAX_S * (p.fs || FS)
  const v = d.valores.length > maxMuestras ? d.valores.subarray(0, maxMuestras) : d.valores
  const t = d.t?.length > maxMuestras ? d.t.subarray(0, maxMuestras) : d.t
  return recortar({
    values: v,
    t,
    leadsOff: d.leadsOff,
    fs: p.fs || FS,
    nombre: `${nombreMonitoreo(s)} · Canal ${p.canalIndex + 1}`,
    usuario: p.usuarioEtiqueta,
  })
}

function recortar(d) {
  return trimValidSegment(d, { maxSeconds: MAX_S, minSeconds: 3, defaultFs: FS })
}

async function obtenerReferencia(duracionS) {
  if (refTipo.value === 'physionet') {
    const s = generarSenalPatologia(refPatologia.value, duracionS, FS)
    return {
      values: s.values,
      fs: FS,
      nombre: s.nombre,
      usuario: 'PhysioNet',
      comentarios: s.comentarios,
    }
  }
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
            { valores: a, color: '#0284c7', etiqueta: 'Referencia' },
            { valores: b, color: '#e11d48', etiqueta: 'Experimental' },
          ],
          ancho: 800,
          alto: 260,
          fs: FS,
        })
      } catch {
        // Sin canvas: el PDF se genera sin gráfico.
      }
      const bytes = await informeComparacionPdf({ ...base, graficoBase64: grafico, etiquetaUsuario: etiqueta })
      downloadBytes(bytes, exportFilename(etiqueta, generadoEn, { prefijo: 'comparacion', ext: 'pdf' }), 'application/pdf')
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
  <section class="compare-view">
    <div class="page-header">
      <h1>Comparar señales</h1>
    </div>
    <p class="muted">
      Pipeline: filtro (paso alto 0,5 Hz + notch 50 Hz) → remuestreo a 250 Hz → normalización
      ({{ settings.sincronizacion.normalizacion }}) → sincronización → métricas. Se comparan como máximo {{ MAX_S }} s
      continuos sin electrodos desconectados.
    </p>

    <!-- BANNER EXPLICATIVO PHYSIONET -->
    <div class="physionet-hero-banner card">
      <div class="banner-icon-col">
        <div class="physionet-logo-badge">
          <AppIcon name="pulse" :size="26" />
        </div>
      </div>
      <div class="banner-text-col">
        <div class="banner-tags">
          <span class="tag-physionet">PHYSIONET.ORG</span>
          <span class="tag-academic">PATRONES CLÍNICOS VALIDADOS</span>
        </div>
        <h3 class="banner-title">Base de Datos Electrocardiográfica PhysioNet</h3>
        <p class="banner-desc">
          <a href="https://physionet.org/" target="_blank" rel="noopener noreferrer" class="link-physionet">
            PhysioNet.org <span aria-hidden="true">↗</span>
          </a>
          es el repositorio abierto estándar de investigación biomédica del MIT y Harvard apoyado por el NIH.
          Permite contrastar tus capturas del ESP32 con trazados fisiológicos reales y patologías cardíacas validadas
          (Fibrilación Auricular, Extrasístoles Ventriculares, Taquicardias e Isquemia ST) para sustentar tus informes de laboratorio.
        </p>
      </div>
    </div>

    <div class="grid cols-2">
      <!-- Tarjeta Señal A: Referencia -->
      <div class="card compare-card">
        <div class="panel-header">
          <div class="panel-title-wrap">
            <span class="panel-badge-dot a"></span>
            <h2 class="panel-title">Señal A: Referencia</h2>
          </div>
          <span class="panel-tag">RF11</span>
        </div>

        <!-- Opción destacada: Base de datos PhysioNet -->
        <label class="check primary-check">
          <input v-model="refTipo" type="radio" value="physionet">
          <span><strong>Base de datos clínica PhysioNet (Arritmias y Patologías)</strong></span>
        </label>

        <!-- Selector interactivo de patologías PhysioNet -->
        <div v-if="refTipo === 'physionet'" class="physionet-selector-box">
          <label for="ref-patologia-select" class="selector-label">Seleccionar patología o arritmia:</label>
          <select id="ref-patologia-select" v-model="refPatologia" class="patologia-select">
            <option v-for="p in PATOLOGIAS_PHYSIONET" :key="p.id" :value="p.id">
              {{ p.sigla }} — {{ p.nombre }} ({{ p.bpmNominal }} BPM)
            </option>
          </select>

          <!-- Tarjeta clínica de la patología seleccionada -->
          <div v-if="patologiaRefInfo" class="patologia-card">
            <div class="pat-header">
              <div class="pat-title-row">
                <span class="pat-badge" :style="{ backgroundColor: patologiaRefInfo.colorCategoria + '15', color: patologiaRefInfo.colorCategoria, borderColor: patologiaRefInfo.colorCategoria }">
                  {{ patologiaRefInfo.categoria }}
                </span>
                <span class="pat-bpm-pill">
                  <AppIcon name="heart" :size="13" filled />
                  {{ patologiaRefInfo.bpmNominal }} BPM nominal
                </span>
              </div>
              <h4 class="pat-name">{{ patologiaRefInfo.nombre }}</h4>
              <p class="pat-db">
                <span class="muted">Fuente:</span> <strong>{{ patologiaRefInfo.baseDatos }}</strong>
              </p>
            </div>

            <p class="pat-desc">{{ patologiaRefInfo.descripcion }}</p>

            <div class="pat-criterios">
              <span class="criterios-title">Criterios electrocardiográficos clave:</span>
              <ul>
                <li v-for="(crit, idx) in patologiaRefInfo.criterios" :key="idx">{{ crit }}</li>
              </ul>
            </div>

            <div class="pat-footer">
              <a :href="patologiaRefInfo.enlacePhysioNet" target="_blank" rel="noopener noreferrer" class="physionet-link">
                <span>Ver en PhysioNet.org</span>
                <span aria-hidden="true">↗</span>
              </a>
              <a :href="`/referencias/physionet_${patologiaRefInfo.id}.csv`" download class="physionet-csv-download">
                <AppIcon name="download" :size="14" />
                <span>Descargar CSV</span>
              </a>
            </div>
          </div>
        </div>

        <label class="check"><input v-model="refTipo" type="radio" value="sintetica"> Sintética interna PQRST (didáctica simple)</label>
        <div v-if="refTipo === 'sintetica'" class="field sub-field">
          <label for="ref-bpm">BPM de la referencia</label>
          <input id="ref-bpm" v-model.number="refBpm" type="number" min="40" max="180">
        </div>
        <label class="check"><input v-model="refTipo" type="radio" value="ejemplo"> CSV de ejemplo incluido (public/referencias)</label>
        <label class="check"><input v-model="refTipo" type="radio" value="monitoreo"> Monitoreo guardado</label>
        <MonitoreoPicker v-if="refTipo === 'monitoreo'" id-base="ref" :lista="sesiones" :ctx="ctxAcceso" v-model:sesion-id="refSesion" v-model:canal="refCanal" />
        <label class="check"><input v-model="refTipo" type="radio" value="comunidad"> Comunidad (públicos)</label>
        <CommunityPicker v-if="refTipo === 'comunidad'" id-base="refc" v-model:sesion-id="refSesion" v-model:canal="refCanal" />
        <label class="check"><input v-model="refTipo" type="radio" value="csv"> Cargar CSV validado (p. ej. PhysioNet descargado)</label>

        <!-- Control moderno para cargar CSV de referencia -->
        <div v-if="refTipo === 'csv'" class="csv-upload-box">
          <input id="ref-csv" type="file" accept=".csv,text/csv" class="sr-only" aria-label="CSV de referencia" @change="cargarCsv($event, 'ref')">
          <div class="csv-upload-row">
            <label for="ref-csv" class="btn secondary csv-btn">
              <AppIcon name="upload" :size="16" />
              <span>{{ refCsv ? 'Cambiar archivo CSV' : 'Elegir archivo CSV' }}</span>
            </label>
            <span v-if="refCsv" class="csv-chip ok">
              <AppIcon name="check" :size="14" />
              <strong>{{ refCsv.nombre }}</strong> · {{ refCsv.filas }} filas
            </span>
            <span v-else class="csv-empty-note">Ningún archivo cargado (.csv)</span>
          </div>
          <p class="hint">Formatos: <span class="mono">t_ms,valor</span> o un CSV exportado por esta app o PhysioNet (máx. 5 MB).</p>
          <p v-if="refCsv?.comentarios?.length" class="small muted">{{ refCsv.comentarios[0] }}</p>
        </div>
      </div>

      <!-- Tarjeta Señal B: Experimental -->
      <div class="card compare-card">
        <div class="panel-header">
          <div class="panel-title-wrap">
            <span class="panel-badge-dot b"></span>
            <h2 class="panel-title">Señal B: Experimental</h2>
          </div>
          <span class="panel-tag">Entrada</span>
        </div>

        <label class="check"><input v-model="expTipo" type="radio" value="simulada"> Sensor simulado (con ruido y desfase conocido)</label>
        <label class="check"><input v-model="expTipo" type="radio" value="sesion"> Monitoreo guardado</label>
        <MonitoreoPicker v-if="expTipo === 'sesion'" id-base="exp" :lista="sesiones" :ctx="ctxAcceso" v-model:sesion-id="sesionSel" v-model:canal="participanteSel" />
        <label class="check"><input v-model="expTipo" type="radio" value="comunidad"> Comunidad (públicos)</label>
        <CommunityPicker v-if="expTipo === 'comunidad'" id-base="expc" v-model:sesion-id="sesionSel" v-model:canal="participanteSel" />
        <label class="check"><input v-model="expTipo" type="radio" value="vivo"> Congelar un canal en vivo</label>
        <div v-if="expTipo === 'vivo'" class="field sub-field">
          <select id="exp-canal" v-model="canalSel" aria-label="Canal en vivo">
            <option value="">—</option>
            <option v-for="c in canalesVivos" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>
        </div>

        <!-- Opción PhysioNet en Señal B para contrastar dos arritmias entre sí -->
        <label class="check">
          <input v-model="expTipo" type="radio" value="physionet">
          <span>Patología clínica PhysioNet (comparar arritmias)</span>
        </label>
        <div v-if="expTipo === 'physionet'" class="physionet-selector-box">
          <label for="exp-patologia-select" class="selector-label">Seleccionar patología experimental:</label>
          <select id="exp-patologia-select" v-model="expPatologia" class="patologia-select">
            <option v-for="p in PATOLOGIAS_PHYSIONET" :key="p.id" :value="p.id">
              {{ p.sigla }} — {{ p.nombre }} ({{ p.bpmNominal }} BPM)
            </option>
          </select>
          <div v-if="patologiaExpInfo" class="patologia-card-mini">
            <span class="pat-badge" :style="{ backgroundColor: patologiaExpInfo.colorCategoria + '15', color: patologiaExpInfo.colorCategoria, borderColor: patologiaExpInfo.colorCategoria }">
              {{ patologiaExpInfo.categoria }}
            </span>
            <p class="pat-desc-mini">{{ patologiaExpInfo.descripcion }}</p>
          </div>
        </div>

        <label class="check"><input v-model="expTipo" type="radio" value="csv"> Cargar CSV</label>

        <!-- Control moderno para cargar CSV experimental -->
        <div v-if="expTipo === 'csv'" class="csv-upload-box">
          <input id="exp-csv" type="file" accept=".csv,text/csv" class="sr-only" aria-label="CSV experimental" @change="cargarCsv($event, 'exp')">
          <div class="csv-upload-row">
            <label for="exp-csv" class="btn secondary csv-btn">
              <AppIcon name="upload" :size="16" />
              <span>{{ expCsv ? 'Cambiar archivo CSV' : 'Elegir archivo CSV' }}</span>
            </label>
            <span v-if="expCsv" class="csv-chip ok">
              <AppIcon name="check" :size="14" />
              <strong>{{ expCsv.nombre }}</strong> · {{ expCsv.filas }} filas
            </span>
            <span v-else class="csv-empty-note">Ningún archivo cargado (.csv)</span>
          </div>
          <p class="hint">Adquisición experimental del sensor PPG o ECG para contrastar con la referencia.</p>
        </div>
      </div>
    </div>

    <SyncControls
      v-model:metodo="metodo"
      v-model:manual-ms="manualMs"
      :max-lag-ms="maxLagMs"
      :bloqueado="bloqueado"
      class="sync"
      @auto="autoAlinear(true)"
    />

    <div class="row compare-action-row">
      <button class="btn primary btn-compare-main" :disabled="calculando" @click="comparar">
        <AppIcon name="activity" :size="18" />
        <span>{{ calculando ? 'Procesando comparación…' : 'Comparar señales' }}</span>
      </button>
    </div>
    <p v-if="error" class="alert danger" role="alert">{{ error }}</p>

    <template v-if="resultado">
      <CompareMetrics :m="resultado.metricas" :metodo="metodo" class="res" />
      <div class="card chart-card">
        <div class="chart-header">
          <h2>Señales superpuestas (RF13)</h2>
          <span class="chart-hint">Normalizadas z-score para comparación de morfología</span>
        </div>
        <SignalChart :data="resultado.data" :series="series" :height="320" y-label="z-score" />
      </div>
      <div class="card report-card">
        <h2>Informe académico de la comparación</h2>
        <p class="muted small">Seudonimizado: incluye correlación de Pearson, RMSE, citas de fuentes PhysioNet y parámetros de sincronización. <DataClassBadge level="sensitive" /></p>
        <div class="row">
          <button class="btn" data-testid="informe-comparacion-pdf" @click="exportandoInforme = 'pdf'">
            <AppIcon name="download" :size="16" />
            <span>Descargar informe PDF</span>
          </button>
          <button class="btn secondary" data-testid="informe-comparacion-csv" @click="exportandoInforme = 'csv'">
            <AppIcon name="download" :size="16" />
            <span>Descargar datos CSV</span>
          </button>
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
.compare-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Banner de PhysioNet */
.physionet-hero-banner {
  display: flex;
  align-items: flex-start;
  gap: 22px;
  padding: 24px 28px;
  background: linear-gradient(135deg, #f0f7fc 0%, #e6f2fa 100%);
  border: 1px solid rgba(2, 132, 199, 0.2);
  border-radius: var(--radius);
}

.banner-icon-col {
  flex-shrink: 0;
}

.physionet-logo-badge {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: #ffffff;
  color: var(--info);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(2, 132, 199, 0.15);
  border: 1px solid rgba(2, 132, 199, 0.25);
}

.banner-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 6px;
}

.tag-physionet {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: var(--info);
  color: #ffffff;
}

.tag-academic {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: rgba(2, 132, 199, 0.12);
  color: var(--info);
}

.banner-title {
  font-size: 1.25rem;
  font-weight: 800;
  margin: 0 0 6px;
  color: var(--text);
  letter-spacing: -0.01em;
}

.banner-desc {
  font-size: 0.92rem;
  line-height: 1.55;
  color: var(--text);
  margin: 0;
}

.link-physionet {
  font-weight: 800;
  color: var(--info);
  text-decoration: underline;
}

/* Tarjetas de señal */
.compare-card {
  padding: 24px 28px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--border-subtle);
}

.panel-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.panel-title {
  font-size: 1.18rem;
  font-weight: 800;
  margin: 0;
  color: var(--text);
  letter-spacing: -0.01em;
}

.panel-badge-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.panel-badge-dot.a {
  background: var(--signal-ref);
  box-shadow: 0 0 8px rgba(2, 132, 199, 0.45);
}

.panel-badge-dot.b {
  background: var(--signal);
  box-shadow: 0 0 8px rgba(225, 29, 72, 0.45);
}

.panel-tag {
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  background: var(--bg-elev-2);
  color: var(--text-muted);
}

.primary-check {
  margin-bottom: 10px;
}

/* Caja selectora de PhysioNet */
.physionet-selector-box {
  margin: 8px 0 16px 28px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.selector-label {
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--text-muted);
  margin-bottom: 2px;
}

.patologia-select {
  width: 100%;
  padding: 10px 14px;
  font-size: 0.92rem;
  font-weight: 600;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--border);
  background: var(--bg-elev);
}

.patologia-select:focus {
  border-color: var(--info);
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
}

/* Tarjeta clínica de la patología */
.patologia-card {
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 18px 20px;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pat-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.pat-badge {
  font-size: 0.75rem;
  font-weight: 800;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  border: 1px solid transparent;
}

.pat-bpm-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-muted);
  background: var(--bg-elev-2);
  padding: 3px 10px;
  border-radius: var(--radius-pill);
}

.pat-name {
  font-size: 1.05rem;
  font-weight: 800;
  margin: 0 0 3px;
  color: var(--text);
}

.pat-db {
  font-size: 0.82rem;
  margin: 0;
}

.pat-desc {
  font-size: 0.86rem;
  line-height: 1.55;
  color: var(--text-muted);
  margin: 0;
}

.pat-criterios {
  background: var(--bg-elev-2);
  border-radius: 8px;
  padding: 10px 14px;
}

.criterios-title {
  display: block;
  font-size: 0.8rem;
  font-weight: 800;
  color: var(--text);
  margin-bottom: 6px;
}

.pat-criterios ul {
  margin: 0;
  padding-left: 18px;
}

.pat-criterios li {
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--text-muted);
  margin-bottom: 2px;
}

.pat-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
  margin-top: 4px;
}

.physionet-link {
  font-size: 0.84rem;
  font-weight: 800;
  color: var(--info);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.physionet-csv-download {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text);
  background: var(--bg-elev-2);
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  text-decoration: none;
}

.physionet-csv-download:hover {
  background: var(--border);
}

/* Mini tarjeta para Señal B */
.patologia-card-mini {
  background: var(--bg-elev-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pat-desc-mini {
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--text-muted);
  margin: 0;
}

.sub-field {
  margin: 10px 0 16px 28px;
}

/* Caja de carga de CSV */
.csv-upload-box {
  margin: 10px 0 14px 28px;
  padding: 14px 18px;
  background: var(--bg-elev-2);
  border: 1.5px dashed var(--border);
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: border-color 0.18s ease;
}

.csv-upload-box:hover {
  border-color: var(--accent);
}

.csv-upload-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.csv-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  margin: 0;
  white-space: nowrap;
}

.csv-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  background: #f0f9ff;
  color: var(--info);
  border: 1px solid rgba(2, 132, 199, 0.25);
  font-size: 0.82rem;
  font-weight: 600;
}

.csv-empty-note {
  font-size: 0.82rem;
  color: var(--text-muted);
}

.compare-action-row {
  margin: 4px 0;
}

.btn-compare-main {
  font-size: 1rem;
  padding: 12px 28px;
}

.chart-card {
  padding: 24px;
}

.chart-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}

.chart-hint {
  font-size: 0.84rem;
  color: var(--text-muted);
}

.report-card {
  padding: 24px;
}

.sync {
  margin: var(--gap) 0 4px;
}

.res {
  margin: var(--gap) 0 4px;
}
</style>
