import { ref } from 'vue'
import { supabase, cloudEnabled } from './supabaseClient.js'
import { createRateLimiter, CLIENT_LIMITS } from '@/utils/rateLimiter.js'
import { camposVisibilidadNube, mapearMonitoreoPublico } from '@/services/monitoreos/visibilidad.js'
import { numeroDeEtiqueta } from '@/services/users/etiquetas.js'
import { EVENTOS_SOLO_SERVIDOR } from '@/services/audit/auditLog.js'
import { createAuditOutbox } from './auditOutbox.js'
import { getDb } from '@/services/storage/db.js'
import { notify } from '@/services/notifications/notifier.js'

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
let ultimoAvisoLimite = 0
function encolar(fn) {
  cola = cola.then(fn).catch((e) => {
    cloudEstado.value = 'error'
    // C-11: el tope de almacenamiento del servidor (ECG01) no se reintenta; se avisa una vez por minuto, con un mensaje claro.
    if (e?.code === 'ECG01' && Date.now() - ultimoAvisoLimite > 60_000) {
      ultimoAvisoLimite = Date.now()
      notify(mensajeErrorNube(e), { tipo: 'error', duracionMs: 9000 })
    }
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
  // es_admin() = rol asignado Y sesión aal2 (privilegios efectivos); sin segundo factor es false.
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

// ---------------------------------------------------------------------------------------------
// Auditoría de la nube (C-08): el actor y la hora los fija el servidor (RPC registrar_evento); los eventos pasan por una
// cola persistente en IndexedDB que se vacía al volver la red o al iniciar sesión, con espera exponencial.
// ---------------------------------------------------------------------------------------------
const CLAVE_COLA_AUDITORIA = 'outbox:audit'
const auditOutbox = createAuditOutbox({
  store: {
    load: async () => (await (await getDb()).get('meta', CLAVE_COLA_AUDITORIA)) ?? [],
    save: async (items) => {
      await (await getDb()).put('meta', items, CLAVE_COLA_AUDITORIA)
    },
  },
  send: (it) => supabase.rpc('registrar_evento', { p_tipo: it.tipo, p_detalle: it.detalle }),
})
export const cloudAuditPendientes = ref(0)
let temporizadorAuditoria = null

async function vaciarAuditoria() {
  if (!cloudEnabled) return
  const cuentaId = cloudCuenta.value?.id
  if (!cuentaId) return
  try {
    const { data } = await supabase.auth.getSession()
    if (data.session?.user?.id !== cuentaId) return
    await auditOutbox.flush(cuentaId)
    cloudAuditPendientes.value = await auditOutbox.pendientes(cuentaId)
    clearTimeout(temporizadorAuditoria)
    const espera = auditOutbox.siguienteIntentoMs()
    if (espera) temporizadorAuditoria = setTimeout(vaciarAuditoria, espera)
  } catch {
    clearTimeout(temporizadorAuditoria)
    temporizadorAuditoria = setTimeout(vaciarAuditoria, 30_000)
  }
}
if (cloudEnabled && typeof window !== 'undefined') window.addEventListener('online', () => vaciarAuditoria())

/** Reenvía los eventos pendientes (al iniciar sesión, al restaurar la sesión o al volver la red). */
export const reanudarAuditoriaNube = () => vaciarAuditoria()
/** Olvida la cola local (borrado total de los datos del equipo). */
export const limpiarAuditoriaPendiente = () => auditOutbox.limpiar()

/**
 * Réplica de auditoría (A.12.4.1). Los detalles ya vienen saneados por el auditLog local. El "actor" local NO se envía:
 * el servidor lo calcula. Los eventos que el servidor registra por su cuenta no se replican (sin doble registro, H-20).
 */
export function pushAudit(tipo, _actor, detalle) {
  if (!cloudEnabled || EVENTOS_SOLO_SERVIDOR.includes(tipo)) return Promise.resolve()
  const cuentaId = cloudCuenta.value?.id
  if (!cuentaId) return Promise.resolve() // sin cuenta no se sube nada
  return auditOutbox.enqueue({ tipo, detalle: detalle ?? {}, cuentaId }).then(() => vaciarAuditoria())
}

/** Parámetros globales definidos por el administrador (RF15, RF26, RF27). */
export async function fetchCloudParametros() {
  if (!(await ensureCloudSession())) return null
  const { data, error } = await supabase.from('parametros').select('parametros, sincronizacion').eq('id', 1).maybeSingle()
  if (error) throw error
  return data
}

export async function pushCloudParametros({ parametros, sincronizacion }) {
  if (!cloudEnabled) return false
  // El nivel aal2 puede haber cambiado desde la última consulta (acaba de verificarse el TOTP): se vuelve a preguntar al servidor.
  if (!(await ensureCloudSession()) || !cloudAdmin.value) return false
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

/**
 * Alta de una notificación de incidente o debilidad (A.16.1.2 / A.16.1.3). Sin datos de salud. El servidor fija la fecha, el
 * reportante y el estado inicial; un reintento no duplica ni sobrescribe (ignoreDuplicates). Los cambios de estado los hace
 * el administrador con actualizarIncidenteNube (RPC). C-09.
 */
export function pushIncident(inc) {
  if (!cloudEnabled || !permitir('incident')) return Promise.resolve()
  return encolar(async () => {
    if (!(await ensureCloudSession())) return
    sinError(await supabase.from('incidentes').upsert({
      id: inc.id,
      tipo: inc.tipo,
      severidad: inc.severidad,
      descripcion: inc.descripcion,
      reportado_por: inc.reportadoPor,
      estado: 'abierto',
    }, { onConflict: 'id', ignoreDuplicates: true }))
  })
}

const filaIncidente = (f) => ({
  id: f.id,
  creadoUtc: f.creado_en,
  actualizadoUtc: f.actualizado_en,
  tipo: f.tipo,
  severidad: f.severidad,
  descripcion: f.descripcion,
  reportadoPor: f.reportado_por,
  estado: f.estado,
  respuesta: f.respuesta ?? '',
  leccion: f.leccion ?? '',
  historial: [],
  origen: 'nube',
})

/** Incidentes visibles para la cuenta (RLS): los propios o, con privilegios efectivos, todos. C-09. */
export async function fetchIncidentesNube() {
  if (!(await ensureCloudSession())) return null
  const { data, error } = await supabase.from('incidentes').select('*').order('creado_en', { ascending: false }).limit(500)
  if (error) throw error
  return (data ?? []).map(filaIncidente)
}

/** Ciclo abrir -> en_analisis -> cerrado/descartado validado en el servidor (solo administrador). */
export async function actualizarIncidenteNube(id, estado, { respuesta = '', leccion = '' } = {}) {
  const { data, error } = await supabase.rpc('admin_actualizar_incidente', { p_id: id, p_estado: estado, p_respuesta: respuesta || null, p_leccion: leccion || null })
  if (error) throw error
  const f = Array.isArray(data) ? data[0] : data
  return f ? { id: f.id, estado: f.estado, respuesta: f.respuesta ?? '', leccion: f.leccion ?? '', actualizadoUtc: f.actualizado_en } : null
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

/** @param {{alConflictoEtiqueta?: () => void}} [o] se invoca si el servidor rechaza la etiqueta por duplicada en la cuenta (23505, C-21) */
export function pushPaciente(u, { alConflictoEtiqueta } = {}) {
  if (!cloudEnabled) return Promise.resolve()
  return encolar(async () => {
    if (!(await ensureCloudSession())) return
    const { error } = await supabase.from('pacientes').upsert(filaPaciente(u))
    if (error?.code === '23505' && alConflictoEtiqueta) {
      setTimeout(() => alConflictoEtiqueta(), 0)
      return
    }
    if (error) throw error
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
    numero: numeroDeEtiqueta(f.etiqueta),
    etiqueta: f.etiqueta,
    alias: f.alias,
    perfil: f.perfil,
    consentimiento: f.consentimiento,
    creadoEn: f.creado_en,
    actualizadoEn: f.actualizado_en,
  }))
}

/** Lista de monitoreos públicos (solo lectura, función RPC segura; máx. 100 por llamada). */
export async function fetchPublicos({ limite = 60, desde = 0 } = {}) {
  if (!(await ensureCloudSession())) throw new Error('Inicia sesión para ver los monitoreos de la comunidad.')
  const { data, error } = await supabase.rpc('listar_monitoreos_publicos', { p_limit: Math.min(limite, 100), p_offset: desde })
  if (error) throw error
  return (data ?? []).map(mapearMonitoreoPublico)
}

/** Detalle de un monitoreo público (RPC). */
export async function fetchPublico(id) {
  if (!(await ensureCloudSession())) throw new Error('Inicia sesión para ver este monitoreo.')
  const { data, error } = await supabase.rpc('monitoreo_publico', { p_id: id })
  if (error) throw error
  const fila = Array.isArray(data) ? data[0] : data
  return fila ? mapearMonitoreoPublico(fila) : null
}

/**
 * Señal de un canal de un monitoreo desde la nube, en el formato de getChannelSignal.
 * Lo público SOLO se lee con la RPC senal_publica (máx. 60 bloques por llamada, sin ids de propietario): ya no existe
 * lectura directa de bloques ajenos (C-04). Lo propio se lee de la tabla (RLS: solo el propietario).
 */
export const BLOQUES_POR_LLAMADA_PUBLICA = 60
export async function fetchSenalNube(sesionId, canal, { publica = false } = {}) {
  if (!(await ensureCloudSession())) throw new Error('Inicia sesión para ver este monitoreo.')
  const filas = []
  if (publica) {
    let desde = 0
    for (let vueltas = 0; vueltas < 200; vueltas++) {
      const { data, error } = await supabase.rpc('senal_publica', { p_sesion: sesionId, p_canal: Number(canal), p_desde: desde, p_limite: BLOQUES_POR_LLAMADA_PUBLICA })
      if (error) throw error
      const bloques = data ?? []
      filas.push(...bloques)
      if (bloques.length < BLOQUES_POR_LLAMADA_PUBLICA) break
      desde = Number(bloques[bloques.length - 1].seq) + 1
    }
  } else {
    for (let desde = 0; ; desde += 500) {
      const { data, error } = await supabase.from('bloques_muestras').select('seq,t,ecg_raw,leads_off,bpm')
        .eq('sesion_id', sesionId).eq('canal', canal).order('seq').range(desde, desde + 499)
      if (error) throw error
      filas.push(...(data ?? []))
      if (!data || data.length < 500) break
    }
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

// ---------------------------------------------------------------------------------------------
// Moderación de lo público y acceso excepcional del administrador (C-04, C-06). Todo por RPC en el servidor.
// ---------------------------------------------------------------------------------------------

/** Mensaje claro (y genérico) para el error del servidor; ECG01 = límite de almacenamiento (C-11). */
export function mensajeErrorNube(error) {
  const code = String(error?.code ?? '')
  const msg = String(error?.message ?? '')
  if (code === 'ECG01') return 'Alcanzaste tu límite de almacenamiento en la nube. Borra monitoreos antiguos para seguir guardando.'
  if (code === 'P0001' && /cuota/i.test(msg)) return 'Demasiadas solicitudes seguidas. Espera un momento e inténtalo de nuevo.'
  if (code === '42501') return 'No se pudo completar la operación (permisos insuficientes).'
  return 'No se pudo completar la operación. Inténtalo de nuevo.'
}

/** Reporta un monitoreo público (cuenta registrada; máx. 5 por día). */
export async function reportarMonitoreo(id, motivo) {
  if (!(await ensureCloudSession())) throw new Error('Inicia sesión para reportar un monitoreo.')
  const { error } = await supabase.rpc('reportar_monitoreo', { p_id: id, p_motivo: String(motivo ?? '').trim() })
  if (error) throw new Error(mensajeErrorNube(error))
}

/** Reportes de contenido (administrador). */
export async function adminListarReportes(estado = 'abierto') {
  const { data, error } = await supabase.rpc('admin_listar_reportes', { p_estado: estado, p_limite: 100 })
  if (error) throw error
  return data ?? []
}
export async function adminResolverReporte(id, estado) {
  const { data, error } = await supabase.rpc('admin_resolver_reporte', { p_id: id, p_estado: estado })
  if (error) throw error
  return data === true
}
/** Pasa a privado un monitoreo reportado (motivo de 10 a 300 caracteres; queda auditado). */
export async function adminRetirarPublicacion(id, motivo) {
  const { data, error } = await supabase.rpc('admin_retirar_publicacion', { p_id: id, p_motivo: motivo })
  if (error) throw error
  return data === true
}

/** Acceso excepcional de lectura (motivo de 10 a 300 caracteres): devuelve solo los metadatos/datos de la sesión, sin señal. */
export async function adminLeerSesion(id, motivo) {
  const { data, error } = await supabase.rpc('admin_leer_sesion', { p_id: id, p_motivo: motivo })
  if (error) throw error
  return Array.isArray(data) ? (data[0] ?? null) : data
}

/** Accesos excepcionales del administrador a MIS sesiones (visible para el titular). */
export async function fetchMisAccesosAdmin() {
  if (!(await ensureCloudSession())) return []
  const { data, error } = await supabase.rpc('mis_accesos_admin', { p_limite: 50 })
  if (error) return []
  return data ?? []
}

// ---------------------------------------------------------------------------------------------
// Auditoría de la nube para el administrador (C-08)
// ---------------------------------------------------------------------------------------------
export async function adminLeerAuditoria({ limite = 100, desde = null, antesDeId = null } = {}) {
  const { data, error } = await supabase.rpc('admin_leer_auditoria', { p_limite: limite, p_desde: desde, p_antes_de_id: antesDeId })
  if (error) throw error
  return data ?? []
}
/** @returns {Promise<{ok:boolean, filas:number, rotoEn:number|null}>} */
export async function verificarCadenaNube() {
  const { data, error } = await supabase.rpc('verificar_cadena_auditoria')
  if (error) throw error
  const f = Array.isArray(data) ? data[0] : data
  return { ok: f?.ok === true, filas: Number(f?.filas ?? 0), rotoEn: f?.roto_en ?? null }
}
