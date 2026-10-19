import { classificationLine } from './csvExporter.js'
import { participantesVisibles, nombreMonitoreo, actividadPrincipal } from '@/services/monitoreos/catalog.js'
import { shortId } from '@/utils/ids.js'

/**
 * JSON seudonimizado de uno o varios monitoreos (portabilidad, SEC-43..47).
 * Incluye solo "Usuario N" (nunca alias ni datos opcionales); la nota solo si se pide.
 * @param {object} o
 * @param {object[]} o.sessions metadatos
 * @param {{usuarioId?:string|null, esAdmin?:boolean}} o.ctx control de acceso
 * @param {(id:string)=>string} o.etiquetaDe
 * @param {boolean} [o.incluirNotas=false]
 * @param {(sessionId:string, canal:number)=>Promise<{t:ArrayLike<number>,raw:ArrayLike<number>,lo:ArrayLike<number>,bpm:ArrayLike<number>,n:number}>} [o.cargarSenal] si se indica, se incluyen las muestras
 */
export async function monitoreosJson({ sessions, ctx, etiquetaDe, incluirNotas = false, cargarSenal = null, fecha = new Date() }) {
  const monitoreos = []
  for (const s of sessions) {
    const vis = participantesVisibles(s, ctx)
    if (!vis.length) continue
    const participantes = []
    for (const p of vis) {
      const item = {
        usuario: etiquetaDe(p.usuarioId) || 'Usuario eliminado',
        canal: p.canalNombre,
        fuente: p.fuente?.tipo ?? null,
        perfil: p.fuente?.perfilId ?? null,
        fs: p.fs,
        actividad: p.actividad,
        eventos: p.eventos,
        resumen: p.resumen,
        estadoFinal: p.estadoFinal,
      }
      if (cargarSenal) {
        const sig = await cargarSenal(s.id, p.canalIndex)
        item.muestras = {
          t_ms: Array.from(sig.t),
          ecg_raw: Array.from(sig.raw),
          leads_off: Array.from(sig.lo),
          bpm: Array.from(sig.bpm),
        }
      }
      participantes.push(item)
    }
    const m = {
      id: shortId(s.id),
      nombre: nombreMonitoreo(s),
      inicio: s.inicio,
      fin: s.fin,
      estado: s.estado,
      guardado: s.guardado !== false,
      actividadPrincipal: actividadPrincipal(s, vis),
      parametrosAplicados: s.parametrosAplicados,
      participantes,
    }
    if (incluirNotas && s.notas) m.notas = s.notas
    monitoreos.push(m)
  }
  return JSON.stringify(
    {
      clasificacion: 'CONFIDENCIAL-SENSIBLE - Datos de salud seudonimizados - Uso exclusivamente academico',
      exportado: fecha.toISOString(),
      aviso: 'No es un dispositivo medico. Uso educativo.',
      monitoreos,
    },
    null,
    2,
  )
}

export { classificationLine }
