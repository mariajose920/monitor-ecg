import { obtenerSenal, esComunitario } from './senalAcceso.js'

const cache = new Map()

/**
 * Convierte una señal en el atributo `d` de un <path> SVG (viewBox 0 0 100 24) con `n` puntos
 * (mínimo y máximo por cubeta). Pura y sin DOM.
 */
export function rutaMiniatura(valores, n = 50, ancho = 100, alto = 24) {
  const len = valores.length
  if (len < 2) return ''
  const pts = []
  const tam = len / n
  let lo = Infinity
  let hi = -Infinity
  for (let b = 0; b < n; b++) {
    const a = Math.floor(b * tam)
    const z = Math.max(a + 1, Math.floor((b + 1) * tam))
    let mn = Infinity
    let mx = -Infinity
    for (let i = a; i < z && i < len; i++) {
      const v = valores[i]
      if (Number.isFinite(v)) {
        if (v < mn) mn = v
        if (v > mx) mx = v
      }
    }
    if (mn === Infinity) continue
    pts.push([b, mn, mx])
    lo = Math.min(lo, mn)
    hi = Math.max(hi, mx)
  }
  if (!pts.length) return ''
  const rango = hi - lo || 1
  const y = (v) => (alto - 2 - ((v - lo) / rango) * (alto - 4)).toFixed(1)
  return pts.map(([b, mn, mx], k) => `${k ? 'L' : 'M'}${((b / (n - 1)) * ancho).toFixed(1)} ${y(mx)}L${((b / (n - 1)) * ancho).toFixed(1)} ${y(mn)}`).join('')
}

/** Miniatura (cacheada) de la señal de una participación. Devuelve '' si no se puede leer. */
export async function miniaturaDe(sesionId, canal) {
  const k = `${sesionId}:${canal}`
  if (cache.has(k)) return cache.get(k)
  let d = ''
  if (esComunitario(sesionId)) return d // evita descargar señales ajenas solo para la miniatura
  try {
    const sig = await obtenerSenal(sesionId, canal)
    // Solo los primeros ~10 s para que sea barato y se vea el pulso.
    d = rutaMiniatura(sig.raw.subarray(0, Math.min(sig.n, 2500)), 60)
  } catch {
    d = ''
  }
  cache.set(k, d)
  return d
}

export function olvidarMiniaturas(sesionId = null) {
  if (!sesionId) cache.clear()
  else for (const k of [...cache.keys()]) if (k.startsWith(`${sesionId}:`)) cache.delete(k)
}
