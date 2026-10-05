<script setup>
import { ref, computed, onMounted } from 'vue'
import EmptyState from '@/components/common/EmptyState.vue'
import DataClassBadge from '@/components/common/DataClassBadge.vue'
import ExportWarningDialog from '@/components/common/ExportWarningDialog.vue'
import { useUsersStore } from '@/stores/users.js'
import { useAuthStore } from '@/stores/auth.js'
import { useSessionStore } from '@/stores/session.js'
import { listSessions, deleteSession } from '@/services/storage/sessionRepository.js'
import { buildSessionsCsv } from '@/services/export/sessionExport.js'
import { exportFilename, downloadText } from '@/services/export/csvExporter.js'
import { audit } from '@/services/audit/auditService.js'
import { notify } from '@/services/notifications/notifier.js'
import { formatFecha, formatDuracion } from '@/utils/time.js'
import { nombreActividad, ACTIVIDADES } from '@/data/activities.js'

/** Historial de sesiones. El participante solo ve y exporta las suyas (8.3, SEC-43). */
const users = useUsersStore()
const auth = useAuthStore()
const sessionStore = useSessionStore()
const sesiones = ref([])
const cargando = ref(true)
const filtroActividad = ref('')
const exportando = ref(null)
const ocupado = ref(false)

const verTodas = computed(() => auth.isAdmin && !users.activeUserId)

async function cargar() {
  cargando.value = true
  sesiones.value = await listSessions({ usuarioId: verTodas.value ? null : users.activeUserId })
  cargando.value = false
}
onMounted(cargar)

function estadoDe(s) {
  if (s.estado === 'activa' && sessionStore.actual?.id !== s.id) return 'interrumpida'
  return s.estado
}

function duracion(s) {
  if (!s.fin) return '—'
  return formatDuracion(Date.parse(s.fin) - Date.parse(s.inicio))
}

function participantesVisibles(s) {
  return verTodas.value ? s.participantes : s.participantes.filter((p) => p.usuarioId === users.activeUserId)
}

const filtradas = computed(() =>
  sesiones.value.filter((s) => !filtroActividad.value || participantesVisibles(s).some((p) => p.actividad.some((a) => a.valor === filtroActividad.value))),
)

async function exportar() {
  const s = exportando.value
  ocupado.value = true
  try {
    const u = users.activeUser
    const { csv, filas } = await buildSessionsCsv({ sessions: [s], usuarioId: u.id, userById: users.byId })
    downloadText(csv, exportFilename(u.etiqueta))
    await audit('EXPORT_CSV', `participant:${u.etiqueta}`, { scope: 'propia', rows: filas, pseudonymized: true })
    exportando.value = null
  } catch (e) {
    notify(`No se pudo exportar: ${e.message}`, { tipo: 'error' })
  } finally {
    ocupado.value = false
  }
}

async function borrar(s) {
  try {
    auth.assertAdmin()
    if (!window.confirm('¿Eliminar definitivamente esta sesión y sus muestras?')) return
    await deleteSession(s.id)
    await cargar()
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  }
}
</script>

<template>
  <section>
    <div class="page-header">
      <h1>Sesiones de medición</h1>
      <DataClassBadge level="sensitive" />
    </div>
    <p class="muted">
      {{ verTodas ? 'Vista de administrador: todas las sesiones.' : `Sesiones de ${users.activeUser?.etiqueta}.` }}
      Las sesiones se purgan automáticamente tras el plazo de retención.
    </p>

    <div class="row filtros">
      <label for="f-act" class="sr-only">Filtrar por actividad</label>
      <select id="f-act" v-model="filtroActividad" class="filtro">
        <option value="">Todas las actividades</option>
        <option v-for="a in ACTIVIDADES" :key="a.id" :value="a.id">{{ a.nombre }}</option>
      </select>
      <button class="btn small" @click="cargar">Actualizar</button>
    </div>

    <p v-if="cargando" class="muted">Cargando…</p>
    <EmptyState v-else-if="!filtradas.length" titulo="No hay sesiones" texto="Inicia una sesión de medición desde el monitor.">
      <RouterLink to="/monitor" class="btn primary">Ir al monitor</RouterLink>
    </EmptyState>

    <div v-else class="table-wrap card">
      <table>
        <thead>
          <tr>
            <th>Inicio</th>
            <th>Duración</th>
            <th>Participantes</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in filtradas" :key="s.id">
            <td>{{ formatFecha(s.inicio) }}</td>
            <td class="mono">{{ duracion(s) }}</td>
            <td>
              <div v-for="p in participantesVisibles(s)" :key="p.canalIndex" class="small">
                {{ users.byId(p.usuarioId)?.etiqueta ?? 'Usuario eliminado' }} · {{ p.canalNombre }} ·
                {{ p.actividad.map((a) => nombreActividad(a.valor)).join(' → ') }}
              </div>
            </td>
            <td>
              <span :class="['chip', estadoDe(s) === 'finalizada' ? 'ok' : estadoDe(s) === 'activa' ? 'info' : 'warn']">{{ estadoDe(s) }}</span>
              <div v-if="s.motivoFin" class="muted small">motivo: {{ s.motivoFin }}</div>
            </td>
            <td class="acciones">
              <RouterLink :to="`/sesiones/${s.id}`" class="btn small">Ver</RouterLink>
              <button v-if="users.activeUser" class="btn small" @click="exportando = s">Exportar CSV</button>
              <button v-if="auth.isAdmin" class="btn small danger" @click="borrar(s)">Eliminar</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ExportWarningDialog
      v-if="exportando"
      :ocupado="ocupado"
      :detalle="`Se exportarán solo tus filas (${users.activeUser?.etiqueta}), seudonimizadas, con columnas user_id, session_id, t_ms, ecg_raw, leads_off, bpm, activity.`"
      @confirmar="exportar"
      @cancelar="exportando = null"
    />
  </section>
</template>

<style scoped>
.filtros {
  margin-bottom: var(--gap);
}

.filtro {
  max-width: 280px;
}

.acciones {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
