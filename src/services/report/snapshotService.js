import { getRuntime } from '@/services/acquisition/channelRegistry.js'
import { DEVICE_PROFILES, maxRaw } from '@/data/deviceProfiles.js'
import { nombreActividad } from '@/data/activities.js'
import { detectRPeaks, bpmFromPeaks } from '@/utils/dsp/rPeakDetector.js'

/**
 * Calcula la frecuencia cardíaca (BPM) a partir de un arreglo de muestras { tRel, v, lo }.
 * Devuelve un número entero o null si no hay suficientes picos R o latidos válidos.
 */
export function calcularBpmDeMuestras(samples, fs = 250) {
  if (!samples || samples.length < fs) return null
  const valores = []
  for (let i = 0; i < samples.length; i++) {
    if (!samples[i].lo && Number.isFinite(samples[i].v)) {
      valores.push(samples[i].v)
    }
  }
  if (valores.length < fs) return null
  try {
    const picos = detectRPeaks(valores, fs)
    if (picos && picos.length >= 2) {
      const bpm = bpmFromPeaks(picos, fs)
      if (bpm != null && Number.isFinite(bpm)) return Math.round(bpm)
    }
  } catch {
    // Si la señal es ruidosa o no contiene picos claros
  }
  return null
}

/**
 * Servicio de capturas de señal en vivo (ECG / PPG).
 * Genera una instantánea en PNG de alta resolución (1200x560) con:
 * - Estética Cardio Monitor en modo claro (papel milimetrado clínico)
 * - Traza exacta de la onda capturada o del tramo recortado
 * - Metadatos: Participante, BPM en el instante de captura / tramo recortado, Actividad, Fecha y hora
 * - Pie institucional y advertencia educativa
 */

