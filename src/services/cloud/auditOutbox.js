/**
 * Cola persistente de eventos de auditoría pendientes de enviar a la nube (C-08 / H-06, A.12.4.1, A.16.1.7).
 * Lógica pura con dependencias inyectadas (almacén y envío) para probarla con Vitest sin red.
 *
 *  - enqueue(): guarda el evento (tipo + detalle ya saneado + cuenta que lo generó) ANTES de intentar enviarlo, de modo
 *    que un corte de red o cerrar la pestaña no lo pierde.
 *  - flush(): envía en orden con registrar_evento; un fallo transitorio (sin red, 5xx, 429, cuota por tiempo, sin sesión)
 *    detiene el vaciado y deja el resto para reintentar con espera exponencial; un rechazo permanente (evento no permitido,
 *    detalle inválido) descarta ese evento y sigue (no atasca la cola).
 *  - Solo se envían los eventos de la cuenta con sesión activa: lo generado por otra cuenta espera a que ella vuelva.
 */

export const OUTBOX_MAX = 500
export const OUTBOX_EDAD_MAX_MS = 7 * 24 * 3600 * 1000
export const BACKOFF_BASE_MS = 5_000
export const BACKOFF_MAX_MS = 5 * 60_000

/** @returns {'reintentar'|'descartar'} qué hacer con un evento que el servidor (o la red) rechazó */
export function clasificarError(error) {
  if (!error) return 'descartar'
  const code = String(error.code ?? '')
  const status = Number(error.status ?? error.statusCode ?? 0)
  const msg = String(error.message ?? '')
  if (error instanceof TypeError || (/failed to fetch|networkerror|load failed|network request failed|fetch/i.test(msg) && !code)) return 'reintentar'
  if (status === 0 && !code) return 'reintentar'
  if (status === 429 || status >= 500) return 'reintentar'
  if (code === '28000' || status === 401) return 'reintentar' // sin sesión todavía / token por renovar
  if (code === 'P0001' && /cuota/i.test(msg)) return 'reintentar' // cupo por hora: se vacía más tarde
  return 'descartar'
}

/** Espera exponencial con tope: 5 s, 10 s, 20 s ... 5 min. */
export function esperaMs(intentosFallidos) {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, intentosFallidos - 1))
}

/**
 * @param {object} deps
 * @param {{load: () => Promise<any[]>, save: (items: any[]) => Promise<void>}} deps.store
 * @param {(item: {tipo: string, detalle: object}) => Promise<{error?: any}>} deps.send
 * @param {() => number} [deps.now]
 */
export function createAuditOutbox({ store, send, now = () => Date.now(), maxItems = OUTBOX_MAX, maxAgeMs = OUTBOX_EDAD_MAX_MS }) {
  let items = null
  let fallos = 0
  let enCurso = null
  let cadena = Promise.resolve()
  const serie = (fn) => {
    const p = cadena.then(fn, fn)
    cadena = p.catch(() => {})
    return p
  }

  async function cargar() {
    if (items) return items
    const l = await store.load().catch(() => [])
    items = Array.isArray(l) ? l.filter((x) => x && typeof x.tipo === 'string') : []
    return items
  }

  async function guardar() {
    await store.save(items).catch(() => {})
  }

  function podar() {
    const limite = now() - maxAgeMs
    items = items.filter((x) => Number(x.ts) >= limite)
    if (items.length > maxItems) items = items.slice(items.length - maxItems)
  }

  return {
    /** @param {{tipo:string, detalle?:object, cuentaId:string}} ev */
    enqueue(ev) {
      return serie(async () => {
        await cargar()
        items.push({ id: `${now()}-${Math.random().toString(36).slice(2, 8)}`, tipo: ev.tipo, detalle: ev.detalle ?? {}, cuentaId: ev.cuentaId, ts: now() })
        podar()
        await guardar()
        return items.length
      })
    },

    /** Vacía los pendientes de la cuenta indicada. @returns {{enviados:number, descartados:number, pendientes:number, detenido:boolean}} */
    flush(cuentaId) {
      if (enCurso) return enCurso
      enCurso = serie(async () => {
        await cargar()
        podar()
        let enviados = 0
        let descartados = 0
        let detenido = false
        for (const it of [...items]) {
          if (it.cuentaId !== cuentaId) continue
          let r
          try {
            r = await send(it)
          } catch (e) {
            r = { error: e }
          }
          if (!r?.error) {
            items = items.filter((x) => x.id !== it.id)
            enviados++
            continue
          }
          if (clasificarError(r.error) === 'reintentar') {
            detenido = true
            break
          }
          items = items.filter((x) => x.id !== it.id)
          descartados++
        }
        fallos = detenido ? fallos + 1 : 0
        await guardar()
        return { enviados, descartados, pendientes: items.length, detenido }
      }).finally(() => {
        enCurso = null
      })
      return enCurso
    },

    /** Milisegundos hasta el siguiente intento, o null si no hace falta reintentar. */
    siguienteIntentoMs() {
      return fallos > 0 ? esperaMs(fallos) : null
    },
    async pendientes(cuentaId) {
      await cargar()
      return cuentaId === undefined ? items.length : items.filter((x) => x.cuentaId === cuentaId).length
    },
    /** Olvida la cola (borrado total de datos del equipo). */
    async limpiar() {
      items = []
      fallos = 0
      await guardar()
    },
  }
}
