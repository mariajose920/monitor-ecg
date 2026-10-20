import { describe, it, expect } from 'vitest'
import {
  CONSENT_VERSION, consentimientoVigente, declaracionVigente, crearConsentimiento, crearDeclaracion, requiereReconsentimiento,
  crearConsentimientoPublicacion, publicacionVigente,
} from '@/services/privacidad/consentimiento.js'
import { validarAlias, aliasPareceNombre } from '@/services/privacidad/alias.js'
import { leerResponsable } from '@/services/privacidad/responsable.js'
import { leerOptIn, guardarOptIn, olvidarOptIn, puedeSubirDatos } from '@/services/cloud/nubeOptIn.js'
import { datosSesionNube, filaPacienteNube, filaSesionNube, puedeSubirPaciente, eventoParaNube, mezclarPacienteNube } from '@/services/cloud/datosNube.js'
import {
  crearAlmacenAuth, compartidoPorDefecto, valorInicialCompartido, guardarEquipoCompartido, borrarTokens, CLAVE_AUTH,
} from '@/services/cloud/almacenSesion.js'
import { estadoInactividad, segundosRestantes, crearControlInactividad, INACTIVIDAD_MS, AVISO_ANTES_MS } from '@/services/security/inactividad.js'
import { validarPassword, esContrasenaComun, validarRegistro, MSG_CREDENCIALES } from '@/services/accounts/validation.js'
import { ventanaReauthVigente, REAUTH_VENTANA_MS } from '@/services/security/reauth.js'
import { planVinculacion, monitoreoParaCuenta } from '@/services/accounts/linkLocal.js'
import { validarEvidencia, resumenEvidencias } from '@/services/security/evidencias.js'
import { aplicarVisibilidad } from '@/services/monitoreos/monitoreoService.js'

const almacen = () => {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), keys: () => [...m.keys()], m }
}
const prefsDe = () => {
  const a = almacen()
  return { get: (k, d) => (a.m.has(k) ? JSON.parse(a.m.get(k)) : d), set: (k, v) => a.setItem(k, JSON.stringify(v)), remove: (k) => a.removeItem(k) }
}

describe('consentimiento versionado (C-02)', () => {
  const u = { id: 'u1', declaracion: crearDeclaracion({ por: 'c1' }) }
  it('la versión vigente es 2.0', () => expect(CONSENT_VERSION).toBe('2.0'))
  it('un consentimiento de otra versión no es vigente y obliga a repetirlo', () => {
    const viejo = { ...u, consentimiento: { userId: 'u1', consentVersion: '1.0', acceptedAt: 'x', scope: [] } }
    expect(consentimientoVigente(viejo)).toBe(false)
    expect(requiereReconsentimiento(viejo)).toBe(true)
    expect(consentimientoVigente({ ...u, consentimiento: crearConsentimiento(u, { cuentaId: 'c1' }) })).toBe(true)
    expect(requiereReconsentimiento({ ...u, consentimiento: null })).toBe(false)
  })
  it('registra quién lo otorga, canal, mayoría de edad y alcance; cabe en 1 KB', () => {
    const c = crearConsentimiento(u, { cuentaId: 'c1', nube: true })
    expect(c).toMatchObject({ otorgadoPor: 'c1', canal: 'app', declaraMayorEdad: true, alcance: { opcionales: true, nube: true, publicar: false } })
    expect(JSON.stringify(c).length).toBeLessThan(1024)
  })
  it('la declaración de mayoría de edad y el consentimiento de publicación se validan', () => {
    expect(declaracionVigente({})).toBe(false)
    expect(declaracionVigente(u)).toBe(true)
    expect(publicacionVigente(crearConsentimientoPublicacion({ por: 'c1' }))).toBe(true)
    expect(publicacionVigente({ version: '1.0', fecha: 'x' })).toBe(false)
    expect(publicacionVigente(null)).toBe(false)
  })
})

describe('responsable configurable', () => {
  it('lee nombre y correo del entorno y no inventa un responsable', () => {
    expect(leerResponsable({ VITE_RESPONSABLE_NOMBRE: 'Dra. Prueba', VITE_RESPONSABLE_CORREO: 'dra@u.cl' })).toMatchObject({ configurado: true, correo: 'dra@u.cl' })
    const vacio = leerResponsable({})
    expect(vacio.configurado).toBe(false)
    expect(vacio.correo).toBe('')
    expect(leerResponsable({ VITE_RESPONSABLE_NOMBRE: 'X', VITE_RESPONSABLE_CORREO: 'no-es-correo' }).correo).toBe('')
  })
})

