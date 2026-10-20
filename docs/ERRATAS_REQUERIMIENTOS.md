# Erratas y aclaraciones de requerimientos (RF04, RF23 y esquema del circuito)

> **Versión:** 1.0 · **Fecha:** 2026-10-20 · **Clasificación:** Interno
> Los archivos originales de la raíz (`Requerimientos funcionales.md`, `esquema_circuito.svg`, `sensor_ecg_ad8232.ino`) **no se modifican**; este documento los aclara.

## 1. Qué mide realmente el prototipo

| Fuente | Tecnología | Señal | Archivo / módulo |
|---|---|---|---|
| Sensor del prototipo (ESP32) | **Óptica, fotopletismografía (PPG)** con MAX30100 por I2C | Intensidad de luz infrarroja reflejada, pulsátil | `sensor_ppg_max30100_esp32/` (formato serie `t_ms,ecg_raw,leads_off,bpm`, 115200 baudios) |
| Cámara del celular | **PPG por cámara** (dedo sobre lente y flash) | Promedio de color de una zona central | `monitor-ecg-vue/src/` (asistente de cámara) |
| Firmware original | Biopotencial (ECG) con AD8232 y electrodos | Señal eléctrica del corazón | `sensor_ecg_ad8232.ino` (conservado como alternativa) |
| Simulador / reproducción CSV | Sintética | ECG de referencia | `SimulatorSource.js`, `ReplaySource.js` |

El nombre interno `ecg_raw` y el título «Monitor ECG» se conservan por compatibilidad del formato; **con MAX30100 o cámara la señal es PPG, no ECG**.

## 2. PPG no es ECG

| | ECG (AD8232) | PPG (MAX30100 / cámara) |
|---|---|---|
| Qué mide | Actividad **eléctrica** del corazón (despolarización) | Cambios de **volumen sanguíneo** por absorción/reflexión de luz |
| Contacto | Electrodos (RA, LA, RL) | Dedo sobre un LED y un fotodetector |
| Forma de onda | Complejo P-QRS-T | Pulso suave (onda sistólica y muesca dicrótica) |
| Frecuencia cardíaca | Intervalo R-R | Intervalo pico a pico del pulso (retardo respecto al ECG) |
| Sensibilidad | Poco al movimiento; detecta arritmias eléctricas | Muy sensible al movimiento, presión y luz ambiente |
| Uso en el proyecto | Referencia sintética y firmware original | Medición real del prototipo y de la cámara |

Consecuencias: la detección de picos R solo aplica al ECG; con PPG se detectan picos de pulso. Ninguna fuente de este prototipo es un dispositivo médico ni sirve para diagnóstico.

## 3. Redacción corregida propuesta

**RF04. Recepción de datos.** El sistema deberá recibir las muestras de la señal de pulso desde (a) un sensor óptico PPG MAX30100 conectado a un ESP32 por puerto serie (Web Serial), (b) la cámara del dispositivo móvil y (c) un simulador o un archivo CSV, mostrando siempre la fuente y el tipo de señal (PPG o ECG).

**RF23. Información sobre el sensor.** El sistema deberá proporcionar información introductoria sobre el funcionamiento del sensor óptico infrarrojo (fotopletismografía, MAX30100) y de la cámara como PPG, así como la diferencia entre PPG y ECG y las limitaciones de ambas técnicas. La información sobre el módulo AD8232 (ECG) se mantiene como contenido complementario.

**RNF08 (compatibilidad).** El sistema deberá ser compatible con ESP32 (MAX30100) y, de forma opcional, con Arduino UNO/Nano (AD8232).

**Esquema del circuito.** El documento debe mostrar el circuito real del prototipo: ESP32 + MAX30100 por I2C (VIN, GND, SDA, SCL con pull-up a 3V3, y la línea de interrupción si se usa) y USB al computador. `esquema_circuito.svg` de la raíz describe un sensor de lactato (LMP91000 + BLE) ajeno al proyecto, y `docs/esquema_circuito_ad8232.svg` corresponde al ECG original; **falta** un esquema MAX30100 + ESP32 (pendiente de dibujar y verificar contra el cableado real).

## 4. Nota sobre el contenido educativo

El contenido de «Aprende» sobre el sensor está redactado para el AD8232 (`src/data/learn/sensorAd8232.js`). La redacción original de RF23 («sensor infrarrojo») era correcta para el MAX30100; lo que quedó desfasado fue la interpretación previa de la trazabilidad. Pendiente: añadir una ficha de PPG (MAX30100 y cámara) al contenido educativo.
