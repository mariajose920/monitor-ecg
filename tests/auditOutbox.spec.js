import { describe, it, expect } from 'vitest'
import { createAuditOutbox, clasificarError, esperaMs, OUTBOX_MAX, BACKOFF_MAX_MS } from '@/services/cloud/auditOutbox.js'

/** C-08 / H-06: los eventos generados sin red no se pierden y se reenvían al volver la conexión. */
function memoria(inicial = []) {
  let datos = inicial
  return { load: async () => datos, save: async (x) => { datos = [...x] }, ver: () => datos }
}
const A = 'cuenta-a'
const B = 'cuenta-b'

describe('clasificarError', () => {
  it('sin red, 5xx, 429, sin sesión y cuota por hora se reintentan', () => {
    expect(clasificarError(new TypeError('Failed to fetch'))).toBe('reintentar')
    expect(clasificarError({ message: 'TypeError: Failed to fetch', code: '' })).toBe('reintentar')
    expect(clasificarError({ status: 503, message: 'x' })).toBe('reintentar')
    expect(clasificarError({ status: 429, message: 'x' })).toBe('reintentar')
    expect(clasificarError({ code: '28000', message: 'Sin sesión' })).toBe('reintentar')
    expect(clasificarError({ code: 'P0001', message: 'Cuota de auditoría superada' })).toBe('reintentar')
  })
  it('un rechazo permanente (evento no permitido, detalle inválido) se descarta', () => {
    expect(clasificarError({ code: '42501', message: 'Operación no permitida' })).toBe('descartar')
    expect(clasificarError({ code: '22023', message: 'Operación no permitida' })).toBe('descartar')
    expect(clasificarError({ code: 'P0001', message: 'otra cosa' })).toBe('descartar')
  })
  it('la espera crece de forma exponencial con tope', () => {
    expect(esperaMs(1)).toBe(5000)
    expect(esperaMs(2)).toBe(10000)
    expect(esperaMs(3)).toBe(20000)
    expect(esperaMs(30)).toBe(BACKOFF_MAX_MS)
  })
})

describe('cola de auditoría (outbox)', () => {
  it('encola y persiste antes de enviar; el envío correcto la vacía', async () => {
    const store = memoria()
    const enviados = []
    const ob = createAuditOutbox({ store, send: async (it) => { enviados.push(it.tipo); return {} } })
    await ob.enqueue({ tipo: 'SESSION_SAVED', detalle: { n: 1 }, cuentaId: A })
    expect(store.ver()).toHaveLength(1) // persistido aunque aún no se envió
    const r = await ob.flush(A)
    expect(r).toMatchObject({ enviados: 1, descartados: 0, pendientes: 0, detenido: false })
    expect(enviados).toEqual(['SESSION_SAVED'])
    expect(store.ver()).toHaveLength(0)
  })

  it('sin red: los eventos se conservan, el orden se mantiene y se reenvían al volver la red', async () => {
    const store = memoria()
    let enLinea = false
    const enviados = []
    const ob = createAuditOutbox({
      store,
      send: async (it) => {
        if (!enLinea) return { error: new TypeError('Failed to fetch') }
        enviados.push(it.tipo)
        return {}
      },
    })
    await ob.enqueue({ tipo: 'SESSION_STARTED', cuentaId: A })
    await ob.enqueue({ tipo: 'SESSION_ENDED', cuentaId: A })
    const r1 = await ob.flush(A)
    expect(r1).toMatchObject({ enviados: 0, pendientes: 2, detenido: true })
    expect(ob.siguienteIntentoMs()).toBe(5000)
    expect(store.ver()).toHaveLength(2)
    await ob.flush(A) // otro fallo seguido: la espera crece
    expect(ob.siguienteIntentoMs()).toBe(10000)

    enLinea = true
    const r2 = await ob.flush(A)
    expect(r2).toMatchObject({ enviados: 2, pendientes: 0, detenido: false })
    expect(enviados).toEqual(['SESSION_STARTED', 'SESSION_ENDED'])
    expect(ob.siguienteIntentoMs()).toBeNull()
  })

  it('un evento rechazado de forma permanente se descarta sin atascar a los siguientes', async () => {
    const store = memoria()
    const enviados = []
    const ob = createAuditOutbox({
      store,
      send: async (it) => {
        if (it.tipo === 'PARAM_CHANGED') return { error: { code: '42501', message: 'Operación no permitida' } }
        enviados.push(it.tipo)
        return {}
      },
    })
    await ob.enqueue({ tipo: 'PARAM_CHANGED', cuentaId: A })
    await ob.enqueue({ tipo: 'EXPORT_CSV', cuentaId: A })
    const r = await ob.flush(A)
    expect(r).toMatchObject({ enviados: 1, descartados: 1, pendientes: 0 })
    expect(enviados).toEqual(['EXPORT_CSV'])
  })

  it('solo envía los eventos de la cuenta con sesión; los de otra cuenta esperan', async () => {
    const store = memoria()
    const enviados = []
    const ob = createAuditOutbox({ store, send: async (it) => { enviados.push(`${it.cuentaId}:${it.tipo}`); return {} } })
    await ob.enqueue({ tipo: 'ACCOUNT_LOGIN', cuentaId: A })
    await ob.enqueue({ tipo: 'ACCOUNT_LOGIN', cuentaId: B })
    await ob.flush(B)
    expect(enviados).toEqual([`${B}:ACCOUNT_LOGIN`])
    expect(await ob.pendientes(A)).toBe(1)
    expect(await ob.pendientes(B)).toBe(0)
  })

  it('sobrevive a recargar la página (otro objeto con el mismo almacén)', async () => {
    const store = memoria()
    const a = createAuditOutbox({ store, send: async () => ({ error: new TypeError('Failed to fetch') }) })
    await a.enqueue({ tipo: 'SESSION_SAVED', cuentaId: A })
    await a.flush(A)
    const enviados = []
    const b = createAuditOutbox({ store, send: async (it) => { enviados.push(it.tipo); return {} } })
    const r = await b.flush(A)
    expect(r.enviados).toBe(1)
    expect(enviados).toEqual(['SESSION_SAVED'])
  })

  it('descarta lo muy antiguo y limita el tamaño de la cola', async () => {
    let t = 1_000_000
    const store = memoria()
    const ob = createAuditOutbox({ store, send: async () => ({}), now: () => t, maxItems: 3, maxAgeMs: 10_000 })
    for (let i = 0; i < 5; i++) await ob.enqueue({ tipo: `E${i}`, cuentaId: A })
    expect(store.ver().map((x) => x.tipo)).toEqual(['E2', 'E3', 'E4'])
    t += 20_000
    const r = await ob.flush(A) // todo caducó
    expect(r.enviados).toBe(0)
    expect(store.ver()).toHaveLength(0)
    expect(OUTBOX_MAX).toBeGreaterThan(100)
  })

  it('una excepción del envío cuenta como fallo transitorio', async () => {
    const store = memoria()
    const ob = createAuditOutbox({ store, send: async () => { throw new TypeError('Failed to fetch') } })
    await ob.enqueue({ tipo: 'SESSION_SAVED', cuentaId: A })
    const r = await ob.flush(A)
    expect(r.detenido).toBe(true)
    expect(r.pendientes).toBe(1)
  })
})
