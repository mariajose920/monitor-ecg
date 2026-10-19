<script setup>
import { ref, computed } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import DataClassBadge from '@/components/common/DataClassBadge.vue'
import { useUsersStore } from '@/stores/users.js'
import { useAuthStore } from '@/stores/auth.js'
import { useExportMonitoreos } from '@/composables/useExportMonitoreos.js'
import { notify } from '@/services/notifications/notifier.js'

/** "Descargar historial": frecuencias cardíacas de un usuario (o de todos, solo administrador) en CSV o PDF. */
const props = defineProps({ usuarioId: { type: String, default: null } })
const emit = defineEmits(['cerrar'])
const users = useUsersStore()
const auth = useAuthStore()
const exportador = useExportMonitoreos()

const elegido = ref(props.usuarioId ?? users.activeUserId ?? (auth.isAdmin ? '' : null))
const formato = ref('csv')
const ocupado = ref(false)
const progreso = ref('')

const opciones = computed(() => (auth.isAdmin ? users.users : users.users.filter((u) => u.id === users.activeUserId)))

async function descargar() {
  ocupado.value = true
  try {
    const n = await exportador.historial({
      usuarioId: elegido.value || null,
      formato: formato.value,
      onProgreso: (i, total) => (progreso.value = `Procesando ${i} de ${total}…`),
    })
    notify(n ? `Historial generado (${n} monitoreo(s)).` : 'El historial está vacío: aún no hay monitoreos guardados.', { tipo: n ? 'ok' : 'aviso' })
    emit('cerrar')
  } catch (e) {
    notify(`No se pudo generar el historial: ${e.message}`, { tipo: 'error' })
  } finally {
    ocupado.value = false
    progreso.value = ''
  }
}
</script>

<template>
  <BaseDialog titulo="Descargar historial" @cerrar="emit('cerrar')">
    <p><DataClassBadge level="sensitive" texto="Datos de salud seudonimizados" /></p>
    <p class="alert warn">Contiene tus frecuencias cardíacas. Guárdalo en un lugar seguro y bórralo cuando ya no lo necesites.</p>
    <div class="field">
      <label for="h-usuario">Usuario</label>
      <select id="h-usuario" v-model="elegido" :disabled="!auth.isAdmin">
        <option v-if="auth.isAdmin" value="">Todos los usuarios (administrador)</option>
        <option v-for="u in opciones" :key="u.id" :value="u.id">{{ u.etiqueta }}</option>
      </select>
    </div>
    <fieldset class="field formato">
      <legend>Formato</legend>
      <label class="check"><input v-model="formato" type="radio" value="csv" name="h-formato"> CSV (tabla y serie de BPM; se puede importar en Comparar)</label>
      <label class="check"><input v-model="formato" type="radio" value="pdf" name="h-formato"> PDF (tabla y gráfico de tendencia)</label>
    </fieldset>
    <p v-if="progreso" role="status" class="muted small">{{ progreso }}</p>
    <template #acciones>
      <button class="btn" @click="emit('cerrar')">Cancelar</button>
      <button class="btn primary" data-testid="confirmar-historial" :disabled="ocupado || (!auth.isAdmin && !elegido)" @click="descargar">Entiendo, descargar</button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.formato {
  border: 0;
  padding: 0;
}

legend {
  font-weight: 600;
  padding: 0;
}
</style>
