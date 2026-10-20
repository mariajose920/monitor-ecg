import { dataStorage as secureStorage } from './index.js'

/**
 * Sesiones de medición y bloques de muestras, cifrados por bloque (SEC-28, SEC-29).
 *  - 'sessions:index'          → [{ id, inicio, usuarios: [ids] }]
 *  - 'session:<id>'            → metadatos de la sesión
 *  - 'chunk:<id>:<canal>:<seq>' → bloque de ~2 s de muestras
 */
const INDEX = 'sessions:index'
const pad = (n) => String(n).padStart(6, '0')

async function getIndex() {
  const idx = await secureStorage.getItem(INDEX)
  return Array.isArray(idx) ? idx : []
}

async function setIndex(idx) {
  await secureStorage.setItem(INDEX, idx)
}

export async function saveSession(meta) {
  await secureStorage.setItem(`session:${meta.id}`, meta)
  const idx = await getIndex()
  const entry = { id: meta.id, inicio: meta.inicio, usuarios: meta.participantes.map((p) => p.usuarioId) }
  const i = idx.findIndex((e) => e.id === meta.id)
  if (i >= 0) idx[i] = entry
  else idx.push(entry)
  await setIndex(idx)
}

export async function getSession(id) {
  return secureStorage.getItem(`session:${id}`)
}

/** Lista metadatos de sesiones (opcionalmente solo las de un usuario: SEC-43/A.9.4.1). */
export async function listSessions({ usuarioId = null } = {}) {
  const idx = await getIndex()
  const ids = idx.filter((e) => !usuarioId || e.usuarios.includes(usuarioId)).map((e) => e.id)
  const out = []
  for (const id of ids) {
    const s = await getSession(id)
    if (s) out.push(s)
  }
  return out.sort((a, b) => (a.inicio < b.inicio ? 1 : -1))
}

export async function saveChunk(sessionId, canalIndex, seq, chunk) {
  await secureStorage.setItem(`chunk:${sessionId}:${canalIndex}:${pad(seq)}`, chunk)
}

/** Devuelve los bloques de un canal ordenados por seq. */
export async function getChunks(sessionId, canalIndex) {
  const keys = (await secureStorage.keys(`chunk:${sessionId}:${canalIndex}:`)).sort()
  const out = []
  for (const k of keys) {
    const c = await secureStorage.getItem(k)
    if (c) out.push(c)
  }
  return out
}

/** Concatena los bloques de un canal en arrays tipados. */
export async function getChannelSignal(sessionId, canalIndex) {
  const chunks = await getChunks(sessionId, canalIndex)
  const n = chunks.reduce((s, c) => s + c.raw.length, 0)
  const t = new Float64Array(n)
  const raw = new Float32Array(n)
  const lo = new Uint8Array(n)
  const bpm = new Float32Array(n)
  let k = 0
  for (const c of chunks) {
    for (let i = 0; i < c.raw.length; i++, k++) {
      t[k] = c.t[i]
      raw[k] = c.raw[i]
      lo[k] = c.lo[i]
      bpm[k] = c.bpm ? c.bpm[i] : 0
    }
  }
  return { t, raw, lo, bpm, n }
}

async function deleteChunks(sessionId, canalIndex = null) {
  const prefix = canalIndex === null ? `chunk:${sessionId}:` : `chunk:${sessionId}:${canalIndex}:`
  for (const k of await secureStorage.keys(prefix)) await secureStorage.removeItem(k)
}

export async function deleteSession(id) {
  await deleteChunks(id)
  await secureStorage.removeItem(`session:${id}`)
  await setIndex((await getIndex()).filter((e) => e.id !== id))
}

/**
 * Borra las mediciones de un usuario (SEC-30). Si la sesión tenía otros participantes,
 * solo se quita su participación y sus bloques.
 * @returns {Promise<number>} sesiones afectadas
 */
export async function deleteByUser(usuarioId) {
  const idx = await getIndex()
  let n = 0
  for (const e of idx.filter((x) => x.usuarios.includes(usuarioId))) {
    const s = await getSession(e.id)
    n++
    if (!s || s.participantes.every((p) => p.usuarioId === usuarioId)) {
      await deleteSession(e.id)
      continue
    }
    for (const p of s.participantes.filter((x) => x.usuarioId === usuarioId)) await deleteChunks(s.id, p.canalIndex)
    s.participantes = s.participantes.filter((p) => p.usuarioId !== usuarioId)
    await saveSession(s)
  }
  return n
}

/** Purga por retención (SEC-32). @returns {Promise<number>} sesiones eliminadas */
export async function purgeOlderThan(dias, now = Date.now()) {
  const limite = now - dias * 86400000
  const idx = await getIndex()
  let n = 0
  for (const e of idx) {
    if (Date.parse(e.inicio) < limite) {
      await deleteSession(e.id)
      n++
    }
  }
  return n
}
