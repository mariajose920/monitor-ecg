<script setup>
import { ref, onMounted } from 'vue'
import DataClassBadge from '@/components/common/DataClassBadge.vue'
import { adminListarReportes, adminResolverReporte, adminRetirarPublicacion, adminLeerSesion } from '@/services/cloud/cloudSync.js'
import { conRenovacionTotp } from '@/services/security/adminRenovacion.js'
import { validarMotivoAcceso, esUuid, MOTIVO_MIN, MOTIVO_MAX } from '@/services/security/soporte.js'
import { useAuthStore } from '@/stores/auth.js'
import { formatFecha } from '@/utils/time.js'
import { notify } from '@/services/notifications/notifier.js'

/**
 * Soporte y moderación (C-04, C-06). El administrador NO ve datos de salud de otras cuentas por defecto:
 *  - Reportes de contenido público: puede descartarlos o retirar la publicación (pasa a privado) con un motivo escrito.
 *  - Acceso excepcional a una sesión concreta: exige un motivo de 10 a 300 caracteres; el servidor lo registra en la
 *    auditoría y la persona titular podrá ver el acceso y su motivo. Nunca se entrega la señal, solo los datos de la sesión.
 */
const auth = useAuthStore()
const reportes = ref([])
const cargando = ref(false)
const error = ref('')
const retirando = ref(null) // reporte en proceso de retiro
const motivoRetiro = ref('')

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    auth.assertAdmin()
    reportes.value = await conRenovacionTotp(() => adminListarReportes('abierto'))
  } catch (e) {
    reportes.value = []
    error.value = e?.cancelado ? 'Verificación cancelada.' : 'No se pudieron cargar los reportes (se requieren privilegios de administrador).'
  } finally {
    cargando.value = false
  }
}
onMounted(cargar)

async function resolver(r, estado) {
  try {
    auth.assertAdmin()
    await conRenovacionTotp(() => adminResolverReporte(r.id, estado))
    notify(estado === 'descartado' ? 'Reporte descartado.' : 'Reporte marcado como revisado.', { tipo: 'ok' })
    await cargar()
  } catch (e) {
    if (!e?.cancelado) notify('No se pudo actualizar el reporte.', { tipo: 'error' })
  }
}

function iniciarRetiro(r) {
  retirando.value = r
  motivoRetiro.value = ''
}
async function confirmarRetiro() {
  const msg = validarMotivoAcceso(motivoRetiro.value)
  if (msg) return notify(msg, { tipo: 'error' })
  try {
    auth.assertAdmin()
    const ok = await conRenovacionTotp(() => adminRetirarPublicacion(retirando.value.sesion_id, motivoRetiro.value.trim()))
    notify(ok ? 'Publicación retirada (el monitoreo pasó a privado) y registrada en la auditoría.' : 'El monitoreo ya no existe.', { tipo: ok ? 'ok' : 'warn' })
    retirando.value = null
    await cargar()
  } catch (e) {
    if (!e?.cancelado) notify('No se pudo retirar la publicación.', { tipo: 'error' })
  }
}

// ---------- Acceso excepcional ----------
const sesionId = ref('')
const motivo = ref('')
const resultado = ref(null)
const errorAcceso = ref('')
const leyendo = ref(false)

async function leer() {
  errorAcceso.value = ''
  resultado.value = null
  if (!esUuid(sesionId.value)) return (errorAcceso.value = 'Escribe un identificador de sesión válido.')
  const msg = validarMotivoAcceso(motivo.value)
  if (msg) return (errorAcceso.value = msg)
  leyendo.value = true
  try {
    auth.assertAdmin()
    const fila = await conRenovacionTotp(() => adminLeerSesion(sesionId.value.trim(), motivo.value.trim()))
    resultado.value = fila ?? { vacio: true }
    notify('Acceso registrado en la auditoría. La persona titular podrá verlo.', { tipo: 'ok' })
    motivo.value = ''
  } catch (e) {
    errorAcceso.value = e?.cancelado ? 'Verificación cancelada.' : 'No se pudo completar la operación.'
  } finally {
    leyendo.value = false
  }
}
</script>