describe('nube opt-in por cuenta (C-03)', () => {
  it('por defecto está apagada y no se sube nada', () => {
    const p = prefsDe()
    expect(leerOptIn('c1', p)).toBeNull()
    expect(puedeSubirDatos({ cuentaId: 'c1', optIn: leerOptIn('c1', p) })).toBe(false)
  })
  it('es por cuenta y se puede olvidar', () => {
    const p = prefsDe()
    guardarOptIn('c1', true, p)
    expect(leerOptIn('c1', p)).toBe(true)
    expect(leerOptIn('c2', p)).toBeNull()
    expect(puedeSubirDatos({ cuentaId: 'c1', optIn: true })).toBe(true)
    expect(puedeSubirDatos({ cuentaId: null, optIn: true })).toBe(false)
    guardarOptIn('c1', false, p)
    expect(leerOptIn('c1', p)).toBe(false)
    olvidarOptIn('c1', p)
    expect(leerOptIn('c1', p)).toBeNull()
  })
})

describe('qué se sube (C-03, C-17)', () => {
  const meta = {
    id: 's1', estado: 'finalizada', guardado: true, inicio: '2026-10-01T10:00:00Z', fin: '2026-10-01T10:01:00Z', motivoFin: 'usuario',
    nombre: 'Juan Pérez en reposo', notas: 'habla de su RUT', parametrosAplicados: { a: 1 }, actividadPrincipal: 'reposo', visibilidad: 'privado',
    participantes: [{
      canalIndex: 0, canalNombre: 'Canal de Juan', usuarioId: 'u1', fuente: { tipo: 'serial', perfilId: 'ad8232', info: { vid: 1, pid: 2 } }, fs: 250,
      actividad: [{ tMs: 0, valor: 'reposo' }], eventos: [{ tMs: 1, tipo: 'x', datos: { libre: 'texto' } }], resumen: { bpmMedio: 70 }, estadoFinal: 'finalizado', motivoFin: 'usuario',
    }],
  }
  it('la sesión no lleva nombre, notas, parámetros, fuente.info, eventos ni nombre de canal', () => {
    const d = datosSesionNube(meta)
    const txt = JSON.stringify(d)
    expect(txt).not.toMatch(/Juan|RUT|"vid"|"info"|eventos|parametrosAplicados|notas|nombre|canalNombre/)
    expect(d.participantes[0]).toMatchObject({ canalIndex: 0, usuarioId: 'u1', fs: 250, resumen: { bpmMedio: 70 } })
    expect(d.actividadPrincipal).toBe('reposo')
  })
  it('lo privado nunca lleva perfil ni consentimiento de publicación; lo público sí lleva el consentimiento', () => {
    const cp = crearConsentimientoPublicacion({ por: 'c1' })
    expect(datosSesionNube({ ...meta, consentPublicacion: cp }).consentPublicacion).toBeUndefined()
    expect(filaSesionNube({ ...meta, visibilidad: 'publico', consentPublicacion: cp }).datos.consentPublicacion).toEqual(cp)
    expect(filaSesionNube({ ...meta, perfilCompartido: { rangoEdad: '18-24' } }).datos.perfilCompartido).toBeUndefined()
  })
  it('el paciente sube solo etiqueta; sin alias; perfil solo con consentimiento vigente', () => {
    const base = { id: 'u1', etiqueta: 'Paciente 1', alias: 'Grupo A', perfil: { rangoEdad: '18-24', pesoKg: 70 }, creadoEn: 'a', actualizadoEn: 'b', declaracion: crearDeclaracion({}) }
    const sin = filaPacienteNube({ ...base, consentimiento: null })
    expect(sin.alias).toBeNull()
    expect(sin.perfil).toBeNull()
    const v1 = filaPacienteNube({ ...base, consentimiento: { consentVersion: '1.0' } })
    expect(v1.perfil).toBeNull()
    expect(v1.consentimiento).toBeNull()
    const v2 = filaPacienteNube({ ...base, consentimiento: crearConsentimiento(base, {}) })
    expect(v2.perfil).toEqual(base.perfil)
    expect(v2.alias).toBeNull()
    expect(JSON.stringify(v2)).not.toMatch(/Grupo A/)
  })
  it('sin declaración de mayoría de edad no se sube el paciente', () => {
    expect(puedeSubirPaciente({ id: 'u' })).toBe(false)
    expect(puedeSubirPaciente({ declaracion: crearDeclaracion({}) })).toBe(true)
  })
  it('lo que llega de la nube conserva el alias local', () => {
    expect(mezclarPacienteNube({ alias: 'Mío' }, { id: 'u', alias: 'otro' }).alias).toBe('Mío')
    expect(mezclarPacienteNube(null, { id: 'u', alias: 'x' }).alias).toBeNull()
  })
  it('con la nube apagada solo salen eventos de seguridad mínimos y sin identificadores', () => {
    expect(eventoParaNube('SESSION_SAVED', { sesion: 'ab' }, { nubeActiva: false })).toBeNull()
    expect(eventoParaNube('PATIENT_CREATED', { usuario: 'Paciente 1' }, { nubeActiva: false })).toBeNull()
    expect(eventoParaNube('ACCOUNT_LOGIN', { usuario: 'Paciente 1', equipoCompartido: true }, { nubeActiva: false })).toEqual({ tipo: 'ACCOUNT_LOGIN', detalle: { equipoCompartido: true } })
    expect(eventoParaNube('SESSION_SAVED', { sesion: 'ab' }, { nubeActiva: true })).toEqual({ tipo: 'SESSION_SAVED', detalle: { sesion: 'ab' } })
  })
})

