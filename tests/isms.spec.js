import { describe, it, expect } from 'vitest'
import {
  validateIncident, createIncident, transitionIncident, isOpen, DESC_MAX,
} from '@/services/security/incidents.js'
import {
  needsPolicyAcceptance, accessReviewStatus, clockSkew, computeSecurityMetrics, evaluateObjectives,
  POLICY_VERSION, ACCESS_REVIEW_DAYS, CLOCK_SKEW_MAX_MS,
} from '@/services/security/isms.js'
import { AUDIT_EVENTS } from '@/services/audit/auditLog.js'

const DIA = 86400000
const borrador = { tipo: 'debilidad', severidad: 'media', descripcion: 'El equipo del laboratorio quedó con la sesión de admin abierta.' }

describe('incidentes (ISO 27001:2013 A.16.1.2–A.16.1.6)', () => {
  it('valida tipo, severidad y longitud', () => {
    expect(validateIncident(borrador)).toBeNull()
    expect(validateIncident({ ...borrador, tipo: 'hackeo' })).not.toBeNull()
    expect(validateIncident({ ...borrador, severidad: 'critica' })).not.toBeNull()
    expect(validateIncident({ ...borrador, descripcion: 'corto' })).not.toBeNull()
    expect(validateIncident({ ...borrador, descripcion: 'x'.repeat(DESC_MAX + 1) })).not.toBeNull()
    expect(validateIncident(null)).not.toBeNull()
  })

  it('rechaza datos personales o de salud (minimización, A.18.1.4)', () => {
    expect(validateIncident({ ...borrador, descripcion: 'El participante 12.345.678-9 vio otra pantalla' })).toMatch(/RUT/)
    expect(validateIncident({ ...borrador, descripcion: 'Escribir a juan.perez@correo.cl por el CSV' })).toMatch(/RUT|correo/)
    expect(validateIncident({ ...borrador, descripcion: 'Se veía un pulso de 85 bpm de otro usuario' })).toMatch(/salud/)
  })

  it('crea con marca UTC (A.12.4.4) y estado abierto', () => {
    const now = new Date('2026-10-15T12:00:00Z')
    const inc = createIncident(borrador, { reportadoPor: 'participant', now, id: 'i1' })
    expect(inc).toMatchObject({ id: 'i1', estado: 'abierto', creadoUtc: '2026-10-15T12:00:00.000Z', reportadoPor: 'participant' })
    expect(inc.historial).toHaveLength(1)
    expect(isOpen(inc)).toBe(true)
    expect(() => createIncident({ ...borrador, tipo: 'x' })).toThrow()
    expect(createIncident(borrador, { reportadoPor: 'root', id: 'i2' }).reportadoPor).toBe('participant')
  })

  it('respeta el ciclo de vida y exige respuesta y lección para cerrar', () => {
    const inc = createIncident(borrador, { id: 'i1' })
    expect(() => transitionIncident(inc, 'cerrado')).toThrow(/Transición/)
    const analisis = transitionIncident(inc, 'en_analisis')
    expect(analisis.estado).toBe('en_analisis')
    expect(() => transitionIncident(analisis, 'cerrado', { respuesta: 'Se cerró la sesión' })).toThrow(/lección/)
    const cerrado = transitionIncident(analisis, 'cerrado', { respuesta: 'Se cerró la sesión', leccion: 'Reducir inactividad' })
    expect(cerrado.estado).toBe('cerrado')
    expect(cerrado.historial.map((h) => h.estado)).toEqual(['abierto', 'en_analisis', 'cerrado'])
    expect(isOpen(cerrado)).toBe(false)
    expect(() => transitionIncident(cerrado, 'abierto')).toThrow()
    expect(inc.estado).toBe('abierto') // inmutable
  })
})

