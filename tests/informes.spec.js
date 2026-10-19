import { describe, it, expect } from 'vitest'
import { PdfDoc, aWinAnsi, envolver, anchoTexto, dataUrlABytes } from '@/services/report/pdfWriter.js'
import {
  informeMonitoreoPdf, informeMonitoreoCsv, informeComparacionPdf, informeComparacionCsv, AVISO_NO_MEDICO, fechaUtc,
} from '@/services/report/informes.js'
import { monitoreosJson } from '@/services/export/monitoreoExport.js'
import { analizarMonitoreo, explicarMonitoreo, reducirMinMax } from '@/services/monitoreos/analysis.js'
import { generateReferenceEcg } from '@/data/referenceEcg.js'
import { defaultParametros } from '@/data/defaultSettings.js'
import { exportFilename } from '@/services/export/csvExporter.js'

const latin1 = (u8) => Buffer.from(u8).toString('latin1')
const FECHA = new Date('2026-10-05T15:30:12Z')

function senal(bpm = 75, seg = 20, { ruido = false } = {}) {
  const { valores, fs } = generateReferenceEcg({ durationS: seg, bpm, ruido: ruido ? 0.6 : 0 })
  const raw = Float32Array.from(valores, (v) => Math.round(2048 + v * 500))
  const t = Float64Array.from(raw, (_, i) => (i * 1000) / fs)
  return { raw, t, lo: new Uint8Array(raw.length), fs }
}

const sesion = {
  id: 'abcdef12-0000-0000-0000-000000000000',
  inicio: '2026-10-05T15:00:00.000Z',
  fin: '2026-10-05T15:01:00.000Z',
  estado: 'finalizada',
  guardado: true,
  nombre: 'Prueba reposo',
  notas: 'nota con texto libre',
  actividadPrincipal: 'reposo',
  parametrosAplicados: defaultParametros(),
  participantes: [],
}
const participante = {
  canalIndex: 1, canalNombre: 'Canal 1', usuarioId: 'u1', fs: 250,
  fuente: { tipo: 'simulator', perfilId: 'esp32-ad8232' },
  actividad: [{ tMs: 0, valor: 'reposo' }],
  eventos: [{ tMs: 1000, tipo: 'marca' }, { tMs: 2000, tipo: 'leads-off' }],
  resumen: { muestras: 15000, descartadas: 3, bpmMedio: 75, bpmMin: 70, bpmMax: 80, pctFueraRango: 4, duracionMs: 60000 },
  estadoFinal: 'finalizado',
}
sesion.participantes = [participante]

describe('pdfWriter', () => {
  it('convierte a WinAnsi y mide texto', () => {
    expect(aWinAnsi('Señal → ≥ 5')).toBe('Señal -> >= 5')
    expect(aWinAnsi('漢')).toBe('?')
    expect(anchoTexto('iii', 10)).toBeLessThan(anchoTexto('WWW', 10))
  })
  it('envuelve texto largo sin exceder el ancho', () => {
    const l = envolver('palabra '.repeat(60), 10, 200)
    expect(l.length).toBeGreaterThan(5)
    for (const x of l) expect(anchoTexto(x, 10)).toBeLessThanOrEqual(200)
    expect(envolver('x'.repeat(300), 10, 100).every((x) => anchoTexto(x, 10) <= 100)).toBe(true)
  })
  it('genera un PDF válido con xref coherente y varias páginas', () => {
    const doc = new PdfDoc({ titulo: 'Prueba (ñ)', fecha: FECHA, pie: 'pie de página' })
    doc.titulo1('Título')
    for (let i = 0; i < 120; i++) doc.parrafo(`Línea ${i} con paréntesis (y) \\ barra`)
    const bytes = doc.construir()
    const txt = latin1(bytes)
    expect(txt.startsWith('%PDF-1.4')).toBe(true)
    expect(txt.trimEnd().endsWith('%%EOF')).toBe(true)
    const paginas = Number(/\/Count (\d+)/.exec(txt)[1])
    expect(paginas).toBeGreaterThan(1)
    expect(txt).toContain(`Pagina ${paginas} de ${paginas}`)
    expect(txt).toContain('/CreationDate (D:20261005153012Z)')
    // Cada entrada de xref apunta a "N 0 obj"
    const sx = Number(/startxref\n(\d+)/.exec(txt)[1])
    const filas = txt.slice(sx).split('\n').slice(3).filter((l) => /^\d{10} 00000 n/.test(l))
    filas.forEach((l, i) => expect(txt.slice(Number(l.slice(0, 10))).startsWith(`${i + 1} 0 obj`)).toBe(true))
  })
  it('incrusta un JPEG como XObject', () => {
    const doc = new PdfDoc({ fecha: FECHA })
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9])
    doc.imagenJpeg(jpeg, 100, 50)
    const txt = latin1(doc.construir())
    expect(txt).toContain('/Filter /DCTDecode')
    expect(txt).toContain('/Im0 Do')
  })
  it('decodifica data URL JPEG y rechaza otros', () => {
    expect(Array.from(dataUrlABytes('data:image/jpeg;base64,/9j/'))).toEqual([0xff, 0xd8, 0xff])
    expect(() => dataUrlABytes('data:text/html;base64,AAAA')).toThrow()
  })
})

