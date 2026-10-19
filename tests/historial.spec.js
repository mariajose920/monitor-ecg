import { describe, it, expect } from 'vitest'
import { filaHistorial, historialCsv, historialPdf, tendencia, ordenarCronologico } from '@/services/report/historial.js'
import { parseSignalCsv } from '@/services/export/csvImporter.js'
import { analizarMonitoreo, serieBpm } from '@/services/monitoreos/analysis.js'
import { generateReferenceEcg } from '@/data/referenceEcg.js'

const FECHA = new Date('2026-10-05T15:30:12Z')
const sesion = (id, inicio, nombre, bpm) => ({
  id, inicio, nombre, guardado: true, estado: 'finalizada', actividadPrincipal: 'reposo',
  participantes: [{ canalIndex: 1, usuarioId: 'u1', actividad: [{ tMs: 0, valor: 'reposo' }], resumen: { bpmMedio: bpm, bpmMin: bpm - 5, bpmMax: bpm + 6, pctFueraRango: 2, duracionMs: 60000 } }],
})
function analisis(bpm) {
  const { valores, fs } = generateReferenceEcg({ durationS: 30, bpm })
  const raw = Float32Array.from(valores, (v) => Math.round(2048 + v * 500))
  return analizarMonitoreo({ raw, t: Float64Array.from(raw, (_, i) => (i * 1000) / fs), fs, adcMax: 4095 })
}

describe('historial de frecuencias cardíacas', () => {
  const a = analisis(70)
  const filas = [
    filaHistorial({ sesion: sesion('bbbbbbbb-2', '2026-10-03T10:00:00Z', '=Segundo', 80), participante: sesion('x', 'y', 'z', 80).participantes[0], etiqueta: 'Usuario 1', analisis: a }),
    filaHistorial({ sesion: sesion('aaaaaaaa-1', '2026-10-01T10:00:00Z', 'Primero', 70), participante: sesion('x', 'y', 'z', 70).participantes[0], etiqueta: 'Usuario 1', analisis: a }),
  ]
  it('ordena cronológicamente y calcula la serie de BPM', () => {
    expect(ordenarCronologico(filas).map((f) => f.sesionId)).toEqual(['aaaaaaaa', 'bbbbbbbb'])
    expect(filas[0].serie.length).toBeGreaterThan(20)
    expect(Math.abs(filas[0].serie[5].bpm - 70)).toBeLessThan(6)
    expect(serieBpm(a, 10).length).toBeLessThanOrEqual(10)
  })
  it('CSV: clasificación, tabla, neutralización de fórmulas y serie reimportable', () => {
    const csv = historialCsv({ filas, generadoEn: FECHA })
    const l = csv.split('\r\n')
    expect(l[0]).toMatch(/^# CLASIFICACION: CONFIDENCIAL-SENSIBLE/)
    expect(l.some((x) => x.startsWith('"2026-10-01 10:00:00 UTC","Primero","Usuario 1","aaaaaaaa",60,"Reposo",70,65,76,2'))).toBe(true)
    expect(csv).toContain(`"'=Segundo"`)
    const r = parseSignalCsv(csv)
    expect(r.formato).toBe('serie-bpm')
    expect(r.filas).toBeGreaterThan(20)
  })
  it('PDF: seudonimizado, con tabla y gráfico', () => {
    const t = tendencia(filas)
    expect(t.x).toEqual([1, 2])
    expect(t.medio).toEqual([70, 80])
    const txt = Buffer.from(historialPdf({ filas, grafico: { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), w: 10, h: 5 }, generadoEn: FECHA, alcance: 'Usuario 1' })).toString('latin1')
    expect(txt).toContain('Usuario 1')
    expect(txt).toContain('/Filter /DCTDecode')
    expect(txt).toContain('CONFIDENCIAL-SENSIBLE')
    expect(txt).toContain('Primero')
  })
  it('PDF vacío indica que no hay monitoreos', () => {
    expect(Buffer.from(historialPdf({ filas: [], generadoEn: FECHA })).toString('latin1')).toContain('No hay monitoreos guardados')
  })
})
