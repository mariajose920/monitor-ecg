import { SerialSource } from './SerialSource.js'
import { SimulatorSource } from './SimulatorSource.js'
import { ReplaySource } from './ReplaySource.js'
import { BleSource } from './BleSource.js'
import { CameraSource } from './CameraSource.js'
import { getProfile } from '@/data/deviceProfiles.js'

export const SOURCE_KINDS = Object.freeze([
  { id: 'simulator', nombre: 'Simulador', soportado: () => true },
  { id: 'serial', nombre: 'Puerto serie (Arduino/ESP32 USB o HC-05)', soportado: () => SerialSource.isSupported() },
  { id: 'replay', nombre: 'Reproducción de CSV', soportado: () => true },
  { id: 'camera', nombre: 'Cámara del celular (PPG con flash)', soportado: () => CameraSource.isSupported() },
])

/**
 * Crea la fuente según el tipo y el perfil.
 * @param {string} kind
 * @param {object} opts { id, perfilId, sim: {bpm, ruido}, replayData }
 */
export function createSource(kind, { id, perfilId, sim = {}, replayData = null }) {
  switch (kind) {
    case 'serial':
      return new SerialSource({ id, profile: getProfile(perfilId) })
    case 'simulator':
      return new SimulatorSource({ id, profile: getProfile('simulador'), bpm: sim.bpm, ruido: sim.ruido })
    case 'replay':
      return new ReplaySource({ id, profile: getProfile(perfilId), data: replayData, loop: true })
    case 'camera':
      return new CameraSource({ id, profile: getProfile('camara-movil') })
    case 'ble':
      return new BleSource({ id, profile: getProfile('esp32-ad8232') })
    default:
      throw new Error(`Tipo de fuente desconocido: ${kind}`)
  }
}
