<script setup>
import { ref, computed, onMounted } from 'vue'
import DataClassBadge from '@/components/common/DataClassBadge.vue'
import { useAdminStore } from '@/stores/admin.js'
import { useAuthStore } from '@/stores/auth.js'
import { AUDIT_EVENTS } from '@/services/audit/auditLog.js'
import { formatFecha } from '@/utils/time.js'
import { notify } from '@/services/notifications/notifier.js'
import TotpRenovarDialog from '@/components/admin/TotpRenovarDialog.vue'
import { adminLeerAuditoria, verificarCadenaNube } from '@/services/cloud/cloudSync.js'
import { conRenovacionTotp } from '@/services/security/adminRenovacion.js'
import { downloadText } from '@/services/export/csvExporter.js'
import { stampUtc } from '@/utils/time.js'

/** SEC-41 (ISO 27001:2013 A.12.4.1–A.12.4.3): auditoría filtrable con verificación de la cadena de hashes al abrir. */
const admin = useAdminStore()
const auth = useAuthStore()
const entradas = ref([])
const integridad = ref(null)
const filtroEvento = ref('')
const desde = ref('')
const hasta = ref('')

// ---------- Auditoría de la nube (C-08): lectura por RPC, solo administrador con TOTP reciente ----------
const vista = ref('local') // 'local' | 'nube'
const hayNube = auth.nube
const nube = ref([])
const nubeCargando = ref(false)
const nubeError = ref('')
const nubeHayMas = ref(false)
const cadena = ref(null) // { ok, filas, rotoEn } | null
const PAGINA = 100

async function cargarNube({ mas = false } = {}) {
  nubeCargando.value = true
  nubeError.value = ''
  try {
    auth.assertAdmin()
    const antesDeId = mas && nube.value.length ? nube.value[nube.value.length - 1].id : null
    const desdeIso = desde.value ? new Date(desde.value).toISOString() : null
    const filas = await conRenovacionTotp(() => adminLeerAuditoria({ limite: PAGINA, desde: desdeIso, antesDeId }))
    nube.value = mas ? [...nube.value, ...filas] : filas
    nubeHayMas.value = filas.length === PAGINA
  } catch (e) {
    nubeError.value = e?.cancelado ? 'Verificación cancelada.' : 'No se pudo leer la auditoría de la nube (se requieren privilegios de administrador).'
  } finally {
    nubeCargando.value = false
  }
}

async function verificarNube() {
  try {
    auth.assertAdmin()
    cadena.value = await conRenovacionTotp(() => verificarCadenaNube())
  } catch (e) {
    if (!e?.cancelado) notify('No se pudo verificar la cadena de la nube.', { tipo: 'error' })
  }
}

function abrirNube() {
  vista.value = 'nube'
  if (!nube.value.length) cargarNube()
}

const nubeFiltrada = computed(() =>
  nube.value.filter((e) => {
    if (filtroEvento.value && e.tipo !== filtroEvento.value) return false
    if (hasta.value && e.ts > new Date(`${hasta.value}T23:59:59.999`).toISOString()) return false
    return true
  }),
)

function exportarNube() {
  downloadText(JSON.stringify({ exportado: new Date().toISOString(), cadena: cadena.value, entradas: nubeFiltrada.value }, null, 2), `auditoria_nube_${stampUtc()}.json`, 'application/json')
}

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

    <div v-if="hayNube" class="tabs" role="tablist">
      <button role="tab" :aria-selected="vista === 'local'" :class="{ active: vista === 'local' }" @click="vista = 'local'">Este navegador</button>
      <button role="tab" :aria-selected="vista === 'nube'" :class="{ active: vista === 'nube' }" @click="abrirNube">Nube</button>
    </div>

    <template v-if="vista === 'nube'">
      <p class="alert info small">
        Registro central de la nube: <strong>el servidor</strong> fija la hora, la cuenta y el actor de cada evento, y encadena un hash para detectar manipulaciones.
        Se conserva 2 años. Los accesos excepcionales del administrador a datos ajenos aparecen aquí como <span class="mono">ADMIN_DATA_ACCESS</span>.
      </p>
      <p v-if="cadena" :class="['alert', cadena.ok ? 'ok' : 'danger']" role="status" data-testid="cadena-nube">
        Cadena de la nube:
        <strong v-if="cadena.ok">OK</strong>
        <strong v-else>ROTA en #{{ cadena.rotoEn }}</strong>
        ({{ cadena.filas }} entradas verificadas).
      </p>
      <div class="row filtros">
        <div class="field">
          <label for="n-ev">Evento</label>
          <select id="n-ev" v-model="filtroEvento">
            <option value="">Todos</option>
            <option v-for="e in AUDIT_EVENTS" :key="e" :value="e">{{ e }}</option>
          </select>
        </div>
        <div class="field"><label for="n-desde">Desde</label><input id="n-desde" v-model="desde" type="date"></div>
        <div class="field"><label for="n-hasta">Hasta</label><input id="n-hasta" v-model="hasta" type="date"></div>
        <button class="btn" :disabled="nubeCargando" @click="cargarNube()">Actualizar</button>
        <button class="btn" @click="verificarNube">Verificar cadena</button>
        <button class="btn" :disabled="!nubeFiltrada.length" @click="exportarNube">Exportar (JSON)</button>
      </div>
      <p v-if="nubeError" class="error-text" role="alert">{{ nubeError }}</p>
      <div class="card table-wrap">
        <table data-testid="tabla-auditoria-nube">
          <thead><tr><th>#</th><th>Fecha</th><th>Evento</th><th>Actor</th><th>Cuenta</th><th>Detalle</th><th>Hash</th></tr></thead>
          <tbody>
            <tr v-for="e in nubeFiltrada" :key="e.id">
              <td class="mono">{{ e.n ?? '—' }}</td>
              <td class="small" :title="`${e.ts} (UTC)`">{{ formatFecha(e.ts) }}</td>
              <td class="mono small">{{ e.tipo }}</td>
              <td class="small">{{ e.actor }}</td>
              <td class="mono small" :title="e.usuario ?? ''">{{ e.usuario ? e.usuario.slice(0, 8) + '…' : '—' }}</td>
              <td class="small">{{ detalle(e.detalle) }}</td>
              <td class="mono small" :title="e.hash ?? ''">{{ e.hash ? e.hash.slice(0, 10) + '…' : '—' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="!nubeFiltrada.length && !nubeCargando" class="muted">Sin entradas.</p>
        <button v-if="nubeHayMas" class="btn small" :disabled="nubeCargando" @click="cargarNube({ mas: true })">Cargar más</button>
      </div>
    </template>

    <template v-else>
    <p v-if="integridad" :class="['alert', integridad.ok ? 'ok' : 'danger']" role="status">
      Integridad de la cadena:
      <strong v-if="integridad.ok">OK</strong>
      <strong v-else>ROTA en #{{ integridad.brokenAt }}</strong>
      ({{ integridad.count }} entradas; se conservan como máximo 5000 o 180 días). Marcas de tiempo guardadas en UTC ISO-8601 (A.12.4.4); se muestran en hora local.
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
            <td class="small" :title="`${e.ts} (UTC)`">{{ formatFecha(e.ts) }}</td>
            <td class="mono small">{{ e.event }}</td>
            <td class="small">{{ e.actor }}</td>
            <td class="small">{{ detalle(e.details) }}</td>
            <td class="mono small" :title="e.hash">{{ e.hash.slice(0, 10) }}…</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!filtradas.length" class="muted">Sin entradas.</p>
    </div>
    </template>
    <TotpRenovarDialog />
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
