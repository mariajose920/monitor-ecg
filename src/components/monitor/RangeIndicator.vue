<script setup>
import { computed } from 'vue'

/** RF17: dentro / bajo / sobre, con color, icono y texto (no solo color). */
const props = defineProps({
  estado: { type: String, default: 'sin-dato' },
  rango: { type: Object, default: null },
  enAlerta: { type: Boolean, default: false },
})

const MAP = {
  dentro: { texto: 'Dentro del rango', icono: '✓', clase: 'ok' },
  bajo: { texto: 'Bajo el rango', icono: '▼', clase: 'warn' },
  sobre: { texto: 'Sobre el rango', icono: '▲', clase: 'warn' },
  'sin-dato': { texto: 'Sin dato válido', icono: '–', clase: 'neutral' },
}

const info = computed(() => {
  const m = MAP[props.estado] || MAP['sin-dato']
  return props.enAlerta ? { ...m, clase: 'danger', texto: `${m.texto} (alerta)` } : m
})
</script>

<template>
  <div class="range">
    <span :class="['chip', info.clase]"><span aria-hidden="true">{{ info.icono }}</span> {{ info.texto }}</span>
    <span v-if="rango" class="muted small">rango {{ rango.min }}–{{ rango.max }} BPM</span>
  </div>
</template>

<style scoped>
.range {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
</style>
