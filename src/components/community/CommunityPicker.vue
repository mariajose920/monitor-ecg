<script setup>
import { computed, onMounted } from 'vue'
import MonitoreoPicker from '@/components/compare/MonitoreoPicker.vue'
import { useComunidadStore } from '@/stores/comunidad.js'
import { useAccountStore } from '@/stores/account.js'
import { PACIENTE_ANONIMO } from '@/services/monitoreos/visibilidad.js'

/**
 * Selector de la pestaña "Comunidad (públicos)": monitoreos que otras cuentas decidieron publicar.
 * Solo lectura y siempre con "Paciente anónimo". Búsqueda y filtro de actividad los da MonitoreoPicker.
 */
defineProps({
  idBase: { type: String, required: true },
  sesionId: { type: String, default: '' },
  canal: { type: [String, Number], default: '' },
})
const emit = defineEmits(['update:sesionId', 'update:canal'])
const comunidad = useComunidadStore()
const cuenta = useAccountStore()
const ctx = { usuarioId: 'publico', esAdmin: false }
const hayDatos = computed(() => comunidad.lista.length > 0)

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
    </template>
  </div>
</template>
