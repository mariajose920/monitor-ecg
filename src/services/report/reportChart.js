import { dataUrlABytes } from './pdfWriter.js'
import { reducirMinMax } from '@/services/monitoreos/analysis.js'

/**
 * Dibuja un gráfico en un <canvas> fuera de pantalla y lo devuelve como JPEG (para el PDF).
 * Colores fijos y fondo blanco para que se imprima bien en ambos temas.
 * @param {object} o
 * @param {{x:ArrayLike<number>, y:ArrayLike<number|null>, color:string, etiqueta:string}[]} o.series x en segundos
 * @param {{x:number,y:number}[]} [o.marcas] picos a marcar (coordenadas de datos)
 * @param {string} [o.etiquetaY]
 * @returns {{bytes:Uint8Array,w:number,h:number}}
 */
export function renderizarGraficoJpeg({ series, marcas = [], etiquetaY = '', etiquetaX = 'Tiempo (s)', ancho = 1000, alto = 360 }) {
  const canvas = document.createElement('canvas')
  canvas.width = ancho
  canvas.height = alto
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, ancho, alto)

  const izq = 64
  const der = 16
  const arr = 16
  const abj = 44
  const pw = ancho - izq - der
  const ph = alto - arr - abj

  let xmin = Infinity
  let xmax = -Infinity
  let ymin = Infinity
  let ymax = -Infinity
  for (const s of series) {
    for (let i = 0; i < s.x.length; i++) {
      const y = s.y[i]
      if (y === null || y === undefined || !Number.isFinite(y)) continue
      if (s.x[i] < xmin) xmin = s.x[i]
      if (s.x[i] > xmax) xmax = s.x[i]
      if (y < ymin) ymin = y
      if (y > ymax) ymax = y
    }
  }
  if (!Number.isFinite(xmin) || xmax <= xmin) {
    xmin = 0
    xmax = 1
  }
  if (!Number.isFinite(ymin) || ymax <= ymin) {
    ymin = 0
    ymax = 1
  }
  const pad = (ymax - ymin) * 0.08
  ymin -= pad
  ymax += pad
  const px = (x) => izq + ((x - xmin) / (xmax - xmin)) * pw
  const py = (y) => arr + ph - ((y - ymin) / (ymax - ymin)) * ph

  // Rejilla y ejes
  ctx.strokeStyle = '#d7dee9'
  ctx.fillStyle = '#4b5d76'
  ctx.font = '13px sans-serif'
  ctx.lineWidth = 1
  for (let k = 0; k <= 5; k++) {
    const gy = arr + (ph * k) / 5
    ctx.beginPath()
    ctx.moveTo(izq, gy)
    ctx.lineTo(izq + pw, gy)
    ctx.stroke()
    const v = ymax - ((ymax - ymin) * k) / 5
    ctx.textAlign = 'right'
    ctx.fillText(Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1), izq - 6, gy + 4)
    const gx = izq + (pw * k) / 5
    ctx.beginPath()
    ctx.moveTo(gx, arr)
    ctx.lineTo(gx, arr + ph)
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.fillText((xmin + ((xmax - xmin) * k) / 5).toFixed(1), gx, arr + ph + 18)
  }
  ctx.textAlign = 'center'
  ctx.fillText(etiquetaX, izq + pw / 2, alto - 8)
  if (etiquetaY) {
    ctx.save()
    ctx.translate(14, arr + ph / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText(etiquetaY, 0, 0)
    ctx.restore()
  }

  // Series (reducidas por mínimos/máximos para no dibujar decenas de miles de puntos)
  for (const s of series) {
    const { idx } = reducirMinMax(s.y, 2 * pw)
    ctx.strokeStyle = s.color
    ctx.lineWidth = 1.4
    ctx.beginPath()
    let abierto = false
    for (const i of idx) {
      const y = s.y[i]
      if (y === null || y === undefined || !Number.isFinite(y)) {
        abierto = false
        continue
      }
      if (!abierto) {
        ctx.moveTo(px(s.x[i]), py(y))
        abierto = true
      } else ctx.lineTo(px(s.x[i]), py(y))
    }
    ctx.stroke()
  }

  // Picos
  ctx.fillStyle = '#c62837'
  for (const m of marcas) {
    if (m.x < xmin || m.x > xmax) continue
    ctx.beginPath()
    ctx.arc(px(m.x), py(m.y), 4.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // Leyenda
  ctx.textAlign = 'left'
  let lx = izq + 8
  for (const s of series) {
    ctx.fillStyle = s.color
    ctx.fillRect(lx, arr + 6, 14, 4)
    ctx.fillStyle = '#0e1a2b'
    ctx.fillText(s.etiqueta, lx + 20, arr + 12)
    lx += 28 + ctx.measureText(s.etiqueta).width
  }
  if (marcas.length) {
    ctx.fillStyle = '#c62837'
    ctx.beginPath()
    ctx.arc(lx + 4, arr + 8, 4.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0e1a2b'
    ctx.fillText('Picos detectados', lx + 14, arr + 12)
  }

  return { bytes: dataUrlABytes(canvas.toDataURL('image/jpeg', 0.9)), w: ancho, h: alto }
}
