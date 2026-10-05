<script setup>
import { ref, computed, onMounted } from 'vue'
import DataClassBadge from '@/components/common/DataClassBadge.vue'
import { useAdminStore } from '@/stores/admin.js'
import { useAuthStore } from '@/stores/auth.js'
import { AUDIT_EVENTS } from '@/services/audit/auditLog.js'
import { formatFecha } from '@/utils/time.js'
import { notify } from '@/services/notifications/notifier.js'

/** SEC-41: auditoría filtrable con verificación de la cadena de hashes al abrir. */
const admin = useAdminStore()
const auth = useAuthStore()
const entradas = ref([])
const integridad = ref(null)
const filtroEvento = ref('')
const desde = ref('')
const hasta = ref('')

async function cargar() {
  try {
    entradas.value = (await admin.readAudit()).reverse()
    integridad.value = await admin.verifyAudit()
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  }
}
onMounted(cargar)

const filtradas = computed(() =>
  entradas.value.filter((e) => {
    if (filtroEvento.value && e.event !== filtroEvento.value) return false
    if (desde.value && e.ts < new Date(desde.value).toISOString()) return false
    if (hasta.value && e.ts > new Date(`${hasta.value}T23:59:59.999`).toISOString()) return false
    return true
  }),
)

function detalle(d) {
  return Object.entries(d || {})
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' · ')
}

async function exportar() {
  try {
    await admin.exportAudit()
    await cargar()
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  }
}
</script>

<template>
  <section>
    <div class="page-header">
      <h1>Auditoría</h1>
      <div class="row">
        <DataClassBadge level="confidential" texto="Registro de auditoría" />
        <RouterLink to="/admin" class="btn small">Volver</RouterLink>
        <button class="btn small danger" @click="auth.logout()">Cerrar sesión</button>
      </div>
    </div>

    <p v-if="integridad" :class="['alert', integridad.ok ? 'ok' : 'danger']" role="status">
      Integridad de la cadena:
      <strong v-if="integridad.ok">OK</strong>
      <strong v-else>ROTA en #{{ integridad.brokenAt }}</strong>
      ({{ integridad.count }} entradas; se conservan como máximo 5000 o 180 días).
    </p>

    <div class="row filtros">
      <div class="field">
        <label for="f-ev">Evento</label>
        <select id="f-ev" v-model="filtroEvento">
          <option value="">Todos</option>
          <option v-for="e in AUDIT_EVENTS" :key="e" :value="e">{{ e }}</option>
        </select>
      </div>
      <div class="field"><label for="f-desde">Desde</label><input id="f-desde" v-model="desde" type="date"></div>
      <div class="field"><label for="f-hasta">Hasta</label><input id="f-hasta" v-model="hasta" type="date"></div>
      <button class="btn" @click="cargar">Actualizar y verificar</button>
      <button class="btn" @click="exportar">Exportar log (JSON)</button>
    </div>

    <div class="card table-wrap">
      <table>
        <thead><tr><th>#</th><th>Fecha</th><th>Evento</th><th>Actor</th><th>Detalle</th><th>Hash</th></tr></thead>
        <tbody>
          <tr v-for="e in filtradas" :key="e.seq" :class="{ rota: integridad && !integridad.ok && e.seq === integridad.brokenAt }">
            <td class="mono">{{ e.seq }}</td>
            <td class="small">{{ formatFecha(e.ts) }}</td>
            <td class="mono small">{{ e.event }}</td>
            <td class="small">{{ e.actor }}</td>
            <td class="small">{{ detalle(e.details) }}</td>
            <td class="mono small" :title="e.hash">{{ e.hash.slice(0, 10) }}…</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!filtradas.length" class="muted">Sin entradas.</p>
    </div>
  </section>
</template>

<style scoped>
.filtros {
  align-items: flex-end;
  margin-bottom: var(--gap);
}

input[type='date'] {
  min-height: var(--touch);
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px;
}

.rota {
  background: rgb(255 92 108 / 0.15);
}
</style>
