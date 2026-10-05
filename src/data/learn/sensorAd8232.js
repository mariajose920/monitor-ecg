/** RF23: el sensor real del prototipo (AD8232) + aclaración sobre el "sensor infrarrojo" (inconsistencia I3). */
export default {
  id: 'sensor',
  rf: 'RF23',
  titulo: 'El sensor: AD8232 (ECG por electrodos)',
  resumen: 'Cómo funciona el front-end analógico AD8232 y cómo se conecta al Arduino.',
  secciones: [
    {
      subtitulo: '¿Qué es el AD8232?',
      parrafos: [
        'Es un circuito integrado de Analog Devices diseñado para acondicionar biopotenciales: toma la diferencia de tensión muy pequeña (del orden de 1 mV) que aparece entre electrodos en la piel durante cada latido y la convierte en una señal analógica que un microcontrolador puede leer.',
      ],
    },
    {
      subtitulo: 'Etapas internas',
      lista: [
        'Amplificador de instrumentación: amplifica la diferencia entre los electrodos y rechaza lo que es común a ambos (por ejemplo, la interferencia de la red).',
        'Filtro paso alto (~0,5 Hz): elimina la componente continua y la deriva lenta de la línea base (respiración, potencial de los electrodos).',
        'Filtro paso bajo (~40 Hz en la configuración de monitoreo): atenúa el ruido muscular y de alta frecuencia.',
        'Amplificador de pierna derecha (right-leg drive): inyecta en el electrodo RL una señal que reduce la tensión de modo común, mejorando el rechazo de interferencia.',
        'Detección de leads-off: las salidas LO+ y LO− se activan cuando un electrodo se despega. El firmware las lee en D10/D11 y envía la marca leads_off.',
        'La salida queda centrada en la mitad de la alimentación (≈1,65 V con 3,3 V), por eso la línea base en el ADC del UNO es de unas 338 cuentas y no 512.',
      ],
    },
    {
      subtitulo: 'Electrodos y conexión',
      lista: [
        '3 electrodos: RA (brazo derecho), LA (brazo izquierdo) y RL (pierna derecha, referencia). Se obtiene una sola derivación.',
        'AD8232 OUTPUT → Arduino A0; LO+ → D10; LO− → D11; 3.3V → 3.3V; GND → GND.',
        'El Arduino muestrea A0 a 250 Hz (cada 4 ms), con un ADC de 10 bits (0–1023), y envía por serie a 115 200 baudios la línea t_ms,ecg_raw,leads_off,bpm.',
        'Un ESP32 tiene ADC de 12 bits (0–4095) y referencia de 3,3 V: por eso la app usa perfiles de dispositivo y no escalas fijas.',
      ],
    },
  ],
  recuadros: [
    {
      tipo: 'info',
      titulo: 'Aclaración: los requerimientos mencionan un "sensor infrarrojo"',
      texto: 'El requerimiento RF23 habla de un sensor infrarrojo, es decir, de fotopletismografía (PPG, por ejemplo el MAX30102): un LED ilumina la piel y un fotodetector mide cómo cambia la luz absorbida con cada pulso de sangre. Este prototipo NO usa PPG: usa ECG por electrodos con el AD8232, que mide la actividad ELÉCTRICA del corazón. Diferencias: el ECG muestra las ondas P-QRS-T y permite medir el intervalo RR con precisión de milisegundos; la PPG mide el pulso mecánico en la periferia (dedo, muñeca), llega con unos cientos de milisegundos de retraso respecto del QRS, no requiere electrodos y es más sensible al movimiento y a la perfusión. Se recomienda corregir la redacción de RF23.',
    },
  ],
  fuentes: [
    'Analog Devices. AD8232 Single-Lead, Heart Rate Monitor Front End — Data Sheet.',
    'SparkFun. AD8232 Heart Rate Monitor Hookup Guide.',
    'Firmware del proyecto: sensor_ecg_ad8232.ino.',
  ],
}
