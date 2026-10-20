import { aplicarMetadatos, puedeEditar, puedeEliminar, validarMetadatos } from './catalog.js'
import { shortId } from '@/utils/ids.js'
import { validarVisibilidad, visibilidadDe, perfilPublicable } from './visibilidad.js'
import { crearConsentimientoPublicacion, publicacionVigente } from '@/services/privacidad/consentimiento.js'

/**
 * Casos de uso sobre monitoreos guardados: guardar, editar, descartar y eliminar
 * (almacenamiento local cifrado + réplica en la nube + auditoría sin datos personales).
 * Las dependencias se inyectan para poder probarlo sin IndexedDB ni Supabase.
 *
 * @param {object} deps
 * @param {{getSession:Function, saveSession:Function, deleteSession:Function}} deps.repo
 * @param {{sincronizarMonitoreo:Function, deleteCloudSessions:Function}} deps.cloud  sincronizarMonitoreo sube un monitoreo GUARDADO (solo con la nube activada)
 * @param {Function} deps.audit (evento, actor, detalles)
 */
/**
 * Aplica la elección de visibilidad (si viene en datos). Publicar exige cuenta, consentimiento explícito y,
 * para incluir datos del paciente, una segunda casilla. Privado borra cualquier copia del perfil.
 */
export function aplicarVisibilidad(meta, datos, { cuenta = false, perfilDe = null, cuentaId = null, nube = true, declarados = null } = {}) {
  if (!datos || datos.visibilidad === undefined) return meta
  if (datos.visibilidad === 'publico' && !cuenta) throw new Error('Para publicar un monitoreo necesitas iniciar sesión con una cuenta.')
  if (datos.visibilidad === 'publico' && declarados && !declarados(meta)) throw new Error('Para publicar, declara antes la mayoría de edad de la persona medida (Pacientes → Ver → Declarar).')
  if (datos.visibilidad === 'publico' && !nube) throw new Error('Para publicar un monitoreo activa antes "Guardar mis datos en la nube" en Mi cuenta.')
  const perfil = perfilDe ? perfilPublicable(perfilDe(meta)) : null
  const v = validarVisibilidad({ ...datos, tienePerfil: perfil !== null })
  if (!v.ok) throw new Error(Object.values(v.errores)[0])
  const out = { ...meta, visibilidad: v.valores.visibilidad, compartirPerfil: v.valores.compartirPerfil }
  if (v.valores.compartirPerfil) out.perfilCompartido = perfil
  else delete out.perfilCompartido
  // C-04/C-02: consentimiento de publicación POR MONITOREO (versión y fecha); el servidor lo exige para aceptar 'publico'.
  if (out.visibilidad === 'publico') {
    if (!publicacionVigente(meta.consentPublicacion)) out.consentPublicacion = crearConsentimientoPublicacion({ por: cuentaId })
  } else delete out.consentPublicacion
  return out
}

export function createMonitoreoService({ repo, cloud, audit }) {
  async function cargar(id) {
    const meta = await repo.getSession(id)
    if (!meta) throw new Error('El monitoreo no existe o ya fue eliminado.')
    return meta
  }

  /** Confirma un borrador: pide nombre, nota y actividad (validados). */
  async function guardar(id, datos, { actor = 'system', ctx = {}, cuenta = false, perfilDe = null } = {}) {
    const meta = await cargar(id)
    if (meta.estado === 'activa') throw new Error('Detén el monitoreo antes de guardarlo.')
    if (!puedeEditar(meta, ctx)) throw new Error('No tienes acceso a este monitoreo.')
    const nuevo = aplicarVisibilidad(aplicarMetadatos(meta, datos, { guardar: true }), datos, { cuenta, perfilDe })
    await repo.saveSession(nuevo)
    cloud.sincronizarMonitoreo(nuevo) // sin esperar: solo si la nube está activada; un borrador NUNCA llega aquí
    await audit('SESSION_SAVED', actor, { sesion: shortId(id), actividad: nuevo.actividadPrincipal ?? null })
    if (visibilidadDe(nuevo) !== visibilidadDe(meta)) await audit('VISIBILITY_CHANGED', actor, { sesion: shortId(id), visibilidad: visibilidadDe(nuevo) })
    return nuevo
  }

  /** Edita nombre, nota y actividad de un monitoreo ya guardado. */
  async function actualizar(id, datos, { actor = 'system', ctx = {}, cuenta = false, perfilDe = null } = {}) {
    const meta = await cargar(id)
    if (!puedeEditar(meta, ctx)) throw new Error('No tienes acceso a este monitoreo.')
    const nuevo = aplicarVisibilidad(aplicarMetadatos(meta, datos), datos, { cuenta, perfilDe })
    await repo.saveSession(nuevo)
    cloud.sincronizarMonitoreo(nuevo)
    await audit('SESSION_UPDATED', actor, { sesion: shortId(id) })
    if (visibilidadDe(nuevo) !== visibilidadDe(meta)) await audit('VISIBILITY_CHANGED', actor, { sesion: shortId(id), visibilidad: visibilidadDe(nuevo) })
    return nuevo
  }

  /** Cambia solo la visibilidad (detalle y lista). Volver a privado es inmediato y queda registrado. */
  async function cambiarVisibilidad(id, datos, { actor = 'system', ctx = {}, cuenta = false, perfilDe = null } = {}) {
    const meta = await cargar(id)
    if (meta.estado === 'activa' || meta.guardado === false) throw new Error('Guarda el monitoreo antes de cambiar su visibilidad.')
    if (!puedeEditar(meta, ctx)) throw new Error('No tienes acceso a este monitoreo.')
    const nuevo = aplicarVisibilidad(meta, datos, { cuenta, perfilDe })
    await repo.saveSession(nuevo)
    cloud.sincronizarMonitoreo(nuevo)
    if (visibilidadDe(nuevo) !== visibilidadDe(meta) || nuevo.compartirPerfil !== meta.compartirPerfil) {
      await audit('VISIBILITY_CHANGED', actor, { sesion: shortId(id), visibilidad: visibilidadDe(nuevo), perfil: nuevo.compartirPerfil === true })
    }
    return nuevo
  }

  /** Descarta un borrador: borra sesión y bloques locales (un borrador nunca se sube; no hay nada que borrar en la nube). */
  async function descartar(id, { actor = 'system', ctx = {} } = {}) {
    const meta = await cargar(id)
    if (meta.guardado !== false && meta.estado !== 'activa') throw new Error('Solo se pueden descartar monitoreos sin guardar; usa Eliminar.')
    if (!puedeEditar(meta, ctx)) throw new Error('No tienes acceso a este monitoreo.')
    await repo.deleteSession(id)
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

  return { guardar, actualizar, cambiarVisibilidad, descartar, eliminar, validar: validarMetadatos }
}
