import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import {
  validarVisibilidad, visibilidadDe, camposVisibilidadNube, perfilPublicable, mapearMonitoreoPublico,
  filtrarComunidad, PACIENTE_ANONIMO,
} from '@/services/monitoreos/visibilidad.js'
import { aplicarVisibilidad } from '@/services/monitoreos/monitoreoService.js'
import { AUDIT_EVENTS } from '@/services/audit/auditLog.js'

const PERFIL = { rangoEdad: '18-29', pesoKg: 70, nivelActividad: 'moderado' }
const meta = (o = {}) => ({ id: 'a', participantes: [{ usuarioId: 'u1' }], ...o })

describe('reglas de visibilidad', () => {
  it('por defecto todo es privado', () => {
    expect(visibilidadDe({})).toBe('privado')
    expect(visibilidadDe({ visibilidad: 'otra' })).toBe('privado')
  })

  it('publicar exige la casilla de consentimiento explícita', () => {
    expect(validarVisibilidad({ visibilidad: 'publico' }).ok).toBe(false)
    expect(validarVisibilidad({ visibilidad: 'publico', consentimientoPublicar: true }).ok).toBe(true)
    expect(validarVisibilidad({ visibilidad: 'privado' }).ok).toBe(true)
  })

  it('los datos del paciente exigen segunda casilla, perfil con consentimiento y monitoreo público', () => {
    const base = { visibilidad: 'publico', consentimientoPublicar: true, compartirPerfil: true, tienePerfil: true }
    expect(validarVisibilidad(base).errores.consentimientoPerfil).toBeTruthy()
    expect(validarVisibilidad({ ...base, consentimientoPerfil: true }).valores.compartirPerfil).toBe(true)
    expect(validarVisibilidad({ ...base, tienePerfil: false, consentimientoPerfil: true }).ok).toBe(false)
    expect(validarVisibilidad({ ...base, visibilidad: 'privado', consentimientoPerfil: true }).ok).toBe(false)
  })

  it('volver a privado nunca comparte el perfil', () => {
    const v = validarVisibilidad({ visibilidad: 'privado', compartirPerfil: false })
    expect(v.valores).toEqual({ visibilidad: 'privado', compartirPerfil: false })
  })

  it('aplicarVisibilidad exige cuenta para publicar y copia el perfil solo si se comparte', () => {
    const datos = { visibilidad: 'publico', consentimientoPublicar: true, compartirPerfil: true, consentimientoPerfil: true }
    expect(() => aplicarVisibilidad(meta(), datos, { cuenta: false, perfilDe: () => PERFIL })).toThrow(/iniciar sesión/)
    const pub = aplicarVisibilidad(meta(), datos, { cuenta: true, perfilDe: () => PERFIL })
    expect(pub.visibilidad).toBe('publico')
    expect(pub.perfilCompartido).toEqual(PERFIL)
    const priv = aplicarVisibilidad(pub, { visibilidad: 'privado' }, { cuenta: true, perfilDe: () => PERFIL })
    expect(priv.visibilidad).toBe('privado')
    expect(priv.compartirPerfil).toBe(false)
    expect('perfilCompartido' in priv).toBe(false)
    // sin elección de visibilidad no cambia nada
    expect(aplicarVisibilidad(pub, { nombre: 'x' })).toBe(pub)
  })
})

describe('qué se publica', () => {
  it('privado nunca envía datos del paciente a la nube', () => {
    expect(camposVisibilidadNube(meta({ compartirPerfil: true, perfilCompartido: PERFIL }))).toEqual({ visibilidad: 'privado', compartir_perfil: false, perfilCompartido: null })
  })

  it('público sin segunda casilla no envía el perfil', () => {
    const c = camposVisibilidadNube(meta({ visibilidad: 'publico', perfilCompartido: PERFIL }))
    expect(c.compartir_perfil).toBe(false)
    expect(c.perfilCompartido).toBeNull()
  })

  it('público con segunda casilla envía solo los campos del consentimiento', () => {
    const c = camposVisibilidadNube(meta({ visibilidad: 'publico', compartirPerfil: true, perfilCompartido: { ...PERFIL, nombre: 'Ana' } }))
    expect(c.compartir_perfil).toBe(true)
    expect(Object.keys(c.perfilCompartido).sort()).toEqual(['nivelActividad', 'pesoKg', 'rangoEdad'])
    expect(perfilPublicable({})).toBeNull()
  })
})

