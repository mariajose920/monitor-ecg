<script setup>
import { useChannelsStore } from '@/stores/channels.js'

/** Controles del simulador para demostrar BPM variable, leads-off, pérdida de señal y RF09. */
const props = defineProps({ canal: { type: Object, required: true }, conectado: { type: Boolean, default: false } })
const channels = useChannelsStore()
const idBase = `sim-${props.canal.id}`
</script>

<template>
  <details class="sim">
    <summary>Controles del simulador</summary>
    <div class="field">
      <label :for="`${idBase}-bpm`">BPM objetivo: <span class="mono">{{ canal.sim.bpm }}</span></label>
      <input :id="`${idBase}-bpm`" type="range" min="35" max="200" step="1" :value="canal.sim.bpm" @input="channels.simControl(canal.id, 'bpm', $event.target.value)">
    </div>
    <div class="field">
      <label :for="`${idBase}-ruido`">Ruido: <span class="mono">{{ canal.sim.ruido.toFixed(2) }} mV</span></label>
      <input :id="`${idBase}-ruido`" type="range" min="0" max="0.2" step="0.01" :value="canal.sim.ruido" @input="channels.simControl(canal.id, 'ruido', $event.target.value)">
    </div>
    <label class="check">
      <input type="checkbox" :checked="canal.sim.leadsOff" @change="channels.simControl(canal.id, 'leadsOff', $event.target.checked)">
      Simular electrodos sueltos (leads-off)
    </label>
    <label class="check">
      <input type="checkbox" :checked="canal.sim.pausado" @change="channels.simControl(canal.id, 'pausar', $event.target.checked)">
      Simular pérdida de comunicación (sin datos)
    </label>
    <button class="btn small" :disabled="!conectado" @click="channels.simControl(canal.id, 'desconectar')">Simular desconexión del sensor</button>
  </details>
</template>

<style scoped>
.sim {
  margin-top: 8px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
}

summary {
  cursor: pointer;
  font-weight: 600;
  min-height: 32px;
}

.check {
  margin: 6px 0;
}
</style>
