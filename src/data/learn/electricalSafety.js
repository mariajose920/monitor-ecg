/** Aviso de seguridad eléctrica (I6, SEC-21). */
export default {
  id: 'seguridad',
  rf: 'I6 / SEC-21',
  titulo: 'Seguridad eléctrica',
  resumen: 'Por qué no se debe conectar el sensor por USB a un PC enchufado a la red con electrodos puestos.',
  secciones: [
    {
      subtitulo: 'El riesgo',
      parrafos: [
        'Los electrodos crean un camino eléctrico de baja resistencia a través del cuerpo. Si el computador está conectado a la red y su fuente tiene una falla de aislación, una corriente de fuga podría circular por el participante a través del cable USB.',
        'Los equipos médicos certificados (norma IEC 60601) incorporan aislamiento galvánico; este prototipo educativo NO lo tiene.',
      ],
    },
    {
      subtitulo: 'Cómo conectarse de forma segura',
      lista: [
        'Alimenta el Arduino con batería (9 V con regulador o power bank aislado) mientras los electrodos estén puestos.',
        'Para ver datos en vivo usa un módulo Bluetooth (HC-05/HC-06): emparejado con el PC aparece como puerto COM y se usa con la opción "Puerto serie" de esta app.',
        'Si usas cable USB, desconecta el portátil del cargador (funcionando solo con batería) o coloca los electrodos solo después de desconectar el USB.',
        'No uses el sistema en personas con marcapasos u otros dispositivos implantados.',
      ],
    },
  ],
  recuadros: [
    { tipo: 'warn', titulo: 'No es un dispositivo médico', texto: 'El sistema es exclusivamente educativo, no está certificado y no debe usarse para diagnóstico ni tratamiento.' },
  ],
  fuentes: ['IEC 60601-1: Medical electrical equipment — General requirements for basic safety.', 'Firmware del proyecto: advertencia de seguridad en sensor_ecg_ad8232.ino.'],
}
