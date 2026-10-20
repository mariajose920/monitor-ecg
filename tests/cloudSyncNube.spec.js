import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Cliente de la nube con Supabase simulado (nunca se contacta la base real):
 *  - la auditoría usa registrar_evento por una cola persistente (C-08);
 *  - lo público solo se lee por la RPC senal_publica, en páginas de 60 bloques (C-04);
 *  - tras cambiar la contraseña se cierran las demás sesiones (C-05).
 */
const llamadas = { rpc: [], from: [] }
let rpcRespuestas = {}
let enLinea = true
const meta = new Map()

const supabase = {
  auth: {
    getSession: vi.fn(async () => ({ data: { session: { user: { id: 'cuenta-1', email: 'a@b.cl' } } } })),
    getUser: vi.fn(async () => ({ data: { user: { id: 'cuenta-1' } } })),
    updateUser: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  },
  rpc: vi.fn(async (nombre, args) => {
    llamadas.rpc.push({ nombre, args })
    if (!enLinea) return { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } }
    const r = rpcRespuestas[nombre]
    return typeof r === 'function' ? r(args) : (r ?? { data: null, error: null })
  }),
  from: vi.fn((tabla) => {
    llamadas.from.push(tabla)
    return { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ range: async () => ({ data: [], error: null }) }) }) }) }) }
  }),
}

vi.mock('@/services/cloud/supabaseClient.js', () => ({ supabase, cloudEnabled: true }))
vi.mock('@/services/storage/db.js', () => ({
  getDb: async () => ({ get: async (_s, k) => meta.get(k), put: async (_s, v, k) => { meta.set(k, v) } }),
}))

const nube = await import('@/services/cloud/cloudSync.js')
const { nubeActivada } = await import('@/services/cloud/nubeOptIn.js')
const authService = await import('@/services/accounts/authService.js')

beforeEach(() => {
  llamadas.rpc.length = 0
  llamadas.from.length = 0
  rpcRespuestas = {}
  enLinea = true
  meta.clear()
  nube.cloudCuenta.value = { id: 'cuenta-1', email: 'a@b.cl' }
  nubeActivada.value = true
})

describe('auditoría de la nube (registrar_evento + cola)', () => {
  it('envía el evento por registrar_evento sin el actor del cliente', async () => {
    await nube.pushAudit('SESSION_SAVED', 'admin', { id: 's1' })
    const c = llamadas.rpc.find((x) => x.nombre === 'registrar_evento')
    expect(c.args).toEqual({ p_tipo: 'SESSION_SAVED', p_detalle: { id: 's1' } })
    expect(JSON.stringify(c.args)).not.toMatch(/admin/)
    expect(await nube.cloudAuditPendientes.value).toBe(0)
  })

  it('no replica los eventos que el servidor ya registra (sin doble registro)', async () => {
    await nube.pushAudit('ADMIN_ROLE_GRANTED', 'admin', { objetivo: 'x' })
    await nube.pushAudit('INCIDENT_UPDATED', 'admin', { id: 'i' })
    await nube.pushAudit('ADMIN_DATA_ACCESS', 'admin', {})
    expect(llamadas.rpc.filter((x) => x.nombre === 'registrar_evento')).toHaveLength(0)
  })

  it('sin cuenta no se sube nada', async () => {
    nube.cloudCuenta.value = null
    await nube.pushAudit('SESSION_SAVED', 'system', {})
    expect(llamadas.rpc).toHaveLength(0)
    expect(meta.get('outbox:audit')).toBeUndefined()
  })

  it('sin red el evento queda en la cola persistente y se reenvía al volver la red', async () => {
    enLinea = false
    await nube.pushAudit('SESSION_STARTED', 'system', { n: 1 })
    expect(meta.get('outbox:audit')).toHaveLength(1)
    expect(nube.cloudAuditPendientes.value).toBe(1)

    enLinea = true
    llamadas.rpc.length = 0
    await nube.reanudarAuditoriaNube()
    expect(llamadas.rpc.filter((x) => x.nombre === 'registrar_evento')).toHaveLength(1)
    expect(meta.get('outbox:audit')).toHaveLength(0)
    expect(nube.cloudAuditPendientes.value).toBe(0)
  })
})

