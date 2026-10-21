import { mulberry32, gaussian } from './referenceEcg.js'
import { MAPA_PATOLOGIAS } from './physionetDatabases.js'

/**
 * Generador de señales clínicas y patológicas basadas en registros abiertos de PhysioNet.
 * Diseñado para investigación académica, docencia y comparación con señales de microcontrolador.
 *
 * Todas las señales se muestrean a la frecuencia del pipeline (fs = 250 Hz) en milivoltios (mV).
 */

/** Función auxiliar de pulso gaussiano individual. */
function gPulse(dt, c, sigma, amp) {
  const z = (dt - c) / sigma
  if (z < -6 || z > 6) return 0
  return amp * Math.exp(-0.5 * z * z)
}

/** Latido sinusal normal parametrizado. */
function latidoSinusal(dt, { ampP = 0.14, ampR = 1.05, ampT = 0.32, stOffset = 0 } = {}) {
  let v = 0
  // Onda P
  v += gPulse(dt, -0.19, 0.024, ampP)
  // Complejo QRS
  v += gPulse(dt, -0.035, 0.01, -0.12)
  v += gPulse(dt, 0.0, 0.012, ampR)
  v += gPulse(dt, 0.035, 0.012, -0.26)
  // Segmento ST y repolarización T
  if (stOffset !== 0 && dt > 0.045 && dt < 0.20) {
    v += stOffset * (1 - Math.abs((dt - 0.12) / 0.10) ** 2)
  }
  v += gPulse(dt, 0.27, 0.048, ampT)
  return v
}

/** Complejo ventricular ectópico ancho y aberrante (PVC). */
function latidoPvc(dt) {
  let v = 0
  // Sin onda P previa
  // Complejo QRS ensanchado (> 130 ms) y mellado
  v += gPulse(dt, -0.03, 0.022, 0.35)
  v += gPulse(dt, 0.0, 0.035, 1.35)
  v += gPulse(dt, 0.045, 0.030, -0.65)
  // Onda T discordante amplia e invertida
  v += gPulse(dt, 0.22, 0.055, -0.45)
  return v
}

/** Complejo ventricular rápido de taquicardia ventricular (VT). */
function latidoVt(dt) {
  let v = 0
  // QRS amplio monomórfico rápido
  v += gPulse(dt, 0.0, 0.044, 1.20)
  v += gPulse(dt, 0.065, 0.038, -0.85)
  v += gPulse(dt, 0.17, 0.050, -0.35)
  return v
}

/**
 * Genera la secuencia temporal continua para una patología PhysioNet dada.
 *
 * @param {string} patologiaId Identificador de la patología ('nsr', 'afib', 'pvc', etc.)
 * @param {number} [duracionS=30] Duración del registro en segundos
 * @param {number} [fs=250] Frecuencia de muestreo (Hz)
 * @returns {{ values: Float32Array, fs: number, nombre: string, patologia: object, comentarios: string[] }}
 */