<template>
  <div>
    <section class="card" aria-labelledby="rep-titulo">
      <div class="row titulo">
        <h2 id="rep-titulo">Reportes de contenido público <DataClassBadge level="confidential" texto="Moderación" /></h2>
        <button class="btn small" :disabled="cargando" @click="cargar">Actualizar</button>
      </div>
      <p class="muted small">Cualquier cuenta puede reportar un monitoreo público. Retirar una publicación lo pasa a privado y no puede volver a publicarse; queda auditado.</p>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <p v-else-if="!reportes.length" class="muted" data-testid="sin-reportes">No hay reportes abiertos.</p>
      <article v-for="r in reportes" :key="r.id" class="reporte" data-testid="reporte">
        <p class="small"><span class="mono">{{ r.sesion_id }}</span> · {{ formatFecha(r.creado_en) }} <span v-if="!r.es_publico" class="chip neutral">ya privado</span></p>
        <p>{{ r.motivo }}</p>
        <div class="row">
          <button class="btn small" @click="resolver(r, 'descartado')">Descartar</button>
          <button class="btn small" @click="resolver(r, 'revisado')">Marcar revisado</button>
          <button class="btn small danger" @click="iniciarRetiro(r)">Retirar publicación…</button>
        </div>
        <form v-if="retirando && retirando.id === r.id" class="retiro" @submit.prevent="confirmarRetiro">
          <div class="field">
            <label :for="`mr-${r.id}`">Motivo del retiro ({{ MOTIVO_MIN }} a {{ MOTIVO_MAX }} caracteres)</label>
            <input :id="`mr-${r.id}`" v-model="motivoRetiro" :maxlength="MOTIVO_MAX" required>
          </div>
          <div class="row">
            <button type="button" class="btn small" @click="retirando = null">Cancelar</button>
            <button type="submit" class="btn small danger">Confirmar retiro</button>
          </div>
        </form>
      </article>
    </section>

    <section class="card" aria-labelledby="acc-titulo">
      <h2 id="acc-titulo">Acceso excepcional a una sesión</h2>
      <p class="alert warn small" role="note">
        Por defecto el administrador no ve datos de salud de otras personas. Este acceso solo se justifica para soporte de un problema concreto:
        queda registrado en la auditoría con tu motivo y <strong>la persona titular puede verlo</strong>. No se entrega la señal, solo los datos de la sesión.
      </p>
      <form @submit.prevent="leer">
        <div class="field">
          <label for="acc-id">Identificador de la sesión</label>
          <input id="acc-id" v-model="sesionId" autocomplete="off" spellcheck="false" placeholder="00000000-0000-4000-8000-000000000000">
        </div>
        <div class="field">
          <label for="acc-motivo">Motivo escrito ({{ MOTIVO_MIN }} a {{ MOTIVO_MAX }} caracteres)</label>
          <textarea id="acc-motivo" v-model="motivo" rows="2" :maxlength="MOTIVO_MAX" />
        </div>
        <p v-if="errorAcceso" class="error-text" role="alert">{{ errorAcceso }}</p>
        <button class="btn primary" type="submit" :disabled="leyendo">Registrar el motivo y leer</button>
      </form>
      <div v-if="resultado" data-testid="resultado-acceso">
        <p v-if="resultado.vacio" class="muted">No se encontró esa sesión (el intento quedó registrado igualmente).</p>
        <template v-else>
          <p class="small">Estado: <strong>{{ resultado.estado }}</strong> · Visibilidad: <strong>{{ resultado.visibilidad }}</strong> · Inicio: {{ formatFecha(resultado.inicio) }}</p>
          <pre class="datos mono small">{{ JSON.stringify(resultado.datos, null, 2) }}</pre>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.titulo {
  justify-content: space-between;
}

.reporte {
  border-top: 1px solid var(--border);
  padding: 10px 0;
}

.retiro {
  margin-top: 8px;
}

.datos {
  max-height: 320px;
  overflow: auto;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
