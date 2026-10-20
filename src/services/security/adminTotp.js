/**
 * Frescura del segundo factor en el cliente (C-05). Lógica pura, probada con Vitest.
 *
 * El servidor es quien decide (es_admin() exige aal2 + una entrada 'totp' de la claim `amr` de hace <= 15 min). Aquí solo se
 * replica la lectura de esa claim para (a) poder avisar a la persona y (b) probar el formato.
 *
 * Formato de la claim `amr` de Supabase Auth (GoTrue): arreglo de objetos
 *   [{ "method": "totp", "timestamp": 1760000000 }, { "method": "password", "timestamp": 1759999000 }]
 * `timestamp` = segundos Unix en que se completó ESE método. Al refrescar el token las entradas se conservan con su marca
 * original (el refresco NO renueva el segundo factor), por eso sirve para medir su antigüedad.
 */

export const TOTP_VIGENCIA_S = 15 * 60

/** Decodifica el payload de un JWT sin verificarlo (solo lectura de claims propios; la verificación es del servidor). */
export function decodificarJwt(token) {
  try {
    const parte = String(token ?? '').split('.')[1]
    if (!parte) return null
    const b64 = parte.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parte.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

/** Segundos desde el último TOTP, o null si no hay (o la claim está mal formada). */
export function segundosDesdeTotp(amr, ahoraS = Math.floor(Date.now() / 1000)) {
  if (!Array.isArray(amr)) return null
  let mejor = null
  for (const a of amr) {
    if (!a || typeof a !== 'object' || a.method !== 'totp') continue
    const ts = Number(a.timestamp)
    if (!Number.isFinite(ts) || ts <= 0) continue
    const edad = ahoraS - ts
    if (edad < -60) continue // marca del futuro: se ignora igual que en el servidor
    if (mejor === null || edad < mejor) mejor = Math.max(0, edad)
  }
  return mejor
}

export function totpVigente(amr, ahoraS, maxS = TOTP_VIGENCIA_S) {
  const edad = segundosDesdeTotp(amr, ahoraS)
  return edad !== null && edad < maxS
}

/** ¿El error del servidor significa "faltan privilegios (p. ej. el TOTP caducó)"? */
export function esErrorPrivilegios(error) {
  if (!error) return false
  return String(error.code ?? '') === '42501' || /privilegios insuficientes/i.test(String(error.message ?? ''))
}
