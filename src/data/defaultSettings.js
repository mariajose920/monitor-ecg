import { ACTIVIDAD_IDS } from './activities.js'

export const MAX_CHANNELS = 5 // RF07 / RNF07: subirlo es cambiar esta constante y validar rendimiento
export const BPM_LIMITE_MIN = 30
export const BPM_LIMITE_MAX = 220
export const SYNC_METODOS = Object.freeze(['r-peak', 'xcorr', 'manual'])
export const SYNC_NOMBRES = Object.freeze({
  'r-peak': 'Alineación por pico R',
  xcorr: 'Correlación cruzada',
  manual: 'Manual (deslizador)',
})
export const RETENCION_DEFECTO_DIAS = 30
export const RETENCION_MAX_DIAS = 180

export function defaultParametros() {
  return {
    version: 1,
    bpm: {
      global: { min: 50, max: 100 },
      porActividad: {
        reposo: { min: 50, max: 100 },
        caminata: { min: 60, max: 120 },
        movimiento: { min: 60, max: 130 },
        ejercicio: { min: 90, max: 180 },
        'post-ejercicio': { min: 60, max: 140 },
      },
      usarPorActividad: true,
      fuenteBpm: 'calculado',
    },
    alertas: { duracionMinMs: 5000, histeresisBpm: 2, sonido: true },
    adquisicion: { watchdogMs: 2000, finTrasPerdidaMs: 10000, ventanaVisualSeg: 8 },
  }
}

export function defaultSincronizacion() {
  return {
    version: 1,
    metodoPorDefecto: 'xcorr',
    permitirCambioUsuario: true,
    xcorr: { maxLagMs: 1000 },
    normalizacion: 'zscore',
    fsComparacion: 250,
  }
}

/** Valida un rango (SEC-36): enteros con 30 ≤ min < max ≤ 220. */
export function validarRango(r) {
  if (!r || typeof r !== 'object') return 'Rango inválido'
  const { min, max } = r
  if (!Number.isInteger(min) || !Number.isInteger(max)) return 'Mín. y máx. deben ser enteros'
  if (min < BPM_LIMITE_MIN || max > BPM_LIMITE_MAX) return `Los valores deben estar entre ${BPM_LIMITE_MIN} y ${BPM_LIMITE_MAX} BPM`
  if (min >= max) return 'El mínimo debe ser menor que el máximo'
  return null
}

/** Valida el objeto completo de parámetros. Devuelve null si es válido o el primer error. */
export function validarParametros(p) {
  if (!p || typeof p !== 'object' || !p.bpm) return 'Estructura de parámetros inválida'
  const e = validarRango(p.bpm.global)
  if (e) return `Global: ${e}`
  for (const id of ACTIVIDAD_IDS) {
    const er = validarRango(p.bpm.porActividad?.[id])
    if (er) return `${id}: ${er}`
  }
  if (typeof p.bpm.usarPorActividad !== 'boolean') return 'usarPorActividad inválido'
  if (!['calculado', 'dispositivo'].includes(p.bpm.fuenteBpm)) return 'Fuente de BPM inválida'
  const a = p.alertas
  if (!a || !Number.isInteger(a.duracionMinMs) || a.duracionMinMs < 0 || a.duracionMinMs > 60000) return 'Duración mínima de alerta inválida'
  if (!Number.isInteger(a.histeresisBpm) || a.histeresisBpm < 0 || a.histeresisBpm > 20) return 'Histéresis inválida'
  if (typeof a.sonido !== 'boolean') return 'Opción de sonido inválida'
  const q = p.adquisicion
  if (!q || !Number.isInteger(q.watchdogMs) || q.watchdogMs < 500 || q.watchdogMs > 10000) return 'Watchdog inválido'
  if (!Number.isInteger(q.finTrasPerdidaMs) || q.finTrasPerdidaMs < q.watchdogMs || q.finTrasPerdidaMs > 120000) return 'Tiempo de fin por pérdida inválido'
  if (!Number.isInteger(q.ventanaVisualSeg) || q.ventanaVisualSeg < 3 || q.ventanaVisualSeg > 10) return 'Ventana visual inválida'
  return null
}

export function validarSincronizacion(s) {
  if (!s || typeof s !== 'object') return 'Estructura inválida'
  if (!SYNC_METODOS.includes(s.metodoPorDefecto)) return 'Método de sincronización inválido'
  if (typeof s.permitirCambioUsuario !== 'boolean') return 'Permiso inválido'
  if (!s.xcorr || !Number.isInteger(s.xcorr.maxLagMs) || s.xcorr.maxLagMs < 50 || s.xcorr.maxLagMs > 3000) return 'Retardo máximo inválido (50–3000 ms)'
  if (!['zscore', 'minmax'].includes(s.normalizacion)) return 'Normalización inválida'
  if (s.fsComparacion !== 250) return 'Frecuencia de comparación inválida'
  return null
}

export function validarRetencion(dias) {
  if (!Number.isInteger(dias) || dias < 1 || dias > RETENCION_MAX_DIAS) return `La retención debe ser un entero entre 1 y ${RETENCION_MAX_DIAS} días`
  return null
}
