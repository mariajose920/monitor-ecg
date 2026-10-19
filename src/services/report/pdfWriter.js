/**
 * Escritor PDF mínimo (PDF 1.4) sin dependencias: texto con Helvetica estándar (WinAnsi),
 * rectángulos, líneas e imágenes JPEG (DCTDecode). Pensado para informes breves y seudonimizados.
 * No ejecuta JavaScript, no incrusta fuentes ni archivos externos y funciona sin DOM (pruebas Node).
 */

const PAGE_W = 595.28 // A4
const PAGE_H = 841.89
const MARGIN = 48

// Anchos de Helvetica (AFM, unidades de 1/1000 em) para ASCII 32–126.
const W = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]

/** Sustituciones para caracteres fuera de WinAnsi. */
const SUSTITUCION = {
  '–': '-', '—': '-', '−': '-', '→': '->', '←': '<-', '≥': '>=', '≤': '<=', '≈': '~', '×': 'x',
  '“': '"', '”': '"', '‘': "'", '’': "'", '…': '...', '•': '*', '✓': 'OK', '⚠': '!', '●': '*', '○': 'o',
}

/** Convierte a una cadena Latin-1 segura (cada carácter ≤ 255). */
export function aWinAnsi(texto) {
  let out = ''
  for (const ch of String(texto ?? '')) {
    if (SUSTITUCION[ch] !== undefined) out += SUSTITUCION[ch]
    else {
      const c = ch.codePointAt(0)
      if (c === 9 || c === 10) out += ch
      else if (c >= 32 && c <= 126) out += ch
      else if (c >= 160 && c <= 255) out += ch
      else out += '?'
    }
  }
  return out
}

/** Ancho aproximado en puntos. Las negritas se ensanchan un 6 % (aproximación conservadora). */
export function anchoTexto(texto, size, bold = false) {
  let w = 0
  for (const ch of aWinAnsi(texto)) {
    const c = ch.charCodeAt(0)
    w += c >= 32 && c <= 126 ? W[c - 32] : 556
  }
  return (w / 1000) * size * (bold ? 1.06 : 1)
}

/** Parte un texto en líneas que caben en `ancho` puntos. */
export function envolver(texto, size, ancho, bold = false) {
  const lineas = []
  for (const parrafo of aWinAnsi(texto).split('\n')) {
    let actual = ''
    for (const palabra of parrafo.split(/ +/)) {
      if (!palabra) continue
      let p = palabra
      // Palabra más larga que la línea: se corta.
      while (anchoTexto(p, size, bold) > ancho && p.length > 1) {
        let k = p.length - 1
        while (k > 1 && anchoTexto(p.slice(0, k), size, bold) > ancho) k--
        if (actual) {
          lineas.push(actual)
          actual = ''
        }
        lineas.push(p.slice(0, k))
        p = p.slice(k)
      }
      const prueba = actual ? `${actual} ${p}` : p
      if (anchoTexto(prueba, size, bold) <= ancho) actual = prueba
      else {
        if (actual) lineas.push(actual)
        actual = p
      }
    }
    lineas.push(actual)
  }
  return lineas
}

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\t/g, ' ').replace(/\r/g, '')
const num = (n) => (Math.round(n * 100) / 100).toString()
const rgb = (c) => c.map((v) => num(v)).join(' ')

export const COLORES = Object.freeze({
  texto: [0.08, 0.1, 0.16],
  suave: [0.35, 0.4, 0.5],
  acento: [0.04, 0.48, 0.3],
  aviso: [0.55, 0.33, 0.03],
  linea: [0.8, 0.84, 0.9],
  fondo: [0.94, 0.96, 0.98],
})

/** Convierte "D:AAAAMMDDHHmmSSZ" desde un Date (UTC). */
export function fechaPdf(d) {
  const p = (n, l = 2) => String(n).padStart(l, '0')
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
}

export class PdfDoc {
  /**
   * @param {{titulo?:string, fecha?:Date, pie?:string}} o
   */
  constructor({ titulo = 'Informe', fecha = new Date(), pie = '' } = {}) {
    this.titulo = aWinAnsi(titulo).slice(0, 120)
    this.fecha = fecha
    this.pie = aWinAnsi(pie)
    this.paginas = [] // { ops: string[], imgs: Set<number> }
    this.imagenes = [] // { bytes, w, h }
    this.y = 0
    this._nueva()
  }

  _nueva() {
    this.paginas.push({ ops: [], imgs: new Set() })
    this.y = PAGE_H - MARGIN
  }

