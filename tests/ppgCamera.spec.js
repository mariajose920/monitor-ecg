import { describe, it, expect } from 'vitest'
import { PpgProcessor, PpgPeakDetector, bandpassPpg, periodicity, PPG_FS } from '@/utils/dsp/ppgCamera.js'

const FS = PPG_FS

/** PRNG determinista (mulberry32) para ruido reproducible. */
function rng(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Onda de pulso: asimetrica (subida rapida, bajada lenta), periodo = 60/bpm. */
function pulso(t, bpm) {
  const f = bpm / 60
  const ph = (t * f) % 1
  return ph < 0.2 ? Math.sin((Math.PI * ph) / 0.2) : 0.35 * Math.sin((Math.PI * (ph - 0.2)) / 0.8) ** 2
}

/** Fotograma rojo con dedo: DC ~ 200, pulsacion ~1 % (el rojo BAJA en la sistole). */
function generar({ seg, bpm, ruido = 0.15, dedo = true, seed = 1, movimientoEn = null }) {
  const rnd = rng(seed)
  const out = []
  for (let i = 0; i < seg * FS; i++) {
    const t = i / FS
    let r = dedo ? 200 - 2.0 * pulso(t, bpm) + (rnd() - 0.5) * 2 * ruido : 20
    if (dedo && movimientoEn && t >= movimientoEn && t < movimientoEn + 1) r += 25 * Math.sin(2 * Math.PI * 3 * (t - movimientoEn))
    out.push({ t: (i * 1000) / FS, r, g: dedo ? 30 : 20, b: dedo ? 20 : 20 })
  }
  return out
}

function procesar(frames) {
  const p = new PpgProcessor({ fs: FS })
  let last = null
  for (const f of frames) last = p.push(f.t, f.r, f.g, f.b)
  return { p, last, tEnd: frames[frames.length - 1].t }
}

describe('PPG por camara: BPM', () => {
  for (const bpm of [55, 72, 90, 120]) {
    it(`recupera ${bpm} lpm a 30 Hz (+-3)`, () => {
      const { p, tEnd } = procesar(generar({ seg: 30, bpm }))
      const est = p.getBpm(tEnd)
      expect(est).not.toBeNull()
      expect(Math.abs(est - bpm)).toBeLessThanOrEqual(3)
    })
  }

  it('los filtros de sanidad rechazan BPM fuera de 30-220', () => {
    const d = new PpgPeakDetector({ fs: FS, warmupMs: 0 })
    // Picos cada 2,4 s (25 lpm): fuera de 30-220, no debe dar BPM
    for (let i = 0; i < 600; i++) d.push((i * 1000) / FS, i % 72 === 0 ? 1 : 0)
    expect(d.getBpm(600 * (1000 / FS))).toBeNull()
    // Picos cada 150 ms (400 lpm): el refractario de 300 ms los descarta, el BPM nunca supera 220
    const e = new PpgPeakDetector({ fs: FS, warmupMs: 0 })
    for (let i = 0; i < 300; i++) e.push((i * 1000) / FS, i % 5 === 0 ? 1 : 0)
    const b = e.getBpm(300 * (1000 / FS))
    expect(b === null || b <= 220).toBe(true)
  })
})

describe('PPG por camara: dedo y calidad', () => {
  it('detecta dedo ausente (leads_off equivalente)', () => {
    const { p, last } = procesar(generar({ seg: 6, bpm: 72, dedo: false }))
    expect(last.fingerOn).toBe(false)
    expect(p.getBpm(6000)).toBeNull()
    expect(p.quality().estado).toBe('sin-dedo')
  })

  it('detecta dedo presente y senal buena tras la calibracion', () => {
    const { p, last } = procesar(generar({ seg: 20, bpm: 75 }))
    expect(last.fingerOn).toBe(true)
    const q = p.quality()
    expect(q.estado).toBe('buena')
    expect(q.snrDb).toBeGreaterThan(0)
  })

  it('al retirar el dedo vuelve a leads-off y reinicia el BPM', () => {
    const a = generar({ seg: 15, bpm: 72 })
    const b = generar({ seg: 3, bpm: 72, dedo: false }).map((f) => ({ ...f, t: f.t + 15000 }))
    const { p, last, tEnd } = procesar([...a, ...b])
    expect(last.fingerOn).toBe(false)
    expect(p.getBpm(tEnd)).toBeNull()
  })

  it('marca movimiento ante sacudidas del rojo', () => {
    const p = new PpgProcessor({ fs: FS })
    const frames = generar({ seg: 14, bpm: 72, movimientoEn: 10 })
    let visto = false
    for (const f of frames) {
      p.push(f.t, f.r, f.g, f.b)
      if (f.t > 10000 && p.quality().estado === 'movimiento') visto = true
    }
    expect(visto).toBe(true)
  })

  it('indica presion excesiva cuando casi no hay pulsatilidad', () => {
    const frames = generar({ seg: 12, bpm: 72, ruido: 0.01 }).map((f) => ({ ...f, r: 200 + (f.r - 200) * 0.02 }))
    const { p } = procesar(frames)
    expect(p.quality().estado).toBe('presion')
  })
})

describe('PPG por camara: filtros', () => {
  it('el pasa-banda elimina la linea base y atenua el ruido de alta frecuencia', () => {
    const n = FS * 20
    const base = new Float32Array(n)
    const hf = new Float32Array(n)
    const pulsoSolo = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const t = i / FS
      base[i] = 100 + 5 * t // deriva lineal
      hf[i] = Math.sin(2 * Math.PI * 12 * t)
      pulsoSolo[i] = Math.sin(2 * Math.PI * 1.2 * t)
    }
    const rms = (x) => Math.sqrt(x.slice(FS * 8).reduce((s, v) => s + v * v, 0) / (n - FS * 8))
    expect(rms(bandpassPpg(hf))).toBeLessThan(0.1 * rms(hf))
    expect(rms(bandpassPpg(pulsoSolo))).toBeGreaterThan(0.7 * rms(pulsoSolo))
    expect(rms(bandpassPpg(base))).toBeLessThan(0.5) // la rampa (5 u/s) casi no pasa
  })

  it('periodicity distingue senal periodica de ruido', () => {
    const n = FS * 6
    const per = new Float32Array(n)
    const rnd = rng(7)
    const ruido = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      per[i] = Math.sin(2 * Math.PI * 1.2 * (i / FS))
      ruido[i] = rnd() - 0.5
    }
    expect(periodicity(per, n, FS)).toBeGreaterThan(0.8)
    expect(periodicity(ruido, n, FS)).toBeLessThan(0.4)
  })
})
