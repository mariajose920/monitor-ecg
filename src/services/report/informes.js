import { PdfDoc } from './pdfWriter.js'
import { classificationLine, csvRow } from '@/services/export/csvExporter.js'
import { nombreActividad } from '@/data/activities.js'
import { nombreEvento } from '@/data/eventos.js'
import { SYNC_NOMBRES } from '@/data/defaultSettings.js'
import { shortId } from '@/utils/ids.js'
import { nombreMonitoreo, textoActividades, actividadPrincipal } from '@/services/monitoreos/catalog.js'

/**
 * Informes seudonimizados (PDF y CSV) de un monitoreo y de una comparación.
 * Solo usan "Usuario N" (nunca el alias), el nombre del monitoreo, métricas y parámetros.
 * La nota del monitoreo se incluye únicamente si se pide (puede contener texto libre).
 * No dependen del DOM: el gráfico llega ya como JPEG ({bytes,w,h}).
 */

export const AVISO_NO_MEDICO = 'Este informe es solo educativo. El sistema no es un dispositivo médico, no diagnostica ni reemplaza la opinión de un profesional de salud.'
export const CLASIFICACION = 'CONFIDENCIAL-SENSIBLE - Datos de salud seudonimizados - Uso exclusivamente academico'

/** En CSV un dato ausente va vacío (un "--" inicial se neutraliza como fórmula). */
const sg = (v) => (typeof v === 'string' && /^-+$/.test(v.trim()) ? '' : v)
const f = (v, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? '--' : Number(v).toFixed(d))

/** Fecha/hora UTC legible: 2026-10-05 15:30:12 UTC. */
export function fechaUtc(d) {
  const x = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(x.getTime())) return '--'
  return `${x.toISOString().slice(0, 10)} ${x.toISOString().slice(11, 19)} UTC`
}

function pie(generadoEn) {
  return `${CLASIFICACION}. Generado: ${generadoEn.toISOString()}. No es un dispositivo medico.`
}

function filasParametros(par) {
  if (!par?.bpm) return []
  const filas = [
    ['Rango BPM global', `${par.bpm.global.min}-${par.bpm.global.max} BPM`],
    ['Rangos por actividad', par.bpm.usarPorActividad ? 'activados' : 'desactivados'],
  ]
  if (par.bpm.usarPorActividad) {
    for (const [id, r] of Object.entries(par.bpm.porActividad ?? {})) filas.push([`  ${nombreActividad(id)}`, `${r.min}-${r.max} BPM`])
  }
  filas.push(['Fuente del BPM', par.bpm.fuenteBpm === 'dispositivo' ? 'dispositivo' : 'calculado en la app'])
  if (par.alertas) {
    filas.push(['Alerta: duración mínima', `${par.alertas.duracionMinMs} ms`])
    filas.push(['Alerta: histéresis', `${par.alertas.histeresisBpm} BPM`])
  }
  if (par.adquisicion) filas.push(['Tiempo sin señal para avisar / terminar', `${par.adquisicion.watchdogMs} ms / ${par.adquisicion.finTrasPerdidaMs} ms`])
  return filas
}

function resumenEventos(eventos = []) {
  const cuenta = {}
  for (const e of eventos) cuenta[e.tipo] = (cuenta[e.tipo] ?? 0) + 1
  const txt = Object.entries(cuenta).map(([t, n]) => `${nombreEvento(t)}: ${n}`).join('; ')
  return txt || 'Sin eventos'
}