describe('señal pública (C-04)', () => {
  const bloque = (seq) => ({ seq, t: [seq * 2, seq * 2 + 1], ecg_raw: [1, 2], leads_off: [0, 0], bpm: [70, 70] })

  it('lo público se lee solo con la RPC senal_publica, paginando de a 60 bloques, sin consultar la tabla', async () => {
    const total = 130
    rpcRespuestas.senal_publica = ({ p_desde, p_limite }) => ({
      data: Array.from({ length: Math.max(0, Math.min(p_limite, total - p_desde)) }, (_, i) => bloque(p_desde + i)),
      error: null,
    })
    const sig = await nube.fetchSenalNube('sesion-1', 0, { publica: true })
    const llamadasSenal = llamadas.rpc.filter((x) => x.nombre === 'senal_publica')
    expect(llamadasSenal.map((x) => x.args.p_desde)).toEqual([0, 60, 120])
    expect(llamadasSenal.every((x) => x.args.p_limite === 60 && x.args.p_sesion === 'sesion-1')).toBe(true)
    expect(llamadas.from).not.toContain('bloques_muestras')
    expect(sig.n).toBe(total * 2)
    expect(sig.t[sig.n - 1]).toBe(129 * 2 + 1)
  })

  it('propaga el error del servidor', async () => {
    rpcRespuestas.senal_publica = { data: null, error: { code: '42501', message: 'x' } }
    await expect(nube.fetchSenalNube('s', 0, { publica: true })).rejects.toMatchObject({ code: '42501' })
  })
})

describe('moderación y mensajes de error', () => {
  it('reportar usa la RPC y traduce errores a mensajes claros y genéricos', async () => {
    await nube.reportarMonitoreo('s1', '  Contenido ofensivo ')
    expect(llamadas.rpc.at(-1)).toEqual({ nombre: 'reportar_monitoreo', args: { p_id: 's1', p_motivo: 'Contenido ofensivo' } })
    rpcRespuestas.reportar_monitoreo = { data: null, error: { code: 'P0001', message: 'Cuota de reportes superada' } }
    await expect(nube.reportarMonitoreo('s1', 'otra vez')).rejects.toThrow(/Demasiadas solicitudes/)
    rpcRespuestas.reportar_monitoreo = { data: null, error: { code: '42501', message: 'Operación no permitida' } }
    await expect(nube.reportarMonitoreo('s1', 'otra vez')).rejects.toThrow(/permisos/)
  })

  it('ECG01 (límite de almacenamiento) se muestra como tal y no como error genérico', () => {
    expect(nube.mensajeErrorNube({ code: 'ECG01', message: 'Límite de almacenamiento alcanzado' })).toMatch(/límite de almacenamiento/i)
    expect(nube.mensajeErrorNube({ code: 'XX', message: 'detalle interno' })).not.toMatch(/detalle interno/)
  })

  it('el acceso excepcional y el retiro envían el motivo al servidor', async () => {
    rpcRespuestas.admin_leer_sesion = { data: [{ id: 's1', datos: { a: 1 } }], error: null }
    const fila = await nube.adminLeerSesion('s1', 'Soporte por solicitud 1234')
    expect(fila.datos).toEqual({ a: 1 })
    expect(llamadas.rpc.at(-1).args).toEqual({ p_id: 's1', p_motivo: 'Soporte por solicitud 1234' })
    rpcRespuestas.admin_retirar_publicacion = { data: true, error: null }
    expect(await nube.adminRetirarPublicacion('s1', 'Contenido reportado y revisado')).toBe(true)
  })
})

describe('cambio de contraseña cierra las demás sesiones (C-05)', () => {
  it('llama a signOut con scope others tras updateUser', async () => {
    supabase.auth.updateUser.mockClear()
    supabase.auth.signOut.mockClear()
    await authService.fijarNuevaPassword('claveSegura2026', 'claveSegura2026', 'otra@x.cl')
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'claveSegura2026' })
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'others' })
  })

  it('si updateUser falla no se cierran las demás sesiones', async () => {
    supabase.auth.updateUser.mockResolvedValueOnce({ error: { message: 'x' } })
    supabase.auth.signOut.mockClear()
    await expect(authService.fijarNuevaPassword('claveSegura2026', 'claveSegura2026', 'otra@x.cl')).rejects.toThrow()
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
  })
})
