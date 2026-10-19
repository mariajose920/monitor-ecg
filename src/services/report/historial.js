import { PdfDoc } from './pdfWriter.js'
import { classificationLine, csvRow } from '@/services/export/csvExporter.js'
import { AVISO_NO_MEDICO, CLASIFICACION, fechaUtc } from './informes.js'
import { nombreActividad } from '@/data/activities.js'
import { nombreMonitoreo, actividadPrincipal } from '@/services/monitoreos/catalog.js'
import { serieBpm } from '@/services/monitoreos/analysis.js'
import { shortId } from '@/utils/ids.js'

/**
 * Historial de frecuencias cardíacas (CSV y PDF), seudonimizado: solo "Usuario N".
 * Una fila por monitoreo + serie de BPM en el tiempo. Se puede volver a importar en Comparar
 * (la serie queda en formato user_id,session_id,t_s,bpm).
 */

/** Crea la fila de historial de una participación ya analizada. */
export function filaHistorial({ sesion, participante, etiqueta, analisis }) {
  const r = participante.resumen ?? {}
  const act = actividadPrincipal(sesion, [participante])
  return {
    inicio: sesion.inicio,
    nombre: nombreMonitoreo(sesion),
    usuario: etiqueta,
    sesionId: shortId(sesion.id),
    duracionS: r.duracionMs ? Math.round(r.duracionMs / 1000) : null,
    actividad: act ? nombreActividad(act) : null,
    bpmMedio: r.bpmMedio ?? null,
    bpmMin: r.bpmMin ?? null,
    bpmMax: r.bpmMax ?? null,
    pctFuera: r.pctFueraRango ?? null,
    serie: analisis ? serieBpm(analisis) : [],
  }
}

export function ordenarCronologico(filas) {
  return [...filas].sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : a.sesionId < b.sesionId ? -1 : 1))
}

const v = (x) => (x === null || x === undefined ? null : x)

/** CSV: línea de clasificación, tabla resumen y serie de BPM (neutralización de fórmulas incluida). */
export function historialCsv({ filas, generadoEn = new Date() }) {
  const ord = ordenarCronologico(filas)
  const out = [
    classificationLine(generadoEn),
    `# ${AVISO_NO_MEDICO}`,
    '# HISTORIAL DE FRECUENCIAS CARDIACAS',
    csvRow(['fecha_utc', 'monitoreo', 'user_id', 'session_id', 'duracion_s', 'actividad', 'bpm_medio', 'bpm_min', 'bpm_max', 'pct_fuera_rango']),
  ]
  for (const f of ord) {
    out.push(csvRow([fechaUtc(f.inicio), f.nombre, f.usuario, f.sesionId, v(f.duracionS), f.actividad ?? '', v(f.bpmMedio), v(f.bpmMin), v(f.bpmMax), v(f.pctFuera)]))
  }
  out.push('', '# SERIE DE BPM POR MONITOREO (un valor por tramo de latidos)', 'user_id,session_id,t_s,bpm')
  for (const f of ord) for (const p of f.serie) out.push(csvRow([f.usuario, f.sesionId, p.tS, p.bpm]))
  return out.join('\r\n') + '\r\n'
}

/**
 * PDF con tabla y gráfico de tendencia (BPM medio, mínimo y máximo por monitoreo).
 * @param {{bytes:Uint8Array,w:number,h:number}|null} grafico
 */
export function historialPdf({ filas, grafico = null, generadoEn = new Date(), alcance = 'Usuario' }) {
  const ord = ordenarCronologico(filas)
  const doc = new PdfDoc({
    titulo: 'Historial de frecuencias cardiacas',
    fecha: generadoEn,
    pie: `${CLASIFICACION}. Generado: ${generadoEn.toISOString()}. No es un dispositivo medico.`,
  })
  doc.titulo1('Historial de frecuencias cardíacas')
  doc.parrafo(`Generado: ${fechaUtc(generadoEn)} · Alcance: ${alcance} · ${ord.length} monitoreo(s)`, { color: [0.35, 0.4, 0.5] })
  doc.aviso(AVISO_NO_MEDICO)
  doc.aviso(`Clasificación: ${CLASIFICACION}. Solo se identifican usuarios con su seudónimo (Usuario N).`, { color: [0.78, 0.16, 0.22] })
  if (grafico) {
    doc.titulo2('Tendencia del BPM por monitoreo')
    doc.imagenJpeg(grafico.bytes, grafico.w, grafico.h)
  }
  doc.titulo2('Monitoreos')
  if (!ord.length) doc.parrafo('No hay monitoreos guardados en el alcance elegido.')
  else {
    doc.tabla(
      ['Fecha (UTC)', 'Usuario', 'Monitoreo', 'Dur. (s)', 'Actividad', 'BPM med.', 'Mín.', 'Máx.', '% fuera'],
      ord.map((f) => [
        fechaUtc(f.inicio).slice(0, 16), f.usuario, f.nombre, f.duracionS ?? '--', f.actividad ?? '--',
        f.bpmMedio ?? '--', f.bpmMin ?? '--', f.bpmMax ?? '--', f.pctFuera ?? '--',
      ]),
      [78, 52, 100, 36, 62, 40, 30, 30, 36],
    )
    const medias = ord.map((f) => f.bpmMedio).filter((x) => Number.isFinite(x))
    if (medias.length) {
      const prom = medias.reduce((s, x) => s + x, 0) / medias.length
      doc.parrafo(`BPM medio de los monitoreos: ${prom.toFixed(0)} (mínimo ${Math.min(...medias)}, máximo ${Math.max(...medias)}). La serie completa de BPM está en el historial CSV.`, { size: 9 })
    }
  }
  return doc.construir()
}

/** Datos del gráfico de tendencia: x = nº de monitoreo en orden cronológico. */
export function tendencia(filas) {
  const ord = ordenarCronologico(filas).filter((f) => Number.isFinite(f.bpmMedio))
  const x = ord.map((_, i) => i + 1)
  return {
    x,
    medio: ord.map((f) => f.bpmMedio),
    min: ord.map((f) => (Number.isFinite(f.bpmMin) ? f.bpmMin : f.bpmMedio)),
    max: ord.map((f) => (Number.isFinite(f.bpmMax) ? f.bpmMax : f.bpmMedio)),
  }
}
