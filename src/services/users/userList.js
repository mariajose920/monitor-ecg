/** Búsqueda y orden de la tabla de usuarios (lógica pura). Solo seudónimo y alias: nunca datos opcionales. */

export const CAMPOS_ORDEN_USUARIO = Object.freeze([
  { id: 'numero', nombre: 'Número' },
  { id: 'alias', nombre: 'Alias' },
  { id: 'creado', nombre: 'Creado' },
  { id: 'monitoreos', nombre: 'Monitoreos' },
])

export function filtrarUsuarios(users, { texto = '' } = {}) {
  const t = texto.trim().toLowerCase()
  if (!t) return [...users]
  return users.filter((u) => `${u.etiqueta} ${u.alias ?? ''}`.toLowerCase().includes(t))
}

/** @param {Record<string, number>} conteos monitoreos por id de usuario */
export function ordenarUsuarios(users, { campo = 'numero', dir = 'asc' } = {}, conteos = {}) {
  const k = dir === 'desc' ? -1 : 1
  const valor = (u) => {
    if (campo === 'alias') return (u.alias ?? '').toLowerCase()
    if (campo === 'creado') return Date.parse(u.creadoEn) || 0
    if (campo === 'monitoreos') return conteos[u.id] ?? 0
    return u.numero ?? 0
  }
  return [...users].sort((a, b) => {
    const va = valor(a)
    const vb = valor(b)
    if (va < vb) return -1 * k
    if (va > vb) return 1 * k
    return (a.numero ?? 0) - (b.numero ?? 0)
  })
}
