<script setup>
import { computed } from 'vue'
import { ESTADOS_CANAL } from '@/stores/channels.js'

/** RF10: estado con color + icono + texto. */
const props = defineProps({
  estado: { type: String, required: true },
  enSesion: { type: Boolean, default: false },
})

const info = computed(() => {
  const e = ESTADOS_CANAL[props.estado] || ESTADOS_CANAL.idle
  if (props.estado === 'streaming') return { ...e, texto: props.enSesion ? 'Midiendo (grabando)' : 'Recibiendo (vista previa)' }
  return e
})
</script>

<template>
  <span :class="['chip', info.clase]" role="status" aria-live="polite">
    <span aria-hidden="true">{{ info.icono }}</span> {{ info.texto }}
  </span>
</template>
