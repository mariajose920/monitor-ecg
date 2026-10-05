import { ref } from 'vue'
import { supabase, cloudEnabled } from './supabaseClient.js'

/**
 * Sincronización con Supabase. Lo local (IndexedDB cifrado) sigue siendo la fuente principal:
 * la nube es una copia. Todas las escrituras van en una cola serie para respetar el orden
 * sesión → bloques (clave foránea) y los fallos nunca interrumpen la medición.
 */
export { cloudEnabled }
export const cloudEstado = ref(cloudEnabled ? 'desconectado' : 'deshabilitado') // | 'conectado' | 'error'
export const cloudAdmin = ref(false)

let cola = Promise.resolve()
function encolar(fn) {
  cola = cola.then(fn).catch(() => {
    cloudEstado.value = 'error'
  })
  return cola
}

/** Garantiza una sesión de Supabase: anónima para participantes (RF02, sin contraseña). */
export async function ensureCloudSession() {
  if (!cloudEnabled) return false
  const { data } = await supabase.auth.getSession()
  if (!data.session) {
    const { error } = await supabase.auth.signInAnonymously()
    if (error) {
      cloudEstado.value = 'error'
      return false
    }
  }
  cloudEstado.value = 'conectado'
  await refrescarAdmin()
  return true
}

async function refrescarAdmin() {
  const { data, error } = await supabase.rpc('es_admin')
  cloudAdmin.value = !error && data === true
}

function sinError({ error }) {
  if (error) throw error
}

/** Sube/actualiza los metadatos de una sesión (participantes seudonimizados). */
export function pushSession(meta) {
  if (!cloudEnabled) return Promise.resolve()
  return encolar(async () => {
    if (!(await ensureCloudSession())) return
    sinError(await supabase.from('sesiones').upsert({
      id: meta.id,
      inicio: meta.inicio,
      fin: meta.fin,
      estado: meta.estado,
      motivo_fin: meta.motivoFin,
      datos: { participantes: meta.participantes, parametrosAplicados: meta.parametrosAplicados, notas: meta.notas },
      actualizado_en: new Date().toISOString(),
    }))
  })
}

/** Sube un bloque de ~2 s de muestras. */
export function pushChunk(sessionId, canal, chunk) {
  if (!cloudEnabled) return Promise.resolve()
  return encolar(async () => {
    sinError(await supabase.from('bloques_muestras').upsert({
      sesion_id: sessionId,
      canal,
      seq: chunk.seq,
      t: Array.from(chunk.t),
      ecg_raw: Array.from(chunk.raw),
      leads_off: Array.from(chunk.lo),
      bpm: chunk.bpm ? Array.from(chunk.bpm) : null,
    }))
  })
}

/** Borra en la nube las sesiones indicadas (derecho de supresión, SEC-30/31). */
export function deleteCloudSessions(ids) {
  if (!cloudEnabled || !ids.length) return Promise.resolve()
  return encolar(async () => {
    if (!(await ensureCloudSession())) return
    sinError(await supabase.from('sesiones').delete().in('id', ids))
  })
}

/** Borra los bloques de un canal de una sesión (cuando un participante elimina sus datos). */
export function deleteCloudChunks(sessionId, canal) {
  if (!cloudEnabled) return Promise.resolve()
  return encolar(async () => {
    if (!(await ensureCloudSession())) return
    sinError(await supabase.from('bloques_muestras').delete().eq('sesion_id', sessionId).eq('canal', canal))
  })
}

/** Réplica de auditoría (8.15). Los detalles ya vienen saneados por el auditLog local. */
export function pushAudit(tipo, actor, detalle) {
  if (!cloudEnabled) return Promise.resolve()
  const actorTipo = actor === 'admin' ? 'admin' : String(actor).startsWith('participant') ? 'participant' : 'system'
  return encolar(async () => {
    if (!(await ensureCloudSession())) return
    const { data } = await supabase.auth.getUser()
    sinError(await supabase.from('auditoria').insert({ tipo, actor: actorTipo, detalle: detalle ?? {}, usuario: data.user?.id }))
  })
}

/** Parámetros globales definidos por el administrador (RF15, RF26, RF27). */
export async function fetchCloudParametros() {
  if (!(await ensureCloudSession())) return null
  const { data, error } = await supabase.from('parametros').select('parametros, sincronizacion').eq('id', 1).maybeSingle()
  if (error) throw error
  return data
}

export async function pushCloudParametros({ parametros, sincronizacion }) {
  if (!cloudEnabled || !cloudAdmin.value) return false
  const { data } = await supabase.auth.getUser()
  const fila = { id: 1, actualizado_en: new Date().toISOString(), actualizado_por: data.user?.id }
  if (parametros) fila.parametros = parametros
  if (sincronizacion) fila.sincronizacion = sincronizacion
  if (!fila.parametros) {
    const actual = await fetchCloudParametros()
    fila.parametros = actual?.parametros ?? parametros
    if (!fila.parametros) return false
  }
  sinError(await supabase.from('parametros').upsert(fila))
  return true
}

/** Inicio de sesión del administrador en la nube (autenticación real en el servidor, 8.5). */
export async function cloudAdminLogin(email, password) {
  if (!cloudEnabled) throw new Error('La nube no está configurada.')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error('Credenciales de la nube inválidas.')
  await refrescarAdmin()
  if (!cloudAdmin.value) {
    await cloudAdminLogout()
    throw new Error('Esta cuenta no figura como administradora en la base de datos.')
  }
}

/** Vuelve a una sesión anónima de participante. */
export async function cloudAdminLogout() {
  if (!cloudEnabled) return
  await supabase.auth.signOut()
  cloudAdmin.value = false
  await ensureCloudSession()
}
