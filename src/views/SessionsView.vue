<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import DataClassBadge from '@/components/common/DataClassBadge.vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import ExportWarningDialog from '@/components/common/ExportWarningDialog.vue'
import HistorialDialog from '@/components/monitoreos/HistorialDialog.vue'
import SaveMonitoringDialog from '@/components/monitoreos/SaveMonitoringDialog.vue'
import { useUsersStore } from '@/stores/users.js'
import { useAuthStore } from '@/stores/auth.js'
import { useMonitoreosStore } from '@/stores/monitoreos.js'
import { useExportMonitoreos } from '@/composables/useExportMonitoreos.js'
import {
  filtrarMonitoreos, ordenarMonitoreos, estadoMonitoreo, infoEstado, nombreMonitoreo, participantesVisibles, resumenVisible,
  duracionMs, actividadPrincipal, textoActividades, puedeEliminar, ESTADOS_MONITOREO, CAMPOS_ORDEN, esUtilizable,
} from '@/services/monitoreos/catalog.js'
import { ACTIVIDADES, nombreActividad } from '@/data/activities.js'
import { notify } from '@/services/notifications/notifier.js'
import { formatFecha, formatDuracion } from '@/utils/time.js'

/** Gestión de monitoreos: filtros, selección múltiple, editar, eliminar y exportar (CSV/JSON). */
const users = useUsersStore()
const auth = useAuthStore()
const monitoreos = useMonitoreosStore()
const exportador = useExportMonitoreos()
const router = useRouter()

const filtros = reactive({ texto: '', usuarioId: '', desde: '', hasta: '', actividad: '', estado: '' })
const orden = reactive({ campo: 'fecha', dir: 'desc' })
const seleccion = ref(new Set())
const editando = ref(null)
const eliminando = ref(null) // array de ids
const exportando = ref(null) // { tipo, sesiones }
const incluirMuestras = ref(false)
const ocupado = ref(false)
const verHistorial = ref(false)

onMounted(async () => {
  try {
    await monitoreos.refrescar()
  } catch (e) {
    notify(`No se pudieron leer los monitoreos: ${e.message}`, { tipo: 'error' })
  }
})

const ctx = computed(() => monitoreos.ctx)
const verTodas = computed(() => auth.isAdmin && !users.activeUserId)
const usuariosFiltro = computed(() => {
  const ids = new Set()
  for (const s of monitoreos.visiblesLista) for (const p of participantesVisibles(s, ctx.value)) ids.add(p.usuarioId)
  return [...ids].map((id) => ({ id, etiqueta: users.byId(id)?.etiqueta ?? 'Usuario eliminado' }))
})
const lista = computed(() => ordenarMonitoreos(filtrarMonitoreos(monitoreos.visiblesLista, filtros, ctx.value), orden, ctx.value))
const hayFiltros = computed(() => Object.values(filtros).some(Boolean))
const aviso = computed(() => `${lista.value.length} de ${monitoreos.visiblesLista.length} monitoreo(s)`)
const seleccionadas = computed(() => lista.value.filter((s) => seleccion.value.has(s.id)))
const todasMarcadas = computed(() => lista.value.length > 0 && lista.value.every((s) => seleccion.value.has(s.id)))
const paraComparar = computed(() => seleccionadas.value.length >= 1 && seleccionadas.value.length <= 2 && seleccionadas.value.every(esUtilizable))

function limpiar() {
  Object.assign(filtros, { texto: '', usuarioId: '', desde: '', hasta: '', actividad: '', estado: '' })
}

function marcar(id, valor) {
  const s = new Set(seleccion.value)
  if (valor) s.add(id)
  else s.delete(id)
  seleccion.value = s
}

function marcarTodas(valor) {
  seleccion.value = valor ? new Set(lista.value.map((s) => s.id)) : new Set()
}

