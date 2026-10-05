import { describe, it, expect } from 'vitest'
import {
  escapeCsvCell, csvRow, classificationLine, buildCsv, exportFilename, participantRows, actividadEn, headerRow,
} from '@/services/export/csvExporter.js'

describe('escapado CSV (SEC-46)', () => {
  it.each([
    ['=SUM(A1:A9)', `"'=SUM(A1:A9)"`],
    ['+cmd', `"'+cmd"`],
    ['-1+1', `"'-1+1"`],
    ['@SUM(1)', `"'@SUM(1)"`],
    ['\tTAB', `"'\tTAB"`],
    ['\rCR', `"'\rCR"`],
    ['texto "con" comillas', '"texto ""con"" comillas"'],
    ['Usuario 3', '"Usuario 3"'],
  ])('neutraliza %j', (entrada, salida) => {
    expect(escapeCsvCell(entrada)).toBe(salida)
  })

  it('números y vacíos', () => {
    expect(escapeCsvCell(-5)).toBe('-5')
    expect(escapeCsvCell(72.5)).toBe('72.5')
    expect(escapeCsvCell(NaN)).toBe('')
    expect(escapeCsvCell(null)).toBe('')
    expect(csvRow(['a', 1, null])).toBe('"a",1,')
  })
})

describe('exportación seudonimizada (SEC-23, SEC-44, SEC-47)', () => {
  const fecha = new Date('2026-10-05T15:30:12Z')

  it('comienza con la línea de clasificación', () => {
    const csv = buildCsv(['x'], { date: fecha })
    expect(csv.startsWith('# CLASIFICACION: CONFIDENCIAL-SENSIBLE - Datos de salud seudonimizados - Uso exclusivamente academico - Exportado: 2026-10-05T15:30:12.000Z')).toBe(true)
    expect(classificationLine(fecha)).toContain('Exportado: 2026-10-05T15:30:12.000Z')
    expect(csv.split('\r\n')[1]).toBe('user_id,session_id,t_ms,ecg_raw,leads_off,bpm,activity')
  })

  it('cabecera con opcionales solo si se pide', () => {
    expect(headerRow(true)).toBe('user_id,session_id,t_ms,ecg_raw,leads_off,bpm,activity,age_range,weight_kg')
  })

  it('nombre de archivo sin datos personales', () => {
    expect(exportFilename('Usuario 3', fecha)).toBe('ecg_Usuario3_2026-10-05T1530Z.csv')
    expect(exportFilename('=evil/../x', fecha)).toBe('ecg_evilx_2026-10-05T1530Z.csv')
  })

  it('filas con actividad según la línea de tiempo y sin nombre real', () => {
    const session = { id: 'abcdef12-0000-0000-0000-000000000000' }
    const participante = { actividad: [{ tMs: 0, valor: 'reposo' }, { tMs: 8, valor: 'ejercicio' }] }
    const signal = { t: [0, 4, 8], raw: [300, 310, 320], lo: [0, 0, 1], bpm: [70, 70, 0], n: 3 }
    const rows = participantRows({ session, participante, signal, etiqueta: 'Usuario 3' })
    expect(rows[0]).toBe('"Usuario 3","abcdef12",0,300,0,70,"reposo"')
    expect(rows[2]).toBe('"Usuario 3","abcdef12",8,320,1,0,"ejercicio"')
    expect(actividadEn(participante.actividad, 5)).toBe('reposo')
  })
})
