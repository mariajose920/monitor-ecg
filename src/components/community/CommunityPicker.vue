<script setup>
import { computed, onMounted, ref } from 'vue'
import MonitoreoPicker from '@/components/compare/MonitoreoPicker.vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { reportarMonitoreo } from '@/services/cloud/cloudSync.js'
import { validarMotivoReporte, REPORTE_MOTIVO_MAX } from '@/services/security/soporte.js'
import { notify } from '@/services/notifications/notifier.js'
import { useComunidadStore } from '@/stores/comunidad.js'
import { useAccountStore } from '@/stores/account.js'
import { PACIENTE_ANONIMO } from '@/services/monitoreos/visibilidad.js'

/**
 * Selector de la pestaña "Comunidad (públicos)": monitoreos que otras cuentas decidieron publicar.
 * Solo lectura y siempre con "Paciente anónimo". Búsqueda y filtro de actividad los da MonitoreoPicker.
 */
const props = defineProps({
  idBase: { type: String, required: true },
  sesionId: { type: String, default: '' },
  canal: { type: [String, Number], default: '' },
})
const emit = defineEmits(['update:sesionId', 'update:canal'])
const comunidad = useComunidadStore()
const cuenta = useAccountStore()
const ctx = { usuarioId: 'publico', esAdmin: false }
const hayDatos = computed(() => comunidad.lista.length > 0)

// ---------- Reportar el monitoreo seleccionado (moderación, C-04) ----------
const seleccionado = computed(() => comunidad.lista.find((m) => m.id === props.sesionId) ?? null)
const reportando = ref(false)
const motivo = ref('')
const errorReporte = ref('')
const enviandoReporte = ref(false)

function abrirReporte() {
  motivo.value = ''
  errorReporte.value = ''
  reportando.value = true
}
async function enviarReporte() {
  const msg = validarMotivoReporte(motivo.value)
  if (msg) return (errorReporte.value = msg)
  enviandoReporte.value = true
  errorReporte.value = ''
  try {
    await reportarMonitoreo(props.sesionId, motivo.value)
    reportando.value = false
    notify('Gracias: el reporte llegó al administrador, que lo revisará.', { tipo: 'ok' })
  } catch (e) {
    errorReporte.value = e?.message || 'No se pudo enviar el reporte.'
  } finally {
    enviandoReporte.value = false
  }
}

onMounted(() => {
  if (cuenta.iniciada && !comunidad.cargada) comunidad.cargar()
})
</script>

<template>
  <div class="comunidad" data-testid="selector-comunidad">
    <p class="alert info small">
      <strong>Comunidad (públicos):</strong> monitoreos que otras personas decidieron publicar, de forma anónima ({{ PACIENTE_ANONIMO }}). Solo lectura.
    </p>
    <p v-if="!cuenta.iniciada" class="alert warn small" role="status" data-testid="comunidad-requiere-cuenta">
      Para ver los monitoreos de la comunidad <RouterLink to="/acceso">inicia sesión</RouterLink>.
    </p>
    <template v-else>
      <div class="actions">
        <button type="button" class="btn small" :disabled="comunidad.cargando" @click="comunidad.cargar()">{{ comunidad.cargando ? 'Cargando…' : 'Actualizar' }}</button>
      </div>
      <p v-if="comunidad.error" class="error-text" role="alert">{{ comunidad.error }}</p>
      <p v-else-if="comunidad.cargada && !hayDatos" class="muted small">Aún no hay monitoreos públicos.</p>
      <MonitoreoPicker
        v-if="hayDatos"
        :id-base="idBase"
        titulo="Medición pública"
        :lista="comunidad.lista"
        :ctx="ctx"
        :sesion-id="sesionId"
        :canal="canal"
        @update:sesion-id="emit('update:sesionId', $event)"
        @update:canal="emit('update:canal', $event)"
      />
      <div v-if="seleccionado" class="actions">
        <button type="button" class="btn small" data-testid="reportar-monitoreo" @click="abrirReporte">Reportar este monitoreo</button>
        <span class="muted small">¿Contenido inapropiado o que identifica a alguien? Avisa al administrador.</span>
      </div>
      <BaseDialog v-if="reportando" titulo="Reportar este monitoreo público" @cerrar="reportando = false">
        <form data-testid="form-reportar" @submit.prevent="enviarReporte">
          <p class="small">El reporte es para contenido inapropiado o que pueda identificar a una persona. Tu cuenta no se muestra a quien publicó. Puedes enviar hasta 5 reportes al día.</p>
          <div class="field">
            <label for="rep-motivo">Motivo</label>
            <textarea id="rep-motivo" v-model="motivo" rows="3" :maxlength="REPORTE_MOTIVO_MAX" required />
          </div>
          <p v-if="errorReporte" class="error-text" role="alert">{{ errorReporte }}</p>
          <div class="row">
            <button type="button" class="btn" @click="reportando = false">Cancelar</button>
            <button type="submit" class="btn primary" :disabled="enviandoReporte">Enviar reporte</button>
          </div>
        </form>
      </BaseDialog>
    </template>
  </div>
</template>
