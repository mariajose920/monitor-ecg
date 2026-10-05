<script setup>
/** RF06: BPM calculado y del dispositivo; "--" si no es válido (bug 15). */
defineProps({
  calculado: { type: Number, default: null },
  dispositivo: { type: Number, default: null },
  mostrarDispositivo: { type: Boolean, default: true },
})
</script>

<template>
  <div class="bpm">
    <div class="principal" aria-live="polite">
      <span class="valor mono">{{ calculado ?? '--' }}</span>
      <span class="unidad">BPM</span>
    </div>
    <div class="sub muted small">
      calculado en la app<template v-if="mostrarDispositivo"> · dispositivo: <strong class="mono">{{ dispositivo ?? '--' }}</strong></template>
    </div>
  </div>
</template>

<style scoped>
.principal {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.valor {
  font-size: 2.4rem;
  font-weight: 800;
  line-height: 1;
}

.unidad {
  color: var(--text-muted);
  font-weight: 700;
}
</style>
