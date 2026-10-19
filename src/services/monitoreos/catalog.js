import { ACTIVIDAD_IDS, nombreActividad } from '@/data/activities.js'

/**
 * Lógica pura de "monitoreos" (sesiones guardadas): estado, visibilidad, filtros, orden,
 * validación y edición de metadatos. Sin DOM ni almacenamiento: se prueba con Vitest.
 *
 * Compatibilidad: una sesión sin el campo `guardado` (anterior a este cambio) cuenta como GUARDADA.
 */

export const NOMBRE_MAX = 60
export const NOTA_MAX = 500
// Letras (con tildes), números, espacio y . , : ( ) / # _ -  (sin < > " ' = + @ que sirven para inyección)
export const NOMBRE_RE = /^[\p{L}\p{N} _\-.,:()/#]{1,60}$/u
// Sin caracteres de control (se permite salto de línea y tabulación).
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

export const ESTADOS_MONITOREO = Object.freeze([
  { id: 'guardado', nombre: 'Guardado', clase: 'ok' },
  { id: 'borrador', nombre: 'Borrador (sin guardar)', clase: 'warn' },
  { id: 'interrumpida', nombre: 'Interrumpida', clase: 'danger' },
  { id: 'en-curso', nombre: 'En curso', clase: 'info' },
])

export const CAMPOS_ORDEN = Object.freeze([
  { id: 'fecha', nombre: 'Fecha' },
  { id: 'nombre', nombre: 'Nombre' },
  { id: 'duracion', nombre: 'Duración' },
  { id: 'bpm', nombre: 'BPM medio' },
])

/** Estado de presentación de una sesión. */
export function estadoMonitoreo(s, sesionActivaId = null) {
  if (s.estado === 'activa') return sesionActivaId && sesionActivaId === s.id ? 'en-curso' : 'interrumpida'
  return s.guardado === false ? 'borrador' : 'guardado'
}

export function infoEstado(id) {
  return ESTADOS_MONITOREO.find((e) => e.id === id) ?? ESTADOS_MONITOREO[0]
}

/** Solo los monitoreos guardados y finalizados sirven para Comparar y Aprende. */
export function esUtilizable(s) {
  return s.estado === 'finalizada' && s.guardado !== false
}

/** Fecha local AAAA-MM-DD de un ISO (para el filtro por día). */
export function diaLocal(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Nombre mostrado: el del usuario o uno sugerido por fecha. */
export function nombreMonitoreo(s) {
  if (s.nombre) return s.nombre
  return sugerirNombre(s)
}

export function sugerirNombre(s) {
  const d = diaLocal(s.inicio)
  const hora = new Date(s.inicio)
  const p = (n) => String(n).padStart(2, '0')
  if (!d || Number.isNaN(hora.getTime())) return 'Monitoreo'
  return `Monitoreo ${d} ${p(hora.getHours())}:${p(hora.getMinutes())}`
}

/** Actividad con más tiempo en una línea de tiempo [{tMs, valor}] de duración `duracionMs`. */
export function actividadDominante(timeline, duracionMs) {
  if (!timeline?.length) return null
  const acum = new Map()
  for (let i = 0; i < timeline.length; i++) {
    const ini = timeline[i].tMs
    const fin = i + 1 < timeline.length ? timeline[i + 1].tMs : Math.max(duracionMs ?? ini, ini)
    acum.set(timeline[i].valor, (acum.get(timeline[i].valor) ?? 0) + Math.max(0, fin - ini))
  }
  let mejor = timeline[0].valor
  let t = -1
  for (const [v, ms] of acum) {
    if (ms > t) {
      mejor = v
      t = ms
    }
  }
  return mejor
}

export function actividadPrincipal(s, participantes = s.participantes) {
  if (s.actividadPrincipal && ACTIVIDAD_IDS.includes(s.actividadPrincipal)) return s.actividadPrincipal
  const p = participantes?.[0]
  return p ? actividadDominante(p.actividad, p.resumen?.duracionMs) : null
}

/** Actividades distintas que aparecen en la sesión (para filtrar). */
export function actividadesDe(s, participantes = s.participantes) {
  const set = new Set()
  if (s.actividadPrincipal) set.add(s.actividadPrincipal)
  for (const p of participantes ?? []) for (const a of p.actividad ?? []) set.add(a.valor)
  return [...set]
}

export function duracionMs(s) {
  if (s.fin) return Math.max(0, Date.parse(s.fin) - Date.parse(s.inicio))
  const r = s.participantes?.[0]?.resumen?.duracionMs
  return Number.isFinite(r) ? r : null
}

/** Participaciones que la persona puede ver (A.9.4.1, SEC-43). */
export function participantesVisibles(s, { usuarioId = null, esAdmin = false } = {}) {
  if (esAdmin && !usuarioId) return s.participantes ?? []
  return (s.participantes ?? []).filter((p) => p.usuarioId === usuarioId)
}

export function visibles(sessions, ctx) {
  return sessions.filter((s) => participantesVisibles(s, ctx).length > 0)
}

export function puedeEditar(s, ctx) {
  return participantesVisibles(s, ctx).length > 0
}

/** Eliminar: admin, o participante cuando TODAS las participaciones son suyas (no borra datos ajenos). */
export function puedeEliminar(s, { usuarioId = null, esAdmin = false } = {}) {
  if (esAdmin) return true
  if (!usuarioId) return false
  return (s.participantes ?? []).length > 0 && s.participantes.every((p) => p.usuarioId === usuarioId)
}

/** Resumen (BPM, % fuera de rango) de la primera participación visible. */
export function resumenVisible(s, ctx) {
  const p = participantesVisibles(s, ctx)[0]
  return p?.resumen ?? null
}

/** Cuenta los monitoreos GUARDADOS por usuario. */
export function conteoPorUsuario(sessions) {
  const out = {}
  for (const s of sessions) {
    if (!esUtilizable(s)) continue
    for (const id of new Set((s.participantes ?? []).map((p) => p.usuarioId))) out[id] = (out[id] ?? 0) + 1
  }
  return out
}

/**
 * Filtra monitoreos.
 * @param {object[]} sessions
 * @param {{texto?:string, usuarioId?:string, desde?:string, hasta?:string, actividad?:string, estado?:string}} f
 * @param {{usuarioId?:string|null, esAdmin?:boolean, sesionActivaId?:string|null, etiquetaDe?:(id:string)=>string}} ctx
 */
export function filtrarMonitoreos(sessions, f = {}, ctx = {}) {
  const texto = (f.texto ?? '').trim().toLowerCase()
  return sessions.filter((s) => {
    const vis = participantesVisibles(s, ctx)
    if (!vis.length) return false
    if (f.usuarioId && !vis.some((p) => p.usuarioId === f.usuarioId)) return false
    const dia = diaLocal(s.inicio)
    if (f.desde && dia < f.desde) return false
    if (f.hasta && dia > f.hasta) return false
    if (f.actividad && !actividadesDe(s, vis).includes(f.actividad)) return false
    if (f.estado && estadoMonitoreo(s, ctx.sesionActivaId) !== f.estado) return false
    if (texto) {
      const etiquetas = vis.map((p) => ctx.etiquetaDe?.(p.usuarioId) ?? '').join(' ')
      const pajar = `${nombreMonitoreo(s)} ${s.notas ?? ''} ${etiquetas}`.toLowerCase()
      if (!pajar.includes(texto)) return false
    }
    return true
  })
}

/** Ordena sin mutar. campo: fecha | nombre | duracion | bpm; dir: asc | desc. */
export function ordenarMonitoreos(sessions, { campo = 'fecha', dir = 'desc' } = {}, ctx = {}) {
  const k = dir === 'asc' ? 1 : -1
  const valor = (s) => {
    if (campo === 'nombre') return nombreMonitoreo(s).toLowerCase()
    if (campo === 'duracion') return duracionMs(s) ?? -1
    if (campo === 'bpm') return resumenVisible(s, ctx)?.bpmMedio ?? -1
    return Date.parse(s.inicio) || 0
  }
  return [...sessions].sort((a, b) => {
    const va = valor(a)
    const vb = valor(b)
    if (va < vb) return -1 * k
    if (va > vb) return 1 * k
    return a.id < b.id ? -1 : 1
  })
}

/**
 * Valida los metadatos editables. Devuelve { ok, errores:{campo:msg}, valores }.
 * La actividad es de lista cerrada (SEC-20); nombre y nota son texto acotado.
 */
export function validarMetadatos({ nombre = '', notas = '', actividad = null } = {}) {
  const errores = {}
  const n = String(nombre ?? '').trim()
  const t = String(notas ?? '').replace(/\r\n/g, '\n').trim()
  if (!n) errores.nombre = 'Escribe un nombre para el monitoreo.'
  else if (n.length > NOMBRE_MAX) errores.nombre = `Máximo ${NOMBRE_MAX} caracteres.`
  else if (!NOMBRE_RE.test(n)) errores.nombre = 'Solo letras, números, espacio y . , : ( ) / # _ -'
  if (t.length > NOTA_MAX) errores.notas = `Máximo ${NOTA_MAX} caracteres.`
  else if (CONTROL_RE.test(t)) errores.notas = 'La nota contiene caracteres no permitidos.'
  const a = actividad || null
  if (a !== null && !ACTIVIDAD_IDS.includes(a)) errores.actividad = 'Actividad inválida.'
  return { ok: Object.keys(errores).length === 0, errores, valores: { nombre: n, notas: t, actividad: a } }
}

/** Devuelve una copia de la sesión con los metadatos aplicados (sin mutar la original). */
export function aplicarMetadatos(meta, valores, { guardar = false } = {}) {
  const v = validarMetadatos(valores)
  if (!v.ok) throw new Error(Object.values(v.errores)[0])
  const out = { ...meta, nombre: v.valores.nombre, notas: v.valores.notas, actividadPrincipal: v.valores.actividad }
  if (guardar) out.guardado = true
  return out
}

/** Texto corto para listas: "Reposo → Caminata". */
export function textoActividades(s, participantes = s.participantes) {
  const p = participantes?.[0]
  if (!p?.actividad?.length) return '—'
  const vistos = []
  for (const a of p.actividad) if (vistos[vistos.length - 1] !== a.valor) vistos.push(a.valor)
  return vistos.map(nombreActividad).join(' → ')
}
