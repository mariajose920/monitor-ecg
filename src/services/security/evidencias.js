/**
 * Evidencias del SGSI (C-10, cláusulas 9.2 y 9.3 de ISO/IEC 27001:2013). Solo registra que la actividad SE REALIZÓ, con fecha y
 * responsable; no contiene ni inventa resultados (estos se archivan en docs/sgsi/evidencias/). Lógica pura, probada con Vitest.
 */
export const TIPOS_EVIDENCIA = Object.freeze({
  auditoria_interna: { clausula: '9.2', nombre: 'Auditoría interna' },
  revision_direccion: { clausula: '9.3', nombre: 'Revisión por la dirección' },
})
export const RESPONSABLE_MAX = 80
export const REFERENCIA_MAX = 120

/** @returns {{ok:boolean, errores:Record<string,string>, valores?:object}} */
export function validarEvidencia({ tipo, fecha, responsable, referencia = '' }, ahora = new Date()) {
  const errores = {}
  if (!TIPOS_EVIDENCIA[tipo]) errores.tipo = 'Elige el tipo de evidencia.'
  const f = typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? new Date(`${fecha}T00:00:00Z`) : null
  if (!f || Number.isNaN(f.getTime())) errores.fecha = 'Indica la fecha (AAAA-MM-DD).'
  else if (f.getTime() > new Date(ahora).getTime() + 86_400_000) errores.fecha = 'La fecha no puede ser futura.'
  const r = String(responsable ?? '').trim()
  if (r.length < 3 || r.length > RESPONSABLE_MAX) errores.responsable = `Indica el responsable (3 a ${RESPONSABLE_MAX} caracteres).`
  const ref = String(referencia ?? '').trim()
  if (ref.length > REFERENCIA_MAX) errores.referencia = `La referencia admite hasta ${REFERENCIA_MAX} caracteres.`
  if (Object.keys(errores).length) return { ok: false, errores }
  return { ok: true, errores, valores: { tipo, fecha, responsable: r, referencia: ref } }
}

/** Última evidencia de cada tipo (o null) y días desde su fecha. */
export function resumenEvidencias(lista, ahora = new Date()) {
  const out = {}
  for (const tipo of Object.keys(TIPOS_EVIDENCIA)) {
    const ultima = lista.filter((e) => e.tipo === tipo).sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0] ?? null
    out[tipo] = ultima ? { ...ultima, dias: Math.floor((new Date(ahora).getTime() - new Date(`${ultima.fecha}T00:00:00Z`).getTime()) / 86_400_000) } : null
  }
  return out
}
