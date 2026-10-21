<script setup>
import { computed } from 'vue'
import { latido, ONDAS } from '@/data/referenceEcg.js'

/** Figura PQRST anotada, generada con el mismo modelo que la referencia sintética (sin HTML inyectado). */
const W = 640
const H = 240
const RR = 0.9
const T0 = -0.4
const T1 = 0.55
const mvMin = -0.4
const mvMax = 1.15

const x = (t) => ((t - T0) / (T1 - T0)) * (W - 40) + 20
const y = (mv) => H - 30 - ((mv - mvMin) / (mvMax - mvMin)) * (H - 50)

const path = computed(() => {
  const pts = []
  for (let t = T0; t <= T1; t += 0.002) pts.push(`${x(t).toFixed(1)},${y(latido(t, RR)).toFixed(1)}`)
  return `M${pts.join(' L')}`
})

const etiquetas = computed(() =>
  ONDAS.map((o) => {
    const c = o.escalaRR ? o.centro * Math.sqrt(RR) : o.centro
    const v = latido(c, RR)
    return { nombre: o.nombre, x: x(c), y: y(v) + (o.amp > 0 ? -10 : 18) }
  }),
)
</script>

<template>
  <figure class="figura">
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" aria-label="Latido ECG con ondas P, Q, R, S y T">
      <line :x1="20" :x2="W - 20" :y1="y(0)" :y2="y(0)" class="base" />
      <path :d="path" class="traza" />
      <text v-for="e in etiquetas" :key="e.nombre" :x="e.x" :y="e.y" text-anchor="middle" class="etq">{{ e.nombre }}</text>
      <line :x1="x(0)" :x2="x(0)" :y1="y(1.08)" :y2="H - 10" class="guia" />
      <text :x="x(0) + 6" :y="H - 12" class="nota">pico R → referencia para medir el intervalo RR</text>
    </svg>
    <figcaption class="muted small">Modelo sintético de un latido (suma de gaussianas). Amplitud aproximada en mV.</figcaption>
  </figure>
</template>

<style scoped>
.figura {
  margin: 24px auto;
  max-width: 860px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

svg {
  width: 100%;
  height: auto;
  background: #f8fafc;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}

figcaption {
  margin-top: 10px;
  text-align: center;
}

.traza {
  fill: none;
  stroke: var(--signal);
  stroke-width: 2.5;
}

.base {
  stroke: var(--grid);
  stroke-dasharray: 4 4;
}

.guia {
  stroke: var(--text-muted);
  stroke-dasharray: 2 4;
}

.etq {
  fill: var(--text);
  font-weight: 700;
  font-size: 16px;
}

.nota {
  fill: var(--text-muted);
  font-size: 12px;
}
</style>
