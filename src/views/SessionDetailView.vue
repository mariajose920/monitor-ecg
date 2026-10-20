<script setup>
import { ref, computed, onMounted, shallowRef, markRaw } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SignalChart from '@/components/common/SignalChart.vue'
import DataClassBadge from '@/components/common/DataClassBadge.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import ExportWarningDialog from '@/components/common/ExportWarningDialog.vue'
import SaveMonitoringDialog from '@/components/monitoreos/SaveMonitoringDialog.vue'
import VisibilityDialog from '@/components/monitoreos/VisibilityDialog.vue'
import { visibilidadDe } from '@/services/monitoreos/visibilidad.js'
import { getSession } from '@/services/storage/sessionRepository.js'
import { cargarYAnalizar, datosGrafico } from '@/services/monitoreos/senal.js'
import {
  participantesVisibles, nombreMonitoreo, estadoMonitoreo, infoEstado, actividadPrincipal, puedeEliminar, esUtilizable,
} from '@/services/monitoreos/catalog.js'
import { useUsersStore } from '@/stores/users.js'
import { useMonitoreosStore } from '@/stores/monitoreos.js'
import { useExportMonitoreos } from '@/composables/useExportMonitoreos.js'
import { nombreEvento } from '@/data/eventos.js'
import { notify } from '@/services/notifications/notifier.js'
import { formatFecha, formatDuracion } from '@/utils/time.js'
import { nombreActividad } from '@/data/activities.js'

/** Detalle de un monitoreo: gráfico con picos, métricas, eventos, actividad, parámetros, editar/eliminar/exportar. */
const route = useRoute()
const router = useRouter()
const users = useUsersStore()
const monitoreos = useMonitoreosStore()
const exportador = useExportMonitoreos()

const sesion = ref(null)
const cargando = ref(true)
const graficos = shallowRef({}) // canalIndex → { data, marcas, analisis }
const editando = ref(false)
const eliminando = ref(false)
const exportando = ref(null) // { tipo, participante? }
const incluirNotas = ref(false)
const ocupado = ref(false)
const series = [{ label: 'Señal (cuentas ADC)', color: '--signal' }]

const ctx = computed(() => ({ usuarioId: users.activeUserId, esAdmin: monitoreos.ctx.esAdmin }))
const visibles = computed(() => (sesion.value ? participantesVisibles(sesion.value, ctx.value) : []))
const estado = computed(() => (sesion.value ? estadoMonitoreo(sesion.value, monitoreos.ctx.sesionActivaId) : 'guardado'))
const utilizable = computed(() => !!sesion.value && esUtilizable(sesion.value))
const par = computed(() => sesion.value?.parametrosAplicados)

async function cargar() {
  cargando.value = true
  sesion.value = await getSession(String(route.params.id))
  cargando.value = false
  if (!sesion.value || !visibles.value.length) return
  const out = {}
  for (const p of visibles.value) {
    try {
      const { sig, analisis } = await cargarYAnalizar(sesion.value, p)
      out[p.canalIndex] = markRaw({ ...datosGrafico(sig, analisis), analisis, n: sig.n })
    } catch {
      out[p.canalIndex] = null
    }
  }
  graficos.value = out
}
onMounted(cargar)

async function guardarEdicion(valores) {
  ocupado.value = true
  try {
    if (utilizable.value) await monitoreos.actualizar(sesion.value.id, valores)
    else await monitoreos.guardar(sesion.value.id, valores)
    sesion.value = await getSession(sesion.value.id)
    editando.value = false
    notify('Cambios guardados.', { tipo: 'ok' })
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  } finally {
    ocupado.value = false
  }
}

const cambiandoVis = ref(false)
async function guardarVisibilidad(valores) {
  ocupado.value = true
  try {
    await monitoreos.cambiarVisibilidad(sesion.value.id, valores)
    sesion.value = await getSession(sesion.value.id)
    cambiandoVis.value = false
    notify(visibilidadDe(sesion.value) === 'publico' ? 'El monitoreo ahora es público.' : 'El monitoreo ahora es privado.', { tipo: 'ok' })
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  } finally {
    ocupado.value = false
  }
}

async function descartar() {
  ocupado.value = true
  try {
    await monitoreos.descartar(sesion.value.id)
    router.push('/monitoreos')
  } catch (e) {
    notify(e.message, { tipo: 'error' })
    ocupado.value = false
  }
}

async function eliminar() {
  ocupado.value = true
  try {
    const r = await monitoreos.eliminar([sesion.value.id])
    if (r.rechazados.length) throw new Error(r.rechazados[0].motivo)
    notify('Monitoreo eliminado (local y nube).', { tipo: 'ok' })
    router.push('/monitoreos')
  } catch (e) {
    notify(`No se pudo eliminar: ${e.message}`, { tipo: 'error' })
    ocupado.value = false
  }
}

