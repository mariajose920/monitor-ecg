import { describe, it, expect } from 'vitest'
import { crossCorrelate, overlap } from '@/utils/dsp/crossCorrelation.js'
import { pearson, rmse, nrmse } from '@/utils/dsp/metrics.js'
import { zscore, minmax } from '@/utils/dsp/normalize.js'
import { resample } from '@/utils/dsp/resample.js'
import { generateReferenceEcg, PqrstGenerator } from '@/data/referenceEcg.js'
import { computeLag, prepareSignal, longestValidSegment } from '@/services/compare/compareSignals.js'

function retrasar(x, d) {
  const out = new Float32Array(x.length)
  for (let i = 0; i < x.length; i++) out[i] = i - d >= 0 ? x[i - d] : x[0]
  return out
}

describe('métricas y normalización', () => {
  it('pearson, rmse y nrmse en casos conocidos', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1)
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1)
    expect(pearson([1, 1, 1], [1, 2, 3])).toBe(0)
    expect(rmse([0, 0], [3, 4])).toBeCloseTo(Math.sqrt(12.5))
    expect(nrmse([0, 10], [0, 10])).toBe(0)
  })

  it('zscore y minmax', () => {
    const z = zscore([1, 2, 3, 4])
    expect(z.reduce((a, b) => a + b, 0)).toBeCloseTo(0)
    const m = minmax([5, 10, 15])
    expect([...m]).toEqual([0, 0.5, 1])
  })

  it('resample conserva la duración', () => {
    const x = new Float32Array(500).map((_, i) => i)
    const y = resample(x, 500, 250)
    expect(y.length).toBe(250)
    expect(y[100]).toBeCloseTo(200)
  })
})

describe('correlación cruzada (RF14)', () => {
  const { valores } = generateReferenceEcg({ durationS: 10, bpm: 70 })

  it.each([0, 10, 45, -30])('recupera un desfase conocido de %i muestras', (d) => {
    const b = d >= 0 ? retrasar(valores, d) : valores.slice(-d)
    const r = crossCorrelate(valores, b, 250)
    expect(r.lag).toBe(d)
    expect(r.r).toBeGreaterThan(0.99)
  })

  it('overlap empareja a[i] con b[i+lag]', () => {
    const { x, y } = overlap([1, 2, 3, 4], [9, 1, 2, 3, 4], 1)
    expect([...x]).toEqual([1, 2, 3, 4])
    expect([...y]).toEqual([1, 2, 3, 4])
  })

  it('xcorr y pico R alinean una señal ruidosa con 180 ms de retraso', () => {
    const fs = 250
    const ref = prepareSignal({ values: generateReferenceEcg({ durationS: 12, bpm: 72 }).valores, fs })
    const gen = new PqrstGenerator({ fs, bpm: 72, variabilidad: 0, ruido: 0.04, deriva: 0.1, seed: 5 })
    const raw = new Float32Array(12 * fs)
    for (let i = 0; i < 45; i++) raw[i] = 0
    // La señal experimental empieza 45 muestras (180 ms) más tarde
    const tmp = new Float32Array(12 * fs - 45)
    for (let i = 0; i < tmp.length; i++) tmp[i] = gen.next()
    raw.set(tmp, 45)
    const exp = prepareSignal({ values: raw, fs })
    const x = computeLag(ref, exp, fs, 'xcorr', { maxLagMs: 1000 })
    const r = computeLag(ref, exp, fs, 'r-peak', { maxLagMs: 1000 })
    expect(Math.abs(x.lag - 45)).toBeLessThanOrEqual(2)
    expect(Math.abs(r.lag - 45)).toBeLessThanOrEqual(3)
    expect(computeLag(ref, exp, fs, 'manual', { manualMs: 180 }).lag).toBe(45)
  })

  it('longestValidSegment evita tramos con leads-off', () => {
    const v = new Float32Array(10)
    const lo = Uint8Array.from([0, 0, 1, 0, 0, 0, 0, 1, 0, 0])
    expect(longestValidSegment(v, lo)).toEqual({ start: 3, end: 7 })
  })
})
