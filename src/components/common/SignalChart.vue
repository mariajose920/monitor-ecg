<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import uPlot from 'uplot'

/**
 * Gráfico estático (revisión de sesiones y comparación, RF13): cursor activo y zoom en X
 * arrastrando. `data` = [x(s), serie1, serie2, ...]. Se recrea al cambiar los datos.
 */
const props = defineProps({
  data: { type: Array, required: true },
  series: { type: Array, required: true }, // [{ label, color: '--signal' }]
  height: { type: Number, default: 260 },
  yLabel: { type: String, default: '' },
})

const box = ref(null)
let plot = null
let ro = null

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function crear() {
  plot?.destroy()
  const muted = cssVar('--text-muted', '#9fb0c8')
  const grid = cssVar('--grid', '#1d2a44')
  const opts = {
    width: box.value.clientWidth || 600,
    height: props.height,
    cursor: { drag: { x: true, y: false }, points: { show: false } },
    legend: { show: true, live: true },
    scales: { x: { time: false } },
    axes: [
      { stroke: muted, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid, width: 1 }, label: 'Tiempo (s)' },
      { stroke: muted, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid, width: 1 }, size: 50, label: props.yLabel },
    ],
    series: [
      { label: 't (s)', value: (u, v) => (v == null ? '—' : v.toFixed(3)) },
      ...props.series.map((s) => ({
        label: s.label,
        stroke: cssVar(s.color || '--signal', '#3ddc97'),
        width: 1.25,
        points: { show: false },
        spanGaps: false,
        value: (u, v) => (v == null ? '—' : v.toFixed(2)),
      })),
    ],
  }
  plot = new uPlot(opts, props.data, box.value)
}

onMounted(() => {
  crear()
  ro = new ResizeObserver((entries) => {
    const w = Math.floor(entries[0].contentRect.width)
    if (w > 0 && plot && w !== plot.width) plot.setSize({ width: w, height: props.height })
  })
  ro.observe(box.value)
})

watch(() => [props.data, props.series], () => crear())

onBeforeUnmount(() => {
  ro?.disconnect()
  plot?.destroy()
  plot = null
})
</script>

<template>
  <div>
    <div ref="box" class="chart-box" />
    <p class="muted small">Arrastra horizontalmente para ampliar; doble clic para restablecer.</p>
  </div>
</template>
