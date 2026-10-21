import { getRuntime } from '@/services/acquisition/channelRegistry.js'
import { DEVICE_PROFILES, maxRaw } from '@/data/deviceProfiles.js'
import { nombreActividad } from '@/data/activities.js'

/**
 * Servicio de capturas de señal en vivo (ECG / PPG).
 * Genera una instantánea en PNG de alta resolución (1200x560) con:
 * - Estética Cardio Monitor en modo claro (papel milimetrado clínico)
 * - Traza exacta de la onda capturada en el momento preciso
 * - Metadatos: Participante, BPM en el instante de captura, Actividad, Fecha y hora
 * - Pie institucional y advertencia educativa
 */

export async function generarCaptura({ canal, usuarioEtiqueta = 'Participante', ventanaSeg = 8, datosVisibles = null }) {
  if (typeof document === 'undefined') {
    throw new Error('generarCaptura requiere un entorno con DOM (navegador).')
  }

  const rt = getRuntime(canal.id)
  const profile = rt?.profile || DEVICE_PROFILES[canal.perfilId] || { nombre: canal.perfilId, fs: 250, yRange: [0, 4095] }
  const bitsMax = maxRaw(profile)
  const fs = profile.fs || 250

  let samples = []

  // 1. Si el gráfico en pantalla proporcionó sus muestras visibles exactas (p. ej. en pausa o en vivo),
  // las usamos prioritariamente para capturar exactamente el fotograma que el usuario ve.
  if (datosVisibles?.samples?.length) {
    samples = datosVisibles.samples
  } else {
    // 2. Fallback al buffer circular en memoria
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
  ctx.fillText('CARDIO MONITOR — REGISTRO DE FRECUENCIA CARDÍACA', 28, 35)

  const fecha = new Date()
  const fechaStr = fecha.toLocaleString('es-CL', {
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
  ctx.fillText(`Canal: ${canal.nombre}   ·   Dispositivo: ${profile.nombre}   ·   Fecha: ${fechaStr}`, 28, 59)

  // BPM destacado en Carmesí Cardíaco (#e11d48)
  const bpm = canal.bpmCalculado ?? canal.bpmDispositivo
  const bpmTexto = bpm != null ? `${bpm} BPM` : '-- BPM'
  ctx.font = 'bold 28px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif'
  ctx.fillStyle = '#e11d48'
  const bpmWidth = ctx.measureText(bpmTexto).width
  ctx.fillText(bpmTexto, ancho - bpmWidth - 28, 38)

  // Participante y actividad
  ctx.font = '500 13px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif'
  ctx.fillStyle = '#64748b'
  const infoDer = `Participante: ${usuarioEtiqueta || 'Sin asignar'}   ·   ${nombreActividad(canal.actividad)}`
  const infoDerWidth = ctx.measureText(infoDer).width
  ctx.fillText(infoDer, ancho - infoDerWidth - 28, 59)

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
  const totalSubDiv = ventanaSeg * 5
  for (let s = 0; s <= totalSubDiv; s++) {
    const x = x0 + (s / totalSubDiv) * wGraf
    ctx.beginPath()
    ctx.moveTo(x, y0)
    ctx.lineTo(x, y0 + hGraf)
    ctx.stroke()
  }

  // Cuadrícula principal vertical (cada 1 segundo)
  ctx.strokeStyle = 'rgba(225, 29, 72, 0.22)'
  ctx.lineWidth = 1.2
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = '#64748b'
  for (let s = 0; s <= ventanaSeg; s++) {
    const x = x0 + (s / ventanaSeg) * wGraf
    ctx.beginPath()
    ctx.moveTo(x, y0)
    ctx.lineTo(x, y0 + hGraf)
    ctx.stroke()
    ctx.fillText(`${s}s`, x - 8, y0 + hGraf + 18)
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
  const ejeXTexto = `Tiempo en la ventana de captura (${ventanaSeg} s)`
  const ejeXWidth = ctx.measureText(ejeXTexto).width
  ctx.fillText(ejeXTexto, x0 + (wGraf - ejeXWidth) / 2, alto - 28)

  // Trazo de la señal en Carmesí Cardíaco (#e11d48)
  if (samples.length > 1) {
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
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]
      if (s.lo || s.v == null || !Number.isFinite(s.v)) {
        drawing = false
        continue
      }
      const px = x0 + (s.tRel / ventanaSeg) * wGraf
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
  const filename = `captura_${safeUser}_${stamp}.png`

  return {
    dataUrl,
    blob,
    filename,
    bpm: bpm != null ? bpm : null,
    actividad: nombreActividad(canal.actividad),
    usuario: usuarioEtiqueta,
    fecha: fechaStr,
    ventanaSeg,
  }
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
