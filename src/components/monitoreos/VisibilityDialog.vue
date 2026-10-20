<script setup>
import { reactive, ref, computed } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import DataClassBadge from '@/components/common/DataClassBadge.vue'
import { cloudCuenta } from '@/services/cloud/cloudSync.js'
import { useMonitoreosStore } from '@/stores/monitoreos.js'
import { validarVisibilidad, visibilidadDe, perfilPublicable, CAMPOS_PUBLICADOS, CAMPOS_NO_PUBLICADOS } from '@/services/monitoreos/visibilidad.js'

/** Cambia solo la visibilidad de un monitoreo guardado (desde el detalle o la lista). */
const props = defineProps({
  sesion: { type: Object, required: true },
  ocupado: { type: Boolean, default: false },
})
const emit = defineEmits(['guardar', 'cerrar'])
const monitoreos = useMonitoreosStore()
const conCuenta = computed(() => !!cloudCuenta.value)
const hayPerfil = computed(() => perfilPublicable(monitoreos.perfilDe(props.sesion)) !== null)
const vis = reactive({
  visibilidad: visibilidadDe(props.sesion),
  consentimientoPublicar: false,
  compartirPerfil: props.sesion.compartirPerfil === true,
  consentimientoPerfil: false,
})
const errores = ref({})

function enviar() {
  const v = validarVisibilidad({ ...vis, tienePerfil: hayPerfil.value })
  errores.value = v.errores
  if (v.ok) emit('guardar', { ...vis })
}
</script>

<template>
  <BaseDialog titulo="Visibilidad del monitoreo" ancho="560px" @cerrar="emit('cerrar')">
    <form id="form-visibilidad" novalidate @submit.prevent="enviar">
      <p><DataClassBadge /></p>
      <p v-if="!conCuenta" class="alert warn" role="alert">Para publicar un monitoreo necesitas iniciar sesión con una cuenta.</p>
      <fieldset class="field" :disabled="!conCuenta">
        <legend>¿Quién puede ver este monitoreo?</legend>
        <label class="radio"><input v-model="vis.visibilidad" type="radio" value="privado" name="vis-det"> <strong>Privado</strong> · solo tú, dentro de tu cuenta</label>
        <label class="radio"><input v-model="vis.visibilidad" type="radio" value="publico" name="vis-det"> <strong>Público</strong> · cualquier persona con una cuenta (solo lectura)</label>
      </fieldset>
      <div v-if="vis.visibilidad === 'publico'" class="alert warn">
        <p><strong>Se publicará:</strong> {{ CAMPOS_PUBLICADOS.join(', ') }}. <strong>No se publicará:</strong> {{ CAMPOS_NO_PUBLICADOS.join(', ') }}.</p>
        <label class="radio"><input v-model="vis.consentimientoPublicar" type="checkbox" data-testid="vis-consentimiento"> Entiendo y acepto publicar la señal, el BPM, la actividad y la fecha de este monitoreo de forma anónima.</label>
        <p v-if="errores.consentimientoPublicar" class="error-text" role="alert">{{ errores.consentimientoPublicar }}</p>
        <template v-if="hayPerfil">
          <label class="radio"><input v-model="vis.compartirPerfil" type="checkbox"> Incluir datos del paciente (rango de edad, actividad…)</label>
          <label v-if="vis.compartirPerfil" class="radio"><input v-model="vis.consentimientoPerfil" type="checkbox"> Confirmo que el paciente consintió que estos datos sean públicos.</label>
          <p v-if="errores.compartirPerfil || errores.consentimientoPerfil" class="error-text" role="alert">{{ errores.compartirPerfil || errores.consentimientoPerfil }}</p>
        </template>
      </div>
      <p v-else class="hint">Al volver a privado, el monitoreo deja de ser visible para el resto de forma inmediata y el cambio queda registrado.</p>
    </form>
    <template #acciones>
      <button type="button" class="btn" @click="emit('cerrar')">Cancelar</button>
      <button type="submit" form="form-visibilidad" class="btn primary" data-testid="guardar-visibilidad" :disabled="ocupado || !conCuenta">Guardar visibilidad</button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.radio { display: flex; gap: 8px; align-items: flex-start; margin: 6px 0; }
.radio input { margin-top: 4px; flex: none; }
</style>
