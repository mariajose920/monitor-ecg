import { describe, it, expect } from 'vitest'
import { mezclarIncidentes } from '@/services/security/incidents.js'
import { validarMotivoAcceso, validarMotivoReporte, esUuid, MOTIVO_MIN, MOTIVO_MAX } from '@/services/security/soporte.js'

/** C-09: el administrador ve los incidentes de otros navegadores y la respuesta vuelve al reportante. */
const base = { tipo: 'acceso', severidad: 'alta', descripcion: 'Descripción de prueba suficiente', reportadoPor: 'participant' }
const local = (id, extra = {}) => ({ ...base, id, creadoUtc: '2026-10-01T10:00:00.000Z', actualizadoUtc: '2026-10-01T10:00:00.000Z', estado: 'abierto', respuesta: '', leccion: '', historial: [{ ts: '2026-10-01T10:00:00.000Z', estado: 'abierto' }], ...extra })
const nube = (id, extra = {}) => ({ ...base, id, creadoUtc: '2026-10-01T10:00:00.000Z', actualizadoUtc: '2026-10-01T10:00:00.000Z', estado: 'abierto', respuesta: '', leccion: '', historial: [], origen: 'nube', ...extra })

describe('mezclarIncidentes', () => {
  it('el administrador ve un incidente reportado desde otro navegador (solo está en la nube)', () => {
    const { lista, porSubir } = mezclarIncidentes([], [nube('otro')])
    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({ id: 'otro', estado: 'abierto', subido: true })
    expect(lista[0].historial[0].estado).toBe('abierto')
    expect(lista[0].origen).toBeUndefined()
    expect(porSubir).toEqual([])
  })

  it('la respuesta y el estado del administrador llegan al reportante', () => {
    const { lista } = mezclarIncidentes([local('i1')], [nube('i1', { estado: 'cerrado', respuesta: 'Se rotó la clave', leccion: 'Revisar trimestralmente', actualizadoUtc: '2026-10-02T09:00:00.000Z' })])
    expect(lista[0]).toMatchObject({ estado: 'cerrado', respuesta: 'Se rotó la clave', leccion: 'Revisar trimestralmente', subido: true })
    expect(lista[0].historial.map((h) => h.estado)).toEqual(['abierto', 'cerrado'])
  })

  it('el servidor manda: un estado local adelantado pero no confirmado se corrige', () => {
    const { lista } = mezclarIncidentes([local('i1', { estado: 'cerrado', respuesta: 'x', leccion: 'y' })], [nube('i1', { estado: 'en_analisis' })])
    expect(lista[0].estado).toBe('en_analisis')
  })

  it('un incidente solo local (sin subir) se conserva y se marca para reintentar la subida', () => {
    const { lista, porSubir } = mezclarIncidentes([local('nuevo')], [])
    expect(lista[0].subido).toBe(false)
    expect(porSubir.map((x) => x.id)).toEqual(['nuevo'])
  })

  it('uno ya subido que desapareció del servidor (el reportante borró sus datos) se descarta de la caché', () => {
    const { lista } = mezclarIncidentes([local('viejo', { subido: true }), local('vigente', { subido: true })], [nube('vigente')])
    expect(lista.map((x) => x.id)).toEqual(['vigente'])
  })

  it('ordena por fecha de creación', () => {
    const { lista } = mezclarIncidentes([local('b', { creadoUtc: '2026-10-03T00:00:00.000Z' })], [nube('a', { creadoUtc: '2026-10-01T00:00:00.000Z' }), nube('b', { creadoUtc: '2026-10-03T00:00:00.000Z' })])
    expect(lista.map((x) => x.id)).toEqual(['a', 'b'])
  })
})

describe('motivos del acceso excepcional y de los reportes', () => {
  it('el motivo del acceso exige entre 10 y 300 caracteres', () => {
    expect(validarMotivoAcceso('corto')).toMatch(/al menos/)
    expect(validarMotivoAcceso('          ')).toMatch(/al menos/)
    expect(validarMotivoAcceso('Soporte por solicitud 1234')).toBeNull()
    expect(validarMotivoAcceso('x'.repeat(MOTIVO_MAX + 1))).toMatch(/máximo/)
    expect(validarMotivoAcceso('x'.repeat(MOTIVO_MIN))).toBeNull()
    expect(validarMotivoAcceso(undefined)).not.toBeNull()
  })

  it('el motivo del reporte exige entre 3 y 200 caracteres', () => {
    expect(validarMotivoReporte('ab')).not.toBeNull()
    expect(validarMotivoReporte('Contenido ofensivo')).toBeNull()
    expect(validarMotivoReporte('x'.repeat(201))).toMatch(/máximo/)
  })

  it('reconoce identificadores de sesión (uuid) y rechaza otros textos', () => {
    expect(esUuid('bbbbbbbb-0000-4000-8000-000000000001')).toBe(true)
    expect(esUuid(' bbbbbbbb-0000-4000-8000-000000000001 ')).toBe(true)
    expect(esUuid('1; drop table sesiones')).toBe(false)
    expect(esUuid('')).toBe(false)
    expect(esUuid(null)).toBe(false)
  })
})
