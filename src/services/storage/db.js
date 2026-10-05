import { openDB, deleteDB } from 'idb'

/**
 * Base IndexedDB `monitor-ecg`.
 *  - keys:   CryptoKey AES-GCM no extraíble (SEC-26)
 *  - secure: registros cifrados { v, iv, ct } (SEC-24/25)
 *  - audit:  log de auditoría append-only con cadena de hashes (SEC-38)
 *  - meta:   ancla de la cadena de auditoría y otros metadatos no sensibles
 */
export const DB_NAME = 'monitor-ecg'
export const DB_VERSION = 1

let dbPromise = null

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('keys')) db.createObjectStore('keys')
        if (!db.objectStoreNames.contains('secure')) db.createObjectStore('secure')
        if (!db.objectStoreNames.contains('audit')) db.createObjectStore('audit', { keyPath: 'seq' })
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
      },
    })
  }
  return dbPromise
}

export async function deleteDatabase() {
  if (dbPromise) {
    const db = await dbPromise
    db.close()
    dbPromise = null
  }
  await deleteDB(DB_NAME)
}

/** Adaptador clave-valor sobre un almacén (interfaz que usa secureStorage). */
export function idbKv(storeName) {
  return {
    async get(key) {
      return (await getDb()).get(storeName, key)
    },
    async set(key, value) {
      await (await getDb()).put(storeName, value, key)
    },
    async delete(key) {
      await (await getDb()).delete(storeName, key)
    },
    async keys() {
      return (await getDb()).getAllKeys(storeName)
    },
    async clear() {
      await (await getDb()).clear(storeName)
    },
  }
}