  get _p() {
    return this.paginas[this.paginas.length - 1]
  }

  _asegurar(alto) {
    if (this.y - alto < MARGIN + 28) this._nueva()
  }

  /** Línea de texto en (x, y). */
  _texto(txt, x, y, { size = 10, bold = false, color = COLORES.texto } = {}) {
    this._p.ops.push(`BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${rgb(color)} rg ${num(x)} ${num(y)} Td (${esc(aWinAnsi(txt))}) Tj ET`)
  }

  espacio(h = 8) {
    this.y -= h
  }

  titulo1(txt) {
    this._asegurar(30)
    for (const l of envolver(txt, 18, PAGE_W - 2 * MARGIN, true)) {
      this.y -= 22
      this._texto(l, MARGIN, this.y, { size: 18, bold: true, color: COLORES.acento })
    }
    this.y -= 4
  }

  titulo2(txt) {
    this._asegurar(30)
    this.y -= 10
    this._p.ops.push(`${rgb(COLORES.linea)} RG 0.6 w ${num(MARGIN)} ${num(this.y - 2)} m ${num(PAGE_W - MARGIN)} ${num(this.y - 2)} l S`)
    this.y -= 14
    this._texto(txt, MARGIN, this.y, { size: 12, bold: true })
    this.y -= 6
  }

  parrafo(txt, { size = 10, bold = false, color = COLORES.texto, sangria = 0 } = {}) {
    const lineas = envolver(txt, size, PAGE_W - 2 * MARGIN - sangria, bold)
    for (const l of lineas) {
      this._asegurar(size + 4)
      this.y -= size + 3
      this._texto(l, MARGIN + sangria, this.y, { size, bold, color })
    }
    this.y -= 3
  }

  /** Pares clave/valor en dos columnas. */
  pares(filas, { anchoClave = 150 } = {}) {
    for (const [k, v] of filas) {
      const lineas = envolver(String(v ?? '--'), 10, PAGE_W - 2 * MARGIN - anchoClave)
      this._asegurar(lineas.length * 13 + 2)
      this.y -= 13
      this._texto(k, MARGIN, this.y, { size: 10, bold: true, color: COLORES.suave })
      this._texto(lineas[0], MARGIN + anchoClave, this.y)
      for (const extra of lineas.slice(1)) {
        this.y -= 13
        this._texto(extra, MARGIN + anchoClave, this.y)
      }
    }
    this.y -= 4
  }

  /** Cuadro destacado (avisos). */
  aviso(txt, { color = COLORES.aviso } = {}) {
    const lineas = envolver(txt, 9.5, PAGE_W - 2 * MARGIN - 16)
    const alto = lineas.length * 12.5 + 10
    this._asegurar(alto + 6)
    const yTop = this.y - 4
    this._p.ops.push(`${rgb(COLORES.fondo)} rg ${num(MARGIN)} ${num(yTop - alto)} ${num(PAGE_W - 2 * MARGIN)} ${num(alto)} re f`)
    this._p.ops.push(`${rgb(color)} rg ${num(MARGIN)} ${num(yTop - alto)} 3 ${num(alto)} re f`)
    let y = yTop - 5
    for (const l of lineas) {
      y -= 12.5
      this._texto(l, MARGIN + 10, y, { size: 9.5 })
    }
    this.y = yTop - alto - 6
  }

  /**
   * Tabla simple: cabeceras y filas de texto; las celdas largas se recortan con "..." para caber.
   * @param {string[]} cabeceras
   * @param {string[][]} filas
   * @param {number[]} anchos puntos por columna (suma ≤ ancho útil)
   */
  tabla(cabeceras, filas, anchos, { size = 8 } = {}) {
    const recorte = (t, w, bold) => {
      let x = aWinAnsi(String(t ?? ''))
      if (anchoTexto(x, size, bold) <= w - 4) return x
      while (x.length > 1 && anchoTexto(x + '...', size, bold) > w - 4) x = x.slice(0, -1)
      return x + '...'
    }
    const fila = (celdas, bold) => {
      this._asegurar(size + 8)
      this.y -= size + 4
      let x = MARGIN
      celdas.forEach((c, i) => {
        this._texto(recorte(c, anchos[i], bold), x, this.y, { size, bold, color: bold ? COLORES.suave : COLORES.texto })
        x += anchos[i]
      })
    }
    fila(cabeceras, true)
    this._p.ops.push(`${rgb(COLORES.linea)} RG 0.5 w ${num(MARGIN)} ${num(this.y - 2)} m ${num(PAGE_W - MARGIN)} ${num(this.y - 2)} l S`)
    for (const f of filas) fila(f, false)
    this.y -= 6
  }

