import { CSV_HEADER, parseLine } from '@/services/parsing/ecgCsvParser.js'
import { estimateFs } from '@/utils/dsp/resample.js'

/**
 * Importación de CSV de señal (referencia RF11 o reproducción) con validación (SEC-37):
 *  - solo `.csv`, tamaño ≤ 5 MB;
 *  - cada fila validada numéricamente (nunca se interpreta como HTML ni como código);
 *  - formatos aceptados:
 *      a) `t_ms,ecg_raw,leads_off,bpm` (firmware; mismo criterio estricto que el parser serie)
 *      b) `t_ms,valor` (registro externo, p. ej. un tramo de PhysioNet convertido)
 *  - líneas que empiezan por '#' son comentarios (metadatos de origen).
 */
export const MAX_CSV_BYTES = 5 * 1024 * 1024
export const MAX_ROWS = 300000
// Anclada y con cuantificadores acotados: sin riesgo de ReDoS (falso positivo de safe-regex).
// eslint-disable-next-line security/detect-unsafe-regex
const RE_DOS = /^(\d{1,10}(?:\.\d{1,3})?),(-?\d{1,7}(?:\.\d{1,6})?)$/

export function validateCsvFile(file) {
  if (!file) return 'No se seleccionó ningún archivo'
  if (!/\.csv$/i.test(file.name)) return 'Solo se aceptan archivos .csv'
  if (file.size > MAX_CSV_BYTES) return 'El archivo supera el límite de 5 MB'
  if (file.size === 0) return 'El archivo está vacío'
  return null
}

/**
 * @param {string} text
 * @param {{maxRaw?:number}} [o]
 * @returns {{formato:string, t:Float64Array, v:Float32Array, leadsOff:Uint8Array, bpm:Float32Array, fs:number|null, filas:number, invalidas:number, comentarios:string[]}}
 */
export function parseSignalCsv(text, { maxRaw = 4095 } = {}) {
  if (typeof text !== 'string') throw new Error('Contenido inválido')
  if (text.length > MAX_CSV_BYTES) throw new Error('El archivo supera el límite de 5 MB')
  const lines = text.split(/\r?\n/)
  const t = []
  const v = []
  const lo = []
  const bpm = []
  const comentarios = []
  let formato = null
  let invalidas = 0
  let lastT = -Infinity
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#')) {
      if (comentarios.length < 10) comentarios.push(line.slice(1, 161).trim())
      continue
    }
    if (line === CSV_HEADER) {
      formato = formato ?? 'firmware'
      continue
    }
    if (/^t_ms\s*,\s*valor$/i.test(line)) {
      formato = formato ?? 'tiempo-valor'
      continue
    }
    if (t.length >= MAX_ROWS) break
    const r4 = parseLine(line, { maxRaw })
    if (r4.ok && formato !== 'tiempo-valor') {
      formato = 'firmware'
      if (r4.tMs < lastT) {
        invalidas++
        continue
      }
      lastT = r4.tMs
      t.push(r4.tMs)
      v.push(r4.raw)
      lo.push(r4.leadsOff)
      bpm.push(r4.bpm)
      continue
    }
    const m = RE_DOS.exec(line)
    if (m && formato !== 'firmware') {
      formato = 'tiempo-valor'
      const tt = Number(m[1])
      const vv = Number(m[2])
      if (!Number.isFinite(tt) || !Number.isFinite(vv) || tt < lastT) {
        invalidas++
        continue
      }
      lastT = tt
      t.push(tt)
      v.push(vv)
      lo.push(0)
      bpm.push(0)
      continue
    }
    invalidas++
  }
  if (t.length < 50) throw new Error('El CSV no contiene suficientes filas válidas (mínimo 50)')
  const tA = Float64Array.from(t)
  return {
    formato: formato ?? 'desconocido',
    t: tA,
    v: Float32Array.from(v),
    leadsOff: Uint8Array.from(lo),
    bpm: Float32Array.from(bpm),
    fs: estimateFs(tA),
    filas: t.length,
    invalidas,
    comentarios,
  }
}

/** Lee y valida un File del navegador. */
export async function readSignalFile(file, opts) {
  const err = validateCsvFile(file)
  if (err) throw new Error(err)
  const text = await file.text()
  return parseSignalCsv(text, opts)
}
