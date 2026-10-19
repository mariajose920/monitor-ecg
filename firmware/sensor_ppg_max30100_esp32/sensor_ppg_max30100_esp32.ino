/* ============================================================
 * SENSOR DE PULSO ÓPTICO (PPG, infrarrojo) — MAX30100 + ESP32
 * Monitor ECG web (Programación Web) — mismo protocolo que el AD8232:
 *     t_ms,ecg_raw,leads_off,bpm      a 115200 baudios
 *
 * NO necesita librerías externas: habla directo con el chip por I2C (Wire).
 *
 * CONEXIONES (el ESP32 trabaja a 3.3 V):
 *   MAX30100 VIN -> ESP32 3V3
 *   MAX30100 GND -> ESP32 GND
 *   MAX30100 SDA -> ESP32 GPIO21 (D21)   + resistencia 2.2k-4.7k a 3V3
 *   MAX30100 SCL -> ESP32 GPIO22 (D22)   + resistencia 2.2k-4.7k a 3V3
 *   (INT, IRD, RD -> sin conectar)
 *   Las resistencias a 3V3 son necesarias en módulos cuyas pull-up van a 1.8 V.
 *
 * NOTAS:
 *  - Es una señal PPG (pulso), NO un ECG: la onda tiene forma de pulso, no de QRS.
 *  - ecg_raw se envía centrada en 2048 dentro de 0-4095 (perfil "ESP32" de la web).
 *  - leads_off = 1 cuando no hay dedo sobre el sensor.
 *  - El LED rojo queda encendido tenue como indicador visible; la señal usa el IR.
 * ============================================================ */
#include <Wire.h>

const uint8_t  DIR_SENSOR = 0x57;
const int      PIN_SDA = 21;
const int      PIN_SCL = 22;

// Registros del MAX30100
const uint8_t REG_FIFO_WR  = 0x02;
const uint8_t REG_FIFO_OVF = 0x03;
const uint8_t REG_FIFO_RD  = 0x04;
const uint8_t REG_FIFO_DAT = 0x05;
const uint8_t REG_MODE     = 0x06;
const uint8_t REG_SPO2     = 0x07;
const uint8_t REG_LED      = 0x09;
const uint8_t REG_PART_ID  = 0xFF;

// Dedo: el IR sin dedo es muy bajo; con dedo sube. Ajusta si hace falta (mira el valor "ir" con DEPURAR).
const uint16_t UMBRAL_DEDO = 8000;
const bool DEPURAR = false;       // true: imprime "# ir=..." cada 50 muestras

// Estado del procesamiento
float dc = 0;
float filtrado = 0;
float maximo = 0;
float anterior = 0;
float amplitud = 100;
unsigned long ultimoLatido = 0;
float bpmActual = 0;
const unsigned long REFRACTARIO_MS = 300;   // máx. 200 lpm
unsigned long contador = 0;
unsigned long dedoDesde = 0;               // instante en que se detectó el dedo
const unsigned long CALENTAMIENTO_MS = 2500; // se ignora la caída inicial al apoyar el dedo
bool habiaDedo = false;

void escribirReg(uint8_t reg, uint8_t valor) {
  Wire.beginTransmission(DIR_SENSOR);
  Wire.write(reg);
  Wire.write(valor);
  Wire.endTransmission();
}

int leerReg(uint8_t reg) {
  Wire.beginTransmission(DIR_SENSOR);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return -1;
  if (Wire.requestFrom((int)DIR_SENSOR, 1) != 1) return -1;
  return Wire.read();
}

bool leerMuestra(uint16_t &ir, uint16_t &rojo) {
  Wire.beginTransmission(DIR_SENSOR);
  Wire.write(REG_FIFO_DAT);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((int)DIR_SENSOR, 4) != 4) return false;
  uint8_t a = Wire.read();
  uint8_t b = Wire.read();
  uint8_t c = Wire.read();
  uint8_t d = Wire.read();
  ir = ((uint16_t)a << 8) | b;      // en el MAX30100 el IR va primero
  rojo = ((uint16_t)c << 8) | d;
  return true;
}

