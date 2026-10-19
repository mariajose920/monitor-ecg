import { describe, it, expect, vi } from 'vitest'
import { createMonitoreoService } from '@/services/monitoreos/monitoreoService.js'

function montar(sesiones) {
  const db = new Map(sesiones.map((s) => [s.id, structuredClone(s)]))
  const repo = {
    getSession: async (id) => (db.has(id) ? structuredClone(db.get(id)) : null),
    saveSession: vi.fn(async (m) => void db.set(m.id, structuredClone(m))),
    deleteSession: vi.fn(async (id) => void db.delete(id)),
  }
  const cloud = { pushSession: vi.fn(), deleteCloudSessions: vi.fn() }
  const audit = vi.fn(async () => null)
  return { svc: createMonitoreoService({ repo, cloud, audit }), db, repo, cloud, audit }
}
const base = (id, usuarios, extra = {}) => ({
  id, estado: 'finalizada', guardado: false, inicio: '2026-10-01T10:00:00Z', notas: '',
  participantes: usuarios.map((u, i) => ({ canalIndex: i + 1, usuarioId: u, actividad: [{ tMs: 0, valor: 'reposo' }], eventos: [] })),
  ...extra,
})
const ctx = { usuarioId: 'u1', esAdmin: false }

describe('monitoreoService', () => {
  it('guardar: confirma el borrador, replica en la nube y audita sin nombre ni nota', async () => {
    const { svc, db, cloud, audit } = montar([base('s1-aaaa-bbbb', ['u1'])])
    const m = await svc.guardar('s1-aaaa-bbbb', { nombre: 'Mi prueba', notas: 'secreto', actividad: 'caminata' }, { actor: 'participant:Usuario 1', ctx })
    expect(m.guardado).toBe(true)
    expect(db.get('s1-aaaa-bbbb')).toMatchObject({ guardado: true, nombre: 'Mi prueba', actividadPrincipal: 'caminata' })
    expect(cloud.pushSession).toHaveBeenCalledOnce()
    const [evento, actor, detalle] = audit.mock.calls[0]
    expect([evento, actor]).toEqual(['SESSION_SAVED', 'participant:Usuario 1'])
    expect(JSON.stringify(detalle)).not.toMatch(/Mi prueba|secreto/)
  })
  it('guardar: rechaza datos inválidos, sesión activa y accesos ajenos', async () => {
    const { svc } = montar([base('s1', ['u1']), base('s2', ['u1'], { estado: 'activa' }), base('s3', ['u2'])])
    await expect(svc.guardar('s1', { nombre: '' }, { ctx })).rejects.toThrow()
    await expect(svc.guardar('s2', { nombre: 'x' }, { ctx })).rejects.toThrow(/Detén/)
    await expect(svc.guardar('s3', { nombre: 'x' }, { ctx })).rejects.toThrow(/acceso/)
    await expect(svc.guardar('nope', { nombre: 'x' }, { ctx })).rejects.toThrow(/no existe/)
  })
  it('actualizar: edita nombre, nota y actividad', async () => {
    const { svc, db, audit } = montar([base('s1', ['u1'], { guardado: true, nombre: 'A' })])
    await svc.actualizar('s1', { nombre: 'B', notas: 'n', actividad: 'ejercicio' }, { ctx })
    expect(db.get('s1')).toMatchObject({ nombre: 'B', notas: 'n', actividadPrincipal: 'ejercicio', guardado: true })
    expect(audit.mock.calls[0][0]).toBe('SESSION_UPDATED')
  })
  it('descartar: solo borradores; borra local y nube', async () => {
    const { svc, db, cloud, audit } = montar([base('s1', ['u1']), base('s2', ['u1'], { guardado: true })])
    await svc.descartar('s1', { ctx })
    expect(db.has('s1')).toBe(false)
    expect(cloud.deleteCloudSessions).toHaveBeenCalledWith(['s1'])
    expect(audit.mock.calls[0][0]).toBe('SESSION_DISCARDED')
    await expect(svc.descartar('s2', { ctx })).rejects.toThrow(/Solo se pueden descartar/)
  })
  it('eliminar: respeta permisos por monitoreo, borra local y nube y audita cada uno', async () => {
    const { svc, db, cloud, audit } = montar([base('s1', ['u1'], { guardado: true }), base('s2', ['u1', 'u2'], { guardado: true })])
    const r = await svc.eliminar(['s1', 's2', 'nope'], { ctx, actor: 'participant:Usuario 1' })
    expect(r.eliminados).toEqual(['s1'])
    expect(r.rechazados.map((x) => x.id)).toEqual(['s2', 'nope'])
    expect(db.has('s1')).toBe(false)
    expect(db.has('s2')).toBe(true)
    expect(cloud.deleteCloudSessions).toHaveBeenCalledWith(['s1'])
    expect(audit.mock.calls.map((c) => c[0])).toEqual(['SESSION_DELETED'])
    const admin = await svc.eliminar(['s2'], { ctx: { esAdmin: true }, actor: 'admin' })
    expect(admin.eliminados).toEqual(['s2'])
  })
})
