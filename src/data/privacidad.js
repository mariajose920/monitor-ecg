/**
 * Hechos de privacidad que describen lo que el sistema REALMENTE hace (C-02). ConsentDialog, PrivacyView, el formulario de la cuenta y
 * las pruebas leen de aquí, de modo que el texto no se contradiga con el comportamiento. Si cambia algo de lo que se hace,
 * se cambia aquí y se sube CONSENT_VERSION (services/privacidad/consentimiento.js).
 */
export const NUBE_PROVEEDOR = 'Supabase'
export const NUBE_REGION = 'Estados Unidos (región us-east-1 de Supabase)'
export const HOSTING_PROVEEDOR = 'Vercel'
export const RETENCION_NUBE_DIAS = 365
export const INACTIVIDAD_CUENTA_MESES = 24
export const PLAZO_RESPUESTA_DIAS = 30
export const INACTIVIDAD_SESION_MIN = 15

/** Qué se envía a la nube y cuándo (solo con cuenta y con "Guardar mis datos en la nube" activado). */
export const SE_ENVIA_A_LA_NUBE = Object.freeze([
  'Tu cuenta (correo y contraseña) siempre que uses una cuenta: la gestiona Supabase Auth.',
  'Solo con "Guardar mis datos en la nube" activado: el seudónimo «Paciente N», la declaración de mayoría de edad y, con consentimiento vigente, el perfil opcional (rango de edad, peso, actividad habitual).',
  'Solo con "Guardar mis datos en la nube" activado y al pulsar "Guardar monitoreo": la señal ECG, el BPM, la actividad y el resumen del monitoreo, con su fecha de inicio.',
  'Un registro de auditoría mínimo (inicios de sesión, cambios de contraseña, borrados, incidentes); con la nube apagada se omiten los identificadores de pacientes y de monitoreos.',
])

/** Qué NUNCA sale del dispositivo. */
export const NUNCA_SALE_DEL_DISPOSITIVO = Object.freeze([
  'Los monitoreos sin guardar (borradores): ni sus metadatos ni su señal se envían nunca.',
  'El alias de cada paciente.',
  'El nombre y las notas de cada monitoreo (texto libre).',
  'Los datos del dispositivo conectado (identificadores USB) y los parámetros de la aplicación.',
  'Las imágenes de la cámara (si usas la cámara, solo se calcula una señal numérica).',
])

/** Qué es "público" cuando decides publicar un monitoreo concreto. */
export const LO_PUBLICO = Object.freeze({
  quien: 'Cualquier persona con una cuenta registrada (no hay acceso anónimo ni sin cuenta).',
  que: 'La señal ECG procesada, el BPM, la actividad y el resumen, el día de la medición (sin la hora) y la duración, siempre como «Paciente anónimo».',
  no: 'No se publica la etiqueta, el alias, el nombre ni la nota del monitoreo, la cuenta propietaria ni, salvo una casilla adicional, los datos del paciente.',
})

export const DERECHOS = Object.freeze([
  ['Acceso', 'Pacientes y Monitoreos: ves tus datos. Con la nube activada puedes pedir al responsable una copia de lo guardado en la nube.'],
  ['Rectificación', 'Pacientes → Editar (alias y datos opcionales); para otros datos, escribe al responsable.'],
  ['Supresión', 'Pacientes → "Eliminar" (este equipo y la nube); Mi cuenta → "Eliminar mis datos en la nube" y "Eliminar mi cuenta" (piden tu contraseña).'],
  ['Oposición y retiro del consentimiento', 'Pacientes → "Retirar consentimiento": borra de inmediato los datos opcionales y devuelve a privado lo que estuviera publicado.'],
  ['Portabilidad', 'Monitoreos → exportar CSV (formato abierto y legible por máquina).'],
])

/** Límites honestos del cifrado local (C-14, H-12). */
export const CIFRADO_LOCAL_ALCANCE = Object.freeze({
  protege: 'Cifra (AES-GCM de 256 bits, con la clave guardada en el mismo navegador) lo que queda en este equipo, para que no se lea de forma casual abriendo los archivos de datos del navegador.',
  noProtege: 'No protege frente a quien controle este equipo o su sesión del sistema operativo (puede copiar el perfil del navegador, que incluye la clave), frente a extensiones del navegador ni frente a código malicioso que se ejecute dentro de esta página (XSS).',
  recomendacion: 'En equipos compartidos usa "Estoy en un equipo compartido" y cierra sesión al terminar: se quitan los datos de tu cuenta del equipo.',
})
