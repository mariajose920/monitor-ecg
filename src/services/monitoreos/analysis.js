import { detectRPeaks } from '@/utils/dsp/rPeakDetector.js'
import { bpmFromRR } from '@/utils/dsp/bpm.js'
import { longestValidSegment } from '@/services/compare/compareSignals.js'
import { nombreActividad } from '@/data/activities.js'

/**
 * Análisis didáctico de un monitoreo guardado (pantalla Aprende → Mis monitoreos e informes).
 * Todo es cálculo puro sobre arrays; no diagnostica nada.
 */

export const MAX_ANALISIS_S = 30
export const RR_MIN_MS = 273 // ≈ 220 lpm
export const RR_MAX_MS = 2000 // ≈ 30 lpm

const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null)

function percentil(sorted, p) {
  if (!sorted.length) return 0
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))]
}

/**
 * @param {object} o
 * @param {ArrayLike<number>} o.raw señal cruda
 * @param {ArrayLike<number>} [o.t] tiempos en ms (si falta se usa fs)
 * @param {ArrayLike<number>} [o.lo] 1 = electrodos/dedo sin contacto
 * @param {number} [o.fs=250]
 * @param {number} [o.adcMax=4095] máximo del ADC del perfil (12 bits ESP32)
 * @param {number} [o.maxSeconds=30]
 * @param {number} [o.descartadas=0] líneas descartadas por el parser
 * @param {number} [o.muestras] total de líneas recibidas (para % descartadas)
 */
export function analizarMonitoreo({ raw, t = null, lo = null, fs = 250, adcMax = 4095, maxSeconds = MAX_ANALISIS_S, descartadas = 0 }) {
  const n = raw.length
  const vacio = {
    n, fs, segmento: { inicioS: 0, duracionS: 0 }, picos: [], rr: [], rrDescartados: 0,
    bpm: { medio: null, min: null, max: null }, rrStats: { medioMs: null, sdnnMs: null, rmssdMs: null, cv: null },
    calidad: { nivel: 'baja', puntaje: 0, pctSinContacto: 0, pctSaturada: 0, amplitudRel: 0, pctDescartadas: 0, motivos: ['No hay suficientes datos válidos.'] },
  }
  if (n < fs * 3) return { ...vacio, calidad: { ...vacio.calidad, motivos: ['El monitoreo dura menos de 3 s: no hay latidos suficientes para analizar.'] } }

  const maxN = Math.round(maxSeconds * fs)
  const seg = longestValidSegment(raw, lo, maxN)
  const largo = seg.end - seg.start
  const sinContacto = lo ? Array.prototype.reduce.call(lo, (s, x) => s + (x ? 1 : 0), 0) : 0
  const tiempoDe = (i) => (t ? t[i] / 1000 : i / fs)

  // Calidad global (todo el registro)
  let sat = 0
  for (let i = 0; i < n; i++) if (raw[i] <= 0 || raw[i] >= adcMax - 1) sat++
  const pctSinContacto = (100 * sinContacto) / n
  const pctSaturada = (100 * sat) / n
  const pctDescartadas = n + descartadas > 0 ? (100 * descartadas) / (n + descartadas) : 0

  if (largo < fs * 3) {
    return {
      ...vacio,
      calidad: {
        ...vacio.calidad, pctSinContacto, pctSaturada, pctDescartadas,
        motivos: ['No hay un tramo continuo de al menos 3 s con contacto del sensor: revisa cómo apoyas el dedo o los electrodos.'],
      },
    }
  }

  const tramo = Float32Array.from(Array.prototype.slice.call(raw, seg.start, seg.end))
  const idx = detectRPeaks(tramo, fs)
  const picos = idx.map((i) => ({ i: seg.start + i, tS: tiempoDe(seg.start + i), y: raw[seg.start + i] }))

  const rr = []
  let rrDescartados = 0
  for (let k = 1; k < picos.length; k++) {
    const d = (picos[k].tS - picos[k - 1].tS) * 1000
    if (d >= RR_MIN_MS && d <= RR_MAX_MS) rr.push(Math.round(d))
    else rrDescartados++
  }
  const rrMedio = media(rr)
  let sdnn = null
  let rmssd = null
  if (rr.length >= 2) {
    sdnn = Math.sqrt(rr.reduce((s, x) => s + (x - rrMedio) ** 2, 0) / (rr.length - 1))
    let acc = 0
    for (let k = 1; k < rr.length; k++) acc += (rr[k] - rr[k - 1]) ** 2
    rmssd = Math.sqrt(acc / (rr.length - 1))
  }
  const bpmInst = rr.map((d) => 60000 / d)
  const bpm = {
    medio: bpmFromRR(rr),
    min: bpmInst.length ? Math.min(...bpmInst) : null,
    max: bpmInst.length ? Math.max(...bpmInst) : null,
  }
  const cv = rrMedio && sdnn !== null ? sdnn / rrMedio : null

  const ord = Array.from(tramo).sort((a, b) => a - b)
  const amplitudRel = (percentil(ord, 0.99) - percentil(ord, 0.01)) / adcMax

  // Calidad: puntaje 100 con penalizaciones explicables
  const motivos = []
  let puntaje = 100
  if (picos.length < 3) {
    puntaje -= 50
    motivos.push('Se detectaron muy pocos latidos: la señal es débil, está muy ruidosa o el tramo es corto.')
  }
  if (pctSinContacto > 10) {
    puntaje -= 25
    motivos.push(`El sensor perdió contacto durante el ${pctSinContacto.toFixed(0)} % del registro (dedo mal apoyado o electrodos sueltos).`)
  } else if (pctSinContacto > 2) {
    puntaje -= 8
    motivos.push(`Hubo pérdidas breves de contacto (${pctSinContacto.toFixed(1)} %).`)
  }
  if (pctSaturada > 2) {
    puntaje -= 25
    motivos.push(`La señal toca los límites del conversor en el ${pctSaturada.toFixed(1)} % de las muestras (saturación: demasiada luz o presión).`)
  }
  if (amplitudRel < 0.005) {
    puntaje -= 20
    motivos.push('La amplitud de la señal es muy pequeña: poca perfusión, dedo frío o presión insuficiente.')
  }
  if (cv !== null && cv > 0.25) {
    puntaje -= 20
    motivos.push('Los intervalos entre latidos son muy irregulares: suele deberse a movimiento o ruido, y solo un profesional puede interpretar un ritmo irregular real.')
  }
  if (rrDescartados > Math.max(1, rr.length * 0.2)) {
    puntaje -= 10
    motivos.push(`Se descartaron ${rrDescartados} intervalos no fisiológicos (picos de más o latidos no detectados).`)
  }
  if (pctDescartadas > 5) {
    puntaje -= 15
    motivos.push(`El ${pctDescartadas.toFixed(0)} % de las líneas recibidas se descartó por formato o rango: revisa el perfil del dispositivo (ESP32, 12 bits) y la conexión.`)
  }
  puntaje = Math.max(0, puntaje)
  if (!motivos.length) motivos.push('No se detectaron problemas de calidad.')
  const nivel = puntaje >= 75 ? 'buena' : puntaje >= 45 ? 'regular' : 'baja'

  return {
    n,
    fs,
    segmento: { inicioS: tiempoDe(seg.start), duracionS: largo / fs, i0: seg.start, i1: seg.end },
    picos,
    rr,
    rrDescartados,
    bpm,
    rrStats: { medioMs: rrMedio, sdnnMs: sdnn, rmssdMs: rmssd, cv },
    calidad: { nivel, puntaje, pctSinContacto, pctSaturada, amplitudRel, pctDescartadas, motivos },
  }
}

