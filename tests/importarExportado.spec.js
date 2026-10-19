import { describe, it, expect } from 'vitest'
import { parseSignalCsv } from '@/services/export/csvImporter.js'
import { buildCsv, participantRows } from '@/services/export/csvExporter.js'

function exportar(n = 300, sid = 'abcdef12-0000') {
  const t = Float64Array.from({ length: n }, (_, i) => i * 4)
  const raw = Float32Array.from({ length: n }, (_, i) => 2000 + Math.round(300 * Math.sin(i / 8)))
  const signal = { t, raw, lo: new Uint8Array(n), bpm: new Float32Array(n).fill(72), n }
  return participantRows({ session: { id: sid }, participante: { actividad: [{ tMs: 0, valor: 'reposo' }] }, signal, etiqueta: 'Usuario 3' })
}

describe('importar lo que exporta la app', () => {
  it('un CSV de monitoreo exportado vuelve a ser una señal comparable', () => {
    const csv = buildCsv(exportar(), { date: new Date('2026-10-05T15:30:12Z') })
    const r = parseSignalCsv(csv)
    expect(r.formato).toBe('exportado')
    expect(r.filas).toBe(300)
    expect(r.invalidas).toBe(0)
    expect(Math.round(r.fs)).toBe(250)
    expect(r.v[0]).toBe(2000)
    expect(r.comentarios[0]).toMatch(/CLASIFICACION/)
  })
  it('usa solo el primer monitoreo si el archivo trae varios', () => {
    const csv = buildCsv([...exportar(100, 'aaaaaaaa-1'), ...exportar(200, 'bbbbbbbb-2')])
    expect(parseSignalCsv(csv).filas).toBe(100)
  })
  it('rechaza valores fuera del rango del ADC y filas manipuladas', () => {
    const filas = exportar(100)
    filas.push('"Usuario 3","abcdef12",9000,99999,0,70,"reposo"', '"Usuario 3","abcdef12",9004,5000,0,70,"reposo"', '=cmd|calc,1,2,3,4,5,6')
    const r = parseSignalCsv(buildCsv(filas))
    expect(r.filas).toBe(100)
    expect(r.invalidas).toBe(3)
  })
  it('importa la serie de BPM de un historial', () => {
    const filas = Array.from({ length: 20 }, (_, i) => `"Usuario 3","abcdef12",${i * 1.5},${70 + (i % 5)}`)
    const csv = ['# CLASIFICACION: x', 'user_id,session_id,t_s,bpm', ...filas].join('\r\n')
    const r = parseSignalCsv(csv)
    expect(r.formato).toBe('serie-bpm')
    expect(r.filas).toBe(20)
    expect(r.t[1]).toBe(1500)
  })
  it('un archivo con pocas filas se rechaza', () => {
    expect(() => parseSignalCsv(buildCsv(exportar(10)))).toThrow(/suficientes/)
  })
})
