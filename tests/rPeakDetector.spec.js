import { describe, it, expect } from 'vitest'
import { RPeakDetector, detectRPeaks, bpmFromPeaks } from '@/utils/dsp/rPeakDetector.js'
import { bpmFromRR } from '@/utils/dsp/bpm.js'
import { generateReferenceEcg, PqrstGenerator, mvToAdc } from '@/data/referenceEcg.js'

describe('bpmFromRR', () => {
  it('usa la mediana y filtra lo no fisiológico', () => {
    expect(bpmFromRR([800, 800, 810, 300, 790])).toBeCloseTo(75, 0)
    expect(bpmFromRR([100])).toBeNull() // 600 BPM
    expect(bpmFromRR([])).toBeNull()
  })
})

describe('RPeakDetector incremental', () => {
  it.each([50, 72, 120, 170])('estima %i BPM en una señal sintética limpia', (bpm) => {
    const { valores, fs } = generateReferenceEcg({ durationS: 20, bpm })
    const det = new RPeakDetector({ fs })
    let beats = 0
    for (let i = 0; i < valores.length; i++) if (det.push((i * 1000) / fs, valores[i])) beats++
    const est = det.getBpm(((valores.length - 1) * 1000) / fs)
    expect(est).not.toBeNull()
    expect(Math.abs(est - bpm)).toBeLessThan(3)
    expect(Math.abs(beats - (20 * bpm) / 60)).toBeLessThanOrEqual(2)
  })

  it('funciona con cuentas de ADC, ruido y deriva (independiente de la escala)', () => {
    const gen = new PqrstGenerator({ fs: 250, bpm: 80, ruido: 0.03, deriva: 0.1, variabilidad: 0.02, seed: 3 })
    const det = new RPeakDetector({ fs: 250 })
    let t = 0
    for (let i = 0; i < 250 * 20; i++, t += 4) det.push(t, mvToAdc(gen.next()))
    expect(Math.abs(det.getBpm(t) - 80)).toBeLessThan(5)
  })

  it('devuelve null si no hay latidos recientes (señal plana)', () => {
    const det = new RPeakDetector({ fs: 250 })
    for (let i = 0; i < 2500; i++) det.push(i * 4, 338)
    expect(det.getBpm(10000)).toBeNull()
  })

  it('detectRPeaks ubica los picos R en la posición correcta', () => {
    const fs = 250
    const { valores } = generateReferenceEcg({ durationS: 10, bpm: 60 })
    const peaks = detectRPeaks(valores, fs)
    // Primer R del generador en 0,35 s y luego cada 1 s
    expect(peaks.length).toBeGreaterThanOrEqual(9)
    expect(Math.abs(peaks[0] - Math.round(0.35 * fs))).toBeLessThanOrEqual(2)
    expect(bpmFromPeaks(peaks, fs)).toBeCloseTo(60, 0)
  })
})
