<script setup>
import { ref } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import DataClassBadge from '@/components/common/DataClassBadge.vue'
import { CONSENT_VERSION } from '@/stores/users.js'

/** SEC-16: consentimiento informado antes de mostrar los campos opcionales. Checkbox NO premarcado. */
defineProps({ etiqueta: { type: String, required: true } })
const emit = defineEmits(['acepto', 'no-acepto'])
const leido = ref(false)
</script>

<template>
  <BaseDialog titulo="Consentimiento informado" ancho="640px" @cerrar="emit('no-acepto')">
    <p><DataClassBadge level="sensitive" texto="Datos opcionales" /></p>
    <p>Participante: <strong>{{ etiqueta }}</strong> · versión del texto {{ CONSENT_VERSION }}</p>
    <ul class="lista">
      <li><strong>Finalidad:</strong> exclusivamente académica (asignatura de Programación Web / bioinstrumentación).</li>
      <li><strong>Datos tratados:</strong> rango de edad, peso y nivel de actividad física habitual. Todos opcionales.</li>
      <li><strong>Dónde se guardan:</strong> solo en este equipo y navegador, cifrados (AES-GCM). No se envían a ningún servidor.</li>
      <li><strong>Plazo de retención:</strong> el configurado por el administrador (30 días por defecto, máximo 180).</li>
      <li><strong>Quién accede:</strong> el administrador del curso desde este equipo.</li>
      <li><strong>Retiro y borrado:</strong> puedes retirar el consentimiento cuando quieras; tus datos opcionales se borran de inmediato. También puedes usar "Eliminar mis datos".</li>
      <li><strong>Importante:</strong> este sistema <strong>no es un dispositivo médico ni realiza diagnósticos</strong>.</li>
    </ul>
    <p class="muted small">Más detalles en el <RouterLink to="/privacidad" target="_blank">aviso de privacidad</RouterLink>. Si no aceptas, puedes medir igualmente sin datos opcionales.</p>
    <label class="check">
      <input v-model="leido" type="checkbox">
      He leído la información y acepto el tratamiento de mis datos opcionales para fines académicos.
    </label>
    <template #acciones>
      <button class="btn" @click="emit('no-acepto')">No acepto</button>
      <button class="btn primary" :disabled="!leido" @click="emit('acepto')">Acepto</button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.lista li {
  margin-bottom: 6px;
}
</style>
