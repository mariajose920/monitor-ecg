import { camposVisibilidadNube, esPublico } from '@/services/monitoreos/visibilidad.js'
import { consentimientoVigente, declaracionVigente, publicacionVigente } from '@/services/privacidad/consentimiento.js'

/**
 * Qué campos viajan a la nube (C-03, C-17). Lógica pura, probada con Vitest.
 * Regla: el alias y las notas NUNCA salen del dispositivo; tampoco el nombre del monitoreo (texto libre), `fuente.info`
 * (VID/PID USB), los eventos con detalle ni los parámetros aplicados. A la nube solo va lo necesario para la copia
 * y para el resumen público: señal (por bloques), actividad, resumen de BPM y un seudónimo "Paciente N".
 */

/** Campos de la sesión que se suben (el servidor y las RPC públicas solo leen estos). */
export function participanteNube(p) {
  return {
    canalIndex: p.canalIndex,
    usuarioId: p.usuarioId,
    fuente: p.fuente ? { tipo: p.fuente.tipo ?? null, perfilId: p.fuente.perfilId ?? null } : null,
    fs: p.fs,
    actividad: Array.isArray(p.actividad) ? p.actividad.map((a) => ({ tMs: a.tMs, valor: a.valor })) : [],
    resumen: p.resumen ?? null,
    estadoFinal: p.estadoFinal ?? null,
    motivoFin: p.motivoFin ?? null,
  }
}

/** `sesiones.datos` que se envía. Sin `notas`, `nombre`, `parametrosAplicados`, `fuente.info` ni `eventos`. */
export function datosSesionNube(meta) {
  const vis = camposVisibilidadNube(meta)
  return {
    participantes: (meta.participantes ?? []).map(participanteNube),
    guardado: meta.guardado !== false,
    actividadPrincipal: meta.actividadPrincipal ?? null,
    ...(vis.perfilCompartido ? { perfilCompartido: vis.perfilCompartido } : {}),
    ...(esPublico(meta) && publicacionVigente(meta.consentPublicacion) ? { consentPublicacion: meta.consentPublicacion } : {}),
  }
}

/** ¿Se puede subir este paciente? Exige la declaración de mayoría de edad (sin menores). */
export function puedeSubirPaciente(u) {
  return !!u && declaracionVigente(u)
}

/**
 * Fila de `pacientes`: etiqueta (seudónimo) y, solo con consentimiento VIGENTE (versión actual), el perfil opcional.
 * El alias nunca se envía.
 */
export function filaPacienteNube(u) {
  const conConsentimiento = consentimientoVigente(u)
  return {
    id: u.id,
    etiqueta: u.etiqueta,
    alias: null,
    perfil: conConsentimiento ? (u.perfil ?? null) : null,
    consentimiento: conConsentimiento ? u.consentimiento : null,
    declaracion: u.declaracion,
    creado_en: u.creadoEn,
    actualizado_en: u.actualizadoEn,
  }
}

/** Paciente que llega de la nube: el alias y las notas siguen siendo locales (se conservan los locales si existen). */
export function mezclarPacienteNube(local, nube) {
  return { ...nube, alias: local?.alias ?? null }
}

/**
 * Con la nube apagada solo se replican eventos de seguridad mínimos de la cuenta (sin etiquetas de paciente ni ids de sesión):
 * acceso, administración y gestión de incidentes. El resto de la auditoría se queda en el dispositivo.
 */
export const EVENTOS_NUBE_MINIMOS = Object.freeze([
  'ACCOUNT_REGISTERED', 'ACCOUNT_LOGIN', 'ACCOUNT_LOGOUT', 'ACCOUNT_PASSWORD_RESET', 'ACCOUNT_PASSWORD_CHANGED', 'ACCOUNT_DELETED',
  'CLOUD_SYNC_CHANGED', 'CLOUD_DATA_DELETED', 'SESSION_IDLE_TIMEOUT', 'CONSENT_WITHDRAWN',
  'ADMIN_ACCOUNT_LOGIN', 'ADMIN_MFA_ENROLLED', 'ADMIN_MFA_VERIFIED', 'ADMIN_MFA_FAILED', 'ADMIN_RECOVERY_REQUESTED', 'CLOUD_ADMIN_LOGIN',
  'CLOUD_ADMIN_LOGOUT', 'PARAM_CHANGED', 'AUDIT_EXPORTED', 'POLICY_ACCEPTED', 'ACCESS_REVIEW_DONE', 'ISMS_EVIDENCE_RECORDED', 'INCIDENT_REPORTED',
])

const CLAVES_IDENTIFICADORAS = new Set(['usuario', 'sesion', 'participante', 'participantes', 'alias', 'etiqueta'])

/** Detalle de un evento sin identificadores de paciente ni de sesión (para la nube apagada). */
export function detalleSinIdentificadores(detalle) {
  const out = {}
  for (const [k, v] of Object.entries(detalle ?? {})) if (!CLAVES_IDENTIFICADORAS.has(k)) out[k] = v
  return out
}

/**
 * Decide qué evento se replica en la nube. @returns {{tipo:string, detalle:object}|null} null = no se replica.
 * Con la nube activada pasa todo (los detalles ya vienen saneados por el log local).
 */
export function eventoParaNube(tipo, detalle, { nubeActiva }) {
  if (nubeActiva) return { tipo, detalle: detalle ?? {} }
  if (!EVENTOS_NUBE_MINIMOS.includes(tipo)) return null
  return { tipo, detalle: detalleSinIdentificadores(detalle) }
}

/** Fila completa de `sesiones` (la visibilidad pública solo viaja con el consentimiento de publicación dentro de `datos`). */
export function filaSesionNube(meta) {
  const vis = camposVisibilidadNube(meta)
  return {
    id: meta.id,
    paciente_id: meta.participantes?.[0]?.usuarioId ?? null,
    visibilidad: vis.visibilidad,
    compartir_perfil: vis.compartir_perfil,
    inicio: meta.inicio,
    fin: meta.fin,
    estado: meta.estado,
    motivo_fin: meta.motivoFin,
    datos: datosSesionNube(meta),
    actualizado_en: new Date().toISOString(),
  }
}
