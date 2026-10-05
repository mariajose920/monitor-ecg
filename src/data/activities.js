/**
 * Catálogo CERRADO de actividades (RF18, SEC-20: sin texto libre).
 * Combina la lista del documento ISO (reposo, caminata, movimiento, post-ejercicio)
 * con 'ejercicio' del documento de arquitectura.
 */
export const ACTIVIDADES = Object.freeze([
  { id: 'reposo', nombre: 'Reposo', icono: '🛋' },
  { id: 'caminata', nombre: 'Caminata', icono: '🚶' },
  { id: 'movimiento', nombre: 'Movimiento', icono: '↔' },
  { id: 'ejercicio', nombre: 'Ejercicio', icono: '🏃' },
  { id: 'post-ejercicio', nombre: 'Post-ejercicio (recuperación)', icono: '↘' },
])

export const ACTIVIDAD_IDS = ACTIVIDADES.map((a) => a.id)

export function nombreActividad(id) {
  return ACTIVIDADES.find((a) => a.id === id)?.nombre ?? id
}

/** Nivel de actividad física habitual (dato opcional RF03, lista cerrada). */
export const NIVELES_ACTIVIDAD = Object.freeze([
  { id: 'sedentario', nombre: 'Sedentario' },
  { id: 'moderado', nombre: 'Moderado' },
  { id: 'alto', nombre: 'Alto' },
])

/** Rangos de edad (SEC-20: minimización, sin edad exacta). */
export const RANGOS_EDAD = Object.freeze(['18-24', '25-34', '35-44', '45-54', '55-64', '65+'])
