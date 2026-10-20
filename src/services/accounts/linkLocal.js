import { readDataNamespace, dataStorage, secureStorage, DATOS_RE } from '@/services/storage/index.js'
import { audit } from '@/services/audit/auditService.js'
import { sincronizarMonitoreo } from '@/services/cloud/subidaMonitoreo.js'
import { nubeDatosActiva, upsertPaciente } from '@/services/cloud/cloudSync.js'
import { puedeSubirPaciente } from '@/services/cloud/datosNube.js'
import { getPref, setPref } from '@/utils/prefs.js'

/**
 * "Vincular los datos de este dispositivo a mi cuenta" (C-15). Solo se pueden vincular datos creados EN ESTE DISPOSITIVO SIN CUENTA
 * (el espacio '' del almacén). El espacio de otra cuenta (acct:<uid>:) nunca se lee: queda aislado. Siempre con selección explícita
 * por paciente, confirmación y, aparte, la decisión de quitar la copia sin cuenta. Si la nube está activada, lo vinculado se sube
 * como PRIVADO; si no, queda solo en el espacio local de la cuenta. El espacio de datos activo debe ser el de la cuenta.
 */
const PREF_NO_OFRECER = 'vincular.noOfrecer'

export const vinculacionOcultaEnEsteEquipo = () => getPref(PREF_NO_OFRECER, false) === true
export const ocultarVinculacionEnEsteEquipo = (v = true) => setPref(PREF_NO_OFRECER, v === true)

const pacientesDe = (filas) => {
  const u = filas.find(([k]) => k === 'users')?.[1]
  return Array.isArray(u) ? u : []
}
const sesionesDe = (filas) => filas.filter(([k]) => k.startsWith('session:')).map(([, v]) => v).filter(Boolean)

/**
 * Plan puro: qué pacientes y monitoreos se vinculan para una selección. Un monitoreo solo se vincula si TODOS sus pacientes
 * están seleccionados (no se parte un monitoreo compartido). Probado con Vitest.
 */
export function planVinculacion(filas, seleccion) {
  const elegidos = new Set(seleccion)
  const pacientes = pacientesDe(filas).filter((u) => elegidos.has(u.id))
  const ids = new Set(pacientes.map((u) => u.id))
  const sesiones = []
  const omitidas = []
  for (const s of sesionesDe(filas)) {
    const usuarios = [...new Set((s.participantes ?? []).map((p) => p.usuarioId))]
    if (!usuarios.length || !usuarios.some((id) => ids.has(id))) continue
    if (usuarios.every((id) => ids.has(id))) sesiones.push(s)
    else omitidas.push(s.id)
  }
  return { pacientes, sesiones, omitidas }
}

/** Datos del dispositivo (sin cuenta) que se podrían vincular, por paciente. */
export async function resumenLocal() {
  const filas = await readDataNamespace('')
  const sesiones = sesionesDe(filas)
  const pacientes = pacientesDe(filas).map((u) => ({
    id: u.id,
    etiqueta: u.etiqueta,
    monitoreos: sesiones.filter((s) => (s.participantes ?? []).some((p) => p.usuarioId === u.id)).length,
  }))
  return { pacientes: pacientes.length, monitoreos: sesiones.length, detalle: pacientes }
}

/** Sanea un monitoreo antes de pasarlo a la cuenta: privado, sin perfil compartido ni consentimiento de publicación, aún no en la nube. */
export function monitoreoParaCuenta(s) {
  const m = { ...s, visibilidad: 'privado', compartirPerfil: false, enNube: false }
  delete m.perfilCompartido
  delete m.consentPublicacion
  return m
}

async function quitarCopiaSinCuenta(plan, filas) {
  const ids = new Set(plan.pacientes.map((u) => u.id))
  const idsSesion = new Set(plan.sesiones.map((s) => s.id))
  for (const [k] of filas) {
    if (k.startsWith('acct:') || !DATOS_RE.test(k)) continue
    const m = /^(?:session|chunk):([^:]+)/.exec(k)
    if (m && idsSesion.has(m[1])) await secureStorage.removeItem(k)
  }
  const restantes = pacientesDe(filas).filter((u) => !ids.has(u.id))
  await secureStorage.setItem('users', restantes)
  const indice = filas.find(([k]) => k === 'sessions:index')?.[1]
  if (Array.isArray(indice)) await secureStorage.setItem('sessions:index', indice.filter((e) => !idsSesion.has(e.id)))
}

