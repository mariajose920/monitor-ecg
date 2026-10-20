import { getChannelSignal } from '@/services/storage/sessionRepository.js'
import { fetchSenalNube } from '@/services/cloud/cloudSync.js'

/**
 * Origen de la señal: los monitoreos de la comunidad (públicos, solo lectura) se leen de la nube;
 * los propios, del almacenamiento local cifrado.
 */
const comunitarios = new Set()

export function registrarComunitarios(ids) {
  comunitarios.clear()
  for (const id of ids) comunitarios.add(id)
}

export const esComunitario = (id) => comunitarios.has(id)

export function obtenerSenal(sesionId, canal) {
  return comunitarios.has(sesionId) ? fetchSenalNube(sesionId, canal, { publica: true }) : getChannelSignal(sesionId, canal)
}
