/**
 * ¿El dispositivo debería medir con la cámara por defecto? Móvil/tablet (user agent), pantalla estrecha
 * o navegador sin Web Serial. En PC con Chrome/Edge se mantiene el simulador/puerto serie como antes.
 */
export function prefiereCamara() {
  if (typeof navigator === 'undefined') return false
  const movil = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
  const sinSerial = !('serial' in navigator)
  const estrecha = typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 640px)').matches
  return movil || sinSerial || estrecha
}
