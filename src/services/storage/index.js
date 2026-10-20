import { idbKv } from './db.js'
import { createSecureStorage, createKeyProvider } from './secureStorage.js'

let integrityHandler = () => {}

/** Permite a main.js conectar el aviso "Datos dañados o manipulados" + auditoría (SEC-27). */
export function setIntegrityHandler(fn) {
  integrityHandler = typeof fn === 'function' ? fn : () => {}
}

export const keyProvider = createKeyProvider(idbKv('keys'))

export const secureStorage = createSecureStorage({
  kv: idbKv('secure'),
  keyProvider,
  onIntegrityError: (key) => integrityHandler(key),
})

/**
 * Espacios de datos locales (A.9.4.1, A.8.3.2): los datos de la persona/cuenta (pacientes, monitoreos y
 * bloques) se guardan bajo un prefijo según quién los usa. '' = modo sin cuenta (dispositivo);
 * 'acct:<uid>:' = datos de una cuenta en este equipo. Al cerrar sesión se puede borrar el espacio de la
 * cuenta para no dejar datos de salud en un equipo compartido. Ajustes, auditoría e incidentes no se separan.
 */
let espacio = ''
export const DATOS_RE = /^(users|sessions:|session:|chunk:)/

export function setDataNamespace(ns) {
  espacio = ns ? `acct:${ns}:` : ''
}
export function getDataNamespace() {
  return espacio
}

export const dataStorage = {
  getItem: (k) => secureStorage.getItem(espacio + k),
  setItem: (k, v) => secureStorage.setItem(espacio + k, v),
  removeItem: (k) => secureStorage.removeItem(espacio + k),
  async keys(prefix = '') {
    const todas = await secureStorage.keys(espacio + prefix)
    return todas.map((k) => k.slice(espacio.length))
  },
}

/** Borra todos los datos de pacientes/monitoreos de un espacio ('' = sin cuenta, o el uid de la cuenta). */
export async function clearDataNamespace(ns) {
  const pref = ns ? `acct:${ns}:` : ''
  for (const k of await secureStorage.keys(pref)) {
    const base = k.slice(pref.length)
    if (!ns && k.startsWith('acct:')) continue
    if (DATOS_RE.test(base)) await secureStorage.removeItem(k)
  }
}

/** Lee todos los registros de datos de un espacio (para vincular a la cuenta). */
export async function readDataNamespace(ns) {
  const pref = ns ? `acct:${ns}:` : ''
  const out = []
  for (const k of await secureStorage.keys(pref)) {
    const base = k.slice(pref.length)
    if (!ns && k.startsWith('acct:')) continue
    if (DATOS_RE.test(base)) out.push([base, await secureStorage.getItem(k)])
  }
  return out
}