/**
 * @param {object} o
 * @param {string[]} o.pacientesIds  selección explícita (obligatoria)
 * @param {boolean} [o.quitarCopia=false]  borrar de la zona sin cuenta lo que se vinculó (segunda confirmación en la interfaz)
 * @returns {Promise<{pacientes:number, monitoreos:number, omitidos:number, fallos:number, subidos:number, copiaQuitada:boolean}>}
 */
export async function vincularDatosLocales({ pacientesIds = [], quitarCopia = false, onProgreso = () => {} } = {}) {
  if (!Array.isArray(pacientesIds) || !pacientesIds.length) throw new Error('Elige al menos un paciente para vincular.')
  const filas = await readDataNamespace('')
  const plan = planVinculacion(filas, pacientesIds)
  if (!plan.pacientes.length) throw new Error('No hay datos sin cuenta para los pacientes elegidos.')

  const propios = (await dataStorage.getItem('users')) ?? []
  const idsPropios = new Set(propios.map((u) => u.id))
  let numero = Math.max(0, ...propios.map((u) => u.numero || 0), (await dataStorage.getItem('users:counter')) ?? 0)
  const nuevos = []
  for (const u of plan.pacientes) {
    if (idsPropios.has(u.id)) continue
    numero++
    nuevos.push({ ...u, numero, etiqueta: `Paciente ${numero}` })
  }
  await dataStorage.setItem('users', [...propios, ...nuevos])
  await dataStorage.setItem('users:counter', numero)

  const indice = (await dataStorage.getItem('sessions:index')) ?? []
  const idsSesion = new Set(plan.sesiones.map((s) => s.id))
  for (const s of plan.sesiones) {
    await dataStorage.setItem(`session:${s.id}`, monitoreoParaCuenta(s))
    if (!indice.some((e) => e.id === s.id)) indice.push({ id: s.id, inicio: s.inicio, usuarios: s.participantes.map((p) => p.usuarioId) })
  }
  await dataStorage.setItem('sessions:index', indice)
  for (const [k, v] of filas) {
    const m = /^chunk:([^:]+):/.exec(k)
    if (m && idsSesion.has(m[1])) await dataStorage.setItem(k, v)
  }

  // Subida: solo si la persona activó la nube (si no, todo queda en el espacio local de la cuenta).
  let fallos = 0
  let subidos = 0
  const total = nuevos.length + plan.sesiones.length
  let hecho = 0
  if (nubeDatosActiva()) {
    for (const u of nuevos) {
      try {
        if (puedeSubirPaciente(u)) await upsertPaciente(u)
      } catch {
        fallos++
      }
      onProgreso(++hecho, total)
    }
    for (const s of plan.sesiones) {
      try {
        const r = await sincronizarMonitoreo(monitoreoParaCuenta(s))
        if (r.estado === 'subido') subidos++
        else if (r.estado === 'sin-declaracion') fallos++
      } catch {
        fallos++
      }
      onProgreso(++hecho, total)
    }
  }

  // La copia sin cuenta solo se quita si la persona lo pidió; los datos ya están completos en el espacio de la cuenta.
  if (quitarCopia) await quitarCopiaSinCuenta(plan, filas)
  await audit('LOCAL_DATA_LINKED', 'system', {
    pacientes: nuevos.length, monitoreos: plan.sesiones.length, omitidos: plan.omitidas.length, fallos, copiaQuitada: quitarCopia === true, nube: nubeDatosActiva(),
  })
  return { pacientes: nuevos.length, monitoreos: plan.sesiones.length, omitidos: plan.omitidas.length, fallos, subidos, copiaQuitada: quitarCopia === true }
}
