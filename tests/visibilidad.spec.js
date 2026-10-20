import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import {
  validarVisibilidad, visibilidadDe, camposVisibilidadNube, perfilPublicable, mapearMonitoreoPublico,
  filtrarComunidad, PACIENTE_ANONIMO,
} from '@/services/monitoreos/visibilidad.js'
import { aplicarVisibilidad } from '@/services/monitoreos/monitoreoService.js'

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

function leerSql(nombre) {
  for (const base of ['../../supabase/', '../supabase/']) {
    const url = new URL(base + nombre, 'file://' + process.cwd().replaceAll(String.fromCharCode(92), '/') + '/')
    if (existsSync(url)) return readFileSync(url, 'utf8')
  }
  return null
}

describe('migración de endurecimiento (funciones públicas y retención)', () => {
  const sql = leerSql('migracion_endurecimiento.sql')
  const schema = leerSql('schema.sql')

  it.skipIf(!sql)('elimina la vista y define funciones con search_path fijo', () => {
    expect(sql).toContain('drop view if exists public.monitoreos_publicos;')
    expect(sql).not.toMatch(/create (or replace )?view/)
    for (const fn of ['listar_monitoreos_publicos', 'monitoreo_publico']) {
      expect(sql).toContain('create or replace function public.' + fn)
    }
    expect((sql.match(/security definer\s+set search_path = public/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })

  it.skipIf(!sql)('las funciones públicas no exponen etiqueta, alias, propietario ni nombre', () => {
    const cuerpo = /create or replace function public\.listar_monitoreos_publicos[\s\S]*?offset greatest/.exec(sql)[0]
    for (const prohibido of ['propietario', 'etiqueta', 'alias', "'nombre'", "'notas'", 'usuarioId', 'paciente_id']) {
      expect(cuerpo, prohibido).not.toContain(prohibido)
    }
    expect(cuerpo).toContain("'Paciente anónimo'")
    expect(cuerpo).toContain('least(')
    expect(cuerpo).toContain('100')
  })

  it.skipIf(!sql)('anon sin acceso y authenticated con execute', () => {
    expect(sql).toContain('revoke all on function public.listar_monitoreos_publicos(integer, integer) from public, anon;')
    expect(sql).toContain('grant execute on function public.listar_monitoreos_publicos(integer, integer) to authenticated;')
    expect(sql).toContain('revoke all on function public.monitoreo_publico(uuid) from public, anon;')
    expect(sql).not.toContain('to anon')
  })

  it.skipIf(!sql)('retención de 365 días y tarea pg_cron idempotente', () => {
    expect(sql).toContain('purgar_sesiones(dias integer default 365)')
    expect(sql).toContain('create extension if not exists pg_cron')
    expect(sql).toContain("cron.unschedule('purga-ecg')")
    expect(sql).toContain("cron.schedule('purga-ecg'")
    expect(sql).toContain('purgar_sesiones(365)')
  })

  it.skipIf(!schema)('schema.sql es coherente: sin vista, con funciones y 365 días', () => {
    expect(schema).not.toMatch(/create (or replace )?view public\.monitoreos_publicos/)
    expect(schema).toContain('listar_monitoreos_publicos')
    expect(schema).toContain('monitoreo_publico')
    expect(schema).toContain('purgar_sesiones(dias integer default 365)')
  })
})

describe('migración SQL', () => {
  const sql = leerSql('migracion_cuentas_pacientes.sql')

  it.skipIf(!sql)('las políticas usan (select auth.uid()) y no hay acceso para anon', () => {
    expect(sql).not.toContain('to anon')
    expect(sql).toContain('(select auth.uid())')
  })

  it.skipIf(!sql)('la migración histórica ya no fija la lista blanca (vive en tipos_evento)', () => {
    expect(sql).not.toContain('auditoria_tipo_lista_blanca check')
  })

  it.skipIf(!sql)('borrar_mis_datos incluye pacientes y existe eliminar_mi_cuenta', () => {
    expect(sql).toContain('delete from public.pacientes where propietario = uid')
    expect(sql).toContain('function public.eliminar_mi_cuenta')
  })
})

describe('TANDA 1: lo público sin fuga de identificadores (C-04)', () => {
  const mig = leerSql('migracion_endurecimiento_2.sql')

  it('mapea la duración en lugar de la hora de fin y no deja hora en el nombre', () => {
    const m = mapearMonitoreoPublico({ id: 'a', inicio: '2026-10-01T00:00:00Z', duracion_s: 600, participantes: [] })
    expect(m.fin).toBeNull()
    expect(m.duracionS).toBe(600)
    expect(m.nombre).toBe('Monitoreo público 2026-10-01 UTC')
    expect(mapearMonitoreoPublico({ id: 'b', inicio: '2026-10-01T00:00:00Z', participantes: [] }).duracionS).toBeNull()
  })

  it.skipIf(!mig)('las RPC públicas truncan la fecha al día, excluyen cuentas anónimas y no devuelven propietario', () => {
    for (const fn of ['listar_monitoreos_publicos', 'monitoreo_publico']) {
      const ini = mig.indexOf(`create function public.${fn}(`)
      const def = mig.slice(ini, mig.indexOf('$$;', mig.indexOf('as $$', ini)) + 3)
      expect(def, fn).toContain("date_trunc('day'")
      expect(def, fn).toContain('es_cuenta_registrada()')
      expect(def, fn).toContain('duracion_s')
      for (const prohibido of ['propietario', 'etiqueta', 'alias', 'paciente_id', "'nombre'", "'notas'"]) expect(def, prohibido).not.toContain(prohibido)
    }
  })

  it.skipIf(!mig)('senal_publica: solo sesiones públicas finalizadas, máx. 60 bloques, sin propietario', () => {
    const def = /create or replace function public\.senal_publica[\s\S]*?\$\$;/.exec(mig)[0]
    expect(def).toContain("s.visibilidad = 'publico' and s.estado = 'finalizada'")
    expect(def).toContain('least(greatest(coalesce(p_limite, 60), 1), 60)')
    expect(def).toContain('es_cuenta_registrada()')
    expect(def).not.toContain('propietario')
    expect(mig).toContain('grant execute on function public.senal_publica(uuid, smallint, integer, integer) to authenticated;')
  })

  it.skipIf(!mig)('reportes: cuota diaria, una fila por cuenta y sesión, retiro que bloquea la republicación', () => {
    expect(mig).toContain("cuota('reportes_por_dia')")
    expect(mig).toContain('create unique index if not exists reportes_unico_idx')
    expect(mig).toContain('retiros_contenido')
    expect(mig).toContain("'CONTENT_REMOVED'")
  })
})
