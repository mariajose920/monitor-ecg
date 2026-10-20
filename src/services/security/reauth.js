/**
 * Ventana de reautenticación (C-13). Tras confirmar la contraseña actual, las acciones sensibles (cambiar la contraseña, eliminar datos
 * en la nube, eliminar la cuenta) no vuelven a pedirla durante 5 minutos. El instante vive solo en memoria. Lógica pura.
 */
export const REAUTH_VENTANA_MS = 5 * 60_000

export function ventanaReauthVigente({ desde, ahora, ventanaMs = REAUTH_VENTANA_MS }) {
  return Number.isFinite(desde) && desde > 0 && ahora - desde >= 0 && ahora - desde < ventanaMs
}
