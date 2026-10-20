import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * C-03: con cuenta la nube es opcional. Con Supabase simulado se comprueba qué llega (y qué NO) al servidor:
 * apagada por defecto = nada; borradores = nunca; paciente sin declaración = nunca; alias = nunca; retiros y borrados sí se propagan.
 */
const peticiones = []
const rec = (tabla, op, cuerpo) => {
  peticiones.push({ tabla, op, cuerpo })
  return Promise.resolve({ error: null })
}
const supabase = {
  auth: {
    getSession: vi.fn(async () => ({ data: { session: { user: { id: 'cuenta-1', email: 'a@b.cl' } } } })),
    getUser: vi.fn(async () => ({ data: { user: { id: 'cuenta-1' } } })),
  },
  rpc: vi.fn(async () => ({ data: false, error: null })),
  from: vi.fn((tabla) => ({
    upsert: (c) => rec(tabla, 'upsert', c),
    update: (c) => ({ eq: () => rec(tabla, 'update', c) }),
    delete: () => ({ in: () => rec(tabla, 'delete'), eq: () => rec(tabla, 'delete') }),
  })),
}
vi.mock('@/services/cloud/supabaseClient.js', () => ({ supabase, cloudEnabled: true }))
vi.mock('@/services/storage/db.js', () => ({ getDb: async () => ({ get: async () => [], put: async () => {} }) }))

const nube = await import('@/services/cloud/cloudSync.js')
const { nubeActivada } = await import('@/services/cloud/nubeOptIn.js')
const { crearDeclaracion, crearConsentimiento } = await import('@/services/privacidad/consentimiento.js')

const meta = (extra = {}) => ({
  id: 's1', estado: 'finalizada', guardado: true, inicio: '2026-10-01T10:00:00Z', fin: '2026-10-01T10:01:00Z', motivoFin: 'usuario', notas: 'secreto',
  nombre: 'Nombre libre', participantes: [{ canalIndex: 0, usuarioId: 'u1', fs: 250, actividad: [], resumen: null }], ...extra,
})
const paciente = (extra = {}) => ({ id: 'u1', etiqueta: 'Paciente 1', alias: 'MiAlias', perfil: null, consentimiento: null, declaracion: crearDeclaracion({}), creadoEn: 'a', actualizadoEn: 'b', ...extra })
const vaciarCola = () => nube.deleteCloudSessions(['__nada__']).then(() => {})

beforeEach(() => {
  peticiones.length = 0
  nube.cloudCuenta.value = { id: 'cuenta-1', email: 'a@b.cl' }
  nubeActivada.value = false
})

describe('nube apagada (valor por defecto)', () => {
  it('no sube sesiones, pacientes ni bloques', async () => {
    await nube.pushSession(meta())
    await nube.pushPaciente(paciente())
    await vaciarCola()
    expect(peticiones.filter((p) => p.op !== 'delete')).toEqual([])
    await expect(nube.subirBloquesConReintento('s1', 0, { seq: 0, t: [], raw: [], lo: [] })).rejects.toThrow(/no está activada/)
  })
  it('sin cuenta tampoco, aunque el interruptor estuviera activo', async () => {
    nubeActivada.value = true
    nube.cloudCuenta.value = null
    await nube.pushSession(meta())
    await nube.pushPaciente(paciente())
    expect(peticiones).toEqual([])
  })
})

describe('nube activada', () => {
  beforeEach(() => {
    nubeActivada.value = true
  })
  it('un borrador (sin "Guardar") nunca se sube', async () => {
    await nube.pushSession(meta({ guardado: false }))
    await nube.pushSession(meta({ estado: 'activa', guardado: false }))
    await vaciarCola()
    expect(peticiones.filter((p) => p.tabla === 'sesiones' && p.op === 'upsert')).toEqual([])
  })
  it('un monitoreo guardado se sube sin nombre ni notas', async () => {
    await nube.pushSession(meta({ id: 's2' }))
    await vaciarCola()
    const sub = peticiones.find((p) => p.tabla === 'sesiones' && p.op === 'upsert')
    expect(sub).toBeTruthy()
    expect(JSON.stringify(sub.cuerpo)).not.toMatch(/secreto|Nombre libre/)
    expect(sub.cuerpo.visibilidad).toBe('privado')
  })
  it('el paciente sube solo la etiqueta (sin alias) y solo con declaración de mayoría de edad', async () => {
    await nube.pushPaciente(paciente({ declaracion: null }))
    await vaciarCola()
    expect(peticiones.filter((p) => p.tabla === 'pacientes')).toEqual([])
    await nube.pushPaciente(paciente())
    await vaciarCola()
    const fila = peticiones.find((p) => p.tabla === 'pacientes' && p.op === 'upsert').cuerpo
    expect(fila.etiqueta).toBe('Paciente 1')
    expect(fila.alias).toBeNull()
    expect(JSON.stringify(fila)).not.toMatch(/MiAlias/)
  })
  it('el perfil solo viaja con consentimiento de la versión vigente', async () => {
    const perfil = { rangoEdad: '18-24', pesoKg: 70, nivelActividad: null }
    await nube.pushPaciente(paciente({ perfil, consentimiento: { consentVersion: '1.0' } }))
    await nube.pushPaciente(paciente({ id: 'u2', etiqueta: 'Paciente 2', perfil, consentimiento: crearConsentimiento(paciente(), {}) }))
    await vaciarCola()
    const filas = peticiones.filter((p) => p.tabla === 'pacientes' && p.op === 'upsert').map((p) => p.cuerpo)
    expect(filas.find((f) => f.id === 'u1').perfil).toBeNull()
    expect(filas.find((f) => f.id === 'u2').perfil).toEqual(perfil)
  })
})

describe('supresión y retiro con la nube apagada', () => {
  it('el retiro del consentimiento y los borrados sí llegan al servidor (solo actualizan o borran filas existentes)', async () => {
    await nube.retirarConsentimientoNube(paciente())
    await nube.deleteCloudSessions(['s1'])
    await nube.deletePaciente('u1')
    expect(peticiones.map((p) => `${p.tabla}:${p.op}`)).toEqual(['pacientes:update', 'sesiones:delete', 'pacientes:delete'])
    expect(peticiones[0].cuerpo).toMatchObject({ consentimiento: null, perfil: null })
  })
})
