<script setup>
import { computed } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'

/** Etiqueta de clasificación visible (SEC-22, A.8.2.2 etiquetado de la información). */
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
  <span :class="['chip', n.clase]" :title="`Clasificación (ISO 27001:2013 A.8.2.1/A.8.2.2): ${n.nombre}`">
    <AppIcon name="lock" :size="13" />
    <span>{{ etiqueta }}</span>
  </span>
</template>
