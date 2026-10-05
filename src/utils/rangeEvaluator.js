/**
 * Evaluación del BPM contra mín./máx. (RF16/RF17) con histéresis y duración mínima
 * para disparar alertas (RF20).
 *
 * - Estado inmediato con histéresis: para volver a 'dentro' desde 'bajo' hay que superar
 *   min + histéresis; desde 'sobre', bajar de max − histéresis.
 * - Alerta: se dispara UNA vez cuando el estado se mantiene fuera de rango ≥ duracionMinMs.
 * - Sin BPM válido ('sin-dato'): se reinicia la evaluación (no se acumula tiempo).
 */
export function createRangeEvaluator({ duracionMinMs = 5000, histeresisBpm = 2 } = {}) {
  let estado = 'sin-dato'
  let fueraDesde = null
  let alertado = false

  function evaluate(bpm, rango, nowMs) {
    if (bpm === null || bpm === undefined || !Number.isFinite(bpm) || !rango) {
      estado = 'sin-dato'
      fueraDesde = null
      alertado = false
      return { estado, alerta: null, enAlerta: false }
    }
    const { min, max } = rango
    let nuevo
    if (estado === 'bajo') {
      if (bpm > max) nuevo = 'sobre'
      else if (bpm >= min + histeresisBpm) nuevo = 'dentro'
      else nuevo = 'bajo'
    } else if (estado === 'sobre') {
      if (bpm < min) nuevo = 'bajo'
      else if (bpm <= max - histeresisBpm) nuevo = 'dentro'
      else nuevo = 'sobre'
    } else {
      nuevo = bpm < min ? 'bajo' : bpm > max ? 'sobre' : 'dentro'
    }

    if (nuevo !== estado) {
      // Cambio de estado: reiniciar el cronómetro de alerta
      fueraDesde = nuevo === 'dentro' ? null : nowMs
      alertado = false
    }
    estado = nuevo

    let alerta = null
    if (estado !== 'dentro' && fueraDesde !== null && !alertado && nowMs - fueraDesde >= duracionMinMs) {
      alertado = true
      alerta = estado === 'sobre' ? 'alta' : 'baja'
    }
    return { estado, alerta, enAlerta: alertado }
  }

  function reset() {
    estado = 'sin-dato'
    fueraDesde = null
    alertado = false
  }

  return { evaluate, reset, get estado() { return estado } }
}
