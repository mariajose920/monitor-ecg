import { highPass, notch } from '@/utils/dsp/filters.js'
import { normalize } from '@/utils/dsp/normalize.js'
import { resample, resampleByTime } from '@/utils/dsp/resample.js'
import { crossCorrelate, overlap } from '@/utils/dsp/crossCorrelation.js'
import { detectRPeaks, bpmFromPeaks } from '@/utils/dsp/rPeakDetector.js'
import { pearson, rmse, nrmse } from '@/utils/dsp/metrics.js'

/**
 * Pipeline de comparación (RF12–RF14):
 * filtro (paso alto 0,5 Hz + notch 50 Hz) → remuestreo a fs común → normalización →
 * alineación (pico R / correlación cruzada / manual) → métricas.
 *
 * Convención de desfase: lag > 0 ⇒ la señal experimental está RETRASADA `lag` muestras respecto
 * de la referencia; se compara ref[i] con exp[i + lag].
 */

/** Tramo contiguo más largo sin leads-off (SEC-34: leads-off no se usa para comparar). */
export function longestValidSegment(values, leadsOff, maxN = Infinity) {
  if (!leadsOff) return { start: 0, end: Math.min(values.length, maxN) }
  let best = { start: 0, end: 0 }
  let s = -1
  for (let i = 0; i <= values.length; i++) {
    const ok = i < values.length && !leadsOff[i]
    if (ok && s < 0) s = i
    if (!ok && s >= 0) {
      if (i - s > best.end - best.start) best = { start: s, end: i }
      s = -1
    }
  }
  if (best.end - best.start > maxN) best.end = best.start + maxN
  return best
}

/**
 * Prepara una señal: (t opcional) → remuestreo → filtro → normalización.
 * @param {object} o { values, fs?, t?, fsOut, normalizacion, filtrar }
 */
export function prepareSignal({ values, fs = null, t = null, fsOut = 250, normalizacion = 'zscore', filtrar = true }) {
  let x
  if (t && t.length === values.length) x = resampleByTime(t, values, fsOut)
  else x = resample(values, fs ?? fsOut, fsOut)
  if (filtrar) x = notch(highPass(x, fsOut, 0.5), fsOut, 50)
  return normalize(x, normalizacion)
}

/** Desfase por picos R: minimiza la distancia media entre picos emparejados. */
export function lagByRPeaks(ref, exp, fs, maxLag) {
  const pr = detectRPeaks(ref, fs)
  const pe = detectRPeaks(exp, fs)
  if (pr.length < 1 || pe.length < 1) return { lag: 0, ok: false, picosRef: pr, picosExp: pe }
  const candidatos = new Set()
  for (const e of pe.slice(0, 4)) for (const r of pr.slice(0, 4)) {
    const lag = e - r
    if (Math.abs(lag) <= maxLag) candidatos.add(lag)
  }
  if (!candidatos.size) return { lag: 0, ok: false, picosRef: pr, picosExp: pe }
  // Costo = distancia media entre picos emparejados (solo dentro del solapamiento).
  const evaluados = []
  for (const lag of candidatos) {
    let s = 0
    let c = 0
    for (const e of pe) {
      const objetivo = e - lag
      if (objetivo < pr[0] - fs * 0.15 || objetivo > pr[pr.length - 1] + fs * 0.15) continue
      let d = Infinity
      for (const r of pr) d = Math.min(d, Math.abs(objetivo - r))
      s += Math.min(d, fs * 0.3)
      c++
    }
    if (c >= Math.min(2, pe.length)) evaluados.push({ lag, cost: s / c })
  }
  if (!evaluados.length) return { lag: 0, ok: false, picosRef: pr, picosExp: pe }
  const minCost = Math.min(...evaluados.map((e) => e.cost))
  // Una señal periódica alinea igual de bien con ±1 RR: se elige el menor |desfase| entre los óptimos.
  const best = evaluados.filter((e) => e.cost <= minCost + 1).sort((a, b) => Math.abs(a.lag) - Math.abs(b.lag))[0]
  return { lag: best.lag, ok: true, picosRef: pr, picosExp: pe }
}

/**
 * Calcula el desfase según el método.
 * @returns {{lag:number, metodo:string, r?:number}}
 */
export function computeLag(ref, exp, fs, metodo, { maxLagMs = 1000, manualMs = 0 } = {}) {
  const maxLag = Math.round((maxLagMs * fs) / 1000)
  if (metodo === 'manual') return { lag: Math.round((manualMs * fs) / 1000), metodo }
  if (metodo === 'r-peak') {
    const r = lagByRPeaks(ref, exp, fs, maxLag)
    return { lag: r.lag, metodo, ok: r.ok }
  }
  const r = crossCorrelate(ref, exp, maxLag)
  return { lag: r.lag, metodo: 'xcorr', r: r.r, ok: true }
}

/** Métricas sobre el solapamiento alineado. */
export function computeMetrics(ref, exp, lag, fs) {
  const { x, y } = overlap(ref, exp, lag)
  const bpmRef = bpmFromPeaks(detectRPeaks(ref, fs), fs)
  const bpmExp = bpmFromPeaks(detectRPeaks(exp, fs), fs)
  return {
    n: x.length,
    duracionS: x.length / fs,
    correlacion: pearson(x, y),
    rmse: rmse(x, y),
    nrmse: nrmse(x, y),
    bpmRef,
    bpmExp,
    deltaBpm: bpmRef !== null && bpmExp !== null ? bpmExp - bpmRef : null,
    desfaseMs: (lag * 1000) / fs,
  }
}

/**
 * Recorta una señal al tramo continuo más largo sin leads-off (máx. maxSeconds).
 * @param {{values:ArrayLike<number>, t?:ArrayLike<number>|null, leadsOff?:ArrayLike<number>|null, fs?:number}} d
 * @throws si el tramo dura menos de minSeconds
 */
export function trimValidSegment(d, { maxSeconds = 30, minSeconds = 3, defaultFs = 250 } = {}) {
  const fs = d.fs || defaultFs
  const seg = longestValidSegment(d.values, d.leadsOff, Math.round(maxSeconds * fs))
  if (seg.end - seg.start < minSeconds * fs) throw new Error(`La señal no tiene al menos ${minSeconds} s continuos sin electrodos desconectados`)
  return {
    ...d,
    values: d.values.subarray(seg.start, seg.end),
    t: d.t ? d.t.subarray(seg.start, seg.end) : null,
  }
}