describe('SGSI: política, revisión de accesos y reloj', () => {
  it('exige aceptar la versión vigente de la política (A.7.2.2)', () => {
    expect(needsPolicyAcceptance(null)).toBe(true)
    expect(needsPolicyAcceptance({ version: '0.9', aceptadaUtc: '2026-01-01T00:00:00Z' })).toBe(true)
    expect(needsPolicyAcceptance({ version: POLICY_VERSION, aceptadaUtc: 'no-fecha' })).toBe(true)
    expect(needsPolicyAcceptance({ version: POLICY_VERSION, aceptadaUtc: '2026-10-01T00:00:00Z' })).toBe(false)
  })

  it('marca vencida la revisión de accesos tras el plazo (A.9.2.5)', () => {
    const now = Date.parse('2026-10-15T00:00:00Z')
    expect(accessReviewStatus(null, now)).toEqual({ vencida: true, diasDesde: null })
    expect(accessReviewStatus(new Date(now - 10 * DIA).toISOString(), now)).toEqual({ vencida: false, diasDesde: 10 })
    expect(accessReviewStatus(new Date(now - ACCESS_REVIEW_DAYS * DIA).toISOString(), now).vencida).toBe(true)
  })

  it('detecta desfase del reloj frente al servidor (A.12.4.4)', () => {
    const server = '2026-10-15T12:00:00.000Z'
    const base = Date.parse(server)
    expect(clockSkew(base + 500, server)).toEqual({ ok: true, skewMs: 500 })
    expect(clockSkew(base - CLOCK_SKEW_MAX_MS - 5000, server).ok).toBe(false)
    expect(clockSkew(base, 'Thu, 15 Oct 2026 12:00:00 GMT').ok).toBe(true)
    expect(clockSkew(base, 'basura')).toBeNull()
  })

  it('los eventos nuevos existen en el catálogo de auditoría', () => {
    for (const e of ['INCIDENT_REPORTED', 'INCIDENT_UPDATED', 'POLICY_ACCEPTED', 'ACCESS_REVIEW_DONE', 'CLOCK_SKEW']) {
      expect(AUDIT_EVENTS).toContain(e)
    }
  })
})

describe('indicadores 9.1 y objetivos 6.2', () => {
  const now = Date.parse('2026-10-15T00:00:00Z')
  const ts = (dias) => new Date(now - dias * DIA).toISOString()
  const audit = [
    { ts: ts(1), event: 'ADMIN_LOGIN_FAIL' },
    { ts: ts(2), event: 'ADMIN_LOGIN_FAIL' },
    { ts: ts(40), event: 'ADMIN_LOGIN_FAIL' }, // fuera de la ventana de 30 días
    { ts: ts(3), event: 'ADMIN_LOCKED' },
    { ts: ts(3), event: 'EXPORT_CSV' },
  ]
  const abierto = { ...createIncident(borrador, { id: 'a' }), severidad: 'alta' }

  it('cuenta eventos en la ventana e incidentes abiertos', () => {
    const m = computeSecurityMetrics({ audit, integridad: { ok: true }, incidentes: [abierto], ultimaRevisionUtc: ts(5), politica: { version: POLICY_VERSION, aceptadaUtc: ts(5) }, now })
    expect(m).toMatchObject({
      loginsFallidos: 2, bloqueos: 1, exportaciones: 1, integridadAuditoria: 'OK',
      incidentesAbiertos: 1, incidentesAltaAbiertos: 1, revisionAccesosVencida: false, politicaAceptada: true,
    })
    const obj = evaluateObjectives(m)
    expect(obj).toHaveLength(6)
    expect(obj.find((o) => o.id === 'OBJ-2').cumple).toBe(false)
    expect(obj.find((o) => o.id === 'OBJ-1').cumple).toBe(true)
  })

  it('refleja auditoría rota y falta de verificación', () => {
    expect(computeSecurityMetrics({ integridad: { ok: false }, now }).integridadAuditoria).toBe('ROTA')
    const m = computeSecurityMetrics({ now })
    expect(m.integridadAuditoria).toBe('sin verificar')
    expect(evaluateObjectives(m).filter((o) => !o.cumple).map((o) => o.id)).toEqual(['OBJ-1', 'OBJ-4', 'OBJ-5'])
  })
})
