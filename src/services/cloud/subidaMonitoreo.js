import { getChunks, getSession, saveSession, listSessions } from '@/services/storage/sessionRepository.js'
import { loadUsers } from '@/services/storage/userRepository.js'
import { nubeDatosActiva, pushSession, upsertSesion, upsertPaciente, subirBloquesConReintento, mensajeErrorNube } from './cloudSync.js'
import { puedeSubirPaciente } from './datosNube.js'
import { notify } from '@/services/notifications/notifier.js'

/**
 * Subida de un monitoreo GUARDADO a la nube (C-03). Los borradores nunca llegan aquí: solo "Guardar monitoreo" (y
 * "Subir lo ya guardado" al activar la nube) disparan la subida. Orden: pacientes (con declaración de mayoría de edad)
 * → sesión como PRIVADA → bloques de señal → estado final (público si corresponde). Así un fallo a mitad de camino
 * nunca deja publicada una señal incompleta. Al terminar se marca \`enNube\` en la copia local.
 */
const enCurso = new Map()

const soloPrivada = (meta) => {
  const m = { ...meta, visibilidad: 'privado', compartirPerfil: false }
  delete m.perfilCompartido
  delete m.consentPublicacion
  return m
}

/** @returns {Promise<{estado:'omitido'|'meta'|'subido'|'sin-declaracion', paciente?:string, bloques?:number}>} */
export async function sincronizarMonitoreo(meta, { progreso = () => {} } = {}) {
  if (!nubeDatosActiva() || meta.guardado === false || meta.estado !== 'finalizada') return { estado: 'omitido' }
  if (enCurso.has(meta.id)) return enCurso.get(meta.id)
  const trabajo = (async () => {
    if (meta.enNube) {
      await pushSession(meta, true)
      return { estado: 'meta' }
    }
    const usuarios = await loadUsers()
    const ids = [...new Set((meta.participantes ?? []).map((p) => p.usuarioId))]
    const pacientes = ids.map((id) => usuarios.find((u) => u.id === id))
    const sin = pacientes.findIndex((u) => !puedeSubirPaciente(u))
    if (sin >= 0) return { estado: 'sin-declaracion', paciente: pacientes[sin]?.etiqueta ?? 'el paciente' }

    for (const u of pacientes) await upsertPaciente(u)
    await upsertSesion(soloPrivada(meta))

    const lotes = []
    for (const p of meta.participantes ?? []) lotes.push([p.canalIndex, await getChunks(meta.id, p.canalIndex)])
    const total = lotes.reduce((a, [, c]) => a + c.length, 0)
    let hechos = 0
    for (const [canal, chunks] of lotes) {
      for (const c of chunks) {
        await subirBloquesConReintento(meta.id, canal, c)
        progreso(++hechos, total)
      }
    }
    await upsertSesion(meta)
    const actual = await getSession(meta.id)
    if (actual) await saveSession({ ...actual, enNube: true })
    return { estado: 'subido', bloques: total }
  })().finally(() => enCurso.delete(meta.id))
  enCurso.set(meta.id, trabajo)
  return trabajo
}

/** Igual, pero sin lanzar: avisa a la persona del resultado. Para llamarlo "sin esperar" desde el flujo de guardado. */
export async function sincronizarMonitoreoConAviso(meta) {
  try {
    const r = await sincronizarMonitoreo(meta)
    if (r.estado === 'subido') notify('Monitoreo guardado también en tu nube.', { tipo: 'ok', duracionMs: 3500 })
    else if (r.estado === 'sin-declaracion') {
      notify(`No se subió a la nube: falta la declaración de mayoría de edad de ${r.paciente} (Pacientes → Ver → Declarar). Sigue guardado en este dispositivo.`, { tipo: 'aviso', duracionMs: 9000 })
    }
    return r
  } catch (e) {
    notify(`${mensajeErrorNube(e)} El monitoreo sigue guardado en este dispositivo; puedes reintentar en Mi cuenta → "Subir lo ya guardado".`, { tipo: 'aviso', duracionMs: 9000 })
    return { estado: 'error' }
  }
}

/** Sube todo lo ya guardado (al activar la nube) o reintenta lo que falló. @returns {{subidos:number, fallidos:number, sinDeclaracion:number}} */
export async function subirTodoGuardado(onProgreso = () => {}) {
  const todos = (await listSessions()).filter((s) => s.guardado !== false && s.estado === 'finalizada')
  let subidos = 0
  let fallidos = 0
  let sinDeclaracion = 0
  let i = 0
  for (const s of todos) {
    onProgreso(++i, todos.length)
    try {
      const r = await sincronizarMonitoreo(s)
      if (r.estado === 'sin-declaracion') sinDeclaracion++
      else if (r.estado === 'subido' || r.estado === 'meta') subidos++
    } catch {
      fallidos++
    }
  }
  return { subidos, fallidos, sinDeclaracion }
}

/** Tras borrar los datos de la nube: nada de lo local está ya en la nube (y por tanto nada sigue publicado). */
export async function marcarTodoFueraDeNube() {
  for (const s of await listSessions()) {
    if (s.enNube || s.visibilidad === 'publico') await saveSession({ ...soloPrivada(s), enNube: false })
  }
}
