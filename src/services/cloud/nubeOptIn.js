import { ref } from 'vue'
import { getPref, setPref, removePref } from '@/utils/prefs.js'

/**
 * Nube OPCIONAL por cuenta (C-03). Por defecto la nube está APAGADA: con una cuenta, pacientes y monitoreos guardados solo salen del
 * dispositivo si la persona activa "Guardar mis datos en la nube". La elección se guarda localmente, una por cuenta
 * (preferencia no sensible: solo un booleano y la fecha, sin datos de salud). Cuenta nueva o equipo nuevo = apagada.
 */
const clave = (uid) => `nube.${uid}`
const prefsPorDefecto = { get: getPref, set: setPref, remove: removePref }

/** @returns {true|false|null} true/false = decisión tomada; null = aún no decidió (se trata como apagada) */
export function leerOptIn(uid, prefs = prefsPorDefecto) {
  if (!uid) return null
  const v = prefs.get(clave(uid), null)
  if (v && typeof v === 'object' && typeof v.activo === 'boolean') return v.activo
  return null
}

export function guardarOptIn(uid, activo, prefs = prefsPorDefecto, ahora = new Date()) {
  if (!uid) return
  prefs.set(clave(uid), { activo: activo === true, fecha: new Date(ahora).toISOString() })
}

export function olvidarOptIn(uid, prefs = prefsPorDefecto) {
  if (uid) prefs.remove(clave(uid))
}

/** Regla única: solo se sube algo (pacientes, monitoreos) con cuenta Y con la nube activada por la persona. */
export function puedeSubirDatos({ cuentaId, optIn }) {
  return !!cuentaId && optIn === true
}

// ---- Estado reactivo de la sesión actual ----
export const nubeActivada = ref(false)
export const nubeDecidida = ref(false)

export function cargarOptIn(uid, prefs = prefsPorDefecto) {
  const v = leerOptIn(uid, prefs)
  nubeActivada.value = v === true
  nubeDecidida.value = v !== null
  return v
}

export function fijarOptIn(uid, activo, prefs = prefsPorDefecto) {
  guardarOptIn(uid, activo, prefs)
  nubeActivada.value = activo === true
  nubeDecidida.value = true
}

export function limpiarOptInEnMemoria() {
  nubeActivada.value = false
  nubeDecidida.value = false
}
