import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './auth.js'
import {
  defaultParametros, defaultSincronizacion, validarParametros, validarSincronizacion, validarRetencion,
  RETENCION_DEFECTO_DIAS,
} from '@/data/defaultSettings.js'
import {
  loadParametros, saveParametros, loadSincronizacion, saveSincronizacion, loadRetencion, saveRetencion,
} from '@/services/storage/settingsRepository.js'
import { audit } from '@/services/audit/auditService.js'
import { cloudEnabled, fetchCloudParametros, pushCloudParametros } from '@/services/cloud/cloudSync.js'

/** Aplana un objeto a rutas "a.b.c" → valor (para auditar cambios campo a campo). */
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const p = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, p, out)
    else out[p] = v
  }
  return out
}

export function diffCampos(antes, despues) {
  const a = flatten(antes)
  const b = flatten(despues)
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  const cambios = []
  for (const k of keys) if (a[k] !== b[k]) cambios.push({ field: k, old: a[k] ?? null, new: b[k] ?? null })
  return cambios
}

const clone = (o) => JSON.parse(JSON.stringify(o))

/**
 * Parámetros (RF15/RF26), sincronización (RF27) y retención (SEC-32).
 * Lectura libre; escritura SOLO con sesión de admin (SEC-03) y validación con esquema (SEC-36).
 */
export const useSettingsStore = defineStore('settings', () => {
  const parametros = ref(defaultParametros())
  const sincronizacion = ref(defaultSincronizacion())
  const retencionDias = ref(RETENCION_DEFECTO_DIAS)
  const loaded = ref(false)

  async function load() {
    parametros.value = await loadParametros()
    sincronizacion.value = await loadSincronizacion()
    retencionDias.value = await loadRetencion()
    loaded.value = true
    cargarDesdeNube() // en segundo plano: no retrasa el arranque si no hay red
  }

  /** Los parámetros publicados por el admin en la nube prevalecen (validados: fallo seguro, A.14.2.5). */
  async function cargarDesdeNube() {
    if (!cloudEnabled) return
    try {
      const fila = await fetchCloudParametros()
      if (fila?.parametros && !validarParametros(fila.parametros)) {
        parametros.value = fila.parametros
        await saveParametros(clone(fila.parametros))
      }
      if (fila?.sincronizacion && !validarSincronizacion(fila.sincronizacion)) {
        sincronizacion.value = fila.sincronizacion
        await saveSincronizacion(clone(fila.sincronizacion))
      }
    } catch {
      /* sin conexión: se usan los parámetros locales */
    }
  }

  /** Publica la configuración en la nube si hay sesión de admin en Supabase. */
  async function publicarEnNube() {
    try {
      return await pushCloudParametros({ parametros: clone(parametros.value), sincronizacion: clone(sincronizacion.value) })
    } catch {
      return false
    }
  }

  /** Rango aplicable según la actividad (RF16). */
  function rangoPara(actividad) {
    const b = parametros.value.bpm
    if (b.usarPorActividad && b.porActividad[actividad]) return b.porActividad[actividad]
    return b.global
  }

  async function auditarCambios(antes, despues, prefijo) {
    for (const c of diffCampos(antes, despues)) {
      await audit('PARAM_CHANGED', 'admin', { field: `${prefijo}.${c.field}`, old: c.old, new: c.new })
    }
  }

  async function setParametros(nuevo) {
    useAuthStore().assertAdmin()
    const err = validarParametros(nuevo)
    if (err) throw new Error(err)
    const antes = clone(parametros.value)
    parametros.value = clone(nuevo)
    await saveParametros(clone(nuevo))
    await auditarCambios(antes, nuevo, 'parametros')
    await publicarEnNube()
  }

  async function setSincronizacion(nuevo) {
    useAuthStore().assertAdmin()
    const err = validarSincronizacion(nuevo)
    if (err) throw new Error(err)
    const antes = clone(sincronizacion.value)
    sincronizacion.value = clone(nuevo)
    await saveSincronizacion(clone(nuevo))
    await auditarCambios(antes, nuevo, 'sincronizacion')
    await publicarEnNube()
  }

  async function setRetencion(dias) {
    useAuthStore().assertAdmin()
    const err = validarRetencion(dias)
    if (err) throw new Error(err)
    const antes = retencionDias.value
    retencionDias.value = dias
    await saveRetencion(dias)
    if (antes !== dias) await audit('PARAM_CHANGED', 'admin', { field: 'retencionDias', old: antes, new: dias })
  }

  function reset() {
    parametros.value = defaultParametros()
    sincronizacion.value = defaultSincronizacion()
    retencionDias.value = RETENCION_DEFECTO_DIAS
  }

  return { parametros, sincronizacion, retencionDias, loaded, load, cargarDesdeNube, publicarEnNube, rangoPara, setParametros, setSincronizacion, setRetencion, reset }
})
