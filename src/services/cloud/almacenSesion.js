/**
 * Dónde vive el token de sesión de supabase-js (C-07, A.9.4.2, A.11.2.8).
 *  - Equipo compartido  → sessionStorage: el token muere al cerrar la pestaña/ventana.
 *  - Equipo personal    → localStorage: la sesión sobrevive al cierre del navegador (hasta cerrar sesión).
 * La elección se hace al iniciar sesión y se recuerda como preferencia no sensible (solo un booleano). Sin elección previa se
 * asume "compartido" en pantallas de escritorio (laboratorios y salas de clases) y "personal" en teléfonos y tabletas táctiles.
 * Lógica pura con almacenes inyectables: probada con Vitest.
 */
export const CLAVE_AUTH = 'ecg-cloud-auth'
const PREF_COMPARTIDO = 'ecg.pref.equipoCompartido'

const seguro = (fn, def = null) => {
  try {
    return fn()
  } catch {
    return def
  }
}

/** Valor por defecto de la casilla según el dispositivo: escritorio (puntero fino, pantalla ancha) = compartido. */
export function compartidoPorDefecto({ ancho = 0, punteroFino = true } = {}) {
  return punteroFino === true && ancho >= 900
}

export function dispositivoActual() {
  if (typeof window === 'undefined') return {}
  return {
    ancho: window.innerWidth,
    punteroFino: seguro(() => window.matchMedia('(pointer: fine)').matches, true),
  }
}

/** @returns {true|false|null} preferencia guardada (null = nunca elegida) */
export function leerEquipoCompartido(local = seguro(() => window.localStorage)) {
  const raw = seguro(() => local?.getItem(PREF_COMPARTIDO))
  if (raw === 'true') return true
  if (raw === 'false') return false
  return null
}

export function guardarEquipoCompartido(valor, local = seguro(() => window.localStorage)) {
  seguro(() => local?.setItem(PREF_COMPARTIDO, valor === true ? 'true' : 'false'))
}

/** Valor inicial de la casilla "Estoy en un equipo compartido". */
export function valorInicialCompartido(local, dispositivo = dispositivoActual()) {
  const guardada = leerEquipoCompartido(local)
  return guardada ?? compartidoPorDefecto(dispositivo)
}

/**
 * Almacén para supabase-js (`auth.storage`). Escribe SOLO en el almacén que corresponde al modo; lee del modo activo y, como
 * migración, del otro (una sesión anterior a este cambio vivía en localStorage). Nunca deja el token en los dos sitios.
 */
export function crearAlmacenAuth({ local = seguro(() => window.localStorage), sesion = seguro(() => window.sessionStorage), dispositivo = dispositivoActual } = {}) {
  const compartido = () => leerEquipoCompartido(local) ?? compartidoPorDefecto(dispositivo())
  const elegido = () => (compartido() ? sesion : local)
  const otro = () => (compartido() ? local : sesion)
  return {
    getItem(k) {
      const v = seguro(() => elegido()?.getItem(k))
      if (v !== null && v !== undefined) return v
      return seguro(() => otro()?.getItem(k))
    },
    setItem(k, v) {
      seguro(() => elegido()?.setItem(k, v))
      seguro(() => otro()?.removeItem(k))
    },
    removeItem(k) {
      seguro(() => local?.removeItem(k))
      seguro(() => sesion?.removeItem(k))
    },
  }
}

/** Borra cualquier resto del token (y del verificador PKCE) de ambos almacenes. */
export function borrarTokens({ local = seguro(() => window.localStorage), sesion = seguro(() => window.sessionStorage) } = {}) {
  for (const a of [local, sesion]) {
    if (!a) continue
    const claves = seguro(() => (typeof a.keys === 'function' ? [...a.keys()] : Object.keys(a)), [])
    for (const k of claves) if (k === CLAVE_AUTH || k.startsWith(`${CLAVE_AUTH}-`)) seguro(() => a.removeItem(k))
  }
}
