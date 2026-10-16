/**
 * Limitador de tasa de ventana deslizante (SUG-04/SUG-05, A.12.1.3 y A.9.4.2).
 * Defensa en profundidad en el cliente: evita que un error de la app (o un bucle) inunde Supabase.
 * No sustituye a los límites del servidor (triggers de cuota en supabase/schema.sql ni rate limits de Auth).
 *
 * @param {object} o
 * @param {number} o.max      solicitudes permitidas dentro de la ventana
 * @param {number} o.windowMs duración de la ventana en ms
 * @param {() => number} [o.now]
 */
export function createRateLimiter({ max, windowMs, now = () => Date.now() }) {
  if (!(max > 0) || !(windowMs > 0)) throw new Error('Parámetros de límite de tasa inválidos')
  let marcas = []

  function limpiar(t) {
    const desde = t - windowMs
    while (marcas.length && marcas[0] <= desde) marcas.shift()
  }

  return {
    /** Consume un permiso si hay disponible. @returns {boolean} */
    tryAcquire() {
      const t = now()
      limpiar(t)
      if (marcas.length >= max) return false
      marcas.push(t)
      return true
    },
    /** Permisos restantes en la ventana actual. */
    remaining() {
      limpiar(now())
      return Math.max(0, max - marcas.length)
    },
    /** ms hasta que se libere el siguiente permiso (0 si hay disponibles). */
    retryAfterMs() {
      const t = now()
      limpiar(t)
      return marcas.length < max ? 0 : marcas[0] + windowMs - t
    },
    reset() {
      marcas = []
    },
  }
}

/**
 * Límites del cliente, alineados (por debajo) con las cuotas del servidor en supabase/schema.sql.
 * Bloques: 5 canales × 1 bloque/2 s = 150/min; se deja holgura para reintentos.
 */
export const CLIENT_LIMITS = Object.freeze({
  anonSignIn: { max: 3, windowMs: 10 * 60_000 },
  audit: { max: 120, windowMs: 60 * 60_000 },
  incident: { max: 5, windowMs: 24 * 60 * 60_000 },
  session: { max: 30, windowMs: 60 * 60_000 },
  chunk: { max: 400, windowMs: 60_000 },
})
