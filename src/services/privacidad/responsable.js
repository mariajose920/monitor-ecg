/**
 * Responsable del tratamiento (C-02): configurable por quien despliega (variables VITE_RESPONSABLE_*), sin datos personales en el código.
 * Si no se configura, se muestra un texto honesto que lo indica (no se inventa un responsable).
 */
const env = import.meta.env ?? {}
const limpio = (v, max) => [...String(v ?? '')].filter((c) => c.charCodeAt(0) >= 32 && c !== '<' && c !== '>').join('').trim().slice(0, max)

export function leerResponsable(e = env) {
  const nombre = limpio(e.VITE_RESPONSABLE_NOMBRE, 120)
  const correo = limpio(e.VITE_RESPONSABLE_CORREO, 120)
  const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ? correo : ''
  return {
    nombre: nombre || 'Docente a cargo de la asignatura (responsable por definir)',
    correo: correoValido,
    configurado: !!nombre && !!correoValido,
  }
}

export const responsable = leerResponsable()