describe('publicación (C-04)', () => {
  const meta = { id: 's1', participantes: [{ usuarioId: 'u1' }] }
  const datos = { visibilidad: 'publico', consentimientoPublicar: true }
  it('exige cuenta, nube activada y declaración de mayoría de edad', () => {
    expect(() => aplicarVisibilidad(meta, datos, { cuenta: false })).toThrow(/cuenta/)
    expect(() => aplicarVisibilidad(meta, datos, { cuenta: true, nube: false })).toThrow(/nube/)
    expect(() => aplicarVisibilidad(meta, datos, { cuenta: true, nube: true, declarados: () => false })).toThrow(/mayoría de edad/)
  })
  it('al publicar guarda el consentimiento 2.0 con la cuenta; al volver a privado lo quita', () => {
    const pub = aplicarVisibilidad(meta, datos, { cuenta: true, nube: true, cuentaId: 'c1', declarados: () => true })
    expect(pub.consentPublicacion).toMatchObject({ version: '2.0', por: 'c1' })
    const priv = aplicarVisibilidad(pub, { visibilidad: 'privado' }, { cuenta: true, nube: true })
    expect(priv.consentPublicacion).toBeUndefined()
  })
})

describe('equipo compartido: selección de almacén del token (C-07)', () => {
  it('por defecto: escritorio = compartido; móvil táctil = personal', () => {
    expect(compartidoPorDefecto({ ancho: 1280, punteroFino: true })).toBe(true)
    expect(compartidoPorDefecto({ ancho: 390, punteroFino: false })).toBe(false)
    expect(valorInicialCompartido(almacen(), { ancho: 1280, punteroFino: true })).toBe(true)
  })
  it('la elección guardada manda sobre el valor por defecto', () => {
    const local = almacen()
    guardarEquipoCompartido(false, local)
    expect(valorInicialCompartido(local, { ancho: 1280, punteroFino: true })).toBe(false)
  })
  it('compartido: el token va a sessionStorage y no a localStorage', () => {
    const local = almacen()
    const sesion = almacen()
    guardarEquipoCompartido(true, local)
    const a = crearAlmacenAuth({ local, sesion })
    a.setItem(CLAVE_AUTH, 'tok')
    expect(sesion.getItem(CLAVE_AUTH)).toBe('tok')
    expect(local.getItem(CLAVE_AUTH)).toBeNull()
    expect(a.getItem(CLAVE_AUTH)).toBe('tok')
  })
  it('personal: el token va a localStorage', () => {
    const local = almacen()
    const sesion = almacen()
    guardarEquipoCompartido(false, local)
    const a = crearAlmacenAuth({ local, sesion })
    a.setItem(CLAVE_AUTH, 'tok')
    expect(local.getItem(CLAVE_AUTH)).toBe('tok')
    expect(sesion.getItem(CLAVE_AUTH)).toBeNull()
  })
  it('una sesión antigua en localStorage se lee y, al guardarse de nuevo, pasa al almacén correcto', () => {
    const local = almacen()
    const sesion = almacen()
    guardarEquipoCompartido(true, local)
    local.setItem(CLAVE_AUTH, 'viejo')
    const a = crearAlmacenAuth({ local, sesion })
    expect(a.getItem(CLAVE_AUTH)).toBe('viejo')
    a.setItem(CLAVE_AUTH, 'nuevo')
    expect(local.getItem(CLAVE_AUTH)).toBeNull()
    expect(sesion.getItem(CLAVE_AUTH)).toBe('nuevo')
  })
  it('cerrar sesión borra los tokens de ambos almacenes (y el verificador PKCE)', () => {
    const local = almacen()
    const sesion = almacen()
    local.setItem(CLAVE_AUTH, 'a')
    sesion.setItem(CLAVE_AUTH, 'b')
    sesion.setItem(`${CLAVE_AUTH}-code-verifier`, 'c')
    local.setItem('otra-clave', 'z')
    borrarTokens({ local, sesion })
    expect(local.getItem(CLAVE_AUTH)).toBeNull()
    expect(sesion.getItem(CLAVE_AUTH)).toBeNull()
    expect(sesion.getItem(`${CLAVE_AUTH}-code-verifier`)).toBeNull()
    expect(local.getItem('otra-clave')).toBe('z')
  })
})

