<script setup>
import { ACTIVIDADES } from '@/data/activities.js'

/** RF18: actividad por canal, seleccionable antes y durante la sesión (lista cerrada). */
defineProps({ modelValue: { type: String, required: true }, id: { type: String, required: true } })
const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <div class="field">
    <label :for="id">Actividad</label>
    <select :id="id" :value="modelValue" @change="emit('update:modelValue', $event.target.value)">
      <option v-for="a in ACTIVIDADES" :key="a.id" :value="a.id">{{ a.icono }} {{ a.nombre }}</option>
    </select>
  </div>
</template>
