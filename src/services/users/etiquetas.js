/**
 * Etiquetas de paciente ("Paciente N"). Lógica pura (probada en tests/etiquetas.spec.js).
 * C-21 / H-23: antes las expresiones regulares carecían de la barra invertida (`d+` en lugar de `\d+`), de modo que
 * los pacientes bajados de la nube recibían numero 0 y el siguiente se creaba como "Paciente 1" (etiqueta duplicada).
 */

/** Número final de una etiqueta ("Paciente 7" -> 7). Sin número válido devuelve 0. */
export function numeroDeEtiqueta(etiqueta) {
  const m = /(\d+)$/.exec(String(etiqueta ?? ''))
  return m ? Number(m[1]) : 0
}

/** Los seudónimos antiguos "Usuario N" se muestran como "Paciente N". */
export function normalizarEtiquetaLegada(u) {
  return /^Usuario \d+$/.test(u?.etiqueta ?? '') ? { ...u, etiqueta: u.etiqueta.replace('Usuario', 'Paciente') } : u
}

/** Etiqueta para un número. */
export const etiquetaDe = (numero) => `Paciente ${numero}`

/** Siguiente número libre dado el contador persistido y los pacientes existentes (ninguno repetido). */
export function siguienteNumero(contador, pacientes) {
  const max = (pacientes ?? []).reduce((m, p) => Math.max(m, Number(p?.numero) || numeroDeEtiqueta(p?.etiqueta)), 0)
  return Math.max(Number(contador) || 0, max) + 1
}
