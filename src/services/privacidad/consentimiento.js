/**
 * Consentimiento y declaraciones (C-02, C-18). Lógica pura, probada con Vitest.
 *  - CONSENT_VERSION: versión del texto del consentimiento de DATOS OPCIONALES de un paciente. Si cambia (o el guardado es de otra
 *    versión) se vuelve a pedir antes de usar datos opcionales o de subirlos a la nube.
 *  - La declaración de mayoría de edad de la persona medida se guarda aparte (u.declaracion).
 *  - La publicación de un monitoreo exige un consentimiento propio por monitoreo (meta.consentPublicacion).
 */
export const CONSENT_VERSION = '2.0'
export const CONSENT_SCOPE = Object.freeze(['age', 'weight', 'activity'])
export const PUBLICACION_VERSION = '2.0'

/** Texto de la casilla de publicación (se muestra en el diálogo; la versión se guarda con el consentimiento). */
export const TEXTO_CONSENTIMIENTO_PUBLICACION =
  'Confirmo que la persona medida es mayor de edad y me autorizó, de forma expresa, a publicar este monitoreo (señal, BPM, actividad y el día) para las cuentas registradas de la aplicación. Sé que puedo volver a privado cuando quiera y que, si ella retira su consentimiento, el monitoreo vuelve a privado automáticamente.'

export const TEXTO_DECLARACION_MAYOR_EDAD = 'La persona medida es mayor de 18 años (no se miden menores de edad en esta aplicación).'

const esObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)

/** ¿El consentimiento guardado corresponde a la versión vigente del texto? (otra versión = hay que volver a pedirlo) */
export function consentimientoVigente(u) {
  return esObjeto(u?.consentimiento) && u.consentimiento.consentVersion === CONSENT_VERSION
}

/** ¿El paciente tiene la declaración de mayoría de edad? Sin ella no se sube nada a la nube ni se publica. */
export function declaracionVigente(u) {
  return esObjeto(u?.declaracion) && u.declaracion.mayorEdad === true
}

export function crearDeclaracion({ por = null, ahora = new Date() } = {}) {
  return { mayorEdad: true, version: CONSENT_VERSION, fecha: new Date(ahora).toISOString(), por: por ?? null }
}

/**
 * Consentimiento de datos opcionales. Registra quién lo otorga (uid de la cuenta o null sin cuenta), el canal y el alcance
 * (los opcionales; la nube y la publicación se deciden aparte). Cabe en el límite de 1 KB del servidor.
 */
export function crearConsentimiento(u, { cuentaId = null, nube = false, ahora = new Date() } = {}) {
  return {
    userId: u.id,
    consentVersion: CONSENT_VERSION,
    acceptedAt: new Date(ahora).toISOString(),
    scope: [...CONSENT_SCOPE],
    otorgadoPor: cuentaId ?? null,
    canal: 'app',
    declaraMayorEdad: declaracionVigente(u),
    alcance: { opcionales: true, nube: nube === true, publicar: false },
  }
}

/** Consentimiento de publicación de UN monitoreo (se guarda en meta y viaja en sesiones.datos para que lo valide el servidor). */
export function crearConsentimientoPublicacion({ por = null, ahora = new Date() } = {}) {
  return { version: PUBLICACION_VERSION, fecha: new Date(ahora).toISOString(), por: por ?? null }
}

export function publicacionVigente(c) {
  return esObjeto(c) && c.version === PUBLICACION_VERSION && typeof c.fecha === 'string' && c.fecha.length > 0
}

/** ¿Hay algo que volver a pedir? (consentimiento existente pero de otra versión) */
export function requiereReconsentimiento(u) {
  return esObjeto(u?.consentimiento) && u.consentimiento.consentVersion !== CONSENT_VERSION
}
