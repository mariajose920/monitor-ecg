import { describe, it, expect } from 'vitest'
import { parseLine, EcgStreamParser, bpmMostrable, MAX_PENDING } from '@/services/parsing/ecgCsvParser.js'
import { parseSignalCsv, validateCsvFile } from '@/services/export/csvImporter.js'

function crearParser(opts = {}) {
  const batches = []
  const events = []
  const p = new EcgStreamParser({ onBatch: (b) => batches.push(b), onEvent: (e) => events.push(e), ...opts })
  const all = () => {
    const t = []
    const v = []
    const lo = []
    for (const b of batches) for (let i = 0; i < b.n; i++) {
      t.push(b.t[i])
      v.push(b.v[i])
      lo.push(b.leadsOff[i])
    }
    return { t, v, lo }
  }
  return { p, batches, events, all }
}

describe('parseLine (SEC-34)', () => {
  it('acepta líneas válidas y los límites', () => {
    expect(parseLine('1234,512,0,72.5')).toEqual({ ok: true, tMs: 1234, raw: 512, leadsOff: 0, bpm: 72.5 })
    expect(parseLine('0,0,1,0').ok).toBe(true)
    expect(parseLine('4294967295,1023,0,300').ok).toBe(true)
    expect(parseLine('10,4095,0,60', { maxRaw: 4095 }).ok).toBe(true)
  })

  it.each([
    ['1023x', 'formato'],
    ['10,1024,0,70', 'ecg_raw'],
    ['10,-1,0,70', 'formato'],
    ['10,500,2,70', 'formato'],
    ['10,500,0,301', 'bpm'],
    ['10,500,0,72.123', 'formato'],
    ['12abc,500,0,72', 'formato'],
    ['10,500,0', 'formato'],
    ['10,500,0,72,9', 'formato'],
    [' 10,500,0,72', 'formato'],
    ['10,5e2,0,72', 'formato'],
    ['=cmd|"/c calc"!A1', 'formato'],
    ['<script>alert(1)</script>', 'formato'],
    ['4294967296,500,0,72', 't_ms'],
    ['', 'formato'],
  ])('rechaza "%s" (%s)', (linea, motivo) => {
    const r = parseLine(linea)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe(motivo)
  })

  it('rechaza líneas de más de 64 caracteres', () => {
    expect(parseLine('1'.repeat(65)).reason).toBe('longitud')
  })

  it('bpmMostrable aplica 30–220', () => {
    expect(bpmMostrable(29.9)).toBeNull()
    expect(bpmMostrable(30)).toBe(30)
    expect(bpmMostrable(220)).toBe(220)
    expect(bpmMostrable(221)).toBeNull()
  })
})

describe('EcgStreamParser (flujo)', () => {
  it('descarta la primera línea, ignora la cabecera y conserva fragmentos parciales (CRLF)', () => {
    const { p, all } = crearParser()
    p.push('3,51,0,72.0\r\nt_ms,ecg_raw,leads_off,bpm\r\n100,300,0,0.0\r\n10')
    p.push('4,310,0,0.0\r\n108,320,1,0.0\n')
    const d = all()
    expect(d.t).toEqual([0, 4, 8])
    expect(d.v).toEqual([300, 310, 320])
    expect(d.lo).toEqual([0, 0, 1])
    expect(p.stats.skipped).toBe(1)
    expect(p.stats.headers).toBe(1)
    expect(p.stats.valid).toBe(3)
  })

  it('cuenta y descarta líneas maliciosas o fuera de rango sin emitir NaN', () => {
    const { p, all } = crearParser()
    p.push('basura\n0,300,0,70.0\n4,1024,0,70.0\n8,abc,0,70\n12,301,3,70\n16,302,0,999\n20,303,0,70.0\n')
    const d = all()
    expect(d.v).toEqual([300, 303])
    expect(d.v.every(Number.isFinite)).toBe(true)
    expect(p.stats.invalid).toBe(4)
  })

  it('vacía el buffer pendiente si supera 1024 caracteres sin salto de línea', () => {
    const { p, all } = crearParser({ skipFirstLine: false })
    p.push('x'.repeat(MAX_PENDING + 10))
    expect(p.pending).toBe('')
    expect(p.stats.overflow).toBe(1)
    p.push('\n0,300,0,70.0\n')
    expect(all().v).toEqual([300])
  })

  it('trata un t_ms decreciente como reinicio de la placa sin romper la monotonía', () => {
    const { p, events, all } = crearParser({ skipFirstLine: false })
    p.push('1000,300,0,0\n1004,301,0,0\n1008,302,0,0\n0,303,0,0\n4,304,0,0\n')
    const d = all()
    for (let i = 1; i < d.t.length; i++) expect(d.t[i]).toBeGreaterThan(d.t[i - 1])
    expect(d.t).toEqual([0, 4, 8, 12, 16])
    expect(events.some((e) => e.type === 'device-reset')).toBe(true)
    expect(p.stats.resets).toBe(1)
  })

  it('reset() reinicia la base de tiempo (reconexión: millis vuelve a 0)', () => {
    const { p, all } = crearParser({ skipFirstLine: false })
    p.push('5000,300,0,0\n')
    p.reset()
    p.skipNext = false
    p.push('20,301,0,0\n24,302,0,0\n')
    expect(all().t).toEqual([0, 0, 4])
  })

  it('emite "invalid-data" si más del 5 % de las líneas en 5 s son inválidas', () => {
    const { p, events } = crearParser({ skipFirstLine: false })
    let txt = ''
    for (let i = 0; i < 1250; i++) txt += i % 10 === 0 ? 'ruido\n' : `${i * 4},300,0,70.0\n`
    p.push(txt)
    const ev = events.find((e) => e.type === 'invalid-data')
    expect(ev).toBeTruthy()
    expect(ev.primeraVez).toBe(true)
  })
})

