/**
 * Preferencias de UI NO sensibles (tema, ventana visual...). Único módulo, junto con
 * adminAuth, autorizado a escribir en localStorage (SEC-24). Nunca guardar datos de salud aquí.
 */
const PREFIX = 'ecg.pref.'

export function getPref(key, def = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? def : JSON.parse(raw)
  } catch {
    return def
  }
}

export function setPref(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* almacenamiento no disponible: se ignora */
  }
}

export function clearPrefs() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignorar */
  }
}

export function removePref(key) {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* ignorar */
  }
}
