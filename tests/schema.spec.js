import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { AUDIT_EVENTS, EVENTOS_SOLO_SERVIDOR } from '@/services/audit/auditLog.js'

/**
 * La lista blanca de tipos de auditoría del servidor (tabla public.tipos_evento) debe coincidir con AUDIT_EVENTS (A.12.4.1)
 * en schema.sql Y en la migración; los eventos 'servidor' deben coincidir con EVENTOS_SOLO_SERVIDOR.
 * Además se vigilan por texto los controles de la TANDA 1 (el SQL real se prueba en supabase/pruebas_rls.sql).
 */
function leer(nombre) {
  for (const ruta of [`../supabase/${nombre}`, `./supabase/${nombre}`]) {
    const url = new URL(ruta, `file://${process.cwd().replace(/\\/g, '/')}/`)
    if (existsSync(url)) return readFileSync(url, 'utf8')
  }
  return null
}

function tiposDe(sql) {
  const m = /insert into public\.tipos_evento \(tipo, origen\) values([\s\S]*?)on conflict/.exec(sql ?? '')
  if (!m) return null
  return [...m[1].matchAll(/\('([A-Z_]+)',\s*'(cliente|admin|servidor)'\)/g)].map((x) => ({ tipo: x[1], origen: x[2] }))
}

for (const archivo of ['schema.sql', 'migracion_endurecimiento_2.sql']) {
  describe(`${archivo} ↔ AUDIT_EVENTS`, () => {
    const sql = leer(archivo)
    const filas = tiposDe(sql)

    it.skipIf(!sql)('encuentra la lista blanca (tipos_evento)', () => {
      expect(filas?.length).toBeGreaterThan(40)
    })

    it.skipIf(!sql)('contiene exactamente los eventos de la aplicación, sin repetidos', () => {
      const enSql = filas.map((f) => f.tipo)
      expect(new Set(enSql).size).toBe(enSql.length)
      expect([...enSql].sort()).toEqual([...AUDIT_EVENTS].sort())
    })

    it.skipIf(!sql)('los eventos de origen "servidor" coinciden con EVENTOS_SOLO_SERVIDOR', () => {
      const servidor = filas.filter((f) => f.origen === 'servidor').map((f) => f.tipo)
      expect([...servidor].sort()).toEqual([...EVENTOS_SOLO_SERVIDOR].sort())
    })

    it.skipIf(!sql)('no queda ningún CHECK fijo de lista blanca', () => {
      expect(/add constraint auditoria_tipo_lista_blanca/.test(sql)).toBe(false)
    })
  })
}

