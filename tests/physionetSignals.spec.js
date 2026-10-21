import { describe, it, expect } from 'vitest'
import { PATOLOGIAS_PHYSIONET, MAPA_PATOLOGIAS } from '@/data/physionetDatabases.js'
import { generarSenalPatologia } from '@/data/physionetSignals.js'

describe('Base de datos y generador de señales PhysioNet', () => {
  it('contiene las 7 patologías representativas con metadatos completos', () => {
    expect(PATOLOGIAS_PHYSIONET).toHaveLength(7)
    const ids = PATOLOGIAS_PHYSIONET.map((p) => p.id)
    expect(ids).toContain('nsr')
    expect(ids).toContain('afib')
    expect(ids).toContain('pvc')
    expect(ids).toContain('vtach')
    expect(ids).toContain('brady')
    expect(ids).toContain('tachy')
    expect(ids).toContain('ischemia')

    for (const p of PATOLOGIAS_PHYSIONET) {
      expect(p.nombre).toBeTruthy()
      expect(p.sigla).toBeTruthy()
      expect(p.baseDatos).toMatch(/Database/i)
      expect(p.enlacePhysioNet).toMatch(/https:\/\/physionet\.org/)
      expect(p.bpmNominal).toBeGreaterThan(30)
      expect(p.criterios).toHaveLength(4)
      expect(p.caracteristicas).toBeDefined()
    }
  })

  it('el mapa indexa correctamente por ID', () => {
    expect(MAPA_PATOLOGIAS.afib.sigla).toBe('AFIB')
    expect(MAPA_PATOLOGIAS.pvc.sigla).toBe('PVC')
    expect(MAPA_PATOLOGIAS.nsr.categoria).toBe('Control Normal')
  })

  it('genera señales válidas sin NaN ni valores infinitos a 250 Hz', () => {
    const fs = 250
    const durS = 10
    const n = fs * durS

    for (const p of PATOLOGIAS_PHYSIONET) {
      const res = generarSenalPatologia(p.id, durS, fs)
      expect(res.values).toBeInstanceOf(Float32Array)
      expect(res.values.length).toBe(n)
      expect(res.fs).toBe(fs)
      expect(res.nombre).toContain(p.sigla)
      expect(res.comentarios.length).toBeGreaterThan(0)

      let tieneValoresDistintosDeCero = false
      for (let i = 0; i < n; i++) {
        const v = res.values[i]
        expect(Number.isFinite(v)).toBe(true)
        expect(Number.isNaN(v)).toBe(false)
        if (Math.abs(v) > 0.05) tieneValoresDistintosDeCero = true
      }
      expect(tieneValoresDistintosDeCero).toBe(true)
    }
  })
})