async function exportar() {
  const { tipo, participante } = exportando.value
  ocupado.value = true
  try {
    if (tipo === 'csv') await exportador.csv([sesion.value])
    else if (tipo === 'json') await exportador.json([sesion.value], { incluirNotas: incluirNotas.value })
    else await exportador.informe(sesion.value, participante, { formato: tipo, incluirNotas: incluirNotas.value })
    notify('Archivo generado.', { tipo: 'ok' })
    exportando.value = null
  } catch (e) {
    notify(`No se pudo exportar: ${e.message}`, { tipo: 'error' })
  } finally {
    ocupado.value = false
  }
}

const etiqueta = (p) => users.byId(p.usuarioId)?.etiqueta ?? 'Usuario eliminado'
const pct = (v) => (v === null || v === undefined ? '--' : `${v} %`)
const nombresDe = computed(() => ({ csv: 'CSV', json: 'JSON', pdf: 'informe PDF', 'informe-csv': 'informe CSV' }))
</script>

<template>
  <section>
    <div class="page-header">
      <h1>{{ sesion ? nombreMonitoreo(sesion) : 'Detalle del monitoreo' }}</h1>
      <DataClassBadge level="sensitive" />
    </div>
    <RouterLink to="/monitoreos">← Volver a monitoreos</RouterLink>

    <p v-if="cargando" class="muted">Cargando…</p>
    <EmptyState v-else-if="!sesion || !visibles.length" titulo="Monitoreo no encontrado" texto="No existe, fue eliminado o no tienes acceso a él.">
      <RouterLink to="/monitoreos" class="btn">Ver mis monitoreos</RouterLink>
    </EmptyState>

    <template v-else>
      <div class="card info">
        <div class="row">
          <span :class="['chip', infoEstado(estado).clase]">{{ infoEstado(estado).nombre }}</span>
          <span v-if="actividadPrincipal(sesion, visibles)" class="chip neutral">{{ nombreActividad(actividadPrincipal(sesion, visibles)) }}</span>
        </div>
        <p>
          Inicio: <strong>{{ formatFecha(sesion.inicio) }}</strong> · Fin: <strong>{{ formatFecha(sesion.fin) }}</strong>
          <template v-if="sesion.motivoFin"> · motivo del fin: {{ sesion.motivoFin }}</template>
        </p>
        <p v-if="sesion.notas" class="nota"><strong>Nota:</strong> {{ sesion.notas }}</p>
        <div class="row">
          <button class="btn" data-testid="editar-monitoreo" :disabled="estado === 'en-curso'" @click="editando = true">{{ utilizable ? 'Editar' : 'Guardar monitoreo' }}</button>
          <button v-if="utilizable" class="btn" data-testid="cambiar-visibilidad" @click="cambiandoVis = true">Visibilidad: {{ visibilidadDe(sesion) === 'publico' ? 'Público' : 'Privado' }}</button>
          <button class="btn" data-testid="exportar-csv" @click="exportando = { tipo: 'csv' }">CSV</button>
          <button class="btn" @click="exportando = { tipo: 'json' }">JSON</button>
          <RouterLink v-if="utilizable" :to="{ path: '/comparar', query: { a: sesion.id } }" class="btn">Comparar</RouterLink>
          <RouterLink v-if="utilizable" :to="{ path: '/aprende/mis-monitoreos', query: { id: sesion.id } }" class="btn">Aprender con este monitoreo</RouterLink>
          <button v-if="puedeEliminar(sesion, ctx) && estado !== 'en-curso'" class="btn danger" data-testid="eliminar-monitoreo" @click="eliminando = true">Eliminar</button>
        </div>
      </div>

      <article v-for="p in visibles" :key="p.canalIndex" class="card">
        <h2>{{ etiqueta(p) }} · {{ p.canalNombre }}</h2>
        <p class="muted small">
          Fuente: {{ p.fuente.tipo }} ({{ p.fuente.perfilId }}) · {{ p.fs }} Hz · estado final: {{ p.estadoFinal ?? 'en curso' }}<template v-if="p.motivoFin"> ({{ p.motivoFin }})</template>
        </p>

        <div v-if="p.resumen" class="grid cols-3 resumen">
          <div><span class="muted small">Duración</span><br><strong class="mono">{{ formatDuracion(p.resumen.duracionMs) }}</strong></div>
          <div><span class="muted small">BPM medio</span><br><strong class="mono" data-testid="bpm-medio">{{ p.resumen.bpmMedio ?? '--' }}</strong></div>
          <div><span class="muted small">BPM mínimo / máximo</span><br><strong class="mono">{{ p.resumen.bpmMin ?? '--' }} / {{ p.resumen.bpmMax ?? '--' }}</strong></div>
          <div><span class="muted small">Tiempo fuera de rango</span><br><strong class="mono">{{ pct(p.resumen.pctFueraRango) }}</strong></div>
          <div><span class="muted small">Muestras</span><br><strong class="mono">{{ p.resumen.muestras }}</strong></div>
          <div><span class="muted small">Líneas descartadas</span><br><strong class="mono">{{ p.resumen.descartadas }}</strong></div>
        </div>
        <p v-else class="muted">Este monitoreo no tiene resumen (se interrumpió antes de cerrarse).</p>

        <h3>Señal grabada</h3>
        <template v-if="graficos[p.canalIndex]">
          <p class="muted small">
            {{ graficos[p.canalIndex].n }} muestras. Puntos rojos: {{ graficos[p.canalIndex].analisis.picos.length }} picos detectados
            en el tramo analizado (máx. 30 s). Calidad de la señal: <strong>{{ graficos[p.canalIndex].analisis.calidad.nivel }}</strong>.
            Los huecos son pérdidas de contacto.
          </p>
          <SignalChart :data="graficos[p.canalIndex].data" :series="series" :marcas="graficos[p.canalIndex].marcas" :height="280" y-label="ADC" />
          <div class="row">
            <button class="btn" data-testid="informe-pdf" @click="exportando = { tipo: 'pdf', participante: p }">Informe PDF</button>
            <button class="btn" @click="exportando = { tipo: 'informe-csv', participante: p }">Informe CSV</button>
          </div>
        </template>
        <p v-else-if="p.canalIndex in graficos" class="muted">No se pudo leer la señal de este monitoreo.</p>
        <p v-else class="muted">Descifrando señal…</p>

        <h3>Actividad</h3>
        <ol class="timeline">
          <li v-for="(a, i) in p.actividad" :key="i"><span class="mono">{{ formatDuracion(a.tMs) }}</span> · {{ nombreActividad(a.valor) }}</li>
        </ol>

        <h3>Eventos</h3>
        <p v-if="!p.eventos.length" class="muted small">Sin eventos.</p>
        <ul v-else class="eventos">
          <li v-for="(e, i) in p.eventos.slice(0, 200)" :key="i"><span class="mono">{{ formatDuracion(e.tMs) }}</span> · {{ nombreEvento(e.tipo) }}</li>
        </ul>
      </article>

      <section v-if="par" class="card">
        <h2>Parámetros aplicados</h2>
        <p class="muted small">Valores vigentes cuando se grabó el monitoreo (RF15): no cambian aunque el administrador los modifique después.</p>
        <ul class="params">
          <li>Rango global: <strong>{{ par.bpm.global.min }}–{{ par.bpm.global.max }} BPM</strong></li>
          <li>Rangos por actividad: <strong>{{ par.bpm.usarPorActividad ? 'sí' : 'no' }}</strong>
            <template v-if="par.bpm.usarPorActividad"> ({{ Object.entries(par.bpm.porActividad).map(([k, r]) => `${nombreActividad(k)} ${r.min}–${r.max}`).join('; ') }})</template>
          </li>
          <li>Fuente del BPM: <strong>{{ par.bpm.fuenteBpm }}</strong></li>
          <li>Alertas: duración mínima {{ par.alertas.duracionMinMs }} ms, histéresis {{ par.alertas.histeresisBpm }} BPM</li>
          <li>Señal perdida: aviso a {{ par.adquisicion.watchdogMs }} ms, fin a {{ par.adquisicion.finTrasPerdidaMs }} ms</li>
        </ul>
      </section>
    </template>

    <VisibilityDialog v-if="cambiandoVis && sesion" :sesion="sesion" :ocupado="ocupado" @guardar="guardarVisibilidad" @cerrar="cambiandoVis = false" />
    <SaveMonitoringDialog v-if="editando && sesion" :sesion="sesion" :modo="utilizable ? 'editar' : 'guardar'" :ocupado="ocupado" @guardar="guardarEdicion" @descartar="descartar" @cerrar="editando = false" />

    <BaseDialog v-if="eliminando" titulo="Eliminar monitoreo" @cerrar="eliminando = false">
      <p>Se eliminará <strong>definitivamente</strong> este monitoreo y sus muestras, en este navegador y en la nube si está activada. No se puede deshacer.</p>
      <template #acciones>
        <button class="btn" @click="eliminando = false">Cancelar</button>
        <button class="btn danger" data-testid="confirmar-eliminar" :disabled="ocupado" @click="eliminar">Eliminar definitivamente</button>
      </template>
    </BaseDialog>

    <ExportWarningDialog
      v-if="exportando"
      :ocupado="ocupado"
      :boton="`Entiendo, descargar ${nombresDe[exportando.tipo]}`"
      detalle="El archivo va seudonimizado (Usuario N), sin alias ni datos opcionales."
      @confirmar="exportar"
      @cancelar="exportando = null"
    >
      <label v-if="exportando.tipo !== 'csv'" class="check"><input v-model="incluirNotas" type="checkbox"> Incluir la nota del monitoreo (texto libre: revísala antes)</label>
    </ExportWarningDialog>
  </section>
</template>

<style scoped>
.info {
  margin: var(--gap) 0;
}

.nota {
  white-space: pre-wrap;
}

.resumen {
  margin: 12px 0;
}

.timeline,
.eventos {
  max-height: 220px;
  overflow-y: auto;
  padding-left: 20px;
}

.params {
  padding-left: 20px;
}
</style>
