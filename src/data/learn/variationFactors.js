/** RF21: factores que pueden hacer variar la frecuencia cardíaca (enlazado desde las alertas RF20). */
export default {
  id: 'variacion',
  rf: 'RF21',
  titulo: '¿Por qué varía la frecuencia cardíaca?',
  resumen: 'Causas fisiológicas habituales y artefactos técnicos que pueden parecer cambios de frecuencia.',
  secciones: [
    {
      subtitulo: 'Causas fisiológicas frecuentes',
      lista: [
        'Ejercicio y actividad física: los músculos necesitan más oxígeno y el corazón late más rápido.',
        'Postura: al ponerse de pie la frecuencia sube unos segundos para compensar el descenso de presión.',
        'Estrés, ansiedad o emociones intensas: activación del sistema nervioso simpático (adrenalina).',
        'Cafeína, nicotina y otros estimulantes: aumentan la frecuencia.',
        'Temperatura ambiente alta o fiebre: el corazón acelera para disipar calor; por cada grado de fiebre suele subir varios latidos por minuto.',
        'Deshidratación: menor volumen de sangre, el corazón compensa latiendo más rápido.',
        'Fármacos: algunos la aumentan (broncodilatadores, descongestionantes) y otros la reducen (betabloqueadores).',
        'Sueño y descanso: durante el sueño profundo la frecuencia baja; la falta de sueño puede elevarla en reposo.',
        'Respiración: al inspirar la frecuencia sube levemente y al espirar baja (variabilidad normal).',
        'Condición física: las personas entrenadas suelen tener frecuencias de reposo más bajas.',
      ],
    },
    {
      subtitulo: 'Artefactos técnicos que imitan cambios de frecuencia',
      parrafos: ['No todo cambio en el valor mostrado es real. Antes de interpretar una alerta revisa la calidad de la señal:'],
      lista: [
        'Movimiento del participante o de los cables: aparecen picos que el detector puede confundir con latidos (BPM falsamente alto).',
        'Electrodos mal adheridos o gel seco: la señal se vuelve ruidosa o se activa leads-off.',
        'Interferencia de la red eléctrica (50 Hz en Chile): una oscilación fina superpuesta a la señal.',
        'Deriva de la línea base por la respiración o la sudoración: la señal sube y baja lentamente.',
        'Ondas T muy altas: pueden contarse como un segundo latido (BPM duplicado).',
      ],
    },
  ],
  recuadros: [
    { tipo: 'info', titulo: 'Sobre las alertas de esta app', texto: 'Una alerta se dispara cuando el BPM permanece fuera del rango configurado durante varios segundos seguidos; para volver a "dentro" debe superar un margen (histéresis). Así se evitan alertas por valores aislados o por ruido.' },
  ],
  fuentes: ['American Heart Association. All About Heart Rate (Pulse). heart.org.', 'Task Force of ESC/NASPE (1996). Heart rate variability: standards of measurement.'],
}
