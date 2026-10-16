/** Seguridad de la información en la app (ISO/IEC 27001:2013 = UNE-EN ISO/IEC 27001:2017). */
export default {
  id: 'seguridad-informacion',
  rf: 'RNF06 / ISO 27001:2013',
  titulo: 'Seguridad de la información',
  resumen: 'Cómo protege este sistema tus datos de salud siguiendo la norma ISO/IEC 27001:2013 (Anexo A, 114 controles en 14 dominios A.5–A.18).',
  secciones: [
    {
      subtitulo: 'Qué es un SGSI',
      parrafos: [
        'Un Sistema de Gestión de la Seguridad de la Información (SGSI) es el conjunto de políticas, procesos y controles con los que una organización protege la confidencialidad, integridad y disponibilidad de su información.',
        'La norma ISO/IEC 27001:2013 lo organiza en el ciclo planificar–hacer–verificar–actuar: contexto (cláusula 4), liderazgo (5), planificación y riesgos (6), soporte (7), operación (8), evaluación del desempeño (9) y mejora (10).',
      ],
    },
    {
      subtitulo: 'Controles del Anexo A aplicados en esta app',
      lista: [
        'A.5.1.1 Políticas para la seguridad de la información: política publicada en la página "Seguridad".',
        'A.8.2.1 / A.8.2.2 Clasificación y etiquetado: insignias "Confidencial-Sensible" en datos de salud y en los CSV.',
        'A.9.2.3 / A.9.4.2 Privilegios e inicio de sesión seguro: PIN de administrador con PBKDF2, bloqueo tras 5 intentos y sesión que expira.',
        'A.10.1.1 Controles criptográficos: AES-GCM 256 en reposo, SHA-256 en la auditoría y TLS en tránsito.',
        'A.12.4.1 / A.12.4.2 Registro de eventos protegido: auditoría encadenada con hashes en hora UTC (A.12.4.4).',
        'A.16.1.2 / A.16.1.3 Notificación de eventos y puntos débiles: formulario "Reportar incidente".',
        'A.18.1.4 Protección de datos personales: seudónimos, consentimiento y derecho de supresión (Ley 19.628 y Ley 21.719).',
      ],
    },
    {
      subtitulo: 'Tu papel',
      lista: [
        'No uses tu nombre real, RUT ni correo como alias.',
        'Cierra la sesión de administrador al terminar y no dejes el equipo desatendido (A.11.2.8).',
        'Si ves algo raro (datos alterados, CSV perdido, acceso sospechoso), repórtalo en "Seguridad" → "Reportar incidente". No incluyas datos de salud.',
      ],
    },
  ],
  recuadros: [
    { tipo: 'info', titulo: 'Limitación honesta', texto: 'Parte de los controles se ejecutan en el navegador: disuaden el uso indebido casual, pero no detienen a quien controla el equipo. Por eso se combinan con la base de datos en la nube protegida con Row Level Security.' },
  ],
  fuentes: [
    'UNE-EN ISO/IEC 27001:2017 (ISO/IEC 27001:2013 + Cor 1:2014 + Cor 2:2015). Sistemas de gestión de la seguridad de la información. Requisitos.',
    'Documentación del proyecto: docs/ISO27001_controles.md y docs/sgsi/.',
  ],
}
