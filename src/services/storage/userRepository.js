import { dataStorage as secureStorage } from './index.js'

/**
 * Usuarios seudonimizados (RF01–RF03). Todo el registro va cifrado (SEC-28):
 * { id, etiqueta: 'Usuario N', numero, alias|null, perfil|null, consentimiento|null, creadoEn, actualizadoEn }
 */
const KEY_USERS = 'users'
const KEY_COUNTER = 'users:counter'

export async function loadUsers() {
  const list = await secureStorage.getItem(KEY_USERS)
  return Array.isArray(list) ? list : []
}

export async function saveUsers(users) {
  await secureStorage.setItem(KEY_USERS, users)
}

/** Contador persistente para no reutilizar números de seudónimo. */
export async function nextUserNumber(users) {
  const stored = (await secureStorage.getItem(KEY_COUNTER)) ?? 0
  const maxExistente = users.reduce((m, u) => Math.max(m, u.numero || 0), 0)
  const n = Math.max(stored, maxExistente) + 1
  await secureStorage.setItem(KEY_COUNTER, n)
  return n
}
