<script setup>
import { computed } from 'vue'

/** Etiqueta de clasificación visible (SEC-22). */
const props = defineProps({
  level: { type: String, default: 'sensitive', validator: (v) => ['sensitive', 'confidential', 'internal', 'public'].includes(v) },
  texto: { type: String, default: '' },
})

const NIVELES = {
  sensitive: { nombre: 'Confidencial-Sensible', clase: 'danger', defecto: 'Datos de salud' },
  confidential: { nombre: 'Confidencial', clase: 'warn', defecto: '' },
  internal: { nombre: 'Interno', clase: 'info', defecto: '' },
  public: { nombre: 'Público', clase: 'neutral', defecto: '' },
}

const n = computed(() => NIVELES[props.level])
const etiqueta = computed(() => [props.texto || n.value.defecto, n.value.nombre].filter(Boolean).join(' — '))
</script>

<template>
  <span :class="['chip', n.clase]" :title="`Clasificación: ${n.nombre}`">🔒 {{ etiqueta }}</span>
</template>
