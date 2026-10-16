<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import uPlot from 'uplot'
import { getRuntime } from '@/services/acquisition/channelRegistry.js'
import { registerChart, unregisterChart } from '@/services/acquisition/renderScheduler.js'

/**
 * Gráfico en vivo de un canal (RF05). La instancia de uPlot y los arrays de visualización son
 * variables locales (nunca reactivas). Se redibuja desde el renderScheduler (rAF), no por muestra.
 * Leads-off se dibuja como HUECO (null), nunca como un valor inventado (bug 10).
 */
const props = defineProps({
  channelId: { type: Number, required: true },
  windowSec: { type: Number, default: 8 },
  /** Alternativa textual (WCAG 1.1.1): resumen de BPM y estado que acompaña al gráfico. */
  descripcion: { type: String, default: '' },
})

const box = ref(null)
let plot = null
let ro = null
let cap = 0
let xs = null
let ys = []
let tmpT = null
let tmpV = null
let tmpLo = null
let yDefault = [0, 1023]

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function alturaPara(w) {
  return Math.round(Math.max(160, Math.min(300, w * 0.32)))
}

function ensureBuffers(n) {
  if (n <= cap) return
  cap = n
  xs = new Float64Array(cap)
  tmpT = new Float64Array(cap)
  tmpV = new Float32Array(cap)
  tmpLo = new Uint8Array(cap)
}

function draw() {
  if (!plot) return
  const rt = getRuntime(props.channelId)
  if (!rt) {
    plot.setData([[], []])
    return
  }
  yDefault = rt.profile.yRange
  ensureBuffers(rt.ring.capacity)
  const n = rt.ring.toLinear(tmpT, tmpV, tmpLo)
  ys.length = n
  for (let i = 0; i < n; i++) {
    xs[i] = tmpT[i] / 1000
    ys[i] = tmpLo[i] ? null : tmpV[i]
  }
  plot.setData([xs.subarray(0, n), ys])
}

onMounted(() => {
  const muted = cssVar('--text-muted', '#9fb0c8')
  const grid = cssVar('--grid', '#1d2a44')
  const ancho = box.value.clientWidth || 600
  const opts = {
    width: ancho,
    height: alturaPara(ancho),
    cursor: { show: false },
    legend: { show: false },
    scales: {
      x: {
        time: false,
        range: (u, min, max) => (max == null ? [0, props.windowSec] : [max - props.windowSec, max]),
      },
      y: {
        range: (u, min, max) => {
          if (min == null || max == null) return yDefault
          const pad = Math.max(8, (max - min) * 0.12)
          return [min - pad, max + pad]
        },
      },
    },
    axes: [
      { stroke: muted, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid, width: 1 }, values: (u, vals) => vals.map((v) => `${Math.round(v)} s`) },
      { stroke: muted, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid, width: 1 }, size: 48 },
    ],
    series: [{}, { label: 'ECG', stroke: cssVar('--signal', '#3ddc97'), width: 1.5, points: { show: false }, spanGaps: false }],
  }
  plot = new uPlot(opts, [[], []], box.value)
  registerChart(props.channelId, draw)
  ro = new ResizeObserver((entries) => {
    const w = Math.floor(entries[0].contentRect.width)
    if (w > 0 && plot && w !== plot.width) plot.setSize({ width: w, height: alturaPara(w) })
  })
  ro.observe(box.value)
})

onBeforeUnmount(() => {
  unregisterChart(props.channelId)
  ro?.disconnect()
  plot?.destroy()
  plot = null
  xs = tmpT = tmpV = tmpLo = null
  ys = []
})
</script>

<template>
  <div ref="box" class="chart-box" role="img" :aria-label="`Señal ECG en vivo del canal ${channelId}${descripcion ? '. ' + descripcion : ''}`" />
</template>