const estadoDe = (s) => estadoMonitoreo(s, ctx.value.sesionActivaId)
const duracionTxt = (s) => (duracionMs(s) === null ? '—' : formatDuracion(duracionMs(s)))
const usuariosTxt = (s) => participantesVisibles(s, ctx.value).map((p) => users.byId(p.usuarioId)?.etiqueta ?? 'Usuario eliminado').join(', ')
const actividadTxt = (s) => {
  const a = actividadPrincipal(s, participantesVisibles(s, ctx.value))
  return a ? nombreActividad(a) : '—'
}
const bpmTxt = (s) => resumenVisible(s, ctx.value)?.bpmMedio ?? '--'
const eliminable = (s) => puedeEliminar(s, ctx.value) && estadoDe(s) !== 'en-curso'

async function guardarEdicion(valores) {
  ocupado.value = true
  try {
    const s = editando.value
    if (estadoDe(s) === 'borrador' || estadoDe(s) === 'interrumpida') await monitoreos.guardar(s.id, valores)
    else await monitoreos.actualizar(s.id, valores)
    notify('Monitoreo guardado.', { tipo: 'ok' })
    editando.value = null
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  } finally {
    ocupado.value = false
  }
}

async function descartarEdicion() {
  ocupado.value = true
  try {
    await monitoreos.descartar(editando.value.id)
    notify('Monitoreo descartado.', { tipo: 'info' })
    editando.value = null
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  } finally {
    ocupado.value = false
  }
}

async function confirmarEliminar() {
  ocupado.value = true
  try {
    const r = await monitoreos.eliminar(eliminando.value)
    seleccion.value = new Set()
    if (r.eliminados.length) notify(`${r.eliminados.length} monitoreo(s) eliminado(s) (local y nube).`, { tipo: 'ok' })
    for (const x of r.rechazados) notify(`No se eliminó un monitoreo: ${x.motivo}.`, { tipo: 'error' })
    eliminando.value = null
  } catch (e) {
    notify(`No se pudo eliminar: ${e.message}`, { tipo: 'error' })
  } finally {
    ocupado.value = false
  }
}

async function confirmarExportar() {
  const { tipo, sesiones } = exportando.value
  ocupado.value = true
  try {
    if (tipo === 'csv') await exportador.csv(sesiones)
    else await exportador.json(sesiones, { incluirMuestras: incluirMuestras.value })
    notify('Archivo generado.', { tipo: 'ok' })
    exportando.value = null
  } catch (e) {
    notify(`No se pudo exportar: ${e.message}`, { tipo: 'error' })
  } finally {
    ocupado.value = false
  }
}

function comparar() {
  const [a, b] = seleccionadas.value
  router.push({ path: '/comparar', query: { a: a.id, ...(b ? { b: b.id } : {}) } })
}

const textoEliminar = computed(() => {
  const n = eliminando.value?.length ?? 0
  return n === 1 ? 'este monitoreo' : `${n} monitoreos`
})
</script>

