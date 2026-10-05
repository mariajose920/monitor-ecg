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
