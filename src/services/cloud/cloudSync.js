import { ref } from 'vue'
import { supabase, cloudEnabled } from './supabaseClient.js'
import { createRateLimiter, CLIENT_LIMITS } from '@/utils/rateLimiter.js'
import { camposVisibilidadNube, mapearMonitoreoPublico } from '@/services/monitoreos/visibilidad.js'

/**
 * Sincronización con Supabase. Lo local (IndexedDB cifrado) sigue siendo la fuente principal:
 * la nube es una copia. Todas las escrituras van en una cola serie para respetar el orden
 * sesión → bloques (clave foránea) y los fallos nunca interrumpen la medición.
 */
export { cloudEnabled }
export const cloudEstado = ref(cloudEnabled ? 'desconectado' : 'deshabilitado') // | 'conectado' | 'error'
export const cloudAdmin = ref(false)

// Límites de tasa del cliente (SUG-04/SUG-05): defensa en profundidad frente a bucles o abuso;
// el control efectivo está en los triggers de cuota del servidor (supabase/schema.sql).
const limites = Object.fromEntries(Object.entries(CLIENT_LIMITS).map(([k, v]) => [k, createRateLimiter(v)]))
const sesionesConocidas = new Set()
export const cloudDescartes = ref(0)
function permitir(tipo) {
  if (limites[tipo].tryAcquire()) return true
  cloudDescartes.value++
  return false
}

let cola = Promise.resolve()
function encolar(fn) {
  cola = cola.then(fn).catch(() => {
    cloudEstado.value = 'error'
  })
  return cola
}

/**
 * Hay sincronización SOLO con una cuenta real (correo + contraseña). Ya no se usan sesiones anónimas:
 * sin cuenta no se sube nada a la nube (A.9.4.1, A.18.1.4).
 */
export const cloudCuenta = ref(null) // { id, email } | null
export async function ensureCloudSession() {
  if (!cloudEnabled) return false
  try {
    const { data } = await supabase.auth.getSession()
    const user = data.session?.user
    if (!user || user.is_anonymous) {
      cloudEstado.value = 'desconectado'
      cloudCuenta.value = null
      return false
    }
    cloudCuenta.value = { id: user.id, email: user.email ?? '' }
    cloudEstado.value = 'conectado'
    await refrescarAdmin()
    return true
  } catch {
    cloudEstado.value = 'error'
    return false
  }
}

async function refrescarAdmin() {
  const { data, error } = await supabase.rpc('es_admin')
  cloudAdmin.value = !error && data === true
}

function sinError({ error }) {
  if (error) throw error
}

/** Sube/actualiza los metadatos de una sesión (participantes seudonimizados). */
export function pushSession(meta, forzar = false) {
  if (!cloudEnabled) return Promise.resolve()
  const nueva = !sesionesConocidas.has(meta.id)
  if (nueva && !forzar && !permitir('session')) return Promise.resolve()
  sesionesConocidas.add(meta.id)
  return encolar(async () => {
    if (!(await ensureCloudSession())) return
    const vis = camposVisibilidadNube(meta)
    const pacienteId = meta.participantes?.[0]?.usuarioId ?? null
    sinError(await supabase.from('sesiones').upsert({
      id: meta.id,
      paciente_id: pacienteId,
      visibilidad: vis.visibilidad,
      compartir_perfil: vis.compartir_perfil,
      inicio: meta.inicio,
      fin: meta.fin,
      estado: meta.estado,
      motivo_fin: meta.motivoFin,
      datos: {
        participantes: meta.participantes,
        parametrosAplicados: meta.parametrosAplicados,
        notas: meta.notas,
        nombre: meta.nombre ?? null,
        guardado: meta.guardado !== false,
        actividadPrincipal: meta.actividadPrincipal ?? null,
        ...(vis.perfilCompartido ? { perfilCompartido: vis.perfilCompartido } : {}),
      },
      actualizado_en: new Date().toISOString(),
    }))
  })
}

