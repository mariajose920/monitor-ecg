/**
 * Bucle ÚNICO de requestAnimationFrame para todos los gráficos (bug 2 del diagnóstico).
 * La recepción de datos marca el canal como "sucio" y el render ocurre como máximo una vez por
 * cuadro, con tope de fps (30 en móvil, 60 en escritorio). Con la pestaña oculta rAF se pausa,
 * pero la recepción y la grabación continúan porque no dependen de este bucle.
 */
const charts = new Map() // key → draw()
const dirty = new Set()
let rafId = null
let lastFrame = 0
let maxFps = 60

if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) maxFps = 30

export function setMaxFps(fps) {
  maxFps = Math.max(10, Math.min(60, fps))
}

function frame(ts) {
  rafId = charts.size ? requestAnimationFrame(frame) : null
  if (ts - lastFrame < 1000 / maxFps - 1) return
  lastFrame = ts
  for (const key of dirty) {
    const draw = charts.get(key)
    if (draw) {
      try {
        draw()
      } catch {
        /* un gráfico defectuoso no detiene a los demás */
      }
    }
  }
  dirty.clear()
}

export function registerChart(key, draw) {
  charts.set(key, draw)
  dirty.add(key)
  if (rafId === null && typeof requestAnimationFrame !== 'undefined') rafId = requestAnimationFrame(frame)
}

export function unregisterChart(key) {
  charts.delete(key)
  dirty.delete(key)
  if (!charts.size && rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

export function markDirty(key) {
  if (charts.has(key)) dirty.add(key)
}