describe('vista pública', () => {
  const fila = {
    id: 'abc', inicio: '2026-10-01T12:30:00Z', fin: '2026-10-01T12:40:00Z', actividad: 'caminata', paciente: 'Paciente anónimo',
    participantes: [{ canalIndex: 0, fs: 250, actividad: [{ tMs: 0, valor: 'caminata' }], resumen: { bpmMedio: 90 } }],
    perfil: { rangoEdad: '30-39', pesoKg: null, nivelActividad: null, correo: 'x@y.cl' },
  }

  it('mapea la fila al formato de monitoreo, anónima y de solo lectura', () => {
    const m = mapearMonitoreoPublico(fila)
    expect(m.paciente).toBe(PACIENTE_ANONIMO)
    expect(m.origen).toBe('comunidad')
    expect(m.participantes[0].usuarioId).toBe('publico')
    expect(m.nombre).toContain('UTC')
    expect(m.notas).toBe('')
    expect(m.perfil).toEqual({ rangoEdad: '30-39', pesoKg: null, nivelActividad: null })
  })

  it('tolera filas incompletas', () => {
    const m = mapearMonitoreoPublico({ id: 'z', inicio: '2026-01-01T00:00:00Z', participantes: null, perfil: null })
    expect(m.participantes).toEqual([])
    expect(m.perfil).toBeNull()
  })

  it('filtra por texto y actividad', () => {
    const lista = [mapearMonitoreoPublico(fila), mapearMonitoreoPublico({ ...fila, id: 'q', actividad: 'reposo' })]
    expect(filtrarComunidad(lista, { actividad: 'reposo' })).toHaveLength(1)
    expect(filtrarComunidad(lista, { texto: '2026-10' })).toHaveLength(2)
    expect(filtrarComunidad(lista, { texto: 'zzz' })).toHaveLength(0)
  })
})

function leerMigracion() {
  for (const ruta of ['../../supabase/migracion_cuentas_pacientes.sql', '../supabase/migracion_cuentas_pacientes.sql']) {
    const url = new URL(ruta, `file://${process.cwd().replace(/\\/g, '/')}/`)
    if (existsSync(url)) return readFileSync(url, 'utf8')
  }
  return null
}

describe('migración SQL', () => {
  const sql = leerMigracion()

  it.skipIf(!sql)('la vista pública no expone etiqueta, alias, propietario ni nombre', () => {
    const vista = /create or replace view public\.monitoreos_publicos[\s\S]*?where s\.visibilidad/.exec(sql)[0]
    for (const prohibido of ['propietario', 'etiqueta', 'alias', "'nombre'", "'notas'", 'usuarioId', 'paciente_id']) {
      expect(vista, prohibido).not.toContain(prohibido)
    }
    expect(vista).toContain('security_barrier')
  })

  it.skipIf(!sql)('anon no tiene acceso y las políticas usan (select auth.uid())', () => {
    expect(sql).toMatch(/revoke all on public\.monitoreos_publicos from public, anon/)
    expect(sql).not.toContain('to anon')
    expect(sql).toContain('(select auth.uid())')
  })

  it.skipIf(!sql)('la lista blanca de auditoría de la migración coincide con la aplicación', () => {
    const bloque = /auditoria_tipo_lista_blanca check \(tipo in \(([\s\S]*?)\)\) not valid/.exec(sql)[1]
    const enSql = [...bloque.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1])
    expect([...enSql].sort()).toEqual([...AUDIT_EVENTS].sort())
  })

  it.skipIf(!sql)('borrar_mis_datos incluye pacientes y existe eliminar_mi_cuenta', () => {
    expect(sql).toMatch(/delete from public\.pacientes where propietario = uid/)
    expect(sql).toMatch(/function public\.eliminar_mi_cuenta/)
  })
})