describe('cierre por inactividad (C-07)', () => {
  it('estados: activo, aviso 1 min antes y vencido a los 15 min', () => {
    const base = { ultimaActividad: 0 }
    expect(estadoInactividad({ ...base, ahora: 5 * 60_000 })).toBe('activo')
    expect(estadoInactividad({ ...base, ahora: INACTIVIDAD_MS - AVISO_ANTES_MS })).toBe('aviso')
    expect(estadoInactividad({ ...base, ahora: INACTIVIDAD_MS })).toBe('vencido')
    expect(segundosRestantes({ ultimaActividad: 0, ahora: INACTIVIDAD_MS - 30_000 })).toBe(30)
  })
  it('el controlador avisa, se recupera con actividad y vence una sola vez', () => {
    let t = 0
    const ev = []
    const c = crearControlInactividad({ ahora: () => t, alAviso: (s) => ev.push(['aviso', s]), alVencer: () => ev.push(['vencer']), alRecuperar: () => ev.push(['ok']) })
    t = 14 * 60_000
    c.tic()
    expect(ev).toEqual([['aviso', 60]])
    c.actividad()
    expect(ev.at(-1)).toEqual(['ok'])
    t += INACTIVIDAD_MS
    c.tic()
    c.tic()
    expect(ev.filter((e) => e[0] === 'vencer')).toHaveLength(1)
  })
  it('una medición en curso cuenta como actividad', () => {
    let t = 0
    let medicion = true
    let vencio = false
    const c = crearControlInactividad({ ahora: () => t, ocupado: () => medicion, alVencer: () => (vencio = true) })
    t = 40 * 60_000
    c.tic()
    expect(vencio).toBe(false)
    medicion = false
    t += 16 * 60_000
    c.tic()
    expect(vencio).toBe(true)
  })
})

describe('política de contraseña y mensajes sin enumeración (C-13)', () => {
  it('rechaza contraseñas comunes o predecibles', () => {
    for (const p of ['password123', 'Contraseña1234', 'qwerty12345', 'holahola12', 'abcabcabc1', 'a1a1a1a1a1']) {
      expect(esContrasenaComun(p), p).toBe(true)
      expect(validarPassword(p), p).toMatch(/común/)
    }
  })
  it('acepta contraseñas razonables y mantiene el mínimo de 10', () => {
    expect(validarPassword('claveSegura2026')).toBeNull()
    expect(validarPassword('Corta1')).toMatch(/al menos 10/)
  })
  it('el registro exige declarar la mayoría de edad', () => {
    const ok = { correo: 'a@b.cl', password: 'claveSegura2026', confirmar: 'claveSegura2026', acepta: true }
    expect(validarRegistro(ok).errores.mayorEdad).toBeTruthy()
    expect(validarRegistro({ ...ok, mayorEdad: true }).ok).toBe(true)
  })
  it('el mensaje de credenciales es genérico (no revela si la cuenta existe)', () => {
    expect(MSG_CREDENCIALES).not.toMatch(/no existe|no registrad|inexistente/i)
  })
  it('la ventana de reautenticación dura 5 minutos', () => {
    expect(ventanaReauthVigente({ desde: 1000, ahora: 1000 + REAUTH_VENTANA_MS - 1 })).toBe(true)
    expect(ventanaReauthVigente({ desde: 1000, ahora: 1000 + REAUTH_VENTANA_MS })).toBe(false)
    expect(ventanaReauthVigente({ desde: 0, ahora: 5 })).toBe(false)
  })
})