describe('controles de la TANDA 1 presentes en el SQL', () => {
  const schema = leer('schema.sql')
  const mig = leer('migracion_endurecimiento_2.sql')

  it.skipIf(!schema)('es_admin() exige TOTP reciente (claim amr) además de aal2', () => {
    for (const sql of [schema, mig]) {
      const f = /create or replace function public\.es_admin\(\)[\s\S]*?\$\$;/.exec(sql)?.[0] ?? ''
      expect(f).toMatch(/aal2/)
      expect(f).toMatch(/totp_reciente\(900\)/)
    }
    expect(mig).toMatch(/a ->> 'method' = 'totp'/)
  })

  it.skipIf(!schema)('no existe lectura pública directa de bloques ni lectura global del admin', () => {
    for (const sql of [schema, mig]) {
      expect(sql).toMatch(/drop function if exists public\.sesion_es_publica/)
      expect(sql).not.toMatch(/create policy "dueño, admin o público lee bloques"/)
      expect(sql).not.toMatch(/create policy "dueño o admin (lee|borra)/)
    }
  })

  it.skipIf(!schema)('las RPC nuevas revocan a anon y fijan search_path', () => {
    const funciones = ['senal_publica', 'reportar_monitoreo', 'admin_leer_sesion', 'registrar_evento', 'admin_leer_auditoria',
      'verificar_cadena_auditoria', 'admin_retirar_publicacion', 'admin_actualizar_incidente', 'admin_listar_reportes', 'mis_accesos_admin']
    for (const nombre of funciones) {
      const ini = Math.max(mig.indexOf(`create or replace function public.${nombre}(`), mig.indexOf(`create function public.${nombre}(`))
      expect(ini, nombre).toBeGreaterThan(-1)
      const def = mig.slice(ini, mig.indexOf('$$;', mig.indexOf('as $$', ini)))
      expect(def, nombre).toMatch(/set search_path = public/)
      const rev = mig.indexOf(`revoke all on function public.${nombre}(`)
      expect(rev, nombre).toBeGreaterThan(-1)
      expect(mig.slice(rev, rev + 160), nombre).toContain('from public, anon')
    }
  })

  it.skipIf(!schema)('admin_leer_sesion exige motivo de 10 a 300 caracteres y registra el acceso antes de entregar datos', () => {
    const def = /create or replace function public\.admin_leer_sesion[\s\S]*?\$\$;/.exec(mig)?.[0] ?? ''
    expect(def).toMatch(/not between 10 and 300/)
    expect(def.indexOf("'ADMIN_DATA_ACCESS'")).toBeGreaterThan(-1)
    expect(def.indexOf("'ADMIN_DATA_ACCESS'")).toBeLessThan(def.indexOf('return query'))
  })

  it.skipIf(!schema)('auditoría: sin INSERT directo, hash encadenado en el servidor y purga programada', () => {
    expect(mig).toMatch(/revoke insert, update, delete, truncate on public\.auditoria from anon, authenticated/)
    expect(mig).toMatch(/new\.hash := public\._hash_auditoria/)
    expect(mig).toMatch(/purgar_auditoria\(730\)/)
  })

  it.skipIf(!schema)('cuotas y retención usan creado_en del servidor, no el inicio enviado por el cliente', () => {
    expect(mig).toMatch(/delete from public\.sesiones where creado_en </)
    expect(mig).toMatch(/where propietario = new\.propietario and creado_en > now\(\) - interval '1 day'/)
    expect(mig).toMatch(/new\.creado_en := now\(\)/)
    expect(mig).toMatch(/sesiones_inicio_coherente/)
  })

  it.skipIf(!schema)('las migraciones históricas se abortan si ya se aplicó la 2 y la obsoleta no hace nada', () => {
    for (const f of ['migracion_cuentas_pacientes.sql', 'migracion_endurecimiento.sql', 'migracion_admin_mfa.sql', 'migracion_admin_roles.sql']) {
      expect(leer(f), f).toMatch(/to_regclass\('public\.tipos_evento'\) is not null/)
    }
    expect(leer('migracion_eventos_camara.sql')).not.toMatch(/alter table/)
    expect(leer('migracion_admin_mfa.sql')).toMatch(/drop function if exists public\.admin_listar_administradores\(\)/)
  })

  it('los eventos de cuentas, pacientes y visibilidad existen', () => {
    for (const e of ['ACCOUNT_REGISTERED', 'ACCOUNT_LOGIN', 'ACCOUNT_LOGOUT', 'ACCOUNT_PASSWORD_RESET', 'PATIENT_CREATED', 'PATIENT_UPDATED', 'PATIENT_DELETED', 'VISIBILITY_CHANGED', 'LOCAL_DATA_LINKED']) {
      expect(AUDIT_EVENTS).toContain(e)
    }
  })

  it('los eventos nuevos de monitoreos y de la TANDA 1 existen', () => {
    for (const e of ['CAMERA_STARTED', 'CAMERA_STOPPED', 'CAMERA_DENIED', 'TORCH_UNAVAILABLE', 'USER_UPDATED', 'SESSION_SAVED', 'SESSION_UPDATED', 'SESSION_DISCARDED', 'SESSION_DELETED', 'EXPORT_REPORT',
      'ADMIN_DATA_ACCESS', 'CONTENT_REPORTED', 'CONTENT_REMOVED', 'ACCOUNT_PASSWORD_CHANGED']) {
      expect(AUDIT_EVENTS).toContain(e)
    }
  })
})
