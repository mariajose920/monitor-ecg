<script setup>
/** RF12: métricas de la comparación. */
defineProps({ m: { type: Object, required: true }, metodo: { type: String, required: true } })
const f = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '--' : v.toFixed(d))
</script>

<template>
  <div class="grid cols-3 metricas" aria-live="polite">
    <div class="card">
      <span class="muted small">Correlación de Pearson</span>
      <strong class="mono big">{{ f(m.correlacion, 3) }}</strong>
      <span class="muted small">1 = forma idéntica</span>
    </div>
    <div class="card">
      <span class="muted small">RMSE (z-score) · NRMSE</span>
      <strong class="mono big">{{ f(m.rmse, 3) }} · {{ f(m.nrmse * 100, 1) }} %</strong>
      <span class="muted small">sobre {{ f(m.duracionS, 1) }} s solapados</span>
    </div>
    <div class="card">
      <span class="muted small">BPM experimental / referencia (Δ)</span>
      <strong class="mono big">{{ f(m.bpmExp, 0) }} / {{ f(m.bpmRef, 0) }} ({{ f(m.deltaBpm, 1) }})</strong>
      <span class="muted small">desfase aplicado: {{ f(m.desfaseMs, 0) }} ms · método {{ metodo }}</span>
    </div>
  </div>
</template>

<style scoped>
.metricas .card {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.big {
  font-size: 1.3rem;
}
</style>