describe('análisis de un monitoreo', () => {
  it('detecta los latidos y el BPM de una señal limpia', () => {
    const s = senal(75)
    const an = analizarMonitoreo({ ...s, adcMax: 4095 })
    expect(an.picos.length).toBeGreaterThanOrEqual(22)
    expect(Math.abs(an.bpm.medio - 75)).toBeLessThan(3)
    expect(an.rr.length).toBe(an.picos.length - 1)
    expect(an.calidad.nivel).toBe('buena')
    expect(an.rrStats.sdnnMs).toBeLessThan(40)
  })
  it('penaliza pérdida de contacto, saturación y líneas descartadas', () => {
    const s = senal(75)
    for (let i = 0; i < s.lo.length; i += 3) s.lo[i] = 1 // 33 % sin contacto
    const an = analizarMonitoreo({ ...s, adcMax: 4095, descartadas: 5000 })
    expect(an.calidad.nivel).not.toBe('buena')
    expect(an.calidad.motivos.join(' ')).toMatch(/contacto/)
    const sat = senal(75)
    sat.raw.fill(4095, 0, 600)
    expect(analizarMonitoreo({ ...sat, adcMax: 4095 }).calidad.pctSaturada).toBeGreaterThan(5)
  })
  it('señales demasiado cortas o planas no inventan latidos', () => {
    expect(analizarMonitoreo({ raw: new Float32Array(100), fs: 250 }).picos).toEqual([])
    const plano = new Float32Array(5000).fill(2000)
    const an = analizarMonitoreo({ raw: plano, fs: 250 })
    expect(an.picos).toEqual([])
    expect(an.calidad.nivel).toBe('baja')
  })
  it('explica en lenguaje didáctico e incluye actividad y calidad', () => {
    const an = analizarMonitoreo({ ...senal(75), adcMax: 4095 })
    const ex = explicarMonitoreo(an, { actividad: 'reposo', rango: { min: 50, max: 100 } })
    expect(ex.map((e) => e.id)).toEqual(expect.arrayContaining(['picos', 'rr', 'bpm', 'actividad', 'calidad']))
    expect(ex.find((e) => e.id === 'actividad').texto).toMatch(/dentro/)
    expect(ex.find((e) => e.id === 'calidad').texto).toMatch(/ESP32/)
  })
  it('reduce series conservando extremos y huecos', () => {
    const v = Array.from({ length: 10000 }, (_, i) => (i === 5000 ? null : Math.sin(i / 50)))
    v[1234] = 9
    const { idx, val } = reducirMinMax(v, 400)
    expect(idx.length).toBeLessThanOrEqual(600)
    expect(val).toContain(9)
    expect(val).toContain(null)
  })
})

