import { getChannelSignal } from '@/services/storage/sessionRepository.js'
import { participantRows, buildCsv } from './csvExporter.js'
import { CONSENT_VERSION } from '@/stores/users.js'

/**
 * Construye el CSV de una o varias sesiones.
 * @param {object} o
 * @param {object[]} o.sessions metadatos
 * @param {string|null} o.usuarioId si se indica, solo las filas de ese participante (SEC-43)
 * @param {(id:string)=>object|null} o.userById
 * @param {boolean} [o.includeOptional=false] solo admin y con consentimiento (SEC-44)
 * @returns {Promise<{csv:string, filas:number}>}
 */
export async function buildSessionsCsv({ sessions, usuarioId = null, userById, includeOptional = false }) {
  const rows = []
  for (const s of sessions) {
    for (const p of s.participantes) {
      if (usuarioId && p.usuarioId !== usuarioId) continue
      const u = userById(p.usuarioId)
      const etiqueta = u?.etiqueta ?? 'Usuario eliminado'
      const signal = await getChannelSignal(s.id, p.canalIndex)
      let opcionales = null
      if (includeOptional) {
        const consiente = u?.consentimiento?.consentVersion === CONSENT_VERSION
        opcionales = consiente && u.perfil ? { rangoEdad: u.perfil.rangoEdad, pesoKg: u.perfil.pesoKg } : { rangoEdad: '', pesoKg: '' }
      }
      rows.push(...participantRows({ session: s, participante: p, signal, etiqueta, opcionales }))
    }
  }
  return { csv: buildCsv(rows, { includeOptional }), filas: rows.length }
}
