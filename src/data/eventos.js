/** Tipos de evento registrados en una sesión (texto para pantallas e informes). */
export const TIPOS_EVENTO = Object.freeze({
  'leads-off': 'Electrodos desconectados',
  'leads-on': 'Electrodos reconectados',
  'senal-perdida': 'Señal perdida',
  'alerta-alta': 'Alerta: sobre el rango',
  'alerta-baja': 'Alerta: bajo el rango',
  marca: 'Marca manual',
  'fin-canal': 'Fin del canal',
  'reinicio-dispositivo': 'Reinicio de la placa',
  'perfil-incorrecto': 'Perfil del dispositivo no coincide',
})

export function nombreEvento(tipo) {
  return TIPOS_EVENTO[tipo] ?? String(tipo)
}