export function generarSenalPatologia(patologiaId, duracionS = 30, fs = 250) {
  const pat = MAPA_PATOLOGIAS[patologiaId] ?? MAPA_PATOLOGIAS.nsr
  const n = Math.round(duracionS * fs)
  const valores = new Float32Array(n)
  const rand = mulberry32(104729) // Semilla determinista médica

  if (pat.id === 'nsr') {
    // Ritmo Sinusal Normal: 72 BPM regular
    const rrS = 60 / 72
    for (let i = 0; i < n; i++) {
      const t = i / fs
      const beatIndex = Math.floor(t / rrS)
      const tR = (beatIndex + 0.35) * rrS
      valores[i] = latidoSinusal(t - tR) + 0.008 * gaussian(rand)
    }
  } else if (pat.id === 'afib') {
    // Fibrilación Auricular: RR caótico + ondas f fibrilatorias continuas
    // Pre-calculamos los instantes R de manera irregular
    const rPeaks = []
    let curT = 0.25
    while (curT < duracionS + 2) {
      rPeaks.push(curT)
      // RR variable entre 0.38 y 0.78 s (BPM fluctuante 77 a 157)
      const rrRandom = 0.38 + 0.40 * ((rand() * 0.7 + rand() * 0.3))
      curT += rrRandom
    }

    for (let i = 0; i < n; i++) {
      const t = i / fs
      // Ondas f auriculares de alta frecuencia e irregulares (4 a 8 Hz)
      const fWaves =
        0.045 * Math.sin(2 * Math.PI * 5.2 * t) +
        0.035 * Math.sin(2 * Math.PI * 7.1 * t + 1.2) +
        0.025 * Math.sin(2 * Math.PI * 4.3 * t + 2.5) +
        0.015 * gaussian(rand)

      // Respuesta ventricular QRS estrecho sin onda P
      let qrsWave = 0
      for (const tR of rPeaks) {
        const dt = t - tR
        if (Math.abs(dt) < 0.4) {
          qrsWave += latidoSinusal(dt, { ampP: 0, ampR: 1.05 + 0.1 * (rand() - 0.5), ampT: 0.25 })
        }
      }
      valores[i] = qrsWave + fWaves
    }
  } else if (pat.id === 'pvc') {
    // Extrasístoles Ventriculares: latidos 1, 2, 3 sinusales normales; latido 4 es PVC prematuro con pausa
    const rPeaks = []
    let curT = 0.3
    const rrBase = 60 / 74
    let count = 0
    while (curT < duracionS + 2) {
      count++
      if (count % 4 === 0) {
        // Latido 4: Prematuro (llega al 58% del RR)
        const tPvc = curT + rrBase * 0.58
        rPeaks.push({ t: tPvc, esPvc: true })
        // Pausa compensatoria completa: el latido 5 ocurre a 2 * rrBase del latido 3
        curT += rrBase * 2.0
      } else {
        rPeaks.push({ t: curT, esPvc: false })
        curT += rrBase * (1 + 0.02 * (rand() - 0.5))
      }
    }

    for (let i = 0; i < n; i++) {
      const t = i / fs
      let v = 0
      for (const p of rPeaks) {
        const dt = t - p.t
        if (Math.abs(dt) < 0.5) {
          v += p.esPvc ? latidoPvc(dt) : latidoSinusal(dt)
        }
      }
      valores[i] = v + 0.01 * gaussian(rand)
    }
  } else if (pat.id === 'vtach') {
    // Taquicardia Ventricular Monomórfica: 165 BPM muy rápida con complejos ensanchados
    const rrS = 60 / 165 // ~0.363 s
    for (let i = 0; i < n; i++) {
      const t = i / fs
      const beatIndex = Math.floor(t / rrS)
      const tR = (beatIndex + 0.2) * rrS
      valores[i] = latidoVt(t - tR) + 0.012 * gaussian(rand)
    }
  } else if (pat.id === 'brady') {
    // Bradicardia Sinusal: 44 BPM regular con línea isoeléctrica extendida
    const rrS = 60 / 44 // ~1.36 s
    for (let i = 0; i < n; i++) {
      const t = i / fs
      const beatIndex = Math.floor(t / rrS)
      const tR = (beatIndex + 0.3) * rrS
      valores[i] = latidoSinusal(t - tR) + 0.008 * gaussian(rand)
    }
  } else if (pat.id === 'tachy') {
    // Taquicardia Sinusal: 130 BPM rápida regular
    const rrS = 60 / 130 // ~0.46 s
    for (let i = 0; i < n; i++) {
      const t = i / fs
      const beatIndex = Math.floor(t / rrS)
      const tR = (beatIndex + 0.2) * rrS
      // La onda P está próxima al final de la onda T anterior
      valores[i] = latidoSinusal(t - tR, { ampP: 0.16, ampT: 0.28 }) + 0.01 * gaussian(rand)
    }
  } else if (pat.id === 'ischemia') {
    // Isquemia Miocárdica: Segmento ST deprimido (-0.18 mV) e inversión de onda T
    const rrS = 60 / 76
    for (let i = 0; i < n; i++) {
      const t = i / fs
      const beatIndex = Math.floor(t / rrS)
      const tR = (beatIndex + 0.35) * rrS
      valores[i] = latidoSinusal(t - tR, { ampP: 0.13, ampT: -0.22, stOffset: -0.18 }) + 0.008 * gaussian(rand)
    }
  }

  return {
    values: valores,
    fs,
    nombre: `PhysioNet (${pat.sigla}): ${pat.nombre}`,
    patologia: pat,
    comentarios: [
      `Fuente: ${pat.baseDatos}`,
      `Clasificación: ${pat.categoria}`,
      `Frecuencia nominal: ${pat.bpmNominal} BPM`,
      `Registro representativo: ${pat.registroEjemplo}`,
      `DOI / Cita: ${pat.enlacePhysioNet}`,
    ],
  }
}
