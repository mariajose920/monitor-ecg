/**
 * Reglas del acceso excepcional y de la moderación (C-04, C-06). Lógica pura, probada con Vitest.
 * El servidor repite estas comprobaciones (admin_leer_sesion / admin_retirar_publicacion); aquí solo se evita enviar
 * peticiones que seguro serán rechazadas y se da un mensaje claro.
 */
export const MOTIVO_MIN = 10
export const MOTIVO_MAX = 300
export const REPORTE_MOTIVO_MIN = 3
export const REPORTE_MOTIVO_MAX = 200

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const esUuid = (v) => UUID.test(String(v ?? '').trim())

/** @returns {string|null} mensaje de error o null si el motivo es válido */
export function validarMotivoAcceso(motivo) {
  const m = String(motivo ?? '').trim()
  if (m.length < MOTIVO_MIN) return `Escribe un motivo de al menos ${MOTIVO_MIN} caracteres.`
  if (m.length > MOTIVO_MAX) return `El motivo admite como máximo ${MOTIVO_MAX} caracteres.`
  return null
}

/** @returns {string|null} mensaje de error o null (motivo del reporte de contenido de una cuenta común) */
export function validarMotivoReporte(motivo) {
  const m = String(motivo ?? '').trim()
  if (m.length < REPORTE_MOTIVO_MIN) return `Cuéntanos brevemente el motivo (mínimo ${REPORTE_MOTIVO_MIN} caracteres).`
  if (m.length > REPORTE_MOTIVO_MAX) return `El motivo admite como máximo ${REPORTE_MOTIVO_MAX} caracteres.`
  return null
}
