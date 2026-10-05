import { describe, it, expect } from 'vitest'
import { createRangeEvaluator } from '@/utils/rangeEvaluator.js'
import { validarRango, validarParametros, defaultParametros, validarSincronizacion, defaultSincronizacion } from '@/data/defaultSettings.js'

const R = { min: 60, max: 100 }

describe('rangeEvaluator (RF16/RF17/RF20)', () => {
  it('clasifica dentro / bajo / sobre / sin-dato', () => {
    const ev = createRangeEvaluator()
    expect(ev.evaluate(80, R, 0).estado).toBe('dentro')
    expect(createRangeEvaluator().evaluate(50, R, 0).estado).toBe('bajo')
    expect(createRangeEvaluator().evaluate(120, R, 0).estado).toBe('sobre')
    expect(ev.evaluate(null, R, 0).estado).toBe('sin-dato')
  })

  it('dispara la alerta una sola vez tras la duración mínima', () => {
    const ev = createRangeEvaluator({ duracionMinMs: 5000, histeresisBpm: 2 })
    expect(ev.evaluate(110, R, 0).alerta).toBeNull()
    expect(ev.evaluate(110, R, 4999).alerta).toBeNull()
    expect(ev.evaluate(110, R, 5000).alerta).toBe('alta')
    expect(ev.evaluate(110, R, 9000).alerta).toBeNull()
    expect(ev.evaluate(110, R, 9000).enAlerta).toBe(true)
  })

  it('aplica histéresis para volver a "dentro"', () => {
    const ev = createRangeEvaluator({ duracionMinMs: 1000, histeresisBpm: 2 })
    ev.evaluate(101, R, 0)
    expect(ev.evaluate(100, R, 100).estado).toBe('sobre') // aún no baja de max − 2
    expect(ev.evaluate(99, R, 200).estado).toBe('sobre')
    expect(ev.evaluate(98, R, 300).estado).toBe('dentro')
    ev.evaluate(59, R, 400)
    expect(ev.evaluate(61, R, 500).estado).toBe('bajo')
    expect(ev.evaluate(62, R, 600).estado).toBe('dentro')
  })

  it('un valor aislado fuera de rango no dispara alerta y reinicia el cronómetro', () => {
    const ev = createRangeEvaluator({ duracionMinMs: 5000, histeresisBpm: 0 })
    ev.evaluate(50, R, 0)
    ev.evaluate(80, R, 3000)
    expect(ev.evaluate(50, R, 4000).alerta).toBeNull()
    expect(ev.evaluate(50, R, 8999).alerta).toBeNull()
    expect(ev.evaluate(50, R, 9000).alerta).toBe('baja')
  })

  it('perder el dato (leads-off) reinicia la evaluación', () => {
    const ev = createRangeEvaluator({ duracionMinMs: 5000 })
    ev.evaluate(120, R, 0)
    ev.evaluate(null, R, 3000)
    expect(ev.evaluate(120, R, 6000).alerta).toBeNull()
    expect(ev.evaluate(120, R, 11000).alerta).toBe('alta')
  })
})

describe('validación de parámetros (SEC-36)', () => {
  it('valida 30 ≤ min < max ≤ 220 enteros', () => {
    expect(validarRango({ min: 30, max: 220 })).toBeNull()
    expect(validarRango({ min: 29, max: 100 })).not.toBeNull()
    expect(validarRango({ min: 100, max: 100 })).not.toBeNull()
    expect(validarRango({ min: 60.5, max: 100 })).not.toBeNull()
    expect(validarRango({ min: '60', max: 100 })).not.toBeNull()
  })

  it('los valores por defecto son válidos y el enum de sincronización es cerrado', () => {
    expect(validarParametros(defaultParametros())).toBeNull()
    expect(validarSincronizacion(defaultSincronizacion())).toBeNull()
    expect(validarSincronizacion({ ...defaultSincronizacion(), metodoPorDefecto: 'eval' })).not.toBeNull()
  })
})
