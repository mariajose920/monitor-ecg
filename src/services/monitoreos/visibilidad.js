/**
 * Reglas de visibilidad de monitoreos (A.13.2.x, A.18.1.4). Lógica pura, probada con Vitest.
 *  - 'privado' (por defecto): solo el propietario.
 *  - 'publico': legible, en solo lectura, por cualquier cuenta autenticada, mediante la vista
 *    las funciones RPC public.listar_monitoreos_publicos / monitoreo_publico. Se publica: señal, BPM, actividad, fecha UTC y "Paciente anónimo".
 *  - Los datos del paciente (rango de edad, peso…) NO se publican salvo segunda casilla explícita.
 *  - Nunca se publican: etiqueta, alias, nombre del monitoreo, nota, identificadores de paciente ni propietario.
 */
export const VISIBILIDADES = Object.freeze(['privado', 'publico'])
export const PACIENTE_ANONIMO = 'Paciente anónimo'

/** Qué se publica y qué no (se muestra en el diálogo y en el aviso de privacidad). */
export const CAMPOS_PUBLICADOS = Object.freeze(['Señal ECG', 'BPM', 'Actividad', 'Fecha y hora (UTC)', PACIENTE_ANONIMO])
export const CAMPOS_NO_PUBLICADOS = Object.freeze(['Nombre o alias del paciente', 'Nombre y nota del monitoreo', 'Cuenta propietaria', 'Datos del paciente (salvo casilla adicional)'])

export function esVisibilidad(v) {
  return VISIBILIDADES.includes(v)
}

export function visibilidadDe(s) {
  return esVisibilidad(s?.visibilidad) ? s.visibilidad : 'privado'
}

export const esPublico = (s) => visibilidadDe(s) === 'publico'

/**
 * Valida la elección. Publicar exige consentimiento explícito; compartir el perfil exige público,
 * consentimiento adicional y un perfil con consentimiento vigente del paciente.
 */
export function validarVisibilidad({ visibilidad = 'privado', consentimientoPublicar = false, compartirPerfil = false, consentimientoPerfil = false, tienePerfil = false } = {}) {
  const errores = {}
  if (!esVisibilidad(visibilidad)) errores.visibilidad = 'Visibilidad inválida.'
  if (visibilidad === 'publico' && consentimientoPublicar !== true) errores.consentimientoPublicar = 'Marca la casilla para confirmar que entiendes qué se publica.'
  if (compartirPerfil) {
    if (visibilidad !== 'publico') errores.compartirPerfil = 'Los datos del paciente solo se pueden incluir en monitoreos públicos.'
    else if (!tienePerfil) errores.compartirPerfil = 'Este paciente no tiene datos opcionales con consentimiento vigente.'
    else if (consentimientoPerfil !== true) errores.consentimientoPerfil = 'Marca la casilla para incluir los datos del paciente.'
  }
  return {
    ok: Object.keys(errores).length === 0,
    errores,
    valores: {
      visibilidad: esVisibilidad(visibilidad) ? visibilidad : 'privado',
      compartirPerfil: visibilidad === 'publico' && compartirPerfil === true && tienePerfil,
    },
  }
}

/** Copia mínima del perfil que se publica (solo campos del consentimiento). */
export function perfilPublicable(perfil) {
  if (!perfil) return null
  const out = { rangoEdad: perfil.rangoEdad ?? null, pesoKg: perfil.pesoKg ?? null, nivelActividad: perfil.nivelActividad ?? null }
  return Object.values(out).some((v) => v !== null) ? out : null
}

/**
 * Campos de visibilidad que viajan con el monitoreo a la nube. Privado ⇒ nunca perfil.
 * @returns {{visibilidad:string, compartir_perfil:boolean, perfilCompartido:object|null}}
 */
export function camposVisibilidadNube(meta) {
  const vis = visibilidadDe(meta)
  const snap = vis === 'publico' && meta?.compartirPerfil === true ? perfilPublicable(meta?.perfilCompartido) : null
  return { visibilidad: vis, compartir_perfil: snap !== null, perfilCompartido: snap }
}

/** Convierte una fila de listar_monitoreos_publicos() en un "monitoreo" de solo lectura para la interfaz. */
export function mapearMonitoreoPublico(row) {
  const parts = Array.isArray(row?.participantes) ? row.participantes : []
  const participantes = parts.map((p, i) => {
    const idx = Number(p?.canalIndex ?? i)
    return {
      canalIndex: idx,
      canalNombre: `Canal ${idx + 1}`,
      usuarioId: 'publico',
      fs: Number(p?.fs) || 250,
      actividad: Array.isArray(p?.actividad) ? p.actividad : [],
      resumen: p?.resumen ?? null,
      estadoFinal: 'finalizado',
    }
  })
  return {
    id: String(row.id),
    origen: 'comunidad',
    estado: 'finalizada',
    guardado: true,
    visibilidad: 'publico',
    inicio: row.inicio,
    fin: row.fin ?? null,
    nombre: `Monitoreo público ${String(row.inicio ?? '').slice(0, 16).replace('T', ' ')} UTC`,
    notas: '',
    actividadPrincipal: row.actividad ?? null,
    paciente: PACIENTE_ANONIMO,
    perfil: row.perfil ? perfilPublicable(row.perfil) : null,
    participantes,
  }
}

/** Filtro para la pestaña Comunidad. */
export function filtrarComunidad(lista, { texto = '', actividad = '' } = {}) {
  const t = texto.trim().toLowerCase()
  return lista.filter((m) => {
    if (actividad && m.actividadPrincipal !== actividad) return false
    if (t && !`${m.nombre} ${m.actividadPrincipal ?? ''}`.toLowerCase().includes(t)) return false
    return true
  })
}
