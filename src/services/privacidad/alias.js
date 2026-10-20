/**
 * Alias (C-17): solo existe en el dispositivo (nunca se sube) y no debe ser un nombre real. Además del alfabeto permitido,
 * se rechaza lo que parece un nombre y apellido (dos o más palabras alfabéticas de 3 letras o más) y lo que parece un RUT.
 */
export const ALIAS_RE = /^[A-Za-z0-9 _-]{1,20}$/

export function aliasPareceNombre(alias) {
  const palabras = String(alias ?? '').split(/[\s_-]+/).filter((p) => /^[A-Za-z]{3,}$/.test(p))
  return palabras.length >= 2
}

/** @returns {string|null} mensaje de error o null si el alias (o vacío) es válido */
export function validarAlias(alias) {
  const a = String(alias ?? '').trim()
  if (!a) return null
  if (!ALIAS_RE.test(a)) return 'Alias inválido: solo letras sin tilde, números, espacio, _ y - (máx. 20).'
  if (aliasPareceNombre(a)) return 'El alias parece un nombre y apellido. Usa un código (p. ej. "Grupo A-2"); no uses nombres reales.'
  if (/\d{7,}/.test(a.replace(/[\s.-]/g, ''))) return 'El alias parece un documento de identidad. No uses RUT ni números personales.'
  return null
}
