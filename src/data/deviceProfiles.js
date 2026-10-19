/**
 * Perfiles de dispositivo (resuelve la inconsistencia I2: UNO de 10 bits frente a ESP32 de 12 bits).
 * El parser y el gráfico leen el perfil; no hay constantes mágicas de escala.
 * SEC-35: la velocidad del puerto es fija (115200 baudios).
 */
export const DEVICE_PROFILES = Object.freeze({
  'arduino-uno-ad8232': Object.freeze({
    id: 'arduino-uno-ad8232',
    nombre: 'Arduino UNO/Nano + AD8232',
    adcBits: 10,
    vref: 5,
    fs: 250,
    baudRate: 115200,
    yRange: [0, 1023],
    protocolo: 't_ms,ecg_raw,leads_off,bpm',
  }),
  'esp32-ad8232': Object.freeze({
    id: 'esp32-ad8232',
    nombre: 'ESP32 (USB) + AD8232',
    adcBits: 12,
    vref: 3.3,
    fs: 250,
    baudRate: 115200,
    yRange: [0, 4095],
    protocolo: 't_ms,ecg_raw,leads_off,bpm',
  }),
  // PPG por cámara + flash (no es ECG): señal normalizada a 10 bits virtuales, 30 Hz.
  'camara-movil': Object.freeze({
    id: 'camara-movil',
    nombre: 'Cámara del celular (PPG)',
    adcBits: 10,
    vref: 1,
    fs: 30,
    baudRate: 0,
    yRange: [0, 1023],
    protocolo: 'interno-ppg',
  }),
  simulador: Object.freeze({
    id: 'simulador',
    nombre: 'Simulador (equivalente a UNO, 10 bits)',
    adcBits: 10,
    vref: 5,
    fs: 250,
    baudRate: 115200,
    yRange: [0, 1023],
    protocolo: 'interno',
  }),
})

export function getProfile(id) {
  return DEVICE_PROFILES[id] || DEVICE_PROFILES['arduino-uno-ad8232']
}

/** Valor máximo del ADC según la resolución. */
export function maxRaw(profile) {
  return 2 ** profile.adcBits - 1
}
