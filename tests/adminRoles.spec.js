import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  validarCorreoAdmin, normalizarCorreo, puedeConcederRol, puedeRetirarRol, mensajeErrorRol, MAX_ADMINISTRADORES,
  MSG_ROL_GENERICO, MSG_ROL_LIMITE,
} from '@/services/security/adminMfa.js'
import { AUDIT_EVENTS } from '@/services/audit/auditLog.js'

describe('gestión de administradores (A.9.2.3, A.9.2.5, A.9.2.6)', () => {
  it('normaliza y valida el correo (formato y largo ≤ 254)', () => {
    expect(normalizarCorreo('  Persona@Ejemplo.CL ')).toBe('persona@ejemplo.cl')
    expect(validarCorreoAdmin(' Persona@Ejemplo.cl ')).toBeNull()
    for (const malo of ['', '   ', 'sin-arroba', 'a@b', 'a b@c.cl', '@c.cl', 'a@@c.cl', null, undefined]) {
      expect(validarCorreoAdmin(malo), String(malo)).toBeTruthy()
    }
    const largo = `${'a'.repeat(250)}@x.cl`
    expect(validarCorreoAdmin(largo)).toBeTruthy()
    expect(validarCorreoAdmin(`${'a'.repeat(248)}@x.cl`)).toBeNull() // 254 exactos
  })

  it('límite de 5 administradores', () => {
    expect(MAX_ADMINISTRADORES).toBe(5)
    expect(puedeConcederRol(4)).toBe(true)
    expect(puedeConcederRol(5)).toBe(false)
    expect(puedeConcederRol(6)).toBe(false)
  })

  it('no se puede retirar a uno mismo ni dejar el sistema sin administradores', () => {
    expect(puedeRetirarRol({ total: 3, objetivoId: 'a', yoId: 'a' }).ok).toBe(false)
    expect(puedeRetirarRol({ total: 1, objetivoId: 'b', yoId: 'a' }).ok).toBe(false)
    expect(puedeRetirarRol({ total: 2, objetivoId: 'b', yoId: 'a' })).toEqual({ ok: true, motivo: '' })
  })

  it('los errores del servidor se traducen a mensajes genéricos (no revelan si un correo existe)', () => {
    expect(mensajeErrorRol({ message: 'No se pudo conceder el rol' })).toBe(MSG_ROL_GENERICO)
    expect(mensajeErrorRol({ message: 'violates something users auth' })).toBe(MSG_ROL_GENERICO)
    expect(mensajeErrorRol({ message: 'limite_administradores' })).toBe(MSG_ROL_LIMITE)
    expect(MSG_ROL_GENERICO).not.toMatch(/existe|registrad|confirmad/i)
  })

  it('los eventos de auditoría de concesión y retiro están en la lista blanca', () => {
    expect(AUDIT_EVENTS).toContain('ADMIN_ROLE_GRANTED')
    expect(AUDIT_EVENTS).toContain('ADMIN_ROLE_REVOKED')
  })

  const leer = (...r) => { try { return readFileSync(resolve(process.cwd(), ...r), 'utf8') } catch { return null } }
  const mig = leer('..', 'supabase', 'migracion_admin_roles.sql')
  const sch = leer('..', 'supabase', 'schema.sql')

  it.skipIf(!mig || !sch)('SQL: funciones con search_path fijo, solo es_admin, sin acceso anónimo y sin correos en auditoría', () => {
    for (const sql of [mig, sch]) {
      for (const f of ['admin_conceder_rol(text)', 'admin_retirar_rol(uuid)', 'admin_listar_administradores()']) {
        expect(sql).toContain(`revoke all on function public.${f} from public, anon;`)
        expect(sql).toContain(`grant execute on function public.${f} to authenticated;`)
      }
      expect(sql.match(/set search_path = public/g).length).toBeGreaterThanOrEqual(3)
      // listar sigue con es_admin(); conceder y retirar exigen TOTP de los últimos 5 min (es_admin_reciente, C-05)
      expect(sql.match(/if not public\.es_admin\(\) then/g).length).toBeGreaterThanOrEqual(1)
      expect(sql.includes('es_admin_reciente(300)') || sql === mig).toBe(true)
      expect(sql).toMatch(/revoke insert, update, delete on public\.administradores from anon, authenticated/)
      expect(sql).toMatch(/>= 5/)
      expect(sql).toMatch(/jsonb_build_object\('objetivo', v_objetivo, 'por', v_yo\)/)
      expect(sql).not.toMatch(/jsonb_build_object\([^)]*email/)
      expect(sql).toMatch(/email_confirmed_at is not null/)
      expect(sql).toMatch(/p_user_id = v_yo/)
    }
  })

  it('la interfaz no usa v-html', () => {
    expect(readFileSync('src/components/admin/AdminRolesPanel.vue', 'utf8')).not.toMatch(/v-html/)
  })
})
