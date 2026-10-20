<script setup>
import { ref, computed, onMounted } from 'vue'
import DataClassBadge from '@/components/common/DataClassBadge.vue'
import { useIsmsStore } from '@/stores/isms.js'
import { useUsersStore } from '@/stores/users.js'
import { useAuthStore } from '@/stores/auth.js'
import { cloudEnabled, cloudEstado } from '@/services/cloud/cloudSync.js'
import { listarAdministradores } from '@/services/security/adminMfa.js'
import { INCIDENT_TYPES, TRANSITIONS } from '@/services/security/incidents.js'
import { TIPOS_EVIDENCIA, RESPONSABLE_MAX, REFERENCIA_MAX } from '@/services/security/evidencias.js'
import { POLICY_VERSION, ACCESS_REVIEW_DAYS } from '@/services/security/isms.js'
import { formatFecha } from '@/utils/time.js'
import { notify } from '@/services/notifications/notifier.js'

/**
 * Panel del SGSI (ISO/IEC 27001:2013):
 *  - 9.1 indicadores de seguridad y objetivos (docs/sgsi/objetivos_seguridad.md)
 *  - A.9.2.5 revisión de los derechos de acceso de usuario
 *  - A.12.4.4 sincronización del reloj
 *  - A.16.1.4–A.16.1.6 evaluación, respuesta y cierre de incidentes
 */
const isms = useIsmsStore()
const users = useUsersStore()
const auth = useAuthStore()

const datos = ref(null)
const cargando = ref(false)

async function cargar() {
  cargando.value = true
  try {
    await users.ensureLoaded()
    datos.value = await isms.metrics()
    await isms.checkClock()
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  } finally {
    cargando.value = false
  }
}
onMounted(cargar)

// ---------- A.9.2.5 Revisión de accesos ----------
// Con nube, la lista sale del servidor (admin_listar_administradores: solo id y fecha). Sin nube, el PIN local.
const administradores = ref([])
const errorAdmins = ref('')
async function cargarAdministradores() {
  errorAdmins.value = ''
  if (!cloudEnabled) return
  try {
    administradores.value = await listarAdministradores()
  } catch (e) {
    administradores.value = []
    errorAdmins.value = e.message
  }
}
onMounted(cargarAdministradores)
const cuentas = computed(() => [
  ...(cloudEnabled
    ? administradores.value.map((a) => ({
        cuenta: `${a.email || `Administrador ${a.user_id.slice(0, 8)}…`} (alta ${formatFecha(a.creado_en)})`,
        rol: 'admin',
        estado: 'Rol asignado; privilegios solo con TOTP (aal2)',
        privilegios: 'Parámetros globales, auditoría, incidentes y moderación; el contenido ajeno solo con motivo escrito (auditado)',
      }))
    : [{ cuenta: 'Administrador local (PIN)', rol: 'admin', estado: auth.hasCredential ? 'Credencial definida (PBKDF2)' : 'Sin credencial', privilegios: 'Parámetros, auditoría, exportación global, borrado' }]),
  { cuenta: `Participantes (${users.users.length})`, rol: 'participant', estado: 'Seudónimos "Paciente N"; cuenta propia', privilegios: 'Solo sus datos (RLS propietario = auth.uid())' },
])
const confirmaRevision = ref(false)

async function registrarRevision() {
  try {
    await isms.recordAccessReview({
      participantes: users.users.length,
      adminLocal: !cloudEnabled && auth.hasCredential,
      administradoresNube: administradores.value.length,
      resultado: 'sin-cambios',
    })
    confirmaRevision.value = false
    notify('Revisión de accesos registrada en la auditoría.', { tipo: 'ok' })
    await cargar()
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  }
}

// ---------- C-10 Evidencias del SGSI (9.2 y 9.3) ----------
const ev = ref({ tipo: 'auditoria_interna', fecha: new Date().toISOString().slice(0, 10), responsable: '', referencia: '' })
const evError = ref('')
async function registrarEvidencia() {
  evError.value = ''
  try {
    await isms.registrarEvidencia({ ...ev.value })
    ev.value.responsable = ''
    ev.value.referencia = ''
    notify('Evidencia registrada en la auditoría.', { tipo: 'ok' })
  } catch (e) {
    evError.value = e.message
  }
}

// ---------- A.16 Incidentes ----------
const notas = ref({})
function nota(id) {
  if (!notas.value[id]) notas.value[id] = { respuesta: '', leccion: '' }
  return notas.value[id]
}
const ordenados = computed(() => [...isms.incidentes].reverse())

async function cambiarEstado(inc, estado) {
  try {
    await isms.update(inc.id, estado, nota(inc.id))
    notify(`Incidente ${estado.replace('_', ' ')}.`, { tipo: 'ok' })
    await cargar()
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  }
}