describe('alias (C-17)', () => {
  it('rechaza nombre y apellido y números de documento; acepta códigos', () => {
    expect(aliasPareceNombre('Juan Perez')).toBe(true)
    expect(validarAlias('Juan Perez')).toMatch(/nombre/)
    expect(validarAlias('12345678-9')).toMatch(/documento/)
    expect(validarAlias('Grupo A-2')).toBeNull()
    expect(validarAlias('')).toBeNull()
    expect(validarAlias('ñandú')).toMatch(/inválido/)
  })
})

describe('vincular datos del dispositivo (C-15)', () => {
  const filas = [
    ['users', [{ id: 'u1', etiqueta: 'Paciente 1' }, { id: 'u2', etiqueta: 'Paciente 2' }, { id: 'u3', etiqueta: 'Paciente 3' }]],
    ['session:a', { id: 'a', participantes: [{ usuarioId: 'u1' }] }],
    ['session:b', { id: 'b', participantes: [{ usuarioId: 'u1' }, { usuarioId: 'u2' }] }],
    ['session:c', { id: 'c', participantes: [{ usuarioId: 'u3' }] }],
  ]
  it('solo se vincula lo elegido; un monitoreo compartido no se parte', () => {
    const p = planVinculacion(filas, ['u1'])
    expect(p.pacientes.map((u) => u.id)).toEqual(['u1'])
    expect(p.sesiones.map((s) => s.id)).toEqual(['a'])
    expect(p.omitidas).toEqual(['b'])
    expect(planVinculacion(filas, ['u1', 'u2']).sesiones.map((s) => s.id).sort()).toEqual(['a', 'b'])
    expect(planVinculacion(filas, []).pacientes).toEqual([])
  })
  it('lo vinculado pasa a la cuenta como privado, sin perfil ni consentimiento de publicación y sin marca de nube', () => {
    const m = monitoreoParaCuenta({ id: 'a', visibilidad: 'publico', compartirPerfil: true, perfilCompartido: {}, consentPublicacion: {}, enNube: true })
    expect(m).toMatchObject({ visibilidad: 'privado', compartirPerfil: false, enNube: false })
    expect(m.perfilCompartido).toBeUndefined()
    expect(m.consentPublicacion).toBeUndefined()
  })
})

describe('evidencias del SGSI (C-10)', () => {
  const ok = { tipo: 'auditoria_interna', fecha: '2026-10-01', responsable: 'Ana Auditora', referencia: 'docs/sgsi/evidencias/AI-01.md' }
  it('valida tipo, fecha, responsable y no admite fechas futuras', () => {
    expect(validarEvidencia(ok, new Date('2026-10-20')).ok).toBe(true)
    expect(validarEvidencia({ ...ok, tipo: 'x' }).errores.tipo).toBeTruthy()
    expect(validarEvidencia({ ...ok, fecha: '2030-01-01' }, new Date('2026-10-20')).errores.fecha).toMatch(/futura/)
    expect(validarEvidencia({ ...ok, fecha: 'ayer' }).errores.fecha).toBeTruthy()
    expect(validarEvidencia({ ...ok, responsable: '' }).errores.responsable).toBeTruthy()
  })
  it('resume la última evidencia de cada tipo sin inventar las que faltan', () => {
    const r = resumenEvidencias([{ ...ok }, { ...ok, fecha: '2026-09-01' }], new Date('2026-10-11'))
    expect(r.auditoria_interna).toMatchObject({ fecha: '2026-10-01', dias: 10 })
    expect(r.revision_direccion).toBeNull()
  })
})
