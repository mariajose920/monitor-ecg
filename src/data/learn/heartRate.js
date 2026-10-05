/** RF22: frecuencia cardíaca y su relación con la fisiología. Texto plano (SEC-53: sin HTML). */
export default {
  id: 'frecuencia',
  rf: 'RF22',
  titulo: 'Frecuencia cardíaca y fisiología',
  resumen: 'Cómo se genera cada latido, qué representa cada onda del ECG y cómo se calcula el BPM.',
  figura: true,
  secciones: [
    {
      subtitulo: 'El sistema de conducción',
      parrafos: [
        'Cada latido comienza en el nodo sinoauricular (SA), un grupo de células de la aurícula derecha que se despolarizan de forma espontánea y actúan como marcapasos natural.',
        'El impulso recorre las aurículas (que se contraen), se retrasa brevemente en el nodo auriculoventricular (AV) para que los ventrículos terminen de llenarse, y luego viaja rápidamente por el haz de His y las fibras de Purkinje, que activan los ventrículos de forma casi simultánea.',
      ],
    },
    {
      subtitulo: 'Las ondas del ECG',
      lista: [
        'Onda P: despolarización de las aurículas.',
        'Complejo QRS: despolarización de los ventrículos. Es la deflexión más rápida y de mayor amplitud; su pico (R) es el que se usa para medir el ritmo.',
        'Onda T: repolarización de los ventrículos (recuperación eléctrica).',
        'Intervalo RR: tiempo entre dos picos R consecutivos.',
      ],
    },
    {
      subtitulo: 'Del intervalo RR al BPM',
      parrafos: [
        'La frecuencia cardíaca instantánea se calcula como BPM = 60 000 / RR (con RR en milisegundos). Por ejemplo, RR = 800 ms equivale a 75 BPM.',
        'Esta aplicación detecta los picos R en el navegador y usa la mediana de los últimos intervalos RR para que un falso positivo aislado no altere el valor. El firmware del Arduino calcula además su propio BPM con un umbral adaptativo; ambos se muestran.',
      ],
    },
    {
      subtitulo: 'Rangos típicos (orientativos)',
      lista: [
        'Adulto en reposo: aproximadamente 60–100 BPM; personas entrenadas pueden tener 40–60 BPM.',
        'En adultos en reposo se habla de bradicardia por debajo de 60 BPM y de taquicardia por encima de 100 BPM; una bradicardia leve puede ser normal en deportistas o durante el sueño.',
        'Durante el ejercicio aumenta según la intensidad; una estimación clásica (y muy imprecisa) de la máxima es 220 − edad.',
        'Tras el ejercicio desciende progresivamente (recuperación); la rapidez de ese descenso se relaciona con la condición física.',
      ],
    },
    {
      subtitulo: 'Variabilidad de la frecuencia cardíaca (HRV)',
      parrafos: [
        'Los intervalos RR no son idénticos: varían con la respiración (arritmia sinusal respiratoria) y con el equilibrio entre el sistema nervioso simpático y parasimpático. Una variabilidad moderada en reposo es normal y saludable.',
      ],
    },
  ],
  recuadros: [
    { tipo: 'warn', titulo: 'Contenido educativo, no diagnóstico', texto: 'Los rangos son generales. Ante síntomas o valores persistentemente anormales, consulta a un profesional de salud. Este sistema no es un dispositivo médico.' },
  ],
  fuentes: [
    'Guyton y Hall. Tratado de fisiología médica (capítulos de excitación rítmica del corazón y ECG normal).',
    'Tompkins, W. J. (1993). Biomedical Digital Signal Processing. Prentice Hall.',
  ],
}