function filasMonitoreo({ sesion, participante, etiqueta, analisis, incluirNotas }) {
  const r = participante.resumen
  const filas = [
    ['Monitoreo', nombreMonitoreo(sesion)],
    ['Identificador', shortId(sesion.id)],
    ['Usuario (seudónimo)', etiqueta],
    ['Inicio', fechaUtc(sesion.inicio)],
    ['Fin', sesion.fin ? fechaUtc(sesion.fin) : '--'],
    ['Duración', r?.duracionMs ? `${(r.duracionMs / 1000).toFixed(0)} s` : '--'],
    ['Actividad principal', nombreActividad(actividadPrincipal(sesion, [participante]) ?? '') || '--'],
    ['Línea de tiempo de actividad', textoActividades(sesion, [participante])],
    ['Canal / fuente', `${participante.canalNombre} / ${participante.fuente?.tipo ?? '--'} (${participante.fuente?.perfilId ?? '--'}), ${participante.fs} Hz`],
    ['Estado final', participante.estadoFinal ?? 'en curso'],
  ]
  if (incluirNotas && sesion.notas) filas.push(['Nota', sesion.notas])
  const metricas = [
    ['BPM medio (mín.-máx.)', `${f(r?.bpmMedio)} (${f(r?.bpmMin)}-${f(r?.bpmMax)})`],
    ['Tiempo fuera de rango', r?.pctFueraRango == null ? '--' : `${r.pctFueraRango} %`],
    ['Muestras / líneas descartadas', `${r?.muestras ?? '--'} / ${r?.descartadas ?? '--'}`],
    ['Eventos', resumenEventos(participante.eventos)],
  ]
  if (analisis) {
    metricas.push(
      ['Picos detectados (tramo analizado)', `${analisis.picos.length} en ${f(analisis.segmento.duracionS, 0)} s`],
      ['BPM del análisis (mediana, mín.-máx.)', `${f(analisis.bpm.medio)} (${f(analisis.bpm.min)}-${f(analisis.bpm.max)})`],
      ['Intervalo RR medio / SDNN / RMSSD', `${f(analisis.rrStats.medioMs)} / ${f(analisis.rrStats.sdnnMs)} / ${f(analisis.rrStats.rmssdMs)} ms`],
      ['Calidad de la señal', `${analisis.calidad.nivel} (${analisis.calidad.puntaje}/100)`],
      ['Sin contacto / saturación / descartadas', `${f(analisis.calidad.pctSinContacto, 1)} % / ${f(analisis.calidad.pctSaturada, 1)} % / ${f(analisis.calidad.pctDescartadas, 1)} %`],
    )
  }
  return { filas, metricas }
}

/**
 * Informe PDF de un monitoreo.
 * @returns {Uint8Array}
 */
export function informeMonitoreoPdf({ sesion, participante, etiqueta, analisis = null, grafico = null, generadoEn = new Date(), incluirNotas = false }) {
  const doc = new PdfDoc({ titulo: `Informe de monitoreo ${shortId(sesion.id)}`, fecha: generadoEn, pie: pie(generadoEn) })
  const { filas, metricas } = filasMonitoreo({ sesion, participante, etiqueta, analisis, incluirNotas })
  doc.titulo1('Informe de monitoreo')
  doc.parrafo(`Generado: ${fechaUtc(generadoEn)}`, { color: [0.35, 0.4, 0.5] })
  doc.aviso(AVISO_NO_MEDICO)
  doc.aviso(`Clasificación: ${CLASIFICACION}. Los datos están seudonimizados (Usuario N); no incluyen nombre, alias ni datos opcionales.`, { color: [0.78, 0.16, 0.22] })
  doc.titulo2('Datos del monitoreo')
  doc.pares(filas)
  doc.titulo2('Métricas')
  doc.pares(metricas, { anchoClave: 210 })
  if (grafico) {
    doc.titulo2('Señal y picos detectados')
    doc.imagenJpeg(grafico.bytes, grafico.w, grafico.h)
    doc.parrafo('Los puntos rojos marcan los picos detectados (onda R en ECG; máximo del pulso en PPG). Los huecos indican pérdida de contacto del sensor.', { size: 8.5, color: [0.35, 0.4, 0.5] })
  }
  if (analisis?.calidad?.motivos?.length) {
    doc.titulo2('Observaciones de calidad')
    for (const m of analisis.calidad.motivos) doc.parrafo(`- ${m}`, { size: 9.5, sangria: 6 })
  }
  doc.titulo2('Parámetros aplicados durante el monitoreo')
  doc.pares(filasParametros(sesion.parametrosAplicados), { anchoClave: 210 })
  return doc.construir()
}

/** CSV de informe de un monitoreo: métricas + tabla de intervalos RR. */
export function informeMonitoreoCsv({ sesion, participante, etiqueta, analisis = null, generadoEn = new Date(), incluirNotas = false }) {
  const { filas, metricas } = filasMonitoreo({ sesion, participante, etiqueta, analisis, incluirNotas })
  const out = [classificationLine(generadoEn), `# ${AVISO_NO_MEDICO}`, csvRow(['seccion', 'campo', 'valor'])]
  for (const [k, v] of filas) out.push(csvRow(['datos', k.trim(), sg(v)]))
  for (const [k, v] of metricas) out.push(csvRow(['metricas', k.trim(), sg(v)]))
  for (const [k, v] of filasParametros(sesion.parametrosAplicados)) out.push(csvRow(['parametros', k.trim(), sg(v)]))
  if (analisis?.picos?.length) {
    out.push('', '# Picos e intervalos RR del tramo analizado', csvRow(['n', 't_pico_s', 'rr_ms', 'bpm_instantaneo']))
    analisis.picos.forEach((p, i) => {
      const rr = i > 0 ? Math.round((p.tS - analisis.picos[i - 1].tS) * 1000) : null
      out.push(csvRow([i + 1, Number(p.tS.toFixed(3)), rr, rr ? Number((60000 / rr).toFixed(1)) : null]))
    })
  }
  return out.join('\r\n') + '\r\n'
}