<template>
  <section>
    <div class="page-header">
      <h1>Monitoreos</h1>
      <DataClassBadge level="sensitive" />
    </div>
    <p class="muted">
      {{ verTodas ? 'Vista de administrador: todos los monitoreos.' : `Monitoreos de ${users.activeUser?.etiqueta}.` }}
      Se purgan automáticamente tras el plazo de retención. Para crear uno ve a <RouterLink to="/monitor">Monitor</RouterLink>.
    </p>

    <div class="row barra">
      <button class="btn" data-testid="descargar-historial" @click="verHistorial = true">Descargar historial</button>
      <span class="muted small">Todas tus frecuencias cardíacas en CSV o PDF con gráfico de tendencia.</span>
    </div>

    <form class="card filtros" role="search" aria-label="Filtrar monitoreos" @submit.prevent>
      <div class="field">
        <label for="f-texto">Buscar (nombre, nota, usuario)</label>
        <input id="f-texto" v-model="filtros.texto" type="search" autocomplete="off">
      </div>
      <div v-if="verTodas || usuariosFiltro.length > 1" class="field">
        <label for="f-usuario">Usuario</label>
        <select id="f-usuario" v-model="filtros.usuarioId">
          <option value="">Todos</option>
          <option v-for="u in usuariosFiltro" :key="u.id" :value="u.id">{{ u.etiqueta }}</option>
        </select>
      </div>
      <div class="field">
        <label for="f-desde">Desde</label>
        <input id="f-desde" v-model="filtros.desde" type="date">
      </div>
      <div class="field">
        <label for="f-hasta">Hasta</label>
        <input id="f-hasta" v-model="filtros.hasta" type="date">
      </div>
      <div class="field">
        <label for="f-act">Actividad</label>
        <select id="f-act" v-model="filtros.actividad">
          <option value="">Todas</option>
          <option v-for="a in ACTIVIDADES" :key="a.id" :value="a.id">{{ a.nombre }}</option>
        </select>
      </div>
      <div class="field">
        <label for="f-estado">Estado</label>
        <select id="f-estado" v-model="filtros.estado">
          <option value="">Todos</option>
          <option v-for="e in ESTADOS_MONITOREO" :key="e.id" :value="e.id">{{ e.nombre }}</option>
        </select>
      </div>
      <div class="field">
        <label for="f-orden">Ordenar por</label>
        <select id="f-orden" v-model="orden.campo">
          <option v-for="c in CAMPOS_ORDEN" :key="c.id" :value="c.id">{{ c.nombre }}</option>
        </select>
      </div>
      <div class="field botones-f">
        <button type="button" class="btn" @click="orden.dir = orden.dir === 'asc' ? 'desc' : 'asc'">{{ orden.dir === 'asc' ? '↑ Ascendente' : '↓ Descendente' }}</button>
        <button type="button" class="btn ghost" :disabled="!hayFiltros" @click="limpiar">Limpiar filtros</button>
      </div>
    </form>
    <p class="sr-only" role="status" aria-live="polite">{{ aviso }}</p>

    <p v-if="monitoreos.cargando && !monitoreos.cargado" class="muted">Cargando…</p>
    <EmptyState v-else-if="!monitoreos.visiblesLista.length" titulo="Aún no hay monitoreos" texto="Mide con el simulador o un sensor, detén el monitoreo y pulsa «Guardar monitoreo».">
      <RouterLink to="/monitor" class="btn primary">Ir al monitor</RouterLink>
    </EmptyState>
    <EmptyState v-else-if="!lista.length" titulo="Ningún monitoreo coincide" texto="Prueba con otros filtros.">
      <button class="btn" @click="limpiar">Limpiar filtros</button>
    </EmptyState>

    <template v-else>
      <div class="row barra" role="group" aria-label="Acciones sobre la selección">
        <span class="muted small" aria-live="polite">{{ seleccionadas.length }} seleccionado(s) · {{ aviso }}</span>
        <button class="btn small" :disabled="!seleccionadas.length" data-testid="exportar-csv-seleccion" @click="exportando = { tipo: 'csv', sesiones: seleccionadas }">Exportar CSV</button>
        <button class="btn small" :disabled="!seleccionadas.length" @click="exportando = { tipo: 'json', sesiones: seleccionadas }">Exportar JSON</button>
        <button class="btn small" :disabled="!paraComparar" title="Elige 1 o 2 monitoreos guardados" @click="comparar">Comparar</button>
        <button class="btn small danger" :disabled="!seleccionadas.length" @click="eliminando = seleccionadas.map((s) => s.id)">Eliminar</button>
      </div>

      <div class="table-wrap card">
        <table data-testid="tabla-monitoreos">
          <caption class="sr-only">Monitoreos. {{ aviso }}</caption>
          <thead>
            <tr>
              <th scope="col"><input type="checkbox" :checked="todasMarcadas" aria-label="Seleccionar todos los monitoreos mostrados" @change="marcarTodas($event.target.checked)"></th>
              <th scope="col">Nombre</th>
              <th scope="col">Fecha</th>
              <th scope="col">Usuario</th>
              <th scope="col">Actividad</th>
              <th scope="col">Duración</th>
              <th scope="col">BPM medio</th>
              <th scope="col">Estado</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in lista" :key="s.id">
              <td><input type="checkbox" :checked="seleccion.has(s.id)" :aria-label="`Seleccionar ${nombreMonitoreo(s)}`" @change="marcar(s.id, $event.target.checked)"></td>
              <th scope="row"><RouterLink :to="`/monitoreos/${s.id}`">{{ nombreMonitoreo(s) }}</RouterLink></th>
              <td>{{ formatFecha(s.inicio) }}</td>
              <td>{{ usuariosTxt(s) }}</td>
              <td>
                {{ actividadTxt(s) }}
                <div v-if="participantesVisibles(s, ctx)[0]?.actividad?.length > 1" class="muted small">{{ textoActividades(s, participantesVisibles(s, ctx)) }}</div>
              </td>
              <td class="mono">{{ duracionTxt(s) }}</td>
              <td class="mono">{{ bpmTxt(s) }}</td>
              <td>
                <span :class="['chip', infoEstado(estadoDe(s)).clase]">{{ infoEstado(estadoDe(s)).nombre }}</span>
                <div v-if="s.motivoFin && s.motivoFin !== 'usuario'" class="muted small">motivo: {{ s.motivoFin }}</div>
              </td>
              <td class="acciones">
                <RouterLink :to="`/monitoreos/${s.id}`" class="btn small" :aria-label="`Ver ${nombreMonitoreo(s)}`">Ver</RouterLink>
                <button v-if="estadoDe(s) !== 'en-curso'" class="btn small" :aria-label="`${esUtilizable(s) ? 'Editar' : 'Guardar'} ${nombreMonitoreo(s)}`" @click="editando = s">{{ esUtilizable(s) ? 'Editar' : 'Guardar' }}</button>
                <button class="btn small" :aria-label="`Exportar CSV de ${nombreMonitoreo(s)}`" @click="exportando = { tipo: 'csv', sesiones: [s] }">CSV</button>
                <button v-if="eliminable(s)" class="btn small danger" :aria-label="`Eliminar ${nombreMonitoreo(s)}`" @click="eliminando = [s.id]">Eliminar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <HistorialDialog v-if="verHistorial" :usuario-id="verTodas ? null : users.activeUserId" @cerrar="verHistorial = false" />

    <SaveMonitoringDialog
      v-if="editando"
      :sesion="editando"
      :modo="esUtilizable(editando) ? 'editar' : 'guardar'"
      :ocupado="ocupado"
      @guardar="guardarEdicion"
      @descartar="descartarEdicion"
      @cerrar="editando = null"
    />

    <BaseDialog v-if="eliminando" titulo="Eliminar monitoreo" @cerrar="eliminando = null">
      <p>Se eliminará <strong>definitivamente</strong> {{ textoEliminar }}, con sus muestras, en este navegador y en la nube si está activada. No se puede deshacer.</p>
      <template #acciones>
        <button class="btn" @click="eliminando = null">Cancelar</button>
        <button class="btn danger" data-testid="confirmar-eliminar" :disabled="ocupado" @click="confirmarEliminar">Eliminar definitivamente</button>
      </template>
    </BaseDialog>

    <ExportWarningDialog
      v-if="exportando"
      :ocupado="ocupado"
      :boton="exportando.tipo === 'csv' ? 'Entiendo, descargar CSV' : 'Entiendo, descargar JSON'"
      :detalle="`Se exportarán ${exportando.sesiones.length} monitoreo(s), seudonimizados (Usuario N), sin alias ni datos opcionales. ${verTodas ? 'Incluye datos de todos los usuarios.' : 'Solo tus filas.'}`"
      @confirmar="confirmarExportar"
      @cancelar="exportando = null"
    >
      <label v-if="exportando.tipo === 'json'" class="check"><input v-model="incluirMuestras" type="checkbox"> Incluir las muestras (archivo mucho más grande)</label>
    </ExportWarningDialog>
  </section>
</template>

<style scoped>
.filtros {
  display: grid;
  gap: 8px 12px;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  margin-bottom: var(--gap);
}

.filtros .field {
  margin-bottom: 0;
}

.botones-f {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.barra {
  margin-bottom: var(--gap-sm);
}

.acciones {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