describe('informes seudonimizados', () => {
  const an = analizarMonitoreo({ ...senal(75), adcMax: 4095 })
  const base = { sesion, participante, etiqueta: 'Usuario 3', analisis: an, generadoEn: FECHA }

  it('el PDF lleva aviso, clasificación, fecha UTC, métricas y parámetros, sin alias ni nota', () => {
    const txt = latin1(informeMonitoreoPdf({ ...base, grafico: { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), w: 10, h: 5 } }))
    expect(txt).toContain('Usuario 3')
    expect(txt).toContain('Prueba reposo')
    expect(txt).toContain('2026-10-05 15:30:12 UTC')
    expect(txt).toContain('CONFIDENCIAL-SENSIBLE')
    expect(txt).toContain('solo educativo')
    expect(txt).toContain('Rango BPM global')
    expect(txt).toContain('/Filter /DCTDecode')
    expect(txt).not.toContain('nota con texto libre')
    expect(txt).not.toContain('Grupo A') // el alias nunca entra al informe
  })
  it('la nota solo se incluye si se pide', () => {
    expect(latin1(informeMonitoreoPdf({ ...base, incluirNotas: true }))).toContain('nota con texto libre')
    expect(informeMonitoreoCsv(base)).not.toContain('nota con texto libre')
    expect(informeMonitoreoCsv({ ...base, incluirNotas: true })).toContain('nota con texto libre')
  })
  it('el CSV de informe tiene clasificación, aviso, métricas y tabla RR', () => {
    const csv = informeMonitoreoCsv(base)
    const lineas = csv.split('\r\n')
    expect(lineas[0]).toMatch(/^# CLASIFICACION: CONFIDENCIAL-SENSIBLE .* Exportado: 2026-10-05T15:30:12.000Z$/)
    expect(lineas[1]).toContain(AVISO_NO_MEDICO.slice(0, 30))
    expect(csv).toContain('"metricas","BPM medio (mín.-máx.)","75 (70-80)"')
    expect(csv).toContain('n,t_pico_s,rr_ms,bpm_instantaneo'.replace(/(\w+)/g, '"$1"'))
    expect(csv).not.toMatch(/"'--/) // los datos ausentes no se neutralizan como fórmula
  })
  it('informe de comparación (PDF y CSV)', () => {
    const metricas = { n: 1000, duracionS: 4, correlacion: 0.912, rmse: 0.4, nrmse: 0.12, bpmRef: 72, bpmExp: 74, deltaBpm: 2, desfaseMs: 180 }
    const parametros = { metodo: 'xcorr', normalizacion: 'zscore', fsHz: 250, maxLagMs: 1000 }
    const fuentes = [{ rol: 'A (referencia)', nombre: 'Sintética' }, { rol: 'B (experimental)', nombre: 'Prueba reposo', usuario: 'Usuario 3' }]
    const txt = latin1(informeComparacionPdf({ fuentes, metricas, parametros, generadoEn: FECHA }))
    expect(txt).toContain('Usuario 3')
    expect(txt).toContain('0.912')
    expect(txt).toContain('Correlacion cruzada'.replace('Correlacion', 'Correlaci\xF3n'))
    expect(txt).toContain('solo educativo')
    const csv = informeComparacionCsv({ fuentes, metricas, parametros, generadoEn: FECHA, datos: { x: [0, 0.004], a: [1.5, null], b: [0.2, 0.3] } })
    expect(csv).toContain('"t_s","senal_a","senal_b"')
    expect(csv).toContain('0.004,,0.3')
  })
  it('formatea fecha UTC y nombre de archivo sin datos personales', () => {
    expect(fechaUtc(FECHA)).toBe('2026-10-05 15:30:12 UTC')
    expect(exportFilename('Usuario 3', FECHA, { prefijo: 'informe', ext: 'pdf' })).toBe('informe_Usuario3_2026-10-05T1530Z.pdf')
  })
})

describe('JSON de monitoreos', () => {
  const ctx = { usuarioId: 'u1', esAdmin: false }
  it('seudonimiza, respeta el acceso y omite notas y muestras por defecto', async () => {
    const otra = { ...sesion, id: 'otra', participantes: [{ ...participante, usuarioId: 'u2' }] }
    const out = JSON.parse(await monitoreosJson({ sessions: [sesion, otra], ctx, etiquetaDe: (id) => ({ u1: 'Usuario 1', u2: 'Usuario 2' })[id], fecha: FECHA }))
    expect(out.monitoreos).toHaveLength(1)
    expect(out.monitoreos[0].participantes[0].usuario).toBe('Usuario 1')
    expect(out.monitoreos[0].notas).toBeUndefined()
    expect(out.monitoreos[0].participantes[0].muestras).toBeUndefined()
    expect(out.clasificacion).toMatch(/CONFIDENCIAL-SENSIBLE/)
    expect(out.exportado).toBe('2026-10-05T15:30:12.000Z')
  })
  it('puede incluir notas y muestras si se piden', async () => {
    const sig = { t: [0, 4], raw: [1, 2], lo: [0, 0], bpm: [0, 0], n: 2 }
    const out = JSON.parse(await monitoreosJson({ sessions: [sesion], ctx, etiquetaDe: () => 'Usuario 1', incluirNotas: true, cargarSenal: async () => sig }))
    expect(out.monitoreos[0].notas).toBe('nota con texto libre')
    expect(out.monitoreos[0].participantes[0].muestras.ecg_raw).toEqual([1, 2])
  })
})
