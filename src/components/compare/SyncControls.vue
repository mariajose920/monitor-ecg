<script setup>
import { SYNC_METODOS, SYNC_NOMBRES } from '@/data/defaultSettings.js'

/** RF14: método de sincronización + desplazamiento manual (deslizador en ms). */
defineProps({
  metodo: { type: String, required: true },
  manualMs: { type: Number, required: true },
  maxLagMs: { type: Number, required: true },
  stepMs: { type: Number, default: 4 },
  bloqueado: { type: Boolean, default: false },
})
const emit = defineEmits(['update:metodo', 'update:manualMs', 'auto'])
</script>

<template>
  <fieldset class="card sync">
    <legend>Sincronización</legend>
    <div class="row metodos" role="radiogroup" aria-label="Método de sincronización">
      <label v-for="mt in SYNC_METODOS" :key="mt" class="check">
        <input type="radio" name="metodo-sync" :value="mt" :checked="metodo === mt" :disabled="bloqueado && metodo !== mt" @change="emit('update:metodo', mt)">
        {{ SYNC_NOMBRES[mt] }}
      </label>
    </div>
    <p v-if="bloqueado" class="muted small">El administrador fijó el método por defecto y no permite cambiarlo.</p>
    <div class="field">
      <label for="sync-manual">Desplazamiento manual: <span class="mono">{{ manualMs }} ms</span></label>
      <input
        id="sync-manual"
        type="range"
        :min="-maxLagMs"
        :max="maxLagMs"
        :step="stepMs"
        :value="manualMs"
        :disabled="metodo !== 'manual'"
        @change="emit('update:manualMs', Number($event.target.value))"
      >
      <div class="row">
        <button class="btn small" :disabled="metodo !== 'manual'" @click="emit('update:manualMs', manualMs - stepMs)">−1 muestra</button>
        <button class="btn small" :disabled="metodo !== 'manual'" @click="emit('update:manualMs', manualMs + stepMs)">+1 muestra</button>
        <button class="btn small" :disabled="bloqueado && metodo === 'manual'" @click="emit('auto')">Auto-alinear y ajustar a mano</button>
      </div>
    </div>
  </fieldset>
</template>

<style scoped>
.sync {
  border: 1px solid var(--border);
}

legend {
  font-weight: 700;
  padding: 0 6px;
}

.metodos {
  margin-bottom: 8px;
}
</style>
