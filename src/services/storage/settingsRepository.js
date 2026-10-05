import { secureStorage } from './index.js'
import {
  defaultParametros, defaultSincronizacion, validarParametros, validarSincronizacion,
  validarRetencion, RETENCION_DEFECTO_DIAS,
} from '@/data/defaultSettings.js'

/**
 * Configuración del administrador (A05). Se guarda cifrada con AES-GCM, lo que aporta integridad
 * (SEC-28), y se valida con esquema al cargar: si no es válida se usan los valores por defecto
 * seguros (8.9, fallo seguro).
 */
export async function loadParametros() {
  const p = await secureStorage.getItem('settings:parametros')
  return p && !validarParametros(p) ? p : defaultParametros()
}

export async function saveParametros(p) {
  await secureStorage.setItem('settings:parametros', p)
}

export async function loadSincronizacion() {
  const s = await secureStorage.getItem('settings:sincronizacion')
  return s && !validarSincronizacion(s) ? s : defaultSincronizacion()
}

export async function saveSincronizacion(s) {
  await secureStorage.setItem('settings:sincronizacion', s)
}

export async function loadRetencion() {
  const r = await secureStorage.getItem('settings:retencion')
  return r && !validarRetencion(r.dias) ? r.dias : RETENCION_DEFECTO_DIAS
}

export async function saveRetencion(dias) {
  await secureStorage.setItem('settings:retencion', { dias })
}