/** Reduce una serie a ≤ maxPuntos conservando mínimos y máximos por cubeta (para graficar). */
export function reducirMinMax(valores, maxPuntos = 2000) {
  const n = valores.length
  if (n <= maxPuntos) return { idx: Array.from({ length: n }, (_, i) => i), val: Array.from(valores) }
  const cubetas = Math.floor(maxPuntos / 2)
  const tam = n / cubetas
  const idx = []
  const val = []
  for (let b = 0; b < cubetas; b++) {
    const a = Math.floor(b * tam)
    const z = Math.min(n, Math.floor((b + 1) * tam))
    let imin = -1
    let imax = -1
    let hueco = -1
    for (let i = a; i < z; i++) {
      const v = valores[i]
      if (v === null || v === undefined || !Number.isFinite(v)) {
        if (hueco < 0) hueco = i
        continue
      }
      if (imin < 0 || v < valores[imin]) imin = i
      if (imax < 0 || v > valores[imax]) imax = i
    }
    // Se conserva el primer hueco (dato nulo) para que el gráfico no una los tramos separados.
    const elegidos = new Set([imin, imax, hueco].filter((i) => i >= 0))
    for (const i of [...elegidos].sort((p, q) => p - q)) {
      idx.push(i)
      val.push(valores[i])
    }
  }
  return { idx, val }
}

const f0 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '--' : Math.round(v))

/**
 * Explicaciones en lenguaje didáctico a partir del análisis.
 * @param {object} an resultado de analizarMonitoreo
 * @param {{actividad?:string|null, rango?:{min:number,max:number}|null}} ctx
 * @returns {{id:string,titulo:string,texto:string}[]}
 */
