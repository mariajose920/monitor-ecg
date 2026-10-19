/* ============================================================
 * SENSOR DE PULSO ÓPTICO (PPG, infrarrojo) — MAX30102/MAX30100 + ESP32
 * Monitor ECG web (Programación Web) — mismo protocolo que el AD8232:
 *     t_ms,ecg_raw,leads_off,bpm      a 115200 baudios
 *
 * LIBRERÍA (Arduino IDE → Administrar bibliotecas):
 *   "SparkFun MAX3010x Pulse and Proximity Sensor Library"
 *
 * CONEXIONES (I2C, el ESP32 trabaja a 3.3 V):
 *   MAX30102 VIN -> ESP32 3V3
 *   MAX30102 GND -> ESP32 GND
 *   MAX30102 SDA -> ESP32 GPIO21 (D21)
 *   MAX30102 SCL -> ESP32 GPIO22 (D22)
 *   MAX30102 INT -> sin conectar (no se usa)
 *
 * NOTAS:
 *  - Es una señal PPG (pulso), NO un ECG: la onda tiene forma de pulso,
 *    no de complejo QRS. La web la grafica igual y usa el BPM de este firmware.
 *  - ecg_raw se envía centrada en 2048 dentro de 0-4095 (perfil "ESP32" de la web).
 *  - leads_off = 1 cuando no hay dedo sobre el sensor.
 *  - Alimentado por USB de un PC conectado a la red: no hay electrodos en el cuerpo,
 *    por lo que el riesgo eléctrico es bajo; aun así usa el equipo con batería si puedes.
 * ============================================================ */
#include <Wire.h>
#include "MAX30105.h"   // sirve también para MAX30102
#include "heartRate.h"

MAX30105 sensor;

const int PIN_SDA = 21;
const int PIN_SCL = 22;
const long UMBRAL_DEDO = 50000;   // IR por debajo de esto = sin dedo

// Filtro de línea base (DC) y escalado adaptativo a 0-4095
float dc = 0;
float amplitud = 500;             // amplitud típica del pulso, se adapta sola

// BPM por detección de latidos con promedio de las últimas lecturas
const byte N_PROM = 4;
float bpms[N_PROM];
byte bpmIdx = 0;
float bpmActual = 0;
long ultimoLatido = 0;

void setup() {
  Serial.begin(115200);
  delay(300);
  // Marca de arranque: confirma que corre ESTE programa y no el firmware de fábrica (AT).
  Serial.println(F("# PPG MAX30102 v2 listo"));
  Wire.begin(PIN_SDA, PIN_SCL);
  if (!sensor.begin(Wire, I2C_SPEED_FAST)) {
    // Sin sensor: informa y reintenta (no se queda mudo)
    while (true) {
      Serial.println(F("# ERROR: MAX3010x no detectado. Revisa VIN/GND/SDA/SCL."));
      delay(1000);
      if (sensor.begin(Wire, I2C_SPEED_FAST)) break;
    }
  }
  // brillo LED 0x24 (~7 mA), 1 LED IR, 100 muestras/s, pulso 411 us, rango 16384
  sensor.setup(0x24, 1, 2, 100, 411, 16384);
  sensor.setPulseAmplitudeRed(0x0A);  // LED rojo tenue: solo sirve de indicador visible (la señal usa el infrarrojo)
  Serial.println(F("t_ms,ecg_raw,leads_off,bpm"));
}

void loop() {
  sensor.check();
  while (sensor.available()) {
    long ir = sensor.getFIFOIR();
    sensor.nextSample();

    bool sinDedo = ir < UMBRAL_DEDO;
    if (sinDedo) {
      bpmActual = 0;
      dc = ir;
    } else {
      if (dc == 0) dc = ir;
      dc += 0.05f * (ir - dc);        // línea base lenta
      float ac = ir - dc;             // componente pulsátil

      if (fabs(ac) > amplitud) amplitud = fabs(ac);
      else amplitud *= 0.999f;        // la amplitud se adapta lentamente
      if (amplitud < 50) amplitud = 50;

      if (checkForBeat(ir)) {
        long ahora = millis();
        long delta = ahora - ultimoLatido;
        ultimoLatido = ahora;
        float bpm = 60000.0f / delta;
        // Filtro de sanidad fisiológica (igual que el firmware del AD8232)
        if (bpm >= 30 && bpm <= 220) {
          bpms[bpmIdx++ % N_PROM] = bpm;
          float suma = 0;
          byte n = 0;
          for (byte i = 0; i < N_PROM; i++) if (bpms[i] > 0) { suma += bpms[i]; n++; }
          bpmActual = n ? suma / n : bpm;
        }
      }
    }

    // Escala la señal a 0-4095 centrada en 2048
    int valor = 2048;
    if (!sinDedo) {
      float v = 2048.0f + (ir - dc) * (1800.0f / amplitud);
      valor = (int)constrain(v, 0, 4095);
    }

    Serial.print(millis());
    Serial.print(',');
    Serial.print(valor);
    Serial.print(',');
    Serial.print(sinDedo ? 1 : 0);
    Serial.print(',');
    Serial.println(bpmActual, 1);
  }
}