async function aceptarPolitica() {
  try {
    await isms.acceptPolicy()
    notify('Política aceptada.', { tipo: 'ok' })
    await cargar()
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  }
}
</script>

<template>
  <div>
    <section v-if="isms.debeAceptarPolitica" class="card alert warn" role="status">
      <h2>Concienciación (A.7.2.2)</h2>
      <p>Antes de administrar la plataforma, lee la <RouterLink to="/seguridad">política de seguridad y uso aceptable</RouterLink> (versión {{ POLICY_VERSION }}) y confirma que la aceptas.</p>
      <button class="btn primary" @click="aceptarPolitica">He leído y acepto la política</button>
    </section>

    <section class="card">
      <div class="row titulo">
        <h2>Indicadores de seguridad (cláusula 9.1)</h2>
        <button class="btn small" :disabled="cargando" @click="cargar">Actualizar</button>
      </div>
      <template v-if="datos">
        <div class="grid cols-3 kpis">
          <div class="kpi"><span class="muted small">Inicios de sesión fallidos ({{ datos.metricas.ventanaDias }} d)</span><strong>{{ datos.metricas.loginsFallidos }}</strong></div>
          <div class="kpi"><span class="muted small">Bloqueos por intentos</span><strong>{{ datos.metricas.bloqueos }}</strong></div>
          <div class="kpi"><span class="muted small">Integridad de la auditoría</span><strong :class="datos.metricas.integridadAuditoria === 'OK' ? 'ok-text' : 'error-text'">{{ datos.metricas.integridadAuditoria }}</strong></div>
          <div class="kpi"><span class="muted small">Incidentes abiertos (alta)</span><strong>{{ datos.metricas.incidentesAbiertos }} ({{ datos.metricas.incidentesAltaAbiertos }})</strong></div>
          <div class="kpi"><span class="muted small">Exportaciones CSV</span><strong>{{ datos.metricas.exportaciones }}</strong></div>
          <div class="kpi">
            <span class="muted small">Reloj vs. servidor (A.12.4.4)</span>
            <strong v-if="isms.reloj" :class="isms.reloj.ok ? 'ok-text' : 'error-text'">{{ isms.reloj.ok ? 'Sincronizado' : 'Desfasado' }} ({{ Math.round(isms.reloj.skewMs / 1000) }} s)</strong>
            <strong v-else class="muted">{{ cloudEnabled ? `Sin dato (${cloudEstado})` : 'Solo reloj local UTC' }}</strong>
          </div>
        </div>
        <h3>Objetivos de seguridad (6.2)</h3>
        <ul class="objetivos">
          <li v-for="o in datos.objetivos" :key="o.id"><span :class="['chip', o.cumple ? 'ok' : 'danger']">{{ o.cumple ? 'Cumple' : 'No cumple' }}</span> <span class="mono small">{{ o.id }}</span> {{ o.texto }}</li>
        </ul>
        <p class="muted small">Los objetivos no cumplidos se registran como no conformidad (10.1) en docs/sgsi/registro_no_conformidades.md.</p>
      </template>
    </section>

    <section class="card">
      <h2>Revisión de derechos de acceso (A.9.2.5)</h2>
      <p :class="['small', isms.revision.vencida ? 'error-text' : 'muted']">
        <template v-if="isms.revision.diasDesde === null">Nunca se ha registrado una revisión.</template>
        <template v-else>Última revisión hace {{ isms.revision.diasDesde }} días ({{ formatFecha(isms.ultimaRevisionUtc) }}).</template>
        Periodicidad: cada {{ ACCESS_REVIEW_DAYS }} días o al cambiar de responsable.
      </p>
      <p v-if="errorAdmins" class="error-text small" role="alert">{{ errorAdmins }}</p>
      <p v-if="cloudEnabled" class="muted small">Mantén al menos dos administradores para evitar bloqueos (docs/sgsi/recuperacion_acceso_admin.md).</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Cuenta</th><th>Rol</th><th>Estado</th><th>Privilegios</th></tr></thead>
          <tbody><tr v-for="c in cuentas" :key="c.cuenta"><td>{{ c.cuenta }}</td><td class="mono small">{{ c.rol }}</td><td class="small">{{ c.estado }}</td><td class="small">{{ c.privilegios }}</td></tr></tbody>
        </table>
      </div>
      <label class="check"><input v-model="confirmaRevision" type="checkbox"> Revisé las cuentas y los privilegios son los adecuados (conceder o retirar roles: pestaña Administradores; contingencia del dueño: docs/sgsi/recuperacion_acceso_admin.md)</label>
      <button class="btn" :disabled="!confirmaRevision" @click="registrarRevision">Registrar revisión</button>
    </section>

    <section class="card" data-testid="evidencias-sgsi">
      <h2>Evidencias del SGSI (9.2 y 9.3)</h2>
      <p class="muted small">Marca que la auditoría interna o la revisión por la dirección <strong>se realizaron</strong>, con fecha y responsable. No se registran resultados aquí: el acta firmada se archiva en docs/sgsi/evidencias/.</p>
      <ul class="small">
        <li v-for="(t, id) in TIPOS_EVIDENCIA" :key="id">
          {{ t.nombre }} ({{ t.clausula }}):
          <template v-if="isms.resumenEv[id]"><strong>{{ isms.resumenEv[id].fecha }}</strong> · {{ isms.resumenEv[id].responsable }} (hace {{ isms.resumenEv[id].dias }} días)</template>
          <template v-else><span class="error-text">sin evidencia registrada</span></template>
        </li>
      </ul>
      <form class="grid cols-2" novalidate @submit.prevent="registrarEvidencia">
        <div class="field"><label for="ev-tipo">Tipo</label>
          <select id="ev-tipo" v-model="ev.tipo"><option v-for="(t, id) in TIPOS_EVIDENCIA" :key="id" :value="id">{{ t.nombre }} ({{ t.clausula }})</option></select></div>
        <div class="field"><label for="ev-fecha">Fecha de realización</label><input id="ev-fecha" v-model="ev.fecha" type="date"></div>
        <div class="field"><label for="ev-resp">Responsable</label><input id="ev-resp" v-model="ev.responsable" :maxlength="RESPONSABLE_MAX" autocomplete="off"></div>
        <div class="field"><label for="ev-ref">Referencia del acta (opcional)</label><input id="ev-ref" v-model="ev.referencia" :maxlength="REFERENCIA_MAX" autocomplete="off" placeholder="p. ej. docs/sgsi/evidencias/AI-01.md"></div>
        <p v-if="evError" class="error-text" role="alert">{{ evError }}</p>
        <div><button type="submit" class="btn" data-testid="registrar-evidencia">Registrar evidencia</button></div>
      </form>
    </section>

    <section class="card">
      <h2>Incidentes y puntos débiles (A.16.1) <DataClassBadge level="confidential" texto="Incidentes" /></h2>
      <p v-if="!ordenados.length" class="muted">Sin notificaciones. Se reportan desde <RouterLink :to="{ name: 'seguridad', hash: '#reportar' }">Seguridad → Reportar</RouterLink>.</p>
      <article v-for="inc in ordenados" :key="inc.id" class="incidente">
        <div class="row">
          <span :class="['chip', inc.severidad === 'alta' ? 'danger' : inc.severidad === 'media' ? 'warn' : 'info']">{{ inc.severidad }}</span>
          <strong>{{ INCIDENT_TYPES[inc.tipo] }}</strong>
          <span class="chip neutral">{{ inc.estado.replace('_', ' ') }}</span>
          <span class="muted small" :title="inc.creadoUtc">{{ formatFecha(inc.creadoUtc) }} · {{ inc.reportadoPor }}</span>
        </div>
        <p class="small">{{ inc.descripcion }}</p>
        <p v-if="inc.respuesta" class="small"><strong>Respuesta:</strong> {{ inc.respuesta }}</p>
        <p v-if="inc.leccion" class="small"><strong>Lección aprendida:</strong> {{ inc.leccion }}</p>
        <template v-if="TRANSITIONS[inc.estado].length">
          <div class="grid cols-2">
            <div class="field"><label :for="`r-${inc.id}`">Respuesta aplicada (A.16.1.5)</label><input :id="`r-${inc.id}`" v-model="nota(inc.id).respuesta" maxlength="500"></div>
            <div class="field"><label :for="`l-${inc.id}`">Lección aprendida (A.16.1.6)</label><input :id="`l-${inc.id}`" v-model="nota(inc.id).leccion" maxlength="500"></div>
          </div>
          <div class="row">
            <button v-for="e in TRANSITIONS[inc.estado]" :key="e" class="btn small" @click="cambiarEstado(inc, e)">Pasar a {{ e.replace('_', ' ') }}</button>
          </div>
        </template>
      </article>
    </section>
  </div>
</template>

<style scoped>
.titulo {
  justify-content: space-between;
}

.kpis {
  margin: 12px 0;
}

.kpi {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.kpi strong {
  font-size: 1.3rem;
}

.ok-text {
  color: var(--ok, #2ecc71);
}

.objetivos {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 6px;
}

.incidente {
  border-top: 1px solid var(--border);
  padding: 10px 0;
}
</style>
