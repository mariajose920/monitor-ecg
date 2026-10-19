import { useUsersStore } from '@/stores/users.js'
import { useAuthStore } from '@/stores/auth.js'
import { useMonitoreosStore } from '@/stores/monitoreos.js'
import { buildSessionsCsv } from '@/services/export/sessionExport.js'
import { monitoreosJson } from '@/services/export/monitoreoExport.js'
import { exportFilename, downloadText, downloadBytes } from '@/services/export/csvExporter.js'
import { informeMonitoreoPdf, informeMonitoreoCsv } from '@/services/report/informes.js'
import { cargarYAnalizar, graficoParaInforme } from '@/services/monitoreos/senal.js'
import { participantesVisibles } from '@/services/monitoreos/catalog.js'
import { getChannelSignal } from '@/services/storage/sessionRepository.js'
import { filaHistorial, historialCsv, historialPdf, tendencia } from '@/services/report/historial.js'
import { renderizarGraficoJpeg } from '@/services/report/reportChart.js'
import { esUtilizable } from '@/services/monitoreos/catalog.js'
import { audit } from '@/services/audit/auditService.js'

/**
 * Exportaciones seudonimizadas de monitoreos (CSV, JSON, informe PDF e informe CSV).
 * El participante solo exporta lo suyo; el administrador sin usuario activo, todo (A.9.4.1, SEC-43).
 */
export function useExportMonitoreos() {
  const users = useUsersStore()
  const auth = useAuthStore()
  const monitoreos = useMonitoreosStore()

  const ctx = () => ({ usuarioId: users.activeUserId, esAdmin: auth.isAdmin })
  const etiquetaDe = (id) => users.byId(id)?.etiqueta ?? 'Usuario eliminado'
  const nombreBase = () => users.activeUser?.etiqueta ?? 'admin'

  function acceso(s) {
    const vis = participantesVisibles(s, ctx())
    if (!vis.length) throw new Error('No tienes acceso a este monitoreo.')
    return vis
  }

  async function csv(sessions) {
    sessions.forEach(acceso)
    const c = ctx()
    const { csv: texto, filas } = await buildSessionsCsv({ sessions, usuarioId: c.esAdmin && !c.usuarioId ? null : c.usuarioId, userById: users.byId })
    downloadText(texto, exportFilename(nombreBase()))
    await audit('EXPORT_CSV', monitoreos.actor(), { scope: sessions.length > 1 ? 'seleccion' : 'propia', rows: filas, sesiones: sessions.length, pseudonymized: true })
  }

  async function json(sessions, { incluirMuestras = false, incluirNotas = false } = {}) {
    sessions.forEach(acceso)
    const texto = await monitoreosJson({
      sessions,
      ctx: ctx(),
      etiquetaDe,
      incluirNotas,
      cargarSenal: incluirMuestras ? getChannelSignal : null,
    })
    downloadText(texto, exportFilename(nombreBase(), new Date(), { prefijo: 'monitoreos', ext: 'json' }), 'application/json;charset=utf-8')
    await audit('EXPORT_REPORT', monitoreos.actor(), { tipo: 'json', sesiones: sessions.length, muestras: incluirMuestras, pseudonymized: true })
  }

  async function informe(sesion, participante, { formato = 'pdf', incluirNotas = false } = {}) {
    acceso(sesion)
    const { sig, analisis } = await cargarYAnalizar(sesion, participante)
    const generadoEn = new Date()
    const base = { sesion, participante, etiqueta: etiquetaDe(participante.usuarioId), analisis, generadoEn, incluirNotas }
    if (formato === 'pdf') {
      let grafico = null
      try {
        grafico = graficoParaInforme(sig, analisis)
      } catch {
        grafico = null // sin canvas: el informe sale sin imagen
      }
      downloadBytes(informeMonitoreoPdf({ ...base, grafico }), exportFilename(etiquetaDe(participante.usuarioId), generadoEn, { prefijo: 'informe', ext: 'pdf' }))
    } else {
      downloadText(informeMonitoreoCsv(base), exportFilename(etiquetaDe(participante.usuarioId), generadoEn, { prefijo: 'informe', ext: 'csv' }))
    }
    await audit('EXPORT_REPORT', monitoreos.actor(), { tipo: formato === 'pdf' ? 'informe-pdf' : 'informe-csv', sesion: String(sesion.id).slice(0, 8), pseudonymized: true })
  }

  /**
   * Historial de frecuencias cardíacas de un usuario (o de todos, solo admin).
   * @param {{usuarioId?:string|null, formato?:'csv'|'pdf', onProgreso?:(n:number,total:number)=>void}} o
   */
  async function historial({ usuarioId = null, formato = 'csv', onProgreso = () => {} } = {}) {
    const c = ctx()
    if (!c.esAdmin && (!usuarioId || usuarioId !== c.usuarioId)) throw new Error('Solo puedes descargar tu propio historial.')
    await monitoreos.refrescar()
    const items = []
    for (const s of monitoreos.todos.filter(esUtilizable)) {
      for (const p of s.participantes ?? []) if (!usuarioId || p.usuarioId === usuarioId) items.push({ s, p })
    }
    const filas = []
    let n = 0
    for (const { s, p } of items) {
      onProgreso(++n, items.length)
      let analisis = null
      try {
        analisis = (await cargarYAnalizar(s, p, { maxSeconds: 600 })).analisis
      } catch {
        analisis = null // sin señal legible: se conserva el resumen
      }
      filas.push(filaHistorial({ sesion: s, participante: p, etiqueta: etiquetaDe(p.usuarioId), analisis }))
    }
    const generadoEn = new Date()
    const alcance = usuarioId ? etiquetaDe(usuarioId) : 'Todos los usuarios'
    const nombre = usuarioId ? etiquetaDe(usuarioId) : 'todos'
    if (formato === 'pdf') {
      let grafico = null
      try {
        const t = tendencia(filas)
        if (t.x.length) {
          grafico = renderizarGraficoJpeg({
            series: [
              { x: t.x, y: t.max, color: '#c62837', etiqueta: 'BPM máx.' },
              { x: t.x, y: t.medio, color: '#0b7a4c', etiqueta: 'BPM medio' },
              { x: t.x, y: t.min, color: '#1f6fd1', etiqueta: 'BPM mín.' },
            ],
            etiquetaY: 'BPM',
            etiquetaX: 'Monitoreo (orden cronológico)',
          })
        }
      } catch {
        grafico = null
      }
      downloadBytes(historialPdf({ filas, grafico, generadoEn, alcance }), exportFilename(nombre, generadoEn, { prefijo: 'historial', ext: 'pdf' }))
    } else {
      downloadText(historialCsv({ filas, generadoEn }), exportFilename(nombre, generadoEn, { prefijo: 'historial', ext: 'csv' }))
    }
    await audit('EXPORT_REPORT', monitoreos.actor(), { tipo: formato === 'pdf' ? 'historial-pdf' : 'historial-csv', alcance: usuarioId ? 'usuario' : 'todos', monitoreos: filas.length, pseudonymized: true })
    return filas.length
  }

  return { csv, json, informe, historial }
}
