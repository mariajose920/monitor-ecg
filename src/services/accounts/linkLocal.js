import { readDataNamespace, clearDataNamespace, dataStorage } from '@/services/storage/index.js'
import { pushPaciente, subirBloquesConReintento, subirSesionDirecta } from '@/services/cloud/cloudSync.js'
import { audit } from '@/services/audit/auditService.js'

/**
 * "Vincular los datos de este dispositivo a mi cuenta": mueve pacientes y monitoreos del modo sin cuenta
 * a la cuenta (privados por defecto) y los sube a la nube. Solo borra la copia local sin cuenta si TODO
 * se subió bien. El espacio de datos activo debe ser el de la cuenta (dataStorage).
 */
export async function resumenLocal() {
  const filas = await readDataNamespace('')
  const users = filas.find(([k]) => k === 'users')?.[1]
  const sesiones = filas.filter(([k]) => k.startsWith('session:')).length
  return { pacientes: Array.isArray(users) ? users.length : 0, monitoreos: sesiones }
}

export async function vincularDatosLocales(onProgreso = () => {}) {
  const filas = await readDataNamespace('')
  const locales = filas.find(([k]) => k === 'users')?.[1] ?? []
  const propios = (await dataStorage.getItem('users')) ?? []
  const ids = new Set(propios.map((u) => u.id))
  let numero = Math.max(0, ...propios.map((u) => u.numero || 0), (await dataStorage.getItem('users:counter')) ?? 0)
  const nuevos = []
  for (const u of locales) {
    if (ids.has(u.id)) continue
    numero++
    nuevos.push({ ...u, numero, etiqueta: `Paciente ${numero}` })
  }
  await dataStorage.setItem('users', [...propios, ...nuevos])
  await dataStorage.setItem('users:counter', numero)

  const indice = (await dataStorage.getItem('sessions:index')) ?? []
  const sesiones = filas.filter(([k]) => k.startsWith('session:')).map(([, v]) => v).filter(Boolean)
  for (const s of sesiones) {
    await dataStorage.setItem(`session:${s.id}`, { ...s, visibilidad: 'privado', compartirPerfil: false })
    if (!indice.some((e) => e.id === s.id)) indice.push({ id: s.id, inicio: s.inicio, usuarios: s.participantes.map((p) => p.usuarioId) })
  }
  await dataStorage.setItem('sessions:index', indice)
  const chunks = filas.filter(([k]) => k.startsWith('chunk:'))
  for (const [k, v] of chunks) await dataStorage.setItem(k, v)

  // Subida a la nube
  let fallos = 0
  let hecho = 0
  const total = nuevos.length + sesiones.length
  for (const u of nuevos) {
    await pushPaciente(u)
    onProgreso(++hecho, total)
  }
  for (const s of sesiones) {
    try {
      await subirSesionDirecta({ ...s, visibilidad: 'privado', compartirPerfil: false })
      for (const [k, c] of chunks.filter(([key]) => key.startsWith(`chunk:${s.id}:`))) {
        const canal = Number(k.split(':')[2])
        if (!(await subirBloquesConReintento(s.id, canal, c))) fallos++
      }
    } catch {
      fallos++
    }
    onProgreso(++hecho, total)
  }
  if (fallos === 0) await clearDataNamespace('')
  await audit('LOCAL_DATA_LINKED', 'system', { pacientes: nuevos.length, monitoreos: sesiones.length, fallos })
  return { pacientes: nuevos.length, monitoreos: sesiones.length, fallos }
}
