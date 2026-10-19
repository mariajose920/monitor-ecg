<script setup>
import BaseDialog from './BaseDialog.vue'
import DataClassBadge from './DataClassBadge.vue'

/** SEC-45: advertencia antes de descargar datos de salud. */
defineProps({
  detalle: { type: String, default: '' },
  ocupado: { type: Boolean, default: false },
  boton: { type: String, default: 'Entiendo, descargar CSV' },
})
const emit = defineEmits(['confirmar', 'cancelar'])
</script>

<template>
  <BaseDialog titulo="Exportar datos de salud" @cerrar="emit('cancelar')">
    <p><DataClassBadge level="sensitive" texto="Datos de salud seudonimizados" /></p>
    <p class="alert warn">
      Este archivo contiene datos de salud. Guárdalo en un lugar seguro y bórralo cuando ya no lo necesites.
      No lo compartas por canales públicos.
    </p>
    <p v-if="detalle" class="muted">{{ detalle }}</p>
    <slot />
    <template #acciones>
      <button class="btn" @click="emit('cancelar')">Cancelar</button>
      <button class="btn primary" :disabled="ocupado" @click="emit('confirmar')">{{ boton }}</button>
    </template>
  </BaseDialog>
</template>