/** Sube un bloque de ~2 s de muestras. */
export function pushChunk(sessionId, canal, chunk) {
  if (!cloudEnabled || !permitir('chunk')) return Promise.resolve()
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

/**
 * SUG-06 / A.18.1.4: supresión de TODOS los datos del usuario actual en la nube (sesiones, bloques
 * en cascada e incidentes que reportó). Usa la función borrar_mis_datos() del servidor; si aún no
 * existe (schema.sql antiguo), borra las sesiones propias filtrando por propietario (nunca las de otros,
 * aunque la sesión sea de administrador). @returns {Promise<{sesiones:number, incidentes:number}|null>}
 */
export async function deleteAllMyCloudData() {
  if (!cloudEnabled) return null
  await cola.catch(() => {})
  if (!(await ensureCloudSession())) throw new Error('No hay conexión con la nube.')
  const { data, error } = await supabase.rpc('borrar_mis_datos')
  if (!error && data) return { sesiones: Number(data.sesiones ?? 0), incidentes: Number(data.incidentes ?? 0), pacientes: Number(data.pacientes ?? 0) }
  const { data: u } = await supabase.auth.getUser()
  if (!u?.user?.id) throw new Error('No hay usuario de la nube.')
  const r = await supabase.from('sesiones').delete({ count: 'exact' }).eq('propietario', u.user.id)
  sinError(r)
  sesionesConocidas.clear()
  return { sesiones: r.count ?? 0, incidentes: 0 }
}

/** Borra los bloques de un canal de una sesión (cuando un participante elimina sus datos). */
export function deleteCloudChunks(sessionId, canal) {
  if (!cloudEnabled) return Promise.resolve()
  return encolar(async () => {
    if (!(await ensureCloudSession())) return
    sinError(await supabase.from('bloques_muestras').delete().eq('sesion_id', sessionId).eq('canal', canal))
  })
}

/** Réplica de auditoría (A.12.4.1). Los detalles ya vienen saneados por el auditLog local. */
export function pushAudit(tipo, actor, detalle) {
  if (!cloudEnabled || !permitir('audit')) return Promise.resolve()
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

/** Inicio de sesión del administrador en la nube (autenticación real en el servidor, A.9.4.2). */
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

/** Deja de actuar como administrador en la app (la sesión de la cuenta no se cierra aquí). */
export async function cloudAdminLogout() {
  cloudAdmin.value = false
}

/** Réplica de una notificación de incidente o debilidad (A.16.1.2 / A.16.1.3). Sin datos de salud. */
export function pushIncident(inc) {
  if (!cloudEnabled || !permitir('incident')) return Promise.resolve()
  return encolar(async () => {
    if (!(await ensureCloudSession())) return
    sinError(await supabase.from('incidentes').upsert({
      id: inc.id,
      creado_en: inc.creadoUtc,
      actualizado_en: inc.actualizadoUtc,
      tipo: inc.tipo,
      severidad: inc.severidad,
      descripcion: inc.descripcion,
      reportado_por: inc.reportadoPor,
      estado: inc.estado,
      respuesta: inc.respuesta || null,
      leccion: inc.leccion || null,
    }))
  })
}

/** Hora del servidor (fuente única acordada para la sincronización del reloj, A.12.4.4). */
export async function fetchServerTime() {
  if (!(await ensureCloudSession())) return null
  const { data, error } = await supabase.rpc('hora_servidor')
  if (error) return null
  return typeof data === 'string' ? data : null
}

// ---------------------------------------------------------------------------------------------
// Pacientes (propiedad de la cuenta, RLS: solo el propietario) y lectura de monitoreos públicos.
// ---------------------------------------------------------------------------------------------

const filaPaciente = (u) => ({
  id: u.id,
  etiqueta: u.etiqueta,
  alias: u.alias ?? null,
  perfil: u.consentimiento ? (u.perfil ?? null) : null,
  consentimiento: u.consentimiento ?? null,
  creado_en: u.creadoEn,
  actualizado_en: u.actualizadoEn,
})

export function pushPaciente(u) {
  if (!cloudEnabled) return Promise.resolve()
  return encolar(async () => {
    if (!(await ensureCloudSession())) return
    sinError(await supabase.from('pacientes').upsert(filaPaciente(u)))
  })
}

export function deletePaciente(id) {
  if (!cloudEnabled) return Promise.resolve()
  return encolar(async () => {
    if (!(await ensureCloudSession())) return
    sinError(await supabase.from('pacientes').delete().eq('id', id))
  })
}

/** Pacientes de la cuenta (formato local). */
export async function fetchPacientes() {
  if (!(await ensureCloudSession())) return []
  const { data, error } = await supabase.from('pacientes').select('*').order('creado_en')
  if (error) throw error
  return (data ?? []).map((f) => ({
    id: f.id,
    numero: Number(/(d+)$/.exec(f.etiqueta)?.[1] ?? 0),
    etiqueta: f.etiqueta,
    alias: f.alias,
    perfil: f.perfil,
    consentimiento: f.consentimiento,
    creadoEn: f.creado_en,
    actualizadoEn: f.actualizado_en,
  }))
}

/** Lista de monitoreos públicos (solo lectura, vista segura). */
export async function fetchPublicos({ limite = 60 } = {}) {
  if (!(await ensureCloudSession())) throw new Error('Inicia sesión para ver los monitoreos de la comunidad.')
  const { data, error } = await supabase.from('monitoreos_publicos').select('*').order('inicio', { ascending: false }).limit(limite)
  if (error) throw error
  return (data ?? []).map(mapearMonitoreoPublico)
}

/** Señal de un canal de un monitoreo (propio o público) desde la nube, en el formato de getChannelSignal. */
export async function fetchSenalNube(sesionId, canal) {
  if (!(await ensureCloudSession())) throw new Error('Inicia sesión para ver este monitoreo.')
  const filas = []
  for (let desde = 0; ; desde += 500) {
    const { data, error } = await supabase.from('bloques_muestras').select('seq,t,ecg_raw,leads_off,bpm')
      .eq('sesion_id', sesionId).eq('canal', canal).order('seq').range(desde, desde + 499)
    if (error) throw error
    filas.push(...(data ?? []))
    if (!data || data.length < 500) break
  }
  const n = filas.reduce((a, f) => a + f.t.length, 0)
  const t = new Float64Array(n)
  const raw = new Float32Array(n)
  const lo = new Uint8Array(n)
  const bpm = new Float32Array(n)
  let k = 0
  for (const f of filas) {
    for (let i = 0; i < f.t.length; i++, k++) {
      t[k] = f.t[i]
      raw[k] = f.ecg_raw[i]
      lo[k] = f.leads_off[i]
      bpm[k] = f.bpm ? f.bpm[i] : 0
    }
  }
  return { t, raw, lo, bpm, n }
}

/** Elimina la cuenta y todos sus datos (RPC eliminar_mi_cuenta). Irreversible. */
export async function eliminarMiCuenta() {
  if (!(await ensureCloudSession())) throw new Error('No hay sesión de cuenta.')
  await cola.catch(() => {})
  const { error } = await supabase.rpc('eliminar_mi_cuenta')
  if (error) throw error
  await supabase.auth.signOut()
  sesionesConocidas.clear()
}

/** Sube sesiones y bloques existentes con reintentos ante la cuota por minuto del servidor. */
export async function subirBloquesConReintento(sesionId, canal, chunk, intentos = 4) {
  for (let i = 0; i < intentos; i++) {
    const { error } = await supabase.from('bloques_muestras').upsert({
      sesion_id: sesionId, canal, seq: chunk.seq,
      t: Array.from(chunk.t), ecg_raw: Array.from(chunk.raw), leads_off: Array.from(chunk.lo),
      bpm: chunk.bpm ? Array.from(chunk.bpm) : null,
    })
    if (!error) return true
    if (error.code !== 'P0001') return false
    await new Promise((r) => setTimeout(r, 15_000))
  }
  return false
}

export async function subirSesionDirecta(meta) {
  await pushSession(meta, true)
  await cola.catch(() => {})
}