describe('csvImporter (SEC-37)', () => {
  it('valida extensión y tamaño', () => {
    expect(validateCsvFile({ name: 'a.txt', size: 10 })).toMatch(/csv/)
    expect(validateCsvFile({ name: 'a.csv', size: 6 * 1024 * 1024 })).toMatch(/5 MB/)
    expect(validateCsvFile({ name: 'a.csv', size: 100 })).toBeNull()
  })

  it('importa formato t_ms,valor con comentarios y descarta filas inválidas', () => {
    let txt = '# origen: prueba\nt_ms,valor\n'
    for (let i = 0; i < 100; i++) txt += `${i * 4},${(Math.sin(i / 5) * 0.5).toFixed(4)}\n`
    txt += '=HYPERLINK("x"),1\n<img src=x>,2\n'
    const r = parseSignalCsv(txt)
    expect(r.formato).toBe('tiempo-valor')
    expect(r.filas).toBe(100)
    expect(r.invalidas).toBe(2)
    expect(Math.round(r.fs)).toBe(250)
    expect(r.comentarios[0]).toBe('origen: prueba')
  })

  it('rechaza un CSV sin suficientes filas', () => {
    expect(() => parseSignalCsv('t_ms,valor\n0,1\n')).toThrow()
  })
})

describe('diagnóstico de perfil incorrecto', () => {
  function flujo(maxRaw, valorRaw, lineas = 300) {
    const eventos = []
    const p = new EcgStreamParser({ maxRaw, onEvent: (e) => eventos.push(e) })
    let txt = 'basura\n'
    for (let i = 0; i < lineas; i++) txt += `${i * 4},${valorRaw(i)},0,0.0\n`
    p.push(txt)
    return { p, eventos }
  }
  it('un ESP32 de 12 bits con perfil de 10 bits emite profile-mismatch', () => {
    const { p, eventos } = flujo(1023, (i) => 1500 + (i % 50))
    expect(p.stats.outOfRange).toBeGreaterThan(200)
    const e = eventos.find((x) => x.type === 'profile-mismatch')
    expect(e).toBeTruthy()
    expect(e.primeraVez).toBe(true)
    expect(e.maxRaw).toBe(1023)
  })
  it('con el perfil correcto (12 bits) no hay aviso', () => {
    const { eventos } = flujo(4095, (i) => 1500 + (i % 50))
    expect(eventos.filter((x) => x.type === 'profile-mismatch')).toHaveLength(0)
  })
  it('unas pocas muestras fuera de rango no disparan el aviso', () => {
    const { eventos } = flujo(1023, (i) => (i % 40 === 0 ? 2000 : 500), 500)
    expect(eventos.filter((x) => x.type === 'profile-mismatch')).toHaveLength(0)
  })
})
