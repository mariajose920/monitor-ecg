import { describe, it, expect } from 'vitest'
import {
  estadoMonitoreo, filtrarMonitoreos, ordenarMonitoreos, validarMetadatos, aplicarMetadatos, conteoPorUsuario,
  puedeEliminar, puedeEditar, participantesVisibles, visibles, actividadDominante, sugerirNombre, nombreMonitoreo, esUtilizable,
} from '@/services/monitoreos/catalog.js'
import { filtrarUsuarios, ordenarUsuarios } from '@/services/users/userList.js'

const part = (usuarioId, actividad = 'reposo', bpm = 70, dur = 60000) => ({
  canalIndex: 1, canalNombre: 'Canal 1', usuarioId, fs: 250,
  actividad: [{ tMs: 0, valor: actividad }], eventos: [],
  resumen: { bpmMedio: bpm, duracionMs: dur, muestras: 100, descartadas: 0 },
})
const ses = (id, inicio, participantes, extra = {}) => ({ id, inicio, fin: inicio, estado: 'finalizada', participantes, notas: '', ...extra })

const S1 = ses('a1', '2026-10-01T15:00:00', [part('u1', 'reposo', 70)], { guardado: true, nombre: 'Reposo mañana' })
const S2 = ses('a2', '2026-10-03T15:00:00', [part('u1', 'ejercicio', 130, 120000)], { guardado: true, nombre: 'Corrida', notas: 'después de correr' })
const S3 = ses('a3', '2026-10-05T15:00:00', [part('u2', 'caminata', 90)], { guardado: false })
const S4 = ses('a4', '2026-10-06T15:00:00', [part('u1'), { ...part('u2'), canalIndex: 2 }], {}) // legado sin "guardado"
const S5 = { ...ses('a5', '2026-10-07T15:00:00', [part('u1')]), estado: 'activa' }
const TODAS = [S1, S2, S3, S4, S5]
const etiquetaDe = (id) => ({ u1: 'Usuario 1', u2: 'Usuario 2' })[id]

describe('estado y utilidad', () => {
  it('distingue guardado, borrador, interrumpida y en curso (legado = guardado)', () => {
    expect(estadoMonitoreo(S1)).toBe('guardado')
    expect(estadoMonitoreo(S3)).toBe('borrador')
    expect(estadoMonitoreo(S4)).toBe('guardado')
    expect(estadoMonitoreo(S5)).toBe('interrumpida')
    expect(estadoMonitoreo(S5, 'a5')).toBe('en-curso')
  })
  it('solo lo guardado y finalizado sirve para comparar y aprender', () => {
    expect(TODAS.map(esUtilizable)).toEqual([true, true, false, true, false])
  })
})

describe('visibilidad y permisos (A.9.4.1)', () => {
  it('el participante ve solo lo suyo y el admin sin usuario ve todo', () => {
    expect(visibles(TODAS, { usuarioId: 'u2' }).map((s) => s.id)).toEqual(['a3', 'a4'])
    expect(visibles(TODAS, { usuarioId: null, esAdmin: true })).toHaveLength(5)
    expect(visibles(TODAS, { usuarioId: null, esAdmin: false })).toHaveLength(0)
    expect(participantesVisibles(S4, { usuarioId: 'u1' })).toHaveLength(1)
  })
  it('un participante no elimina sesiones con datos de otros', () => {
    expect(puedeEliminar(S1, { usuarioId: 'u1' })).toBe(true)
    expect(puedeEliminar(S4, { usuarioId: 'u1' })).toBe(false)
    expect(puedeEliminar(S4, { esAdmin: true })).toBe(true)
    expect(puedeEliminar(S1, { usuarioId: null })).toBe(false)
    expect(puedeEditar(S3, { usuarioId: 'u1' })).toBe(false)
  })
})

describe('filtros', () => {
  const ctx = { usuarioId: null, esAdmin: true, etiquetaDe }
  const ids = (f) => filtrarMonitoreos(TODAS, f, ctx).map((s) => s.id)
  it('por usuario, actividad y estado', () => {
    expect(ids({ usuarioId: 'u2' })).toEqual(['a3', 'a4'])
    expect(ids({ actividad: 'ejercicio' })).toEqual(['a2'])
    expect(ids({ estado: 'borrador' })).toEqual(['a3'])
    expect(ids({ estado: 'interrumpida' })).toEqual(['a5'])
  })
  it('por rango de fechas (día local, límites inclusivos)', () => {
    expect(ids({ desde: '2026-10-03', hasta: '2026-10-05' })).toEqual(['a2', 'a3'])
    expect(ids({ desde: '2026-10-07' })).toEqual(['a5'])
  })
  it('por texto en nombre, nota o usuario, sin distinguir mayúsculas', () => {
    expect(ids({ texto: 'CORRIDA' })).toEqual(['a2'])
    expect(ids({ texto: 'después' })).toEqual(['a2'])
    expect(ids({ texto: 'usuario 2' })).toEqual(['a3', 'a4'])
  })
  it('combina filtros y respeta la visibilidad', () => {
    expect(filtrarMonitoreos(TODAS, { actividad: 'reposo' }, { usuarioId: 'u2', etiquetaDe }).map((s) => s.id)).toEqual(['a4'])
    expect(ids({ usuarioId: 'u1', estado: 'guardado' })).toEqual(['a1', 'a2', 'a4'])
  })
})