bool iniciarSensor() {
  int id = leerReg(REG_PART_ID);
  if (id != 0x11) {
    Serial.print(F("# ERROR: Part ID inesperado: "));
    Serial.println(id, HEX);
    return false;
  }
  escribirReg(REG_MODE, 0x40);          // reset
  delay(50);
  escribirReg(REG_FIFO_WR, 0);
  escribirReg(REG_FIFO_OVF, 0);
  escribirReg(REG_FIFO_RD, 0);
  escribirReg(REG_MODE, 0x03);          // modo SpO2: enciende LED rojo e infrarrojo
  escribirReg(REG_SPO2, 0x47);          // alta resolución, 100 muestras/s, pulso 1600 us (16 bits)
  escribirReg(REG_LED, 0x28);           // rojo ~7.6 mA (tenue, indicador), IR ~27 mA
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println(F("# PPG MAX30100 v1 listo"));
  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(100000);
  while (!iniciarSensor()) {
    Serial.println(F("# ERROR: MAX30100 no responde. Revisa VIN/GND/SDA/SCL y las pull-up a 3V3."));
    delay(1000);
  }
  Serial.println(F("t_ms,ecg_raw,leads_off,bpm"));
}

void procesar(uint16_t ir) {
  bool sinDedo = ir < UMBRAL_DEDO;
  int valor = 2048;

  if (sinDedo) {
    bpmActual = 0;
    dc = ir;
    filtrado = 0;
    maximo = 0;
    amplitud = 100;
    anterior = 0;
    ultimoLatido = 0;
    habiaDedo = false;
  } else if (!habiaDedo || (millis() - dedoDesde) < CALENTAMIENTO_MS) {
    if (!habiaDedo) { habiaDedo = true; dedoDesde = millis(); }
    dc = ir;                                   // la línea base sigue a la señal mientras se estabiliza
    filtrado = 0;
    maximo = 0;
    anterior = 0;
  } else {
    if (dc == 0) dc = ir;
    dc += 0.02f * (ir - dc);                       // línea base lenta
    float x = dc - ir;                             // con más sangre el IR baja: se invierte
    filtrado += 0.3f * (x - filtrado);             // suavizado

    if (fabs(filtrado) > amplitud) amplitud = fabs(filtrado);
    else amplitud *= 0.998f;
    if (amplitud < 30) amplitud = 30;

    if (filtrado > maximo) maximo = filtrado;
    else maximo *= 0.995f;
    float umbral = 0.5f * maximo;

    unsigned long ahora = millis();
    if (filtrado > umbral && anterior <= umbral && maximo > 25 &&
        (ahora - ultimoLatido) > REFRACTARIO_MS) {
      if (ultimoLatido > 0) {
        float bpm = 60000.0f / (ahora - ultimoLatido);
        if (bpm >= 30 && bpm <= 220) {             // filtro de sanidad fisiológica
          bpmActual = (bpmActual == 0) ? bpm : (0.7f * bpmActual + 0.3f * bpm);
        }
      }
      ultimoLatido = ahora;
    }
    anterior = filtrado;

    float v = 2048.0f + filtrado * (1800.0f / amplitud);
    valor = (int)constrain(v, 0, 4095);
  }

  Serial.print(millis());
  Serial.print(',');
  Serial.print(valor);
  Serial.print(',');
  Serial.print(sinDedo ? 1 : 0);
  Serial.print(',');
  Serial.println(bpmActual, 1);

  if (DEPURAR && (++contador % 50 == 0)) {
    Serial.print(F("# ir="));
    Serial.println(ir);
  }
}

void loop() {
  int wr = leerReg(REG_FIFO_WR);
  int rd = leerReg(REG_FIFO_RD);
  if (wr < 0 || rd < 0) { delay(10); return; }
  int n = (wr - rd) & 0x0F;
  for (int i = 0; i < n; i++) {
    uint16_t ir, rojo;
    if (!leerMuestra(ir, rojo)) break;
    procesar(ir);
  }
  delay(5);
}
