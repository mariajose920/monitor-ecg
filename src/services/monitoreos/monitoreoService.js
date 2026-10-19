import { aplicarMetadatos, puedeEditar, puedeEliminar, validarMetadatos } from './catalog.js'
import { shortId } from '@/utils/ids.js'

/**
 * Casos de uso sobre monitoreos guardados: guardar, editar, descartar y eliminar
 * (almacenamiento local cifrado + réplica en la nube + auditoría sin datos personales).
 * Las dependencias se inyectan para poder probarlo sin IndexedDB ni Supabase.
 *
 * @param {object} deps
 * @param {{getSession:Function, saveSession:Function, deleteSession:Function}} deps.repo
 * @param {{pushSession:Function, deleteCloudSessions:Function}} deps.cloud
 * @param {Function} deps.audit (evento, actor, detalles)
 */
export function createMonitoreoService({ repo, cloud, audit }) {
  async function cargar(id) {
    const meta = await repo.getSession(id)
    if (!meta) throw new Error('El monitoreo no existe o ya fue eliminado.')
    return meta
  }

  /** Confirma un borrador: pide nombre, nota y actividad (validados). */
  async function guardar(id, datos, { actor = 'system', ctx = {} } = {}) {
    const meta = await cargar(id)
    if (meta.estado === 'activa') throw new Error('Detén el monitoreo antes de guardarlo.')
    if (!puedeEditar(meta, ctx)) throw new Error('No tienes acceso a este monitoreo.')
    const nuevo = aplicarMetadatos(meta, datos, { guardar: true })
    await repo.saveSession(nuevo)
    cloud.pushSession(nuevo)
    await audit('SESSION_SAVED', actor, { sesion: shortId(id), actividad: nuevo.actividadPrincipal ?? null })
    return nuevo
  }

  /** Edita nombre, nota y actividad de un monitoreo ya guardado. */
  async function actualizar(id, datos, { actor = 'system', ctx = {} } = {}) {
    const meta = await cargar(id)
    if (!puedeEditar(meta, ctx)) throw new Error('No tienes acceso a este monitoreo.')
    const nuevo = aplicarMetadatos(meta, datos)
    await repo.saveSession(nuevo)
    cloud.pushSession(nuevo)
    await audit('SESSION_UPDATED', actor, { sesion: shortId(id) })
    return nuevo
  }

  /** Descarta un borrador: borra sesión y bloques (local y nube). */
  async function descartar(id, { actor = 'system', ctx = {} } = {}) {
    const meta = await cargar(id)
    if (meta.guardado !== false && meta.estado !== 'activa') throw new Error('Solo se pueden descartar monitoreos sin guardar; usa Eliminar.')
    if (!puedeEditar(meta, ctx)) throw new Error('No tienes acceso a este monitoreo.')
    await repo.deleteSession(id)
    cloud.deleteCloudSessions([id])
    await audit('SESSION_DISCARDED', actor, { sesion: shortId(id) })
  }

  /**
   * Elimina definitivamente uno o varios monitoreos. Cada uno se valida por separado:
   * @returns {Promise<{eliminados:string[], rechazados:{id:string,motivo:string}[]}>}
   */
  async function eliminar(ids, { actor = 'system', ctx = {} } = {}) {
    const eliminados = []
    const rechazados = []
    for (const id of ids) {
      const meta = await repo.getSession(id)
      if (!meta) {
        rechazados.push({ id, motivo: 'no existe' })
        continue
      }
      if (!puedeEliminar(meta, ctx)) {
        rechazados.push({ id, motivo: 'incluye datos de otros usuarios (solo el administrador puede eliminarlo)' })
        continue
      }
      await repo.deleteSession(id)
      eliminados.push(id)
    }
    if (eliminados.length) {
      cloud.deleteCloudSessions(eliminados)
      for (const id of eliminados) await audit('SESSION_DELETED', actor, { sesion: shortId(id) })
    }
    return { eliminados, rechazados }
  }

  return { guardar, actualizar, descartar, eliminar, validar: validarMetadatos }
}
