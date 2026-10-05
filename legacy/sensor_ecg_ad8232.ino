/* ============================================================
 * SENSOR ECG DE UNA DERIVACIÓN — AD8232 + Arduino UNO/Nano
 * Bioinstrumentación avanzada — Máster en Ingeniería Biomédica
 * ------------------------------------------------------------
 * QUÉ HACE:
 *   1) Muestrea la salida analógica del AD8232 a una frecuencia
 *      fija y justificada (ver comentario de FS_HZ más abajo).
 *   2) Detecta si los electrodos están despegados (leads-off).
 *   3) Detecta picos R con un umbral adaptativo + período
 *      refractario, y calcula la frecuencia cardíaca (BPM).
 *   4) Envía todo por Serial: útil tanto para graficar la onda
 *      en el Monitor/Plotter Serial del IDE de Arduino, como
 *      para registrar datos y anexarlos al informe.
 *
 * CONEXIONES (idénticas a la guía oficial de SparkFun para el
 * AD8232, ver referencia en el informe):
 *   AD8232 OUTPUT -> Arduino A0
 *   AD8232 LO-    -> Arduino D11
 *   AD8232 LO+    -> Arduino D10
 *   AD8232 3.3V   -> Arduino 3.3V   (NO usar 5V salvo que tu
 *                     módulo específico indique ser tolerante)
 *   AD8232 GND    -> Arduino GND
 *
 * ADVERTENCIA DE SEGURIDAD (no opcional):
 *   Alimenta el Arduino con BATERÍA (9V con regulador, o power
 *   bank USB aislado) mientras los electrodos están puestos.
 *   NO lo conectes por cable USB directo a un computador
 *   enchufado a la red mientras estás usando los electrodos:
 *   una falla de aislación en el PC podría inyectar corriente
 *   de fuga a través de tu cuerpo. Para ver los datos en vivo
 *   en el computador, usa un módulo Bluetooth (HC-05/HC-06) en
 *   vez del cable USB, o desconecta el USB antes de ponerte los
 *   electrodos y solo revisa los datos después.
 * ============================================================ */

// ---------------- CONFIGURACIÓN DE PINES ----------------
const int PIN_ECG   = A0;
const int PIN_LO_MAS = 10;
const int PIN_LO_MENOS = 11;

// ---------------- FRECUENCIA DE MUESTREO ----------------
// El AD8232 en la configuración típica de monitoreo cardíaco
// filtra la señal a una banda de ~0.5 Hz - 40 Hz (ver hoja de
// datos, Analog Devices). Por el teorema de muestreo de Nyquist,
// Fs debe ser MAYOR que 2 x 40 Hz = 80 Hz como mínimo absoluto.
// En la práctica clínica y en la literatura (Tompkins, 1993;
// Mintchev, 2006 — ambos en la bibliografía del curso) se usa
// 250-500 Hz para tener buena resolución temporal en la
// ubicación del pico R (importante si luego quieres calcular
// variabilidad de la frecuencia cardíaca, HRV). Se eligió 250 Hz
// como compromiso: cumple de sobra Nyquist, y el Arduino UNO
// (ADC de 10 bits, ~100 µs por conversión) lo cumple sin
// problema.
const unsigned long FS_HZ = 250;
const unsigned long PERIODO_US = 1000000UL / FS_HZ; // 4000 µs = 4 ms

// ---------------- DETECCIÓN DE PICOS R ----------------
// Umbral adaptativo simple: se recalcula como una fracción del
// máximo observado en una ventana móvil reciente. El período
// refractario evita contar el mismo latido dos veces (la
// contracción cardíaca no puede repetirse en menos de ~300 ms,
// lo que equivale a un límite fisiológico de 200 lpm).
const unsigned long REFRACTARIO_MS = 300;
float umbral = 550;              // valor inicial (~mitad de escala del ADC de 10 bits, ajustar en pruebas)
const float FACTOR_UMBRAL = 0.6; // el umbral se fija en 60% del máximo reciente
float maximoReciente = 550;
const float DECAIMIENTO_MAX = 0.995; // el "máximo reciente" decae lentamente si no hay picos nuevos

unsigned long ultimoPicoMs = 0;
unsigned long penultimoPicoMs = 0;
float bpmActual = 0;

unsigned long proximoMuestreoUs = 0;

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LO_MAS, INPUT);
  pinMode(PIN_LO_MENOS, INPUT);
  proximoMuestreoUs = micros();

  Serial.println(F("t_ms,ecg_raw,leads_off,bpm"));
}

void loop() {
  // Espera activa hasta el próximo instante de muestreo:
  // mantiene Fs constante independientemente de cuánto tarde
  // el resto del código (importante para no distorsionar la
  // temporización de los picos R).
  while ((long)(micros() - proximoMuestreoUs) < 0) {
    // espera
  }
  proximoMuestreoUs += PERIODO_US;

  bool leadsOff = (digitalRead(PIN_LO_MAS) == HIGH) || (digitalRead(PIN_LO_MENOS) == HIGH);
  int valorCrudo = analogRead(PIN_ECG); // 0-1023 (ADC de 10 bits del Arduino UNO)

  if (!leadsOff) {
    detectarPicoYActualizarBPM(valorCrudo);
  }

  // Salida en formato CSV: fácil de graficar en Excel/Python o
  // de pegar directamente en el Monitor/Plotter Serial.
  Serial.print(millis());
  Serial.print(',');
  Serial.print(valorCrudo);
  Serial.print(',');
  Serial.print(leadsOff ? 1 : 0);
  Serial.print(',');
  Serial.println(bpmActual, 1);
}

void detectarPicoYActualizarBPM(int valor) {
  // Actualiza el máximo reciente (con decaimiento lento) para
  // que el umbral se adapte si cambia la amplitud de la señal
  // (por ejemplo, al reacomodar los electrodos).
  if (valor > maximoReciente) {
    maximoReciente = valor;
  } else {
    maximoReciente *= DECAIMIENTO_MAX;
  }
  umbral = FACTOR_UMBRAL * maximoReciente;

  unsigned long ahora = millis();
  bool fueraDelRefractario = (ahora - ultimoPicoMs) > REFRACTARIO_MS;

  if (valor > umbral && fueraDelRefractario) {
    penultimoPicoMs = ultimoPicoMs;
    ultimoPicoMs = ahora;

    if (penultimoPicoMs > 0) {
      unsigned long intervaloRR_ms = ultimoPicoMs - penultimoPicoMs;
      if (intervaloRR_ms > 0) {
        float bpmInstantaneo = 60000.0 / intervaloRR_ms;
        // Filtro de sanidad fisiológica: descarta valores fuera
        // del rango humano plausible (30-220 lpm), típico de un
        // falso positivo por ruido o movimiento.
        if (bpmInstantaneo >= 30 && bpmInstantaneo <= 220) {
          // Promedio móvil exponencial simple: suaviza el valor
          // mostrado sin perder capacidad de reacción a cambios reales.
          bpmActual = (bpmActual == 0) ? bpmInstantaneo : (0.75 * bpmActual + 0.25 * bpmInstantaneo);
        }
      }
    }
  }
}
