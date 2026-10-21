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
  <div class="card sync-panel">
    <div class="panel-header">
      <div class="panel-title-wrap">
        <h3 class="panel-title">Sincronización</h3>
      </div>
      <span class="panel-tag">Ajuste Temporal</span>
    </div>

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
  </div>
</template>

<style scoped>
.sync-panel {
  border: 1px solid var(--border);
  padding: 24px 28px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.panel-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.panel-title {
  font-size: 1.15rem;
  font-weight: 800;
  margin: 0;
  color: var(--text);
  letter-spacing: -0.01em;
}

.panel-tag {
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  background: var(--bg-elev-2);
  color: var(--text-muted);
}

.metodos {
  margin-bottom: 12px;
}
</style>
