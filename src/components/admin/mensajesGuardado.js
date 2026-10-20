import { cloudEnabled } from '@/services/cloud/cloudSync.js'

/** Texto de confirmación al guardar parámetros: indica si además se publicaron en la nube. */
export function mensajeGuardado(base, resultado) {
  if (!cloudEnabled) return `${base}.`
  return resultado?.publicado
    ? `${base} y publicados en la nube.`
    : `${base}. No se pudo publicar en la nube: usa "Publicar configuración" en la pestaña Nube.`
}
