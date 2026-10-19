/* ============================================================
 * PRUEBA DE CONEXIÓN I2C — ESP32 + sensor MAX30100/MAX30102
 * No usa librerías externas. Sirve para saber si el ESP32 "ve" el sensor.
 *
 * Qué hace: cada 3 segundos busca dispositivos I2C en dos configuraciones:
 *   A) SDA=GPIO21, SCL=GPIO22   (la conexión que debe tener tu montaje)
 *   B) SDA=GPIO22, SCL=GPIO21   (por si SDA y SCL quedaron cruzados)
 * Si encuentra el sensor (dirección 0x57), lee su "Part ID" para saber si es
 * un MAX30102 (0x15) o un MAX30100 (0x11).
 *
 * Abre el Monitor Serie a 115200 baudios.
 * ============================================================ */
#include <Wire.h>

const uint8_t DIR_SENSOR = 0x57;

bool hayDispositivo(uint8_t dir) {
  Wire.beginTransmission(dir);
  return Wire.endTransmission() == 0;
}

int leerRegistro(uint8_t dir, uint8_t reg) {
  Wire.beginTransmission(dir);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return -1;
  if (Wire.requestFrom((int)dir, 1) != 1) return -1;
  return Wire.read();
}

void escanear(int sda, int scl, const char* nombre) {
  Wire.end();
  Wire.begin(sda, scl);
  Wire.setClock(100000);
  delay(50);

  Serial.print(nombre);
  Serial.print(" (SDA=GPIO");
  Serial.print(sda);
  Serial.print(", SCL=GPIO");
  Serial.print(scl);
  Serial.println("):");

  int encontrados = 0;
  for (uint8_t dir = 1; dir < 127; dir++) {
    if (hayDispositivo(dir)) {
      Serial.print("   -> responde la direccion 0x");
      Serial.println(dir, HEX);
      encontrados++;
      if (dir == DIR_SENSOR) {
        int id = leerRegistro(DIR_SENSOR, 0xFF);
        Serial.print("      Part ID leido: 0x");
        Serial.print(id, HEX);
        if (id == 0x15) Serial.println("  => es un MAX30102/MAX30105 (compatible con el programa)");
        else if (id == 0x11) Serial.println("  => es un MAX30100 (necesita otra libreria)");
        else Serial.println("  => ID desconocido");
      }
    }
  }
  if (encontrados == 0) Serial.println("   (no responde nada)");
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println();
  Serial.println("# PRUEBA I2C lista");
}

void loop() {
  Serial.println("---- escaneo ----");
  escanear(21, 22, "Configuracion A");
  escanear(22, 21, "Configuracion B (cruzada)");
  Serial.println();
  delay(3000);
}
