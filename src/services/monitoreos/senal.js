import { obtenerSenal } from './senalAcceso.js'
import { getProfile, maxRaw } from '@/data/deviceProfiles.js'
import { analizarMonitoreo, reducirMinMax } from './analysis.js'
import { renderizarGraficoJpeg } from '@/services/report/reportChart.js'

/** Carga la señal de una participación y su análisis (ADC según el perfil de la fuente). */
export async function cargarYAnalizar(sesion, participante, opciones = {}) {
  const sig = await obtenerSenal(sesion.id, participante.canalIndex)
  const perfil = getProfile(participante.fuente?.perfilId)
  const adcMax = maxRaw(perfil)
  const analisis = analizarMonitoreo({
    raw: sig.raw,
    t: sig.t,
    lo: sig.lo,
    fs: participante.fs || perfil.fs,
    adcMax,
    descartadas: participante.resumen?.descartadas ?? 0,
    ...opciones,
  })
  return { sig, analisis, adcMax }
}

/** Datos para uPlot (x en s, y con huecos en leads-off, reducidos) y picos como marcas. */
export function datosGrafico(sig, analisis, maxPuntos = 3000) {
  const { idx } = reducirMinMax(sig.raw, maxPuntos)
  const x = new Float64Array(idx.length)
  const y = new Array(idx.length)
  idx.forEach((i, k) => {
    x[k] = sig.t[i] / 1000
    y[k] = sig.lo[i] ? null : sig.raw[i]
  })
  const marcas = analisis ? analisis.picos.map((p) => ({ x: p.tS, y: p.y })) : []
  return { data: [x, y], marcas }
}

/** JPEG del gráfico para el PDF (solo el tramo analizado, con picos). */
export function graficoParaInforme(sig, analisis) {
  const seg = analisis.segmento
  if (seg.i0 === undefined) return null
  const n = seg.i1 - seg.i0
  const sub = Array.prototype.slice.call(sig.raw, seg.i0, seg.i1)
  const { idx } = reducirMinMax(sub, 3000)
  return renderizarGraficoJpeg({
    series: [{ x: idx.map((i) => sig.t[seg.i0 + i] / 1000), y: idx.map((i) => sub[i]), color: '#0b7a4c', etiqueta: 'Señal cruda (cuentas ADC)' }],
    marcas: analisis.picos.map((p) => ({ x: p.tS, y: p.y })),
    etiquetaY: n ? 'ADC' : '',
  })
}
