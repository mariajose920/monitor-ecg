/**
 * Resumen visible de la política de seguridad de la información (ISO/IEC 27001:2013, cláusula 5.2
 * y control A.5.1.1). Texto completo y aprobado: docs/sgsi/politica_seguridad.md.
 * La versión debe coincidir con POLICY_VERSION (services/security/isms.js).
 */
export const POLITICA = Object.freeze({
  objetivo: 'Proteger la confidencialidad, integridad y disponibilidad de las señales ECG y de los datos de los participantes del proyecto académico Monitor ECG, cumpliendo la Ley 19.628 y la Ley 21.719 de Chile y los requisitos de ISO/IEC 27001:2013.',
  compromisos: [
    'Tratar los datos de salud solo con fines académicos, con consentimiento informado y con seudónimos ("Usuario N").',
    'Cifrar los datos en reposo (AES-GCM 256) y transmitirlos solo por HTTPS.',
    'Limitar las funciones administrativas al perfil de administrador (PIN local y cuenta en la nube).',
    'Registrar los eventos de seguridad en una auditoría encadenada y revisarla periódicamente.',
    'Notificar y gestionar los incidentes y puntos débiles de seguridad (A.16).',
    'Cumplir los requisitos legales aplicables y mejorar el SGSI de forma continua (cláusula 10).',
  ],
  usoAceptable: [
    'Usa el sistema solo para las actividades del curso; no es un dispositivo médico ni sirve para diagnóstico.',
    'No ingreses nombres reales, RUT, correos ni fotos; usa el identificador generado por el sistema.',
    'No compartas CSV exportados por canales públicos; bórralos cuando ya no los necesites.',
    'Cierra la sesión de administrador al terminar y no dejes el equipo desatendido.',
    'No intentes eludir los controles (DevTools, modificar el almacenamiento) ni accedas a datos de otros participantes.',
    'Respeta la seguridad eléctrica: batería o Bluetooth aislado con los electrodos puestos.',
  ],
  roles: [
    { rol: 'Docente supervisor (dirección)', resp: 'Aprueba la política, acepta riesgos residuales y realiza la revisión por la dirección (9.3).' },
    { rol: 'Responsable de seguridad (equipo)', resp: 'Mantiene el SGSI, la Declaración de Aplicabilidad y gestiona incidentes.' },
    { rol: 'Administrador de la plataforma', resp: 'Configura parámetros, revisa accesos (A.9.2.5) y la auditoría; acepta la política de uso.' },
    { rol: 'Participante', resp: 'Mide sus señales, gestiona su consentimiento y puede notificar incidentes.' },
    { rol: 'Desarrolladores', resp: 'Aplican desarrollo seguro (A.14.2) y no usan datos reales en pruebas (A.14.3.1).' },
  ],
  clasificacion: [
    { nivel: 'Confidencial-Sensible', ejemplo: 'Señal ECG, BPM, edad y peso, CSV exportados' },
    { nivel: 'Confidencial', ejemplo: 'Consentimientos, auditoría, credencial del administrador, incidentes' },
    { nivel: 'Interno', ejemplo: 'Identificador seudónimo, parámetros de configuración, código fuente' },
    { nivel: 'Público', ejemplo: 'Contenido educativo, aviso de privacidad, esta política' },
  ],
})
