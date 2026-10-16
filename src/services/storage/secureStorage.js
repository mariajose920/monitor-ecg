import { bytesToBase64, base64ToBytes } from '@/utils/base64.js'

/**
 * ENGANCHE ISO 27001:2013 A.10.1.1/A.10.1.2: almacenamiento cifrado (SEC-24..SEC-29).
 *  - AES-GCM 256 con clave NO extraíble guardada en IndexedDB (nunca en localStorage ni en el código).
 *  - IV aleatorio de 12 bytes por cada cifrado; additionalData = nombre de la clave (ata el texto
 *    cifrado a su ranura: no se puede mover un registro a otra clave).
 *  - Formato guardado: { v: 1, iv: base64, ct: base64 }.
 *  - Fallo seguro (SEC-27): si el descifrado falla, se descarta el registro, se avisa y se audita.
 *  - wipe(): borra los datos Y la clave (crypto-shredding, SEC-31).
 *
 * Limitación (sección 5.0 del documento ISO): protege frente a copias/volcados del almacenamiento, no frente a
 * XSS ni a quien controla el navegador abierto.
 */

const enc = new TextEncoder()
const dec = new TextDecoder()

/** Proveedor de clave sobre un kv (por defecto IndexedDB 'keys'). */
export function createKeyProvider(kv, keyName = 'aes-gcm-v1') {
  let cached = null
  return {
    async getKey() {
      if (cached) return cached
      let key = await kv.get(keyName)
      if (!key) {
        key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
        await kv.set(keyName, key)
      }
      cached = key
      return key
    },
    async destroyKey() {
      cached = null
      await kv.delete(keyName)
    },
  }
}

/**
 * @param {object} deps
 * @param {{get,set,delete,keys,clear}} deps.kv almacén de registros cifrados
 * @param {{getKey:()=>Promise<CryptoKey>, destroyKey:()=>Promise<void>}} deps.keyProvider
 * @param {(key:string)=>void} [deps.onIntegrityError]
 */
export function createSecureStorage({ kv, keyProvider, onIntegrityError = () => {} }) {
  async function setItem(key, obj) {
    const cryptoKey = await keyProvider.getKey()
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: enc.encode(key) },
      cryptoKey,
      enc.encode(JSON.stringify(obj)),
    )
    await kv.set(key, { v: 1, iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(ct)) })
  }

  async function getItem(key) {
    const rec = await kv.get(key)
    if (rec === undefined || rec === null) return null
    try {
      if (rec.v !== 1 || typeof rec.iv !== 'string' || typeof rec.ct !== 'string') throw new Error('formato')
      const cryptoKey = await keyProvider.getKey()
      const pt = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBytes(rec.iv), additionalData: enc.encode(key) },
        cryptoKey,
        base64ToBytes(rec.ct),
      )
      return JSON.parse(dec.decode(pt))
    } catch {
      // Fallo seguro: descartar el registro dañado o manipulado.
      try {
        await kv.delete(key)
      } catch {
        /* ignorar */
      }
      onIntegrityError(key)
      return null
    }
  }

  async function removeItem(key) {
    await kv.delete(key)
  }

  async function keys(prefix = '') {
    const all = await kv.keys()
    return all.filter((k) => typeof k === 'string' && k.startsWith(prefix))
  }

  async function wipe() {
    await kv.clear()
    await keyProvider.destroyKey()
  }

  return { setItem, getItem, removeItem, keys, wipe }
}

/** Almacén en memoria (para pruebas). */
export function memoryKv() {
  const m = new Map()
  return {
    async get(k) { return m.get(k) },
    async set(k, v) { m.set(k, v) },
    async delete(k) { m.delete(k) },
    async keys() { return [...m.keys()] },
    async clear() { m.clear() },
    _map: m,
  }
}
