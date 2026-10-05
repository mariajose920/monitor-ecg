/** RF24: ingeniería de la medición y del análisis de señales. */
export default {
  id: 'ingenieria',
  rf: 'RF24',
  titulo: 'Ingeniería de la medición y de las señales',
  resumen: 'La cadena de medición, el muestreo (Nyquist), los filtros y la detección de picos.',
  secciones: [
    {
      subtitulo: 'La cadena de medición',
      lista: [
        'Transductor: los electrodos convierten la actividad iónica del corazón en una tensión eléctrica.',
        'Acondicionamiento: el AD8232 amplifica y filtra esa tensión.',
        'Conversión analógico-digital (ADC): el Arduino toma 250 muestras por segundo y cuantifica cada una en 1024 niveles (10 bits).',
        'Transmisión: las muestras viajan como texto CSV por USB o Bluetooth (HC-05) hasta el navegador (Web Serial).',
        'Procesamiento: la app valida cada línea, guarda las muestras en un buffer circular, detecta picos R y calcula el BPM.',
        'Visualización y almacenamiento: el gráfico se actualiza sincronizado con la pantalla y la sesión se guarda cifrada en bloques.',
      ],
    },
    {
      subtitulo: 'Muestreo y teorema de Nyquist',
      parrafos: [
        'Para reconstruir una señal sin pérdida (aliasing), la frecuencia de muestreo debe ser mayor que el doble de la frecuencia más alta que contiene. Como el AD8232 limita la señal a unos 40 Hz, el mínimo teórico sería 80 Hz.',
        'Se usan 250 Hz porque dan un margen amplio y una resolución temporal de 4 ms para ubicar el pico R, importante para medir el intervalo RR y la variabilidad. Es además un valor habitual en la literatura y que el Arduino UNO cumple sin dificultad.',
      ],
    },
    {
      subtitulo: 'Resolución del ADC',
      parrafos: [
        'Con 10 bits y 5 V de referencia, cada cuenta equivale a unos 4,9 mV a la salida del AD8232. Un ESP32 con 12 bits y 3,3 V ofrece unos 0,8 mV por cuenta. Por eso la app ajusta la escala según el perfil del dispositivo.',
      ],
    },
    {
      subtitulo: 'Filtros digitales',
      lista: [
        'Paso alto (~0,5 Hz): quita la deriva de la línea base.',
        'Notch de 50 Hz: elimina la interferencia de la red eléctrica.',
        'Media móvil: suaviza el ruido de alta frecuencia.',
        'En esta app los filtros se aplican solo para visualizar y comparar; el dato crudo se guarda intacto.',
      ],
    },
    {
      subtitulo: 'Detección del pico R con umbral adaptativo',
      parrafos: [
        'Inspirado en el algoritmo de Pan y Tompkins (1985): se elimina la línea base, se deriva la señal y se eleva al cuadrado (el QRS tiene las pendientes más pronunciadas), se integra en una ventana de ~120 ms y se compara con un umbral que es una fracción de un máximo reciente que decae lentamente. Así el umbral se adapta si cambia la amplitud (por ejemplo, al reacomodar electrodos).',
        'Un período refractario de 250–300 ms evita contar dos veces el mismo latido; los intervalos fuera de 30–220 BPM se descartan como fisiológicamente imposibles.',
      ],
    },
    {
      subtitulo: 'Validación frente a una referencia',
      parrafos: [
        'Para saber si el sensor mide bien se compara con una señal de referencia: ambas se filtran, se llevan a la misma frecuencia de muestreo y escala (normalización), se alinean en el tiempo (pico R o correlación cruzada) y se calculan métricas como la correlación de Pearson, el RMSE y la diferencia de BPM. Ver la sección "Comparar".',
      ],
    },
  ],
  recuadros: [],
  fuentes: [
    'Pan, J. y Tompkins, W. J. (1985). A real-time QRS detection algorithm. IEEE Trans. Biomed. Eng., 32(3), 230–236.',
    'Tompkins, W. J. (1993). Biomedical Digital Signal Processing. Prentice Hall.',
    'McSharry, P. E. et al. (2003). A dynamical model for generating synthetic electrocardiogram signals. IEEE Trans. Biomed. Eng., 50(3).',
  ],
}
