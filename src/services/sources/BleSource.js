import { DataSource } from './DataSource.js'

/**
 * EXTENSIÓN FUTURA (RNF08): ESP32 por Bluetooth Low Energy (GATT notify).
 * TODO: definir UUID de servicio/característica y formato binario de las notificaciones.
 * Nota: el HC-05/HC-06 (Bluetooth Clásico) NO funciona con Web Bluetooth; se usa como puerto COM
 * con SerialSource. La Permissions-Policy actual deshabilita bluetooth (SEC-48) hasta implementarlo.
 */
export class BleSource extends DataSource {
  static isSupported() {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator
  }

  constructor({ id, profile }) {
    super({ id, kind: 'ble', profile })
  }

  async connect() {
    throw new Error('La fuente BLE (ESP32) aún no está implementada.')
  }
}
