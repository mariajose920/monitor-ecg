/**
 * Cierre de sesión por inactividad de las cuentas (C-07, A.9.4.2, A.11.2.8). Lógica pura, probada con Vitest.
 * Por defecto 15 minutos, con aviso 1 minuto antes. Un monitoreo en curso cuenta como actividad (no se corta una medición).
 */
export const INACTIVIDAD_MS = 15 * 60_000
export const AVISO_ANTES_MS = 60_000

/** @returns {'activo'|'aviso'|'vencido'} */
export function estadoInactividad({ ultimaActividad, ahora, limiteMs = INACTIVIDAD_MS, avisoMs = AVISO_ANTES_MS }) {
  const inactivo = ahora - ultimaActividad
  if (inactivo >= limiteMs) return 'vencido'
  if (inactivo >= limiteMs - avisoMs) return 'aviso'
  return 'activo'
}

/** Segundos que faltan para el cierre (0 si ya venció). */
export function segundosRestantes({ ultimaActividad, ahora, limiteMs = INACTIVIDAD_MS }) {
  return Math.max(0, Math.ceil((limiteMs - (ahora - ultimaActividad)) / 1000))
}

/**
 * Controlador sin dependencias del DOM (se inyectan el reloj y las acciones): lo usa el composable y las pruebas.
 * `ocupado()` = hay una medición en curso (cuenta como actividad). `alAviso(seg)`, `alVencer()`, `alActividad()`.
 */
export function crearControlInactividad({ ahora = () => Date.now(), limiteMs = INACTIVIDAD_MS, avisoMs = AVISO_ANTES_MS, ocupado = () => false, alAviso = () => {}, alVencer = () => {}, alRecuperar = () => {} } = {}) {
  let ultima = ahora()
  let estado = 'activo'
  let vencido = false
  return {
    actividad() {
      if (vencido) return
      ultima = ahora()
      if (estado !== 'activo') {
        estado = 'activo'
        alRecuperar()
      }
    },
    tic() {
      if (vencido) return estado
      if (ocupado()) {
        ultima = ahora()
        if (estado !== 'activo') {
          estado = 'activo'
          alRecuperar()
        }
        return estado
      }
      const e = estadoInactividad({ ultimaActividad: ultima, ahora: ahora(), limiteMs, avisoMs })
      if (e === 'vencido') {
        vencido = true
        estado = 'vencido'
        alVencer()
      } else if (e === 'aviso') {
        estado = 'aviso'
        alAviso(segundosRestantes({ ultimaActividad: ultima, ahora: ahora(), limiteMs }))
      } else estado = 'activo'
      return estado
    },
    reiniciar() {
      vencido = false
      estado = 'activo'
      ultima = ahora()
    },
    get estado() {
      return estado
    },
  }
}
