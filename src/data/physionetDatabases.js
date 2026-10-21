/**
 * Base de datos clínica PhysioNet (https://physionet.org/).
 *
 * PhysioNet es el repositorio de referencia mundial de bioseñales biomédicas (mantenido por el
 * MIT Laboratory for Computational Physiology, Harvard Medical School y el NIH).
 *
 * Este catálogo indexa patologías cardíacas representativas de las bases de datos abiertas:
 * - MIT-BIH Normal Sinus Rhythm Database (nsrdb)
 * - MIT-BIH Arrhythmia Database (mitdb)
 * - MIT-BIH Atrial Fibrillation Database (afdb)
 * - European ST-T Database (edb)
 */

export const PATOLOGIAS_PHYSIONET = Object.freeze([
  {
    id: 'nsr',
    nombre: 'Ritmo Sinusal Normal',
    sigla: 'NSR',
    baseDatos: 'MIT-BIH Normal Sinus Rhythm Database (nsrdb)',
    enlacePhysioNet: 'https://physionet.org/content/nsrdb/1.0.0/',
    categoria: 'Control Normal',
    colorCategoria: '#0284c7',
    bpmNominal: 72,
    registroEjemplo: 'Registro 16265 (nsrdb)',
    descripcion: 'Trazado fisiológico de control sano. Impulso originado en el nódulo sinoauricular con despolarización auricular y ventricular ordenada y simétrica.',
    criterios: [
      'Onda P positiva y redondeada precediendo a cada QRS (< 120 ms)',
      'Intervalo PR constante y normal (0,12 a 0,20 s)',
      'Complejo QRS estrecho (< 100 ms) sin melladuras ni aberrancias',
      'Intervalo RR regular con leve variación respiratoria fisiológica',
    ],
    caracteristicas: {
      ondaP: 'Presente y normal (0,14 mV)',
      complejoQrs: 'Estrecho (< 100 ms)',
      ritmoRr: 'Regular (72 BPM)',
      segmentoSt: 'Isoeléctrico en línea base',
    },
    utilidadComparacion: 'Patrón oro estándar de referencia para contrastar mediciones de laboratorio en sujetos sanos.',
  },
  {
    id: 'afib',
    nombre: 'Fibrilación Auricular',
    sigla: 'AFIB',
    baseDatos: 'MIT-BIH Atrial Fibrillation Database (afdb)',
    enlacePhysioNet: 'https://physionet.org/content/afdb/1.0.0/',
    categoria: 'Arritmia Supraventricular',
    colorCategoria: '#d97706',
    bpmNominal: 118,
    registroEjemplo: 'Registro 04015 (afdb)',
    descripcion: 'Arritmia supraventricular común caracterizada por actividad eléctrica auricular rápida y desorganizada (350–600 dpm), con respuesta ventricular irregular.',
    criterios: [
      'Ausencia total de ondas P identificables en la línea base',
      'Ondulaciones irregulares rápidas de bajo voltaje (ondas f)',
      'Intervalos RR completamente irregulares ("irregularmente irregular")',
      'Frecuencia ventricular variable (100–140 BPM en reposo)',
    ],
    caracteristicas: {
      ondaP: 'Ausente (reemplazada por ondas f)',
      complejoQrs: 'Estrecho normal (< 100 ms)',
      ritmoRr: 'Caótico e impredecible (100–140 BPM)',
      segmentoSt: 'Ligeramente oscilante por ondas f',
    },
    utilidadComparacion: 'Evalúa la robustez del detector de picos R ante línea base irregular y variabilidad RR extrema.',
  },
  {
    id: 'pvc',
    nombre: 'Extrasístoles Ventriculares (Bigeminismo/Trigeminismo)',
    sigla: 'PVC',
    baseDatos: 'MIT-BIH Arrhythmia Database (mitdb)',
    enlacePhysioNet: 'https://physionet.org/content/mitdb/1.0.0/',
    categoria: 'Ectopia Ventricular',
    colorCategoria: '#e11d48',
    bpmNominal: 74,
    registroEjemplo: 'Registro 119 (mitdb)',
    descripcion: 'Latidos prematuros originados en un foco ectópico en los ventrículos. Ocurren antes del latido sinusal previsto y alteran la contracción mecánica cardíaca.',
    criterios: [
      'Aparición prematura del complejo respecto al ritmo sinusal previo',
      'Complejo QRS ensanchado (> 120 ms) con morfología anómala',
      'Ausencia de onda P previa al complejo ectópico',
      'Onda T discordante de gran amplitud y pausa compensatoria completa posterior',
    ],
    caracteristicas: {
      ondaP: 'Ausente en el latido prematuro',
      complejoQrs: 'Ancho y mellado (> 140 ms)',
      ritmoRr: 'Interrumpido por latido adelantado y pausa compensatoria',
      segmentoSt: 'Desviado en dirección opuesta al QRS',
    },
    utilidadComparacion: 'Permite contrastar la correlación de Pearson frente a morfologías QRS normales vs. aberrantes.',
  },
  {
    id: 'vtach',
    nombre: 'Taquicardia Ventricular Monomórfica',
    sigla: 'VT',
    baseDatos: 'MIT-BIH Arrhythmia Database (mitdb)',
    enlacePhysioNet: 'https://physionet.org/content/mitdb/1.0.0/',
    categoria: 'Arritmia Ventricular',
    colorCategoria: '#be123c',
    bpmNominal: 165,
    registroEjemplo: 'Registro 205 (mitdb)',
    descripcion: 'Ritmo rápido originado en los ventrículos a más de 150 BPM. Emergencia médica de alto riesgo hemodinámico con pérdida de gasto cardíaco efectivo.',
    criterios: [
      'Frecuencia ventricular muy elevada (150–200 BPM, nominal 165 BPM)',
      'Complejos QRS marcadamente ensanchados y monomórficos',
      'Disociación auriculoventricular (sin relación con ondas P)',
      'Trazado casi sinusoidal rápido de gran amplitud',
    ],
    caracteristicas: {
      ondaP: 'No identificable',
      complejoQrs: 'Muy ensanchado (> 150 ms) monomórfico',
      ritmoRr: 'Rápido y regular (165 BPM)',
      segmentoSt: 'Fusionado con la repolarización ventricular',
    },
    utilidadComparacion: 'Demuestra el comportamiento de las métricas RMSE y correlación cruzada en arritmias de alta frecuencia.',
  },
  {
    id: 'brady',
    nombre: 'Bradicardia Sinusal',
    sigla: 'BRAD',
    baseDatos: 'MIT-BIH Arrhythmia Database (mitdb)',
    enlacePhysioNet: 'https://physionet.org/content/mitdb/1.0.0/',
    categoria: 'Trastorno del Ritmo',
    colorCategoria: '#6366f1',
    bpmNominal: 44,
    registroEjemplo: 'Registro 232 (mitdb)',
    descripcion: 'Disminución de la frecuencia cardíaca sinusal por debajo de 50 BPM. Puede ser fisiológica en deportistas o sintomática en enfermedad del nódulo sinusal.',
    criterios: [
      'Frecuencia ventricular baja sostenida (42–46 BPM)',
      'Intervalo isoeléctrico T-P marcadamente prolongado (> 750 ms)',
      'Morfología P-QRS-T conservada y estrecha',
      'Intervalo QT corregido ligeramente prolongado por la bradicardia',
    ],
    caracteristicas: {
      ondaP: 'Normal, previa a cada QRS',
      complejoQrs: 'Estrecho (< 100 ms)',
      ritmoRr: 'Lento y regular (RR ~ 1,36 s)',
      segmentoSt: 'Isoeléctrico',
    },
    utilidadComparacion: 'Verifica la ventana de análisis y el cálculo de BPM ante períodos refractarios extensos.',
  },
  {
    id: 'tachy',
    nombre: 'Taquicardia Sinusal',
    sigla: 'TACH',
    baseDatos: 'MIT-BIH Arrhythmia Database (mitdb)',
    enlacePhysioNet: 'https://physionet.org/content/mitdb/1.0.0/',
    categoria: 'Trastorno del Ritmo',
    colorCategoria: '#0284c7',
    bpmNominal: 130,
    registroEjemplo: 'Registro 212 (mitdb)',
    descripcion: 'Aumento de la frecuencia del nódulo sinusal por encima de 100 BPM en respuesta a ejercicio, estrés o demandas metabólicas.',
    criterios: [
      'Frecuencia ventricular acelerada regular (125–135 BPM)',
      'Acortamiento fisiológico de la diástole (intervalo T-P muy breve)',
      'La onda P puede tocar o fusionarse con el final de la onda T previa',
      'Morfología QRS normal y estrecha',
    ],
    caracteristicas: {
      ondaP: 'Presente pero próxima a la onda T precedente',
      complejoQrs: 'Estrecho (< 90 ms)',
      ritmoRr: 'Rápido y regular (RR ~ 0,46 s)',
      segmentoSt: 'Breve pero isoeléctrico',
    },
    utilidadComparacion: 'Evalúa la capacidad de segmentar la onda P cuando la diástole se acorta drásticamente.',
  },
  {
    id: 'ischemia',
    nombre: 'Isquemia Miocárdica (Depresión ST)',
    sigla: 'ISC',
    baseDatos: 'European ST-T Database (edb)',
    enlacePhysioNet: 'https://physionet.org/content/edb/1.0.0/',
    categoria: 'Cardiopatía Isquémica',
    colorCategoria: '#9333ea',
    bpmNominal: 76,
    registroEjemplo: 'Registro e0103 (edb)',
    descripcion: 'Insuficiencia de irrigación coronaria en el músculo cardíaco. Altera la repolarización ventricular provocando un desnivel negativo del punto J y del segmento ST.',
    criterios: [
      'Depresión horizontal o descendente del segmento ST (> 0,15 mV / 1,5 mm)',
      'Inversión asimétrica de la onda T de repolarización',
      'Frecuencia cardíaca normal (75–80 BPM)',
      'Complejos QRS y ondas P sinusalmente normales',
    ],
    caracteristicas: {
      ondaP: 'Normal',
      complejoQrs: 'Estrecho normal',
      ritmoRr: 'Regular (76 BPM)',
      segmentoSt: 'Deprimido (-0,18 mV) con onda T invertida',
    },
    utilidadComparacion: 'Permite demostrar que dos señales pueden tener idéntico BPM pero correlación baja por alteración del segmento ST.',
  },
])

/** Mapa rápido por ID para búsquedas directas. */
export const MAPA_PATOLOGIAS = Object.freeze(
  PATOLOGIAS_PHYSIONET.reduce((acc, p) => {
    acc[p.id] = p
    return acc
  }, {}),
)