  /** Imagen JPEG a todo el ancho útil (o `ancho`). */
  imagenJpeg(bytes, w, h, { ancho = PAGE_W - 2 * MARGIN } = {}) {
    const alto = (ancho * h) / w
    this._asegurar(alto + 8)
    const idx = this.imagenes.push({ bytes, w, h }) - 1
    this._p.imgs.add(idx)
    this.y -= alto
    this._p.ops.push(`q ${num(ancho)} 0 0 ${num(alto)} ${num(MARGIN)} ${num(this.y)} cm /Im${idx} Do Q`)
    this.y -= 8
  }

  /** Genera el archivo. @returns {Uint8Array} */
  construir() {
    const total = this.paginas.length
    // Pie en cada página
    this.paginas.forEach((pag, i) => {
      pag.ops.push(`${rgb(COLORES.linea)} RG 0.6 w ${num(MARGIN)} ${num(MARGIN + 18)} m ${num(PAGE_W - MARGIN)} ${num(MARGIN + 18)} l S`)
      for (const [k, l] of envolver(this.pie, 7.5, PAGE_W - 2 * MARGIN - 70).entries()) {
        pag.ops.push(`BT /F1 7.5 Tf ${rgb(COLORES.suave)} rg ${num(MARGIN)} ${num(MARGIN + 8 - k * 9)} Td (${esc(l)}) Tj ET`)
      }
      pag.ops.push(`BT /F1 8 Tf ${rgb(COLORES.suave)} rg ${num(PAGE_W - MARGIN - 62)} ${num(MARGIN + 8)} Td (Pagina ${i + 1} de ${total}) Tj ET`)
    })

    const partes = [] // Uint8Array | string
    const offsets = []
    let largo = 0
    const enc = (s) => {
      const b = new Uint8Array(s.length)
      for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff
      return b
    }
    const emitir = (x) => {
      const b = typeof x === 'string' ? enc(x) : x
      partes.push(b)
      largo += b.length
    }
    const objeto = (n, cuerpo, flujo = null) => {
      offsets[n] = largo
      emitir(`${n} 0 obj\n${cuerpo}`)
      if (flujo) {
        emitir('\nstream\n')
        emitir(flujo)
        emitir('\nendstream')
      }
      emitir('\nendobj\n')
    }

    // Numeración: 1 catálogo, 2 páginas, 3 F1, 4 F2, 5 info, luego imágenes, luego (página, contenido) por página.
    const nImg = this.imagenes.length
    const primeraImg = 6
    const primeraPag = primeraImg + nImg
    emitir('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
    objeto(1, '<< /Type /Catalog /Pages 2 0 R >>')
    const kids = this.paginas.map((_, i) => `${primeraPag + i * 2} 0 R`).join(' ')
    objeto(2, `<< /Type /Pages /Kids [${kids}] /Count ${total} >>`)
    objeto(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    objeto(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
    objeto(5, `<< /Title (${esc(this.titulo)}) /Producer (Monitor ECG educativo) /CreationDate (${fechaPdf(this.fecha)}) >>`)
    this.imagenes.forEach((im, i) => {
      objeto(primeraImg + i, `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>`, im.bytes)
    })
    this.paginas.forEach((pag, i) => {
      const nPag = primeraPag + i * 2
      const xo = [...pag.imgs].map((k) => `/Im${k} ${primeraImg + k} 0 R`).join(' ')
      objeto(nPag, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE_W)} ${num(PAGE_H)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo ? ` /XObject << ${xo} >>` : ''} >> /Contents ${nPag + 1} 0 R >>`)
      const contenido = pag.ops.join('\n')
      objeto(nPag + 1, `<< /Length ${contenido.length} >>`, enc(contenido))
    })
    const nObj = primeraPag + total * 2
    const xref = largo
    let tabla = `xref\n0 ${nObj}\n0000000000 65535 f \n`
    for (let n = 1; n < nObj; n++) tabla += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
    emitir(tabla)
    emitir(`trailer\n<< /Size ${nObj} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

    const out = new Uint8Array(largo)
    let o = 0
    for (const p of partes) {
      out.set(p, o)
      o += p.length
    }
    return out
  }
}

/** Decodifica un data URL base64 (image/jpeg) a bytes. */
export function dataUrlABytes(dataUrl) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m) throw new Error('La imagen del gráfico no es un JPEG válido.')
  const bin = atob(m[1])
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