export async function generarCaptura({
  canal,
  usuarioEtiqueta = 'Participante',
  ventanaSeg = 8,
  datosVisibles = null,
  muestrasDirectas = null,
  recorte = null,
  bpmPersonalizado = null,
  fechaStrPersonalizada = null,
}) {
  if (typeof document === 'undefined') {
    throw new Error('generarCaptura requiere un entorno con DOM (navegador).')
  }

  const rt = canal?.id != null ? getRuntime(canal.id) : null
  const profile = rt?.profile || DEVICE_PROFILES[canal?.perfilId] || { nombre: canal?.perfilId || 'Sensor', fs: 250, yRange: [0, 4095] }
  const bitsMax = maxRaw(profile)
  const fs = profile.fs || 250

  let samples = []

  // 1. Muestras pasadas directamente (p. ej. para recortar una captura previa)
  if (muestrasDirectas && Array.isArray(muestrasDirectas) && muestrasDirectas.length > 0) {
    samples = muestrasDirectas.map((s) => ({ ...s }))
  } else if (datosVisibles?.samples?.length) {
    // 2. Gráfico en pantalla proporcionó sus muestras visibles exactas
    samples = datosVisibles.samples.map((s) => ({ ...s }))
  } else {
    // 3. Fallback al buffer circular en memoria
    let n = 0
    let tArr = null
    let vArr = null
    let loArr = null

    if (rt?.ring) {
      const cap = rt.ring.capacity
      tArr = new Float64Array(cap)
      vArr = new Float32Array(cap)
      loArr = new Uint8Array(cap)
      n = rt.ring.toLinear(tArr, vArr, loArr)
    }

    if (n > 0 && tArr) {
      const tFin = tArr[n - 1]
      const tInicio = Math.max(0, tFin - ventanaSeg * 1000)
      for (let i = 0; i < n; i++) {
        if (tArr[i] >= tInicio && tArr[i] <= tFin) {
          samples.push({
            tRel: (tArr[i] - tInicio) / 1000,
            v: vArr[i],
            lo: loArr[i] === 1,
          })
        }
      }
    }
  }

  const samplesOriginales = samples.map((s) => ({ ...s }))
  let duracionSeg = ventanaSeg
  let samplesFinales = samples
  let recorteAplicado = null

  // Aplicación de límites y recorte si se especificó
  if (recorte && Number.isFinite(recorte.inicioSeg) && Number.isFinite(recorte.finSeg)) {
    const durTotal = recorte.ventanaOriginalSeg || ventanaSeg
    const ini = Math.max(0, Math.min(recorte.inicioSeg, durTotal - 0.2))
    const fin = Math.max(ini + 0.2, Math.min(recorte.finSeg, durTotal))
    duracionSeg = Math.max(0.2, fin - ini)
    recorteAplicado = {
      inicioSeg: Number(ini.toFixed(2)),
      finSeg: Number(fin.toFixed(2)),
      duracionSeg: Number(duracionSeg.toFixed(2)),
      ventanaOriginalSeg: durTotal,
    }

    samplesFinales = samplesOriginales
      .filter((s) => s.tRel >= ini && s.tRel <= fin)
      .map((s) => ({
        ...s,
        tRel: s.tRel - ini,
      }))
  }

  const ancho = 1200
  const alto = 560
  const canvas = document.createElement('canvas')
  canvas.width = ancho
  canvas.height = alto
  const ctx = canvas.getContext('2d')

  // Fondo general: Blanco clínico puro
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, ancho, alto)

  // Borde exterior de la tarjeta
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, ancho - 2, alto - 2)

  // Barra de cabecera en porcelana suave (#f8fafc)
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(2, 2, ancho - 4, 76)
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(2, 78)
  ctx.lineTo(ancho - 2, 78)
  ctx.stroke()

  // Título institucional Cardio Monitor en pizarra oscura de alto contraste
  ctx.font = 'bold 20px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif'
  ctx.fillStyle = '#0f172a'
  const tituloHeader = recorteAplicado
    ? 'CARDIO MONITOR — CAPTURA DE FRECUENCIA CARDÍACA (RECORTADA)'
    : 'CARDIO MONITOR — REGISTRO DE FRECUENCIA CARDÍACA'
  ctx.fillText(tituloHeader, 28, 35)

  const fecha = new Date()
  const fechaStr = fechaStrPersonalizada || fecha.toLocaleString('es-CL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  // Metadatos de la sesión
  ctx.font = '500 13px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif'
  ctx.fillStyle = '#64748b'
  const tramoTexto = recorteAplicado ? `   ·   Tramo: ${recorteAplicado.inicioSeg}s a ${recorteAplicado.finSeg}s (${recorteAplicado.duracionSeg}s)` : ''
  ctx.fillText(`Canal: ${canal?.nombre || 'Canal 1'}   ·   Dispositivo: ${profile.nombre}${tramoTexto}   ·   Fecha: ${fechaStr}`, 28, 59)

  // Cálculo de BPM: se recalcula en el tramo si está recortado o se usa el personalizado / canal
  const bpmOriginal = canal?.bpmCalculado ?? canal?.bpmDispositivo ?? null
  let bpmFinal = bpmOriginal

  if (bpmPersonalizado !== null && Number.isFinite(bpmPersonalizado)) {
    bpmFinal = Math.round(bpmPersonalizado)
  } else if (recorteAplicado) {
    const bpmRecalculado = calcularBpmDeMuestras(samplesFinales, fs)
    if (bpmRecalculado != null) {
      bpmFinal = bpmRecalculado
    }
  }

  // BPM destacado en Carmesí Cardíaco (#e11d48)
  const bpmTexto = bpmFinal != null ? `${bpmFinal} BPM` : '-- BPM'
  ctx.font = 'bold 28px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif'
  ctx.fillStyle = '#e11d48'
  const bpmWidth = ctx.measureText(bpmTexto).width
  ctx.fillText(bpmTexto, ancho - bpmWidth - 28, 38)

  if (recorteAplicado) {
    ctx.font = '600 10px system-ui, sans-serif'
    ctx.fillStyle = '#be123c'
    const recBadge = 'TRAMO RECORTADO'
    const recBadgeW = ctx.measureText(recBadge).width
    ctx.fillText(recBadge, ancho - recBadgeW - 28, 52)
  }

  // Participante y actividad
  ctx.font = '500 13px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif'
  ctx.fillStyle = '#64748b'
  const infoDer = `Participante: ${usuarioEtiqueta || 'Sin asignar'}   ·   ${nombreActividad(canal?.actividad || 'reposo')}`
  const infoDerWidth = ctx.measureText(infoDer).width
  ctx.fillText(infoDer, ancho - infoDerWidth - 28, recorteAplicado ? 68 : 59)

  // Dimensiones del área de gráfica
  const x0 = 70
  const y0 = 92
  const wGraf = ancho - x0 - 30
  const hGraf = alto - y0 - 68

  // Fondo del trazado: Blanco nítido
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x0, y0, wGraf, hGraf)

  // Cuadrícula fina (subdivisiones milimétricas: 5 por segundo en rosa suave de papel ECG)
  ctx.strokeStyle = 'rgba(225, 29, 72, 0.08)'
  ctx.lineWidth = 0.8
  const totalSubDiv = Math.max(5, Math.round(duracionSeg * 5))
  for (let s = 0; s <= totalSubDiv; s++) {
    const x = x0 + (s / totalSubDiv) * wGraf
    ctx.beginPath()
    ctx.moveTo(x, y0)
    ctx.lineTo(x, y0 + hGraf)
    ctx.stroke()
  }

  // Cuadrícula principal vertical (cada 0.5s en tramos cortos o cada 1s en ventanas normales)
  ctx.strokeStyle = 'rgba(225, 29, 72, 0.22)'
  ctx.lineWidth = 1.2
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = '#64748b'
  const pasoSeg = duracionSeg <= 3.5 ? 0.5 : 1
  const numMarcas = Math.floor(duracionSeg / pasoSeg)
  for (let s = 0; s <= numMarcas; s++) {
    const tVal = s * pasoSeg
    const x = x0 + (tVal / duracionSeg) * wGraf
    ctx.beginPath()
    ctx.moveTo(x, y0)
    ctx.lineTo(x, y0 + hGraf)
    ctx.stroke()
    const etiquetaSec = pasoSeg < 1 ? `${tVal.toFixed(1)}s` : `${Math.round(tVal)}s`
    ctx.fillText(etiquetaSec, x - 8, y0 + hGraf + 18)
  }

  // Cuadrícula horizontal (amplitud ADC)
  const numHoriz = 8
  for (let h = 0; h <= numHoriz; h++) {
    const y = y0 + (h / numHoriz) * hGraf
    ctx.strokeStyle = h === 0 || h === numHoriz ? 'rgba(225, 29, 72, 0.25)' : 'rgba(225, 29, 72, 0.12)'
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x0 + wGraf, y)
    ctx.stroke()
    const valADC = Math.round(bitsMax - (h / numHoriz) * bitsMax)
    ctx.fillText(String(valADC), x0 - 45, y + 4)
  }

  // Borde del gráfico
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 1.5
  ctx.strokeRect(x0, y0, wGraf, hGraf)

  // Etiqueta Eje X
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = '#64748b'
  const ejeXTexto = recorteAplicado
    ? `Tiempo en tramo recortado (${duracionSeg.toFixed(1)} s — [${recorteAplicado.inicioSeg}s a ${recorteAplicado.finSeg}s])`
    : `Tiempo en la ventana de captura (${ventanaSeg} s)`
  const ejeXWidth = ctx.measureText(ejeXTexto).width
  ctx.fillText(ejeXTexto, x0 + (wGraf - ejeXWidth) / 2, alto - 28)

  // Trazo de la señal en Carmesí Cardíaco (#e11d48)
  if (samplesFinales.length > 1) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(x0, y0, wGraf, hGraf)
    ctx.clip()

    ctx.strokeStyle = '#e11d48'
    ctx.lineWidth = 2.6
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.shadowColor = 'rgba(225, 29, 72, 0.25)'
    ctx.shadowBlur = 3

    let drawing = false
    ctx.beginPath()
    for (let i = 0; i < samplesFinales.length; i++) {
      const s = samplesFinales[i]
      if (s.lo || s.v == null || !Number.isFinite(s.v)) {
        drawing = false
        continue
      }
      const px = x0 + (s.tRel / duracionSeg) * wGraf
      const py = y0 + hGraf - (s.v / bitsMax) * hGraf

      if (!drawing) {
        ctx.moveTo(px, py)
        drawing = true
      } else {
        ctx.lineTo(px, py)
      }
    }
    ctx.stroke()
    ctx.restore()
  } else {
    ctx.fillStyle = '#64748b'
    ctx.font = 'italic 16px system-ui, sans-serif'
    ctx.fillText('Sin muestras registradas en este intervalo', x0 + wGraf / 2 - 140, y0 + hGraf / 2)
  }

  // Pie de página institucional
  ctx.font = 'italic 11px system-ui, sans-serif'
  ctx.fillStyle = '#64748b'
  ctx.fillText('Aviso: Uso académico y formativo — No es un dispositivo médico ni realiza diagnóstico clínico.', 28, alto - 10)
  const rightFooter = `Cardio Monitor · ESP32 AD8232 / PPG · Fs: ${fs} Hz`
  const rfW = ctx.measureText(rightFooter).width
  ctx.fillStyle = '#0f172a'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillText(rightFooter, ancho - rfW - 28, alto - 10)

  const dataUrl = canvas.toDataURL('image/png')
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))

  const stamp = fecha.toISOString().slice(0, 19).replace(/[:T]/g, '-').replace(/[^0-9-]/g, '')
  const safeUser = (usuarioEtiqueta || 'usuario').replace(/[^a-zA-Z0-9_-]/g, '_')
  const sufijoRecorte = recorteAplicado ? `_recorte_${recorteAplicado.inicioSeg}s-${recorteAplicado.finSeg}s` : ''
  const filename = `captura_${safeUser}_${stamp}${sufijoRecorte}.png`

  return {
    dataUrl,
    blob,
    filename,
    bpm: bpmFinal != null ? bpmFinal : null,
    bpmOriginal,
    actividad: nombreActividad(canal?.actividad || 'reposo'),
    usuario: usuarioEtiqueta,
    fecha: fechaStr,
    ventanaSeg: duracionSeg,
    ventanaOriginalSeg: recorte?.ventanaOriginalSeg || ventanaSeg,
    recorte: recorteAplicado,
    samplesOriginales,
    samples: samplesFinales,
    canal,
  }
}

/** Descarga de los datos crudos del recorte en formato CSV para análisis en Excel/MATLAB. */
export function descargarCapturaCsv(captura) {
  const muestras = captura.samples || []
  const lineas = ['t_seg,ecg_raw,leads_off']
  for (const s of muestras) {
    const v = s.v != null && Number.isFinite(s.v) ? s.v : ''
    lineas.push(`${s.tRel.toFixed(4)},${v},${s.lo ? 1 : 0}`)
  }
  const blob = new Blob([lineas.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const filename = (captura.filename || 'captura.png').replace(/\.png$/i, '.csv')
  descargarBlob(blob, filename)
}

/** Descarga automática del archivo Blob en el navegador. */
export function descargarBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

/** Copia la imagen Blob al portapapeles del sistema (Ctrl+V para pegar en Word/Docs). */
export async function copiarAlPortapapeles(blob) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Tu navegador no permite copiar imágenes directamente. Usa la opción «Descargar PNG».')
  }
  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': blob }),
  ])
}