describe('orden', () => {
  const ctx = { usuarioId: null, esAdmin: true }
  it('por fecha, nombre y BPM, sin mutar', () => {
    const copia = [...TODAS]
    expect(ordenarMonitoreos(TODAS, { campo: 'fecha', dir: 'desc' }, ctx)[0].id).toBe('a5')
    expect(ordenarMonitoreos(TODAS, { campo: 'fecha', dir: 'asc' }, ctx)[0].id).toBe('a1')
    expect(ordenarMonitoreos(TODAS, { campo: 'bpm', dir: 'desc' }, ctx)[0].id).toBe('a2')
    expect(ordenarMonitoreos(TODAS, { campo: 'nombre', dir: 'asc' }, ctx)[0].id).toBe('a2')
    expect(TODAS).toEqual(copia)
  })
})

describe('metadatos', () => {
  it('valida nombre, nota y actividad (lista cerrada)', () => {
    expect(validarMetadatos({ nombre: 'Prueba 1 (reposo)', notas: 'ok', actividad: 'reposo' }).ok).toBe(true)
    expect(validarMetadatos({ nombre: '' }).errores.nombre).toBeTruthy()
    expect(validarMetadatos({ nombre: '=CMD()' }).errores.nombre).toBeTruthy()
    expect(validarMetadatos({ nombre: '<b>x</b>' }).errores.nombre).toBeTruthy()
    expect(validarMetadatos({ nombre: 'x'.repeat(61) }).errores.nombre).toBeTruthy()
    expect(validarMetadatos({ nombre: 'ok', notas: 'a'.repeat(501) }).errores.notas).toBeTruthy()
    expect(validarMetadatos({ nombre: 'ok', notas: 'hola\u0000' }).errores.notas).toBeTruthy()
    expect(validarMetadatos({ nombre: 'ok', actividad: 'volar' }).errores.actividad).toBeTruthy()
    expect(validarMetadatos({ nombre: 'Día de ñandú' }).ok).toBe(true)
  })
  it('aplica los cambios sin mutar y marca como guardado', () => {
    const orig = structuredClone(S3)
    const nuevo = aplicarMetadatos(S3, { nombre: ' Mi prueba ', notas: 'n', actividad: 'caminata' }, { guardar: true })
    expect(nuevo).toMatchObject({ nombre: 'Mi prueba', notas: 'n', actividadPrincipal: 'caminata', guardado: true })
    expect(S3).toEqual(orig)
    expect(() => aplicarMetadatos(S3, { nombre: '' })).toThrow()
  })
  it('sugiere nombre y calcula la actividad dominante', () => {
    expect(sugerirNombre(S1)).toMatch(/^Monitoreo 2026-10-01 \d\d:\d\d$/)
    expect(nombreMonitoreo(S1)).toBe('Reposo mañana')
    const tl = [{ tMs: 0, valor: 'reposo' }, { tMs: 10000, valor: 'ejercicio' }]
    expect(actividadDominante(tl, 60000)).toBe('ejercicio')
    expect(actividadDominante(tl, 15000)).toBe('reposo')
    expect(actividadDominante([], 10)).toBeNull()
  })
})

describe('contadores', () => {
  it('cuenta solo monitoreos guardados por usuario', () => {
    expect(conteoPorUsuario(TODAS)).toEqual({ u1: 3, u2: 1 })
  })
})

describe('tabla de usuarios', () => {
  const U = [
    { id: 'u1', numero: 1, etiqueta: 'Usuario 1', alias: 'Grupo B', creadoEn: '2026-10-01T10:00:00Z' },
    { id: 'u2', numero: 2, etiqueta: 'Usuario 2', alias: null, creadoEn: '2026-10-02T10:00:00Z' },
    { id: 'u3', numero: 3, etiqueta: 'Usuario 3', alias: 'Grupo A', creadoEn: '2026-10-03T10:00:00Z' },
  ]
  it('busca por seudónimo o alias', () => {
    expect(filtrarUsuarios(U, { texto: 'grupo' }).map((u) => u.id)).toEqual(['u1', 'u3'])
    expect(filtrarUsuarios(U, { texto: 'usuario 2' }).map((u) => u.id)).toEqual(['u2'])
    expect(filtrarUsuarios(U, { texto: '  ' })).toHaveLength(3)
  })
  it('ordena por alias, creación y monitoreos', () => {
    expect(ordenarUsuarios(U, { campo: 'alias', dir: 'asc' }).map((u) => u.id)).toEqual(['u2', 'u3', 'u1'])
    expect(ordenarUsuarios(U, { campo: 'creado', dir: 'desc' }).map((u) => u.id)).toEqual(['u3', 'u2', 'u1'])
    expect(ordenarUsuarios(U, { campo: 'monitoreos', dir: 'desc' }, { u2: 5, u1: 1 }).map((u) => u.id)).toEqual(['u2', 'u1', 'u3'])
  })
})
