import { reactive } from 'vue'
import { esErrorPrivilegios } from './adminTotp.js'
import { factorTotpVerificado, verificarCodigo, validarCodigo, MSG_MFA_GENERICO, MSG_MFA_LIMITE } from './adminMfa.js'

/**
 * Renovación del segundo factor ante la caducidad real del servidor (C-05): si una operación de administrador falla con
 * "privilegios insuficientes" (el TOTP tiene más de 15 min), se abre un diálogo que pide un código NUEVO, se verifica
 * (mfa.challengeAndVerify renueva el JWT) y se reintenta UNA vez. Si la persona cancela, la operación falla.
 * El diálogo es el componente TotpRenovarDialog.vue (montado en las vistas de administración).
 */
export const renovacion = reactive({ abierta: false, ocupado: false, error: '' })
let espera = null // { resolve, reject }

function pedirCodigo() {
  if (espera) return espera.promesa
  renovacion.abierta = true
  renovacion.error = ''
  const promesa = new Promise((resolve, reject) => {
    espera = { resolve, reject, promesa: null }
  })
  espera.promesa = promesa
  return promesa
}

/** Ejecuta `fn`; si falla por privilegios, pide un código TOTP nuevo y la repite una sola vez. */
export async function conRenovacionTotp(fn) {
  try {
    return await fn()
  } catch (e) {
    if (!esErrorPrivilegios(e)) throw e
    await pedirCodigo()
    return fn()
  }
}

/** Lo llama el diálogo con el código escrito. */
export async function enviarCodigoRenovacion(codigo) {
  const formato = validarCodigo(codigo)
  if (formato) {
    renovacion.error = formato
    return false
  }
  renovacion.ocupado = true
  renovacion.error = ''
  try {
    const f = await factorTotpVerificado()
    const r = f ? await verificarCodigo(f.id, codigo) : { ok: false }
    if (!r.ok) {
      renovacion.error = r.limitado ? MSG_MFA_LIMITE : MSG_MFA_GENERICO
      return false
    }
    renovacion.abierta = false
    const e = espera
    espera = null
    e?.resolve(true)
    return true
  } finally {
    renovacion.ocupado = false
  }
}

export function cancelarRenovacion() {
  renovacion.abierta = false
  renovacion.error = ''
  const e = espera
  espera = null
  e?.reject(Object.assign(new Error('Verificación cancelada.'), { cancelado: true }))
}