export function explicarMonitoreo(an, { actividad = null, rango = null } = {}) {
  const out = []
  const act = actividad ? nombreActividad(actividad).toLowerCase() : null
  out.push({
    id: 'picos',
    titulo: 'Los picos marcados',
    texto: an.picos.length
      ? `Se marcaron ${an.picos.length} picos en un tramo de ${an.segmento.duracionS.toFixed(0)} s. Cada pico es un latido: en un ECG corresponde a la onda R (la despolarización de los ventrículos) y en un sensor PPG (luz sobre el dedo) al máximo de la onda de pulso, cuando llega más sangre al dedo. El programa los busca donde la señal sube más rápido.`
      : 'No se pudieron marcar picos fiables. Sin latidos claros no es posible calcular el ritmo.',
  })
  out.push({
    id: 'rr',
    titulo: 'Intervalos RR',
    texto: an.rr.length
      ? `El intervalo RR es el tiempo entre dos picos consecutivos. Aquí el promedio es ${f0(an.rrStats.medioMs)} ms. Si el corazón late más rápido, los intervalos se acortan; si late más lento, se alargan.`
      : 'No hay intervalos válidos que mostrar.',
  })
  out.push({
    id: 'bpm',
    titulo: 'Latidos por minuto (BPM)',
    texto: an.bpm.medio === null
      ? 'No se pudo calcular un BPM confiable.'
      : `BPM = 60 000 / RR. El valor típico (mediana) fue ${f0(an.bpm.medio)} BPM, con un mínimo de ${f0(an.bpm.min)} y un máximo de ${f0(an.bpm.max)}. Se usa la mediana porque un pico falso aislado no la desvía.`,
  })
  if (an.bpm.medio !== null && rango && act) {
    const dentro = an.bpm.medio >= rango.min && an.bpm.medio <= rango.max
    out.push({
      id: 'actividad',
      titulo: 'Cómo afecta la actividad',
      texto: `Durante ${act} el rango orientativo configurado es ${rango.min}–${rango.max} BPM y este monitoreo quedó ${dentro ? 'dentro' : 'fuera'} de él. El ejercicio y el movimiento aceleran el corazón porque los músculos necesitan más oxígeno; en reposo y al recuperarse baja. Otros factores como el café, el estrés, el sueño o la temperatura también influyen. Es un rango educativo, no un criterio médico.`,
    })
  } else if (act) {
    out.push({
      id: 'actividad',
      titulo: 'Cómo afecta la actividad',
      texto: `La actividad registrada fue ${act}. El ejercicio y el movimiento aceleran el corazón; en reposo y durante la recuperación baja. Compara monitoreos de distintas actividades para verlo.`,
    })
  }
  if (an.rrStats.sdnnMs !== null) {
    out.push({
      id: 'variabilidad',
      titulo: 'Variabilidad entre latidos',
      texto: `Los latidos nunca son perfectamente regulares. La desviación de los intervalos (SDNN) fue ${f0(an.rrStats.sdnnMs)} ms y la variación entre latidos vecinos (RMSSD) ${f0(an.rrStats.rmssdMs)} ms. En un tramo corto y con ruido estos números cambian mucho; sirven para aprender, no para evaluar la salud.`,
    })
  }
  const c = an.calidad
  out.push({
    id: 'calidad',
    titulo: `Calidad de la señal PPG: ${c.nivel}`,
    texto: `${c.motivos.join(' ')} Para mejorar la señal: apoya el dedo sin apretar demasiado, mantenlo quieto, evita luz directa y manos frías, y confirma que el perfil del dispositivo sea ESP32 (12 bits).`,
  })
  return out
}

/**
 * Serie de BPM en el tiempo (un valor por latido, promediado en cubetas hasta maxPuntos).
 * @returns {{tS:number,bpm:number}[]}
 */
export function serieBpm(an, maxPuntos = 120) {
  const pts = []
  for (let k = 1; k < an.picos.length; k++) {
    const d = (an.picos[k].tS - an.picos[k - 1].tS) * 1000
    if (d >= RR_MIN_MS && d <= RR_MAX_MS) pts.push({ tS: an.picos[k].tS, bpm: 60000 / d })
  }
  if (pts.length <= maxPuntos) return pts.map((p) => ({ tS: Number(p.tS.toFixed(3)), bpm: Number(p.bpm.toFixed(1)) }))
  const tam = pts.length / maxPuntos
  const out = []
  for (let b = 0; b < maxPuntos; b++) {
    const seg = pts.slice(Math.floor(b * tam), Math.floor((b + 1) * tam))
    if (!seg.length) continue
    out.push({ tS: Number((seg.reduce((s, p) => s + p.tS, 0) / seg.length).toFixed(3)), bpm: Number((seg.reduce((s, p) => s + p.bpm, 0) / seg.length).toFixed(1)) })
  }
  return out
}