function filasComparacion({ fuentes, metricas, parametros }) {
  return {
    fuentes: fuentes.map((s) => [`Señal ${s.rol}`, `${s.nombre}${s.usuario ? ` (${s.usuario})` : ''}`]),
    metricas: [
      ['Correlación de Pearson', f(metricas.correlacion, 3)],
      ['RMSE (z-score)', f(metricas.rmse, 3)],
      ['NRMSE', metricas.nrmse == null ? '--' : `${f(metricas.nrmse * 100, 1)} %`],
      ['BPM señal A / B (Δ)', `${f(metricas.bpmRef)} / ${f(metricas.bpmExp)} (${f(metricas.deltaBpm, 1)})`],
      ['Desfase aplicado a B', `${f(metricas.desfaseMs)} ms`],
      ['Duración solapada', `${f(metricas.duracionS, 1)} s (${metricas.n} muestras)`],
    ],
    parametros: [
      ['Sincronización', SYNC_NOMBRES[parametros.metodo] ?? parametros.metodo],
      ['Normalización', parametros.normalizacion],
      ['Frecuencia común de comparación', `${parametros.fsHz} Hz`],
      ['Desfase máximo de búsqueda', `${parametros.maxLagMs} ms`],
      ['Pipeline', 'Paso alto 0,5 Hz + notch 50 Hz, remuestreo, normalización, alineación'],
    ],
  }
}

/** Informe PDF de una comparación de señales A y B. @returns {Uint8Array} */
export function informeComparacionPdf({ fuentes, metricas, parametros, grafico = null, generadoEn = new Date() }) {
  const doc = new PdfDoc({ titulo: 'Informe de comparacion de senales', fecha: generadoEn, pie: pie(generadoEn) })
  const m = filasComparacion({ fuentes, metricas, parametros })
  doc.titulo1('Informe de comparación de señales')
  doc.parrafo(`Generado: ${fechaUtc(generadoEn)}`, { color: [0.35, 0.4, 0.5] })
  doc.aviso(AVISO_NO_MEDICO)
  doc.aviso(`Clasificación: ${CLASIFICACION}. Solo se identifican usuarios con su seudónimo (Usuario N).`, { color: [0.78, 0.16, 0.22] })
  doc.titulo2('Señales comparadas')
  doc.pares(m.fuentes)
  doc.titulo2('Métricas')
  doc.pares(m.metricas, { anchoClave: 210 })
  if (grafico) {
    doc.titulo2('Señales superpuestas (normalizadas)')
    doc.imagenJpeg(grafico.bytes, grafico.w, grafico.h)
  }
  doc.titulo2('Parámetros de la comparación')
  doc.pares(m.parametros, { anchoClave: 210 })
  return doc.construir()
}

/**
 * CSV de una comparación: cabecera con métricas y parámetros y las muestras alineadas.
 * @param {{x:ArrayLike<number>, a:ArrayLike<number|null>, b:ArrayLike<number|null>}} datos
 */
export function informeComparacionCsv({ fuentes, metricas, parametros, datos, generadoEn = new Date() }) {
  const m = filasComparacion({ fuentes, metricas, parametros })
  const out = [classificationLine(generadoEn), `# ${AVISO_NO_MEDICO}`, csvRow(['seccion', 'campo', 'valor'])]
  for (const [k, v] of m.fuentes) out.push(csvRow(['senales', k, sg(v)]))
  for (const [k, v] of m.metricas) out.push(csvRow(['metricas', k, sg(v)]))
  for (const [k, v] of m.parametros) out.push(csvRow(['parametros', k, sg(v)]))
  out.push('', '# Muestras alineadas y normalizadas', csvRow(['t_s', 'senal_a', 'senal_b']))
  for (let i = 0; i < datos.x.length; i++) {
    const r = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(5)))
    out.push(csvRow([Number(datos.x[i].toFixed(4)), r(datos.a[i]), r(datos.b[i])]))
  }
  return out.join('\r\n') + '\r\n'
}
