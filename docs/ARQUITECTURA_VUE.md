# Arquitectura del Monitor ECG en Vue 3

> Documento de arquitectura para reescribir el monitor ECG actual (HTML + JS puro) como SPA en **Vue 3 + Vite + Vue Router + Pinia**, cumpliendo los 27 RF y 9 RNF de `Requerimientos funcionales.md`.
> Proyecto destino: `software/monitor-ecg-vue/`. Los archivos originales (`index.html`, `app.js`, `style.css`, `sensor_ecg_ad8232.ino`, `esquema_circuito.svg`) **no se modifican**.
> Los controles de seguridad (ISO 27001) los define otro documento; aquí solo se fijan los **puntos de enganche** (almacenamiento cifrado, auditoría, guard de administración).

**Decisiones de base:** Composition API con `<script setup>`, JavaScript (sin TypeScript), uPlot como dependencia npm, solo frontend, persistencia local (IndexedDB + localStorage), despliegue en Vercel.

---

## 1. Diagnóstico del sistema actual

### 1.1 Inventario

| Archivo | Contenido | Observación |
|---|---|---|
| `sensor_ecg_ad8232.ino` | Arduino UNO/Nano + AD8232, muestreo a 250 Hz por espera activa, detección de leads-off (D10/D11), detección de pico R con umbral adaptativo + refractario de 300 ms, BPM con media exponencial, salida CSV `t_ms,ecg_raw,leads_off,bpm` a 115200 baudios. | Firmware razonable. Es la **única fuente real de datos** del proyecto. |
| `index.html` | Una página: botones conectar/desconectar, aviso de seguridad eléctrica, alerta leads-off, tarjetas BPM/estado, contenedor del gráfico. | Carga uPlot desde `unpkg.com` sin versión fija ni SRI. |
| `app.js` | Web Serial API, parser de líneas, ventana de 1000 puntos (4 s), uPlot. | Monocanal, sin usuarios, sin persistencia (detalle en 1.3). |
| `style.css` | Tema oscuro, tarjetas, alertas. | Sin media queries; gráfico de alto fijo 400 px. |
| `ANALISIS_PROYECTO.md` | Análisis preliminar con 6 RF propios. | **Queda superado** por `Requerimientos funcionales.md`. |
| `esquema_circuito.svg` | Diagrama de bloques de un **sensor de lactato** (electrodo enzimático → LMP91000 → ESP32 → BLE). | **No corresponde al ECG** (ver sección 2). |

### 1.2 Cumplimiento de requerimientos por el sistema actual

Leyenda: ✔ cumple · ◐ parcial · ✘ no cumple.

| Req. | Estado | Justificación |
|---|---|---|
| RF01 Identificación de usuario | ✘ | No existe el concepto de usuario. |
| RF02 Ingreso sin contraseña | ✘ | No hay ingreso. |
| RF03 Información opcional | ✘ | — |
| RF04 Recepción de datos | ◐ | Recibe por Web Serial desde **Arduino UNO**, no desde ESP32. Sin validación de los datos. |
| RF05 Señal en tiempo real | ◐ | Funciona para 1 canal; los problemas de rendimiento de 1.3 la degradan. |
| RF06 Valor de frecuencia | ◐ | Muestra el BPM del firmware; nunca vuelve a `--` (con leads-off o al desconectar muestra un valor viejo). |
| RF07 Hasta 5 sensores | ✘ | Variables globales para un único puerto y una única serie. |
| RF08 Iniciar medición | ◐ | "Conectar" equivale a medir; no existe el concepto de sesión ni la selección de usuarios. |
| RF09 Fin por desconexión | ✘ | Si se desenchufa el USB, `reader.read()` lanza una excepción que solo va a la consola; la UI sigue en "Conectado" y el puerto queda en estado inconsistente. |
| RF10 Estado de conexión | ◐ | Solo "Conectado/Desconectado"; no distingue entre medición activa, señal perdida y finalizada. |
| RF11–RF14 Comparación | ✘ | No hay señal de referencia. |
| RF15–RF17, RF20 Rangos/alertas | ✘ | Solo existe la alerta de leads-off (no es un rango). |
| RF18–RF19 Actividad | ✘ | — |
| RF21–RF24 Educativo | ✘ | Solo el aviso de seguridad eléctrica (útil, se conserva). |
| RF25–RF27 Administración | ✘ | — |
| RNF01 Responsividad | ◐ | Layout flex sin media queries; alto fijo; ancho calculado una vez por evento `resize`, sin *debounce*. |
| RNF02 Multiplataforma | ◐ | Web Serial solo existe en Chrome/Edge/Opera de escritorio; en iOS, Safari y Firefox la app queda inutilizable y no ofrece alternativa. |
| RNF03 Tiempo real | ◐ | La latencia es baja, pero el coste es O(n) por muestra (ver 1.3). |
| RNF04 Usabilidad | ◐ | Clara para 1 canal; errores invisibles (solo en la consola). |
| RNF05 Disponibilidad | ◐ | Depende de unpkg en tiempo de ejecución; sin CDN no hay gráfico. |
| RNF06 Seguridad | ✘ | No hay datos de usuario ni perfiles; CDN sin SRI. |
| RNF07 Escalabilidad | ✘ | Código acoplado a un único puerto/gráfico. |
| RNF08 Compatibilidad ESP32 | ✘ | Rango Y fijo `[0,1024]` (ADC de 10 bits); un ESP32 (12 bits, 0–4095) se saldría de escala. Sin BLE. |
| RNF09 Despliegue | ◐ | Es estático, así que se puede desplegar, pero no hay configuración. |

### 1.3 Bugs y problemas técnicos concretos de `app.js`

1. **`push()` + `shift()` sobre `Array` por cada muestra.** `shift()` es O(n) (n = 1000), dos veces por muestra a 250 Hz: unos 500 000 movimientos de elementos por segundo y canal. Con 5 canales escala mal. Solución: buffer circular con `Float32Array`.
2. **`uplot.setData()` en cada *chunk* del lector.** La frecuencia de los *chunks* la decide el driver USB (puede haber decenas por segundo y con tamaño irregular), no la pantalla. Se redibuja más veces de las que el monitor puede mostrar o de forma entrecortada. Solución: desacoplar la recepción del render con `requestAnimationFrame`.
3. **Actualizaciones del DOM por muestra.** `bpmValue.textContent` y `leadsOffBox.classList` se tocan hasta 250 veces por segundo. Deben actualizarse con un *throttle* de unos 4 Hz y solo cuando el valor cambia.
4. **Sin manejo de desconexión física (RF09).** No se escucha `navigator.serial.addEventListener('disconnect')` ni se trata la excepción de `reader.read()`: el `catch` solo hace `console.error`, `keepReading` sigue en `true`, los botones quedan invertidos y no se llama a `port.close()`.
5. **`inputStream` (promesa de `pipeTo`) nunca se espera al cerrar.** `disconnect()` hace `reader.cancel()` y luego `port.close()`, pero `port.readable` sigue bloqueado por `pipeTo` hasta que la promesa se resuelve. `port.close()` puede rechazar con *"The port is locked"* (o *"readable stream is locked"*). El orden correcto es: `reader.cancel()` → `await inputStream.catch(() => {})` → `await port.close()`.
6. **Condición de carrera en `disconnect()`.** `reader.releaseLock()` corre en el `finally` de `readSerial()` de forma concurrente con `port.close()`. `reader` y `port` tampoco se anulan, así que un segundo clic opera sobre objetos cerrados.
7. **`isFirstData`/`startTime` no se reinician al reconectar.** Abrir el puerto resetea el Arduino UNO (línea DTR), por lo que `millis()` vuelve a 0. El tiempo relativo pasa a ser negativo y el eje X deja de ser monótono, algo que uPlot no admite.
8. **Ventana inicial rellena con ceros.** `timeData` empieza con 1000 ceros: X no monótono al inicio y la línea arranca desde 0.
9. **NaN sin validar.** Al abrir el puerto a mitad de una línea, la primera línea suele llegar truncada (`"3,51,0,72.0"` también tiene 4 campos) y `parseInt`/`parseFloat` pueden devolver `NaN` o valores incorrectos. Faltan la validación de rangos (`0 ≤ ecg_raw ≤ 2^bits−1`, `leads_off ∈ {0,1}`, `0 ≤ bpm ≤ 250`), la comprobación de que `t_ms` sea monótono y el descarte de la primera línea tras abrir. Además, `parseInt` se usa sin radix.
10. **Leads-off forzado a 512.** Sustituir la muestra por 512 **falsea el dato** (se exportaría o compararía como si fuera real) y, además, 512 no es la línea base real: el AD8232 alimentado a 3,3 V tiene la salida centrada en ~1,65 V, que con el ADC del UNO referido a 5 V da ≈ 338 cuentas. Lo correcto es guardar el valor crudo y la marca `leads_off`, y en el gráfico mostrar un hueco o una banda sombreada.
11. **Escala Y contradictoria.** `{ auto: true, range: [0, 1024] }`: el `range` fijo anula `auto`, y la señal real solo ocupa ~0–675. La escala debería depender del perfil del dispositivo o ser automática con margen.
12. **uPlot por CDN sin versión ni SRI** (`https://unpkg.com/uplot/...`). Es un riesgo de cadena de suministro, puede romperse con un cambio mayor y no funciona sin conexión (RNF05/RNF06).
13. **Errores invisibles para el usuario.** Cancelar el diálogo de `requestPort()` se registra como error y otros fallos no se muestran. Solo se usa `alert()` para la falta de soporte.
14. **`bufferSize` por defecto (255 bytes) en `port.open`.** Con 250 líneas/s (~4,7 KB/s) y el hilo principal ocupado (GC, pestaña en segundo plano), el buffer puede desbordarse y perder datos. Conviene abrir con `bufferSize` ≥ 4096.
15. **BPM obsoleto.** `if (bpm > 0)` mantiene el último valor indefinidamente; con leads-off o al desconectar debe mostrar `--`.
16. **Redimensionado frágil.** `clientWidth - 40` y `resize` sin *debounce*; no responde a cambios del contenedor (paneles plegables). Usar `ResizeObserver`.
17. **Sin separación de responsabilidades.** Transporte, parseo, estado y vista están en el mismo archivo, sin pruebas posibles.

---

## 2. Inconsistencias hardware/documentación y cómo las resuelve el software

| # | Inconsistencia | Impacto | Decisión de software |
|---|---|---|---|
| I1 | `esquema_circuito.svg` describe un **sensor de lactato** (LMP91000 + ESP32 + BLE), no el ECG. | El esquema no documenta el hardware real del monitor. | No se usa en la app ni en la vista educativa del ECG. Se recomienda al equipo producir un esquema del AD8232 (conexiones de la cabecera del `.ino`). La abstracción de fuentes (abajo) deja abierto un canal futuro de lactato (`signalType: 'lactate'`) sin rediseñar (RNF07). |
| I2 | Los RF04/RNF08 hablan de **ESP32**, pero el firmware es **Arduino UNO/Nano**. | Cambia el ADC (10 bits / 5 V frente a 12 bits / 3,3 V), el transporte (USB serie frente a BLE/Wi-Fi) y la escala. | **Perfiles de dispositivo** en `src/data/deviceProfiles.js` (`arduino-uno-ad8232`, `esp32-ad8232`, `simulador`) con `adcBits`, `vref`, `fs`, `baudRate`, `yRange` y `protocolo`. El parser y el gráfico leen el perfil y no usan constantes. |
| I3 | RF23 dice **"sensor infrarrojo"** (fotopletismografía, PPG, p. ej. MAX30102), pero el sensor es **AD8232** (ECG biopotencial con electrodos). | Contenido educativo incorrecto si se sigue el RF al pie de la letra. | La vista educativa describe el **AD8232 real** e incluye una nota visible: "Los requerimientos mencionan un sensor infrarrojo (PPG); este prototipo usa ECG por electrodos". También explica brevemente la diferencia ECG/PPG. Se recomienda corregir la redacción de RF23. |
| I4 | El `.ino` recomienda **HC-05/HC-06** (Bluetooth Clásico, SPP) por seguridad eléctrica; el SVG usa **BLE**. | Web Bluetooth **no** soporta Bluetooth Clásico/SPP. | Un HC-05 emparejado con el PC aparece como puerto COM virtual y **se usa con `SerialSource`** (Web Serial también puede listar puertos RFCOMM en Chrome reciente). BLE (ESP32, GATT *notify*) se reserva para `BleSource`, como extensión futura. |
| I5 | Web Serial no existe en móviles iOS ni en Safari/Firefox, mientras que RNF01/RNF02 exigen teléfonos y tablets. | En el móvil no se puede conectar el sensor por cable. | Detección de capacidades (`useCapabilities`): en navegadores sin Web Serial se ocultan las fuentes no disponibles y se ofrecen el **Simulador**, la **Reproducción** de sesiones/CSV guardados, la comparación y la vista educativa. Toda la app es usable en el móvil; la captura por cable requiere un navegador Chromium de escritorio. |
| I6 | Aviso de seguridad eléctrica del `.ino` (no conectar al PC enchufado a la red con electrodos puestos). | Riesgo físico real. | Se conserva y se refuerza: aviso obligatorio (confirmación por sesión) antes de iniciar una medición con `SerialSource`. |
| I7 | El RF07 pide 5 sensores, pero solo hay 1 Arduino. | No se puede demostrar ni probar el multicanal. | `SimulatorSource` genera hasta 5 ECG sintéticos independientes (BPM, ruido y artefactos configurables), y se pueden mezclar canales reales y simulados. |
| I8 | Umbral inicial del firmware (550) por encima de la línea base real (~338) con AD8232 a 3,3 V y AREF a 5 V. | El BPM del firmware puede tardar en estabilizarse. | La app **recalcula el BPM** en el cliente (`rPeakDetector`) y muestra ambos valores ("BPM dispositivo" y "BPM calculado"). Así el BPM existe también para fuentes que no lo envían (simulador, BLE). |

### 2.1 Capa de fuentes de datos (abstracción clave)

Todas las fuentes implementan la misma interfaz (`src/services/sources/DataSource.js`), basada en eventos, sin Vue y sin reactividad:

```
DataSource
  id, kind ('serial'|'simulator'|'replay'|'ble'), profile (perfil de dispositivo)
  async connect(options)        // pide permisos (requestPort / requestDevice) si aplica
  async start() / async stop()
  async disconnect()            // cierre ordenado e idempotente
  on('samples', fn(batch))      // batch = { t: Float64Array, v: Float32Array, leadsOff: Uint8Array, bpmDevice: Float32Array, n }
  on('status', fn(state))       // 'idle'|'connecting'|'streaming'|'signal-lost'|'disconnected'|'error'
  on('error', fn(err))
  static isSupported()
```

| Fuente | Uso | Notas |
|---|---|---|
| `SerialSource` | Arduino UNO/Nano (USB o HC-05 como COM), ESP32 por USB. | Web Serial, `bufferSize` 8192, parser en flujo, *watchdog* de inactividad y evento `disconnect` del puerto (RF09). |
| `SimulatorSource` | Demo, pruebas sin hardware, multicanal (hasta 5), móvil. | Usa el modelo PQRST de `src/data/` con un temporizador (lotes cada ~40 ms con marca de tiempo exacta a 250 Hz). Parámetros: BPM, variabilidad, ruido, deriva de línea base, interferencia de 50 Hz, episodios de leads-off y "desconexión" simulada para probar RF09. |
| `ReplaySource` | Reproduce sesiones guardadas o un CSV `t_ms,ecg_raw,leads_off,bpm`. | Útil para clase y para comparar sin hardware. |
| `BleSource` (*stub*) | ESP32 con BLE (GATT *notify*). | **Extensión futura**: solo existen la clase con `isSupported()` y un TODO de UUIDs/formato. Web Bluetooth funciona en Chrome Android y escritorio, no en iOS. |

---

## 3. Árbol de carpetas propuesto (`monitor-ecg-vue/`)

```
monitor-ecg-vue/
├── index.html                      # Punto de entrada de Vite (solo #app y metadatos)
├── package.json                    # vue, vue-router, pinia, uplot; dev: vite, @vitejs/plugin-vue, vitest
├── vite.config.js                  # Alias '@' → src, build, configuración de Vitest
├── vercel.json                     # Reescritura SPA → /index.html; cabeceras (las completa el doc. ISO)
├── .gitignore
├── README.md                       # Instalación, scripts, navegadores compatibles
├── public/
│   ├── favicon.svg
│   └── referencias/
│       └── ejemplo_referencia.csv  # CSV de ejemplo con formato de señal de referencia
├── tests/                          # Vitest (unitarias de utils/servicios)
│   ├── ringBuffer.spec.js
│   ├── ecgCsvParser.spec.js
│   ├── rPeakDetector.spec.js
│   ├── crossCorrelation.spec.js
│   └── rangeEvaluator.spec.js
└── src/
    ├── main.js                     # createApp, Pinia, Router, montaje, carga de estilos
    ├── App.vue                     # Layout raíz: AppHeader, RouterView, ToastHost, SafetyBanner
    ├── router/
    │   ├── index.js                # Rutas (lazy), títulos, scrollBehavior
    │   └── guards.js               # requireUser, requireAdmin (enganche de seguridad), aviso de salida con sesión activa
    ├── views/
    │   ├── HomeView.vue            # Inicio: qué hace la app, accesos rápidos, compatibilidad del navegador
    │   ├── UserSelectView.vue      # RF01–RF03: elegir/crear identificador, datos opcionales con consentimiento
    │   ├── MonitorView.vue         # RF04–RF10, RF16–RF20: configurar canales, iniciar/detener, ver en vivo
    │   ├── CompareView.vue         # RF11–RF14: señal experimental frente a referencia, sincronización, métricas
    │   ├── SessionsView.vue        # Historial de sesiones (filtro por usuario/actividad), exportar CSV
    │   ├── SessionDetailView.vue   # Revisión de una sesión: señal, actividad, eventos de alerta, reproducción
    │   ├── LearnView.vue           # RF21–RF24: contenedor con pestañas/subrutas educativas
    │   ├── AdminLoginView.vue      # RF25: acceso de administrador (mecanismo definido por el doc. ISO)
    │   ├── AdminView.vue           # RF26–RF27: rangos, método de sincronización, usuarios, auditoría
    │   └── NotFoundView.vue
    ├── components/
    │   ├── layout/
    │   │   ├── AppHeader.vue       # Navegación responsiva, usuario activo, indicador de admin
    │   │   ├── AppNav.vue          # Menú (hamburguesa en el móvil)
    │   │   ├── SafetyBanner.vue    # Aviso de seguridad eléctrica (I6)
    │   │   └── ToastHost.vue       # Notificaciones in-app (alertas, errores)
    │   ├── monitor/
    │   │   ├── ChannelGrid.vue     # Rejilla responsiva de 1–5 ChannelPanel
    │   │   ├── ChannelPanel.vue    # Un canal: cabecera (usuario, fuente), gráfico, métricas, estado
    │   │   ├── ChannelConfigDialog.vue # Asignar fuente (serie/simulador/reproducción) + usuario + perfil
    │   │   ├── EcgChart.vue        # Envoltorio de uPlot (instancia markRaw, ResizeObserver, registro en el scheduler)
    │   │   ├── BpmDisplay.vue      # BPM dispositivo/calculado, "--" si no es válido
    │   │   ├── ConnectionStatus.vue# RF10: chip de estado (activa, señal perdida, finalizada, error)
    │   │   ├── LeadsOffAlert.vue   # Electrodos desconectados
    │   │   ├── RangeIndicator.vue  # RF17: dentro/bajo/sobre rango con color + texto + icono
    │   │   ├── ActivitySelector.vue# RF18: reposo / movimiento / ejercicio / recuperación
    │   │   └── SessionControls.vue # RF08/RF09: iniciar, pausar, detener, marcar evento
    │   ├── compare/
    │   │   ├── ReferencePicker.vue # RF11: dataset interno o carga de CSV
    │   │   ├── CompareChart.vue    # RF13: dos series superpuestas o apiladas
    │   │   ├── SyncControls.vue    # RF14: método, desplazamiento manual (deslizador ms), "auto-alinear"
    │   │   └── CompareMetrics.vue  # RF12: correlación, RMSE, ΔBPM, desfase aplicado
    │   ├── learn/
    │   │   ├── LearnCard.vue       # Tarjeta de contenido con fuente/bibliografía
    │   │   └── EcgAnatomyFigure.vue# Figura PQRST anotada (SVG generado con el dataset de referencia)
    │   ├── admin/
    │   │   ├── RangeSettingsForm.vue  # RF15/RF26: mín./máx. global y por actividad
    │   │   ├── SyncSettingsForm.vue   # RF27: método de sincronización por defecto y parámetros
    │   │   ├── UserAdminTable.vue     # Listado/borrado lógico de identificadores
    │   │   └── AuditLogTable.vue      # Consulta del log de auditoría (enganche)
    │   └── common/
    │       ├── BaseButton.vue, BaseDialog.vue, BaseSelect.vue, BaseField.vue
    │       ├── CapabilityNotice.vue   # "Tu navegador no soporta Web Serial: usa simulador/reproducción"
    │       └── EmptyState.vue
    ├── stores/                     # Pinia (setup stores); solo estado PEQUEÑO y reactivo
    │   ├── users.js                # Usuarios/identificadores, usuario activo, perfil opcional (RF01–RF03)
    │   ├── channels.js             # Hasta N canales: fuente, usuario, perfil, estado, BPM, leadsOff (escalares)
    │   ├── session.js              # Sesión de medición en curso: estado, participantes, actividad, grabación
    │   ├── sessionsHistory.js      # Índice de sesiones guardadas (metadatos; las muestras van en IndexedDB)
    │   ├── settings.js             # Parámetros (rangos), método de sync, preferencias de UI; editable solo por admin
    │   ├── alerts.js               # Alertas activas/historial, reglas de histéresis, silenciado
    │   ├── reference.js            # Señal de referencia cargada + configuración de comparación
    │   └── auth.js                 # Rol actual (usuario/admin); delega en el servicio de seguridad
    ├── services/
    │   ├── sources/
    │   │   ├── DataSource.js       # Clase base + emisor de eventos + máquina de estados
    │   │   ├── SerialSource.js     # Web Serial: open/read/close ordenado, disconnect, watchdog
    │   │   ├── SimulatorSource.js  # Generador ECG sintético multicanal
    │   │   ├── ReplaySource.js     # Reproduce sesión/CSV a velocidad real o acelerada
    │   │   ├── BleSource.js        # Stub para ESP32 BLE (extensión futura)
    │   │   └── sourceFactory.js    # Crea la fuente según tipo + perfil
    │   ├── parsing/
    │   │   └── ecgCsvParser.js     # Parser en flujo (TransformStream/clase): líneas → lotes tipados validados
    │   ├── acquisition/
    │   │   ├── channelRegistry.js  # Registro NO reactivo: canalId → { source, ringBuffer, detector, recorder }
    │   │   ├── renderScheduler.js  # Bucle único de requestAnimationFrame para todos los gráficos
    │   │   └── sessionRecorder.js  # Acumula bloques Int16 y los persiste por lotes (cada ~2 s)
    │   ├── storage/
    │   │   ├── db.js               # Apertura de IndexedDB, versiones y migraciones de esquema
    │   │   ├── secureStorage.js    # ENGANCHE ISO: interfaz put/get/delete cifrada (implementación del doc. ISO)
    │   │   ├── userRepository.js   # CRUD de usuarios vía secureStorage
    │   │   ├── sessionRepository.js# Sesiones + bloques de muestras
    │   │   └── settingsRepository.js
    │   ├── audit/
    │   │   └── auditService.js     # ENGANCHE ISO: log(evento) append-only; consultas para la vista admin
    │   ├── security/
    │   │   └── adminAuth.js        # ENGANCHE ISO: verificar credencial admin, expiración de la sesión admin
    │   ├── export/
    │   │   ├── csvExporter.js      # Sesión → CSV (mismo formato del Arduino + columnas de usuario/actividad)
    │   │   └── csvImporter.js      # CSV → señal (referencia o reproducción), con validación
    │   └── notifications/
    │       └── notifier.js         # Toast + sonido (Web Audio) + Notification API opcional
    ├── composables/
    │   ├── useCapabilities.js      # Soporte de Web Serial/Web Bluetooth, contexto seguro, móvil
    │   ├── useEcgChart.js          # Crear/destruir uPlot, ResizeObserver, tema
    │   ├── useChannel.js           # Une un canal del store con el registro no reactivo
    │   ├── useRangeEvaluation.js   # RF16/RF17 para un valor + actividad
    │   ├── useSignalSync.js        # RF14: aplica el método de sincronización elegido
    │   ├── useSessionTimer.js      # Duración de la sesión
    │   └── useConfirmLeave.js      # Evita perder una sesión activa al navegar/cerrar
    ├── utils/
    │   ├── RingBuffer.js           # Buffer circular Float32Array/Float64Array, lectura linealizada sin asignaciones
    │   ├── dsp/
    │   │   ├── filters.js          # Paso alto (línea base), notch 50 Hz, media móvil (para visualizar y comparar)
    │   │   ├── rPeakDetector.js    # Detector tipo Pan-Tompkins simplificado, incremental
    │   │   ├── bpm.js              # BPM desde intervalos RR, validación fisiológica 30–220
    │   │   ├── normalize.js        # z-score / min-max para comparar señales de distinta escala
    │   │   ├── resample.js         # Remuestreo lineal a fs común
    │   │   ├── crossCorrelation.js # Correlación cruzada normalizada con retardo acotado
    │   │   └── metrics.js          # Pearson, RMSE, NRMSE, ΔBPM
    │   ├── rangeEvaluator.js       # Comparación con mín./máx. + histéresis + duración mínima
    │   ├── time.js                 # Formateo de duraciones/fechas
    │   └── ids.js                  # Generación de IDs (crypto.randomUUID)
    ├── data/
    │   ├── deviceProfiles.js       # Perfiles: arduino-uno-ad8232, esp32-ad8232, simulador
    │   ├── referenceEcg.js         # Generador/dataset PQRST sintético normalizado a 250 Hz (con metadatos)
    │   ├── activities.js           # Catálogo de actividades y rangos sugeridos por defecto
    │   ├── defaultSettings.js      # Rangos por defecto, método de sync por defecto, umbrales de alerta
    │   └── learn/
    │       ├── heartRate.js        # RF22: FC y fisiología
    │       ├── variationFactors.js # RF21: factores de variación
    │       ├── sensorAd8232.js     # RF23: AD8232 real + nota sobre el "infrarrojo"
    │       └── engineering.js      # RF24: ingeniería de medición y señales
    └── assets/
        ├── styles/
        │   ├── tokens.css          # Variables de color (tema clínico oscuro/claro), espaciado, tipografía
        │   ├── base.css            # Reset, tipografía, foco visible
        │   └── uplot-theme.css     # Ajustes de uPlot (se importa también 'uplot/dist/uPlot.min.css')
        └── img/
```

Notas:
- **Rutas** (todas *lazy*): `/`, `/usuarios`, `/monitor`, `/comparar`, `/sesiones`, `/sesiones/:id`, `/aprende/:tema?`, `/admin/acceso`, `/admin` (meta `requiresAdmin`), `/:pathMatch(.*)*`.
- **`vercel.json`**: `rewrites: [{ source: "/(.*)", destination: "/index.html" }]` para el historial HTML5. Las cabeceras de seguridad (CSP, `Permissions-Policy: serial=(self), bluetooth=(self)`, etc.) las fija el documento ISO. Vercel sirve por HTTPS, que es requisito de Web Serial y Web Bluetooth (contexto seguro).

---

## 4. Mapeo de requerimientos a la implementación

### 4.1 Requerimientos funcionales

| RF | Implementación | Detalle de diseño |
|---|---|---|
| **RF01** Identificación | `UserSelectView`, `stores/users.js`, `userRepository` | Lista de identificadores ("Usuario 1"…"Usuario N", o alias libre). Se sugiere automáticamente el siguiente número libre. |
| **RF02** Sin contraseña | `UserSelectView`, `guards.requireUser` | Elegir/crear identificador = sesión de usuario. Sin credenciales para el rol usuario. El admin es un rol aparte (RF25). |
| **RF03** Info opcional | `UserSelectView` (sección plegable), `users.js` | Edad, peso, nivel de actividad física: todo opcional, con casilla de **consentimiento informado** obligatoria para guardarlos. Minimización: sin nombre real. Persistencia vía `secureStorage` (enganche ISO). |
| **RF04** Recepción | `services/sources/*`, `ecgCsvParser`, `deviceProfiles` | Fuente por canal. El parser valida la estructura, los rangos y la monotonía de `t_ms`; descarta la primera línea tras abrir; cuenta líneas descartadas (indicador de calidad). |
| **RF05** Señal en vivo | `EcgChart`, `renderScheduler`, `RingBuffer` | Ventana desplazable de 5–10 s (configurable). Leads-off como hueco/banda sombreada, nunca como valor inventado. Filtro de visualización opcional (paso alto + notch 50 Hz) sin alterar el dato guardado. |
| **RF06** Frecuencia | `BpmDisplay`, `rPeakDetector`, `channels.js` | BPM del dispositivo (si existe) y BPM calculado en el cliente; `--` si hay leads-off, señal perdida o ausencia de picos durante más de 3 s. |
| **RF07** Hasta 5 | `ChannelGrid`, `ChannelPanel`, `ChannelConfigDialog`, `channels.js`, `channelRegistry` | `MAX_CHANNELS = 5` en configuración (RNF07: subirlo es cambiar una constante y validar el rendimiento). **Cada canal tiene su propia fuente** (puerto serie, simulador, reproducción o BLE futuro), **su perfil y su usuario**. Un usuario no puede estar en dos canales a la vez. Rejilla: 1 columna en el móvil, 2 en la tablet, 2–3 en el escritorio; modo "foco" para ampliar un canal. |
| **RF08** Iniciar | `SessionControls`, `session.js` | "Iniciar sesión" crea una `SesionMedicion` con los participantes (canal + usuario + actividad inicial) de todos los canales configurados. Se puede iniciar con uno o varios. La grabación comienza en ese momento (la vista previa en vivo puede existir antes sin grabar). |
| **RF09** Fin por desconexión | `SerialSource` (evento `disconnect`, error del lector, *watchdog*), `session.js` | *Watchdog*: sin muestras válidas durante más de 2 s → `signal-lost`; si persiste más de 10 s (configurable) o el puerto emite `disconnect`, el **canal finaliza** automáticamente, se cierra de forma ordenada, se guarda lo grabado y se registra el motivo (`fin: 'desconexion'`). Si todos los canales finalizan, la sesión pasa a `finalizada`. Los leads-off **no** finalizan (se marcan como pausa de señal). |
| **RF10** Estado | `ConnectionStatus`, `channels.js` | Estados visibles con color + texto + icono: *Sin conectar*, *Conectando*, *Midiendo*, *Electrodos desconectados*, *Señal perdida*, *Finalizada*, *Error*. Estado global de la sesión en la cabecera. |
| **RF11** Señal validada | `ReferencePicker`, `stores/reference.js`, `data/referenceEcg.js`, `csvImporter` | (a) **Dataset interno**: ECG sintético PQRST normalizado a 250 Hz (suma de gaussianas por onda P, Q, R, S, T, modelo tipo McSharry/ECGSYN) con BPM configurable. Se rotula claramente como "referencia sintética, didáctica". (b) **Carga de CSV** (`t_ms,valor` o el formato del Arduino) para usar un registro realmente validado (p. ej. un tramo de PhysioNet o de un equipo clínico), con metadatos de origen y fs. Se remuestrea a la fs de comparación. |
| **RF12** Comparar | `CompareView`, `CompareMetrics`, `utils/dsp/metrics.js` | Ambas señales: filtro → normalización z-score → remuestreo → alineación → métricas: correlación de Pearson, RMSE normalizado, BPM de cada una y ΔBPM, desfase aplicado. Fuente experimental: una sesión guardada, un tramo congelado de un canal en vivo o un CSV. |
| **RF13** Ver simultáneo | `CompareChart` | Una instancia uPlot con dos series (superpuestas) y un modo "apilado" (dos ejes Y). Cursor sincronizado y zoom en X. |
| **RF14** Sincronizar | `SyncControls`, `useSignalSync`, `crossCorrelation.js`, `rPeakDetector.js` | Tres métodos: **`r-peak`** (detecta picos R en ambas señales y alinea el primer R o minimiza la distancia media entre R emparejados), **`xcorr`** (correlación cruzada normalizada con un retardo máximo de ±1 s, elige el máximo) y **`manual`** (deslizador de desplazamiento en ms, ajuste fino ±1 muestra). Se puede pulsar "auto" y luego corregir a mano. El método por defecto lo fija el admin (RF27); el usuario lo puede cambiar en la vista si el admin lo permite (`allowUserOverride`). |
| **RF15** Configurar parámetros | `RangeSettingsForm`, `settings.js` | Mín./máx. de BPM **global** y, opcionalmente, **por actividad** (reposo, movimiento, ejercicio). Validación: `30 ≤ mín < máx ≤ 220`. |
| **RF16** Comparar con parámetros | `rangeEvaluator.js`, `useRangeEvaluation` | Evalúa el BPM calculado (o el del dispositivo, configurable) contra el rango de la actividad actual del canal. Solo con un BPM válido (sin leads-off ni señal perdida). |
| **RF17** Indicar estado | `RangeIndicator` | `dentro` / `bajo` / `sobre`, con color **y** texto (no solo color, por accesibilidad). |
| **RF18** Actividad | `ActivitySelector`, `data/activities.js` | Reposo / Movimiento / Ejercicio / Recuperación, seleccionable por canal antes y **durante** la sesión. |
| **RF19** Asociar contexto | `session.js`, `sessionRepository` | La actividad se guarda como **línea de tiempo** (`{t, actividad}`) en cada participante; los segmentos se muestran como bandas en `SessionDetailView` y se exportan como columna en el CSV. |
| **RF20** Alerta fuera de rango | `stores/alerts.js`, `notifier.js`, `ToastHost` | Se dispara si está fuera de rango durante ≥ 5 s seguidos (histéresis de ±2 BPM para la vuelta). Toast + resaltado del canal + sonido opcional; se puede silenciar. Cada alerta queda como evento en la sesión y en la auditoría. Incluye el enlace "¿Por qué puede pasar?" a RF21. |
| **RF21** Causas de variación | `LearnView` → `variationFactors.js` | Ejercicio, postura, estrés/ansiedad, cafeína, temperatura, deshidratación, fármacos, fiebre, sueño; además, **artefactos técnicos** (movimiento, electrodos mal adheridos, interferencia de 50 Hz) que imitan cambios de FC. |
| **RF22** FC y fisiología | `heartRate.js`, `EcgAnatomyFigure` | Sistema de conducción (nodo SA/AV, His-Purkinje), ondas P-QRS-T, intervalo RR → BPM, rangos típicos por edad/actividad, variabilidad. Aviso: "contenido educativo, no diagnóstico". |
| **RF23** Sensor | `sensorAd8232.js` | Describe el **AD8232** real: front-end de biopotencial, amplificador de instrumentación, filtros paso alto/bajo (~0,5–40 Hz), *right-leg drive*, detección de leads-off, 3 electrodos (RA, LA, RL), una derivación; conexión al Arduino (A0, D10, D11) y muestreo a 250 Hz justificado por Nyquist (tomado del `.ino`). **Recuadro de discrepancia**: los requerimientos mencionan un "sensor infrarrojo" (PPG); se explica qué es la PPG y en qué se diferencia del ECG, y se indica que este prototipo usa ECG. |
| **RF24** Ingeniería | `engineering.js` | Cadena de medición (transductor → acondicionamiento → ADC → transmisión → procesamiento → visualización), muestreo y Nyquist, resolución del ADC (10 frente a 12 bits), filtrado, detección de picos (Pan-Tompkins), seguridad eléctrica y aislamiento, validación frente a una referencia (enlaza con RF11–RF14). |
| **RF25** Perfil admin | `AdminLoginView`, `stores/auth.js`, `security/adminAuth.js`, `guards.requireAdmin` | Rol `admin` separado del flujo sin contraseña. El mecanismo de credencial, el bloqueo y la expiración los define el documento ISO; aquí solo se fija la interfaz `adminAuth.verify()`, `isAdminActive()`, `logout()`. |
| **RF26** Admin parámetros | `AdminView` → `RangeSettingsForm` | Escritura en `settings.js` solo si `auth.isAdmin`; cada cambio genera un evento de auditoría (valor anterior → nuevo). |
| **RF27** Admin sincronización | `AdminView` → `SyncSettingsForm` | Método por defecto (`r-peak`/`xcorr`/`manual`), retardo máximo de xcorr, permiso de cambio para usuarios. Auditado. |

### 4.2 Requerimientos no funcionales

| RNF | Estrategia |
|---|---|
| **RNF01** Responsividad | CSS *mobile-first* con *breakpoints* 600/960/1280 px; `ChannelGrid` con CSS Grid `auto-fit`; `EcgChart` con `ResizeObserver` (alto proporcional al ancho, mínimo 160 px); navegación con hamburguesa; objetivos táctiles ≥ 44 px. |
| **RNF02** Multiplataforma | `useCapabilities` + `CapabilityNotice`: degradación elegante (simulador, reproducción, comparación y educación funcionan en cualquier navegador moderno). Matriz documentada en el README: captura por cable en Chrome/Edge de escritorio; BLE futuro en Chrome de escritorio/Android; el resto en todos. |
| **RNF03** Tiempo real | Sección 6: parser en flujo + buffer circular + rAF. Latencia objetivo de extremo a extremo < 100 ms (transporte + ≤ 1 cuadro). Indicador opcional de fps y muestras/s por canal (modo depuración). |
| **RNF04** Usabilidad | Tema clínico (oscuro por defecto, claro opcional), estados con color + icono + texto, mensajes de error accionables ("Conecta el Arduino y elige el puerto COM…"), flujo guiado: usuario → canales → iniciar. |
| **RNF05** Disponibilidad | Todo empaquetado (uPlot por npm, sin CDN en tiempo de ejecución); CDN de Vercel; la captura no depende de la red una vez cargada la app; los datos se guardan de forma incremental (no se pierden al cerrar la pestaña). Opcional: `vite-plugin-pwa` para funcionar sin conexión (fase 8). |
| **RNF06** Seguridad | **Solo enganches** (detalle en el documento ISO): `secureStorage` (cifrado en reposo de usuarios/sesiones), `auditService` (registro de eventos), `adminAuth` + `guards.requireAdmin` (rutas `/admin`) + comprobación del rol en las acciones de `settings.js` (doble barrera: ruta y store). Sin dependencias por CDN. |
| **RNF07** Escalabilidad | `MAX_CHANNELS` configurable; fuentes intercambiables (`DataSource`); perfiles de dispositivo; `signalType` por canal (ECG hoy, lactato u otros mañana); registro de canales independiente de Vue. |
| **RNF08** Compatibilidad | Perfiles `arduino-uno-ad8232` (10 bits, AREF 5 V, 115200, 250 Hz) y `esp32-ad8232` (12 bits, 3,3 V); parser tolerante a CRLF/LF y basado en la cabecera (`t_ms,ecg_raw,leads_off,bpm`) cuando existe; `BleSource` como punto de extensión para el ESP32. Se recomienda que el firmware del ESP32 emita el mismo CSV por USB para reutilizar `SerialSource` sin cambios. |
| **RNF09** Despliegue | `vite build` → `dist/`; `vercel.json` con *rewrite* SPA; *framework preset* Vite; variables `VITE_*` solo para configuración no secreta (en un frontend no existen secretos). |

---

## 5. Modelo de datos

Persistencia: **IndexedDB** (base `monitor-ecg`, versionada en `db.js`) para usuarios, sesiones, bloques de muestras, referencias y auditoría; **localStorage** solo para preferencias de UI no sensibles (tema, último canal enfocado). Todo acceso a datos de usuario/sesión pasa por `secureStorage` (enganche ISO).

### 5.1 Usuario (`users`)
```
{
  id: 'uuid',
  etiqueta: 'Usuario 3',            // RF01, único entre los activos
  perfil: {                         // RF03, todo opcional
    edad: 24 | null, pesoKg: 68 | null,
    nivelActividad: 'sedentario'|'moderado'|'alto'|null
  },
  consentimiento: { otorgado: true, fecha: ISO, version: 'v1' } | null,
  creadoEn: ISO, actualizadoEn: ISO, eliminado: false   // borrado lógico
}
```

### 5.2 Sesión de medición (`sessions`)
```
{
  id: 'uuid',
  estado: 'preparada'|'activa'|'finalizada'|'abortada',
  inicio: ISO, fin: ISO | null,
  motivoFin: 'usuario'|'desconexion'|'senal-perdida'|'error' | null,   // RF09
  participantes: [{
    canalIndex: 0..4,
    usuarioId: 'uuid',
    fuente: { tipo: 'serial'|'simulator'|'replay'|'ble', perfilId: 'arduino-uno-ad8232', info: { usbVendorId, usbProductId } },
    fs: 250,
    actividad: [{ tMs: 0, valor: 'reposo' }, { tMs: 120000, valor: 'ejercicio' }],   // RF18–RF19
    eventos: [{ tMs, tipo: 'leads-off'|'leads-on'|'senal-perdida'|'alerta-alta'|'alerta-baja'|'marca', datos }],
    resumen: { muestras, descartadas, bpmMedio, bpmMin, bpmMax, pctFueraRango, duracionMs },
    estadoFinal: 'finalizado'|'desconectado'
  }],
  parametrosAplicados: { /* copia de Parametros vigente al iniciar: trazabilidad */ },
  notas: ''
}
```

### 5.3 Muestras (`sampleChunks`)
Las muestras **no** se guardan una por una (250 Hz × 5 canales × 10 min = 750 000 filas). Se guardan en **bloques**:
```
{
  id: [sesionId, canalIndex, seq],          // clave compuesta
  sesionId, canalIndex, seq,
  t0Ms: 123456,                              // t_ms del dispositivo de la primera muestra
  tRel0Ms: 8000,                             // relativo al inicio de la sesión
  n: 500,                                    // ~2 s a 250 Hz
  ecgRaw: Int16Array(n),                     // valor crudo del ADC (cabe en 16 bits para 10 y 12 bits)
  dtMs: Uint16Array(n) | null,               // deltas de tiempo si no son uniformes (null = fs nominal)
  leadsOff: Uint8Array(n),                   // o mapa de bits
  bpmDevice: Float32Array(n) | null
}
```
Equivalencia lógica de una **Muestra**: `{ tMs, ecgRaw, leadsOff, bpmDevice }`, la misma tupla que emite el Arduino. El CSV exportado reconstruye las filas: `t_ms,ecg_raw,leads_off,bpm,usuario,actividad`.

### 5.4 Parámetros (`settings`, clave `parametros`)
```
{
  version: 3,
  bpm: {
    global: { min: 50, max: 100 },
    porActividad: { reposo: {min:50,max:100}, movimiento: {min:60,max:130}, ejercicio: {min:90,max:180}, recuperacion: {min:60,max:140} },
    usarPorActividad: true,
    fuenteBpm: 'calculado'|'dispositivo'
  },
  alertas: { duracionMinMs: 5000, histeresisBpm: 2, sonido: true, notificacionesSO: false },
  adquisicion: { watchdogMs: 2000, finTrasPerdidaMs: 10000, ventanaVisualSeg: 8, maxCanales: 5 },
  actualizadoPor: 'admin', actualizadoEn: ISO
}
```

### 5.5 Configuración de sincronización (`settings`, clave `sincronizacion`)
```
{
  metodoPorDefecto: 'r-peak'|'xcorr'|'manual',     // RF27
  permitirCambioUsuario: true,
  xcorr: { maxLagMs: 1000, preFiltro: true },
  rPeak: { estrategia: 'primer-pico'|'media-rr' },
  normalizacion: 'zscore'|'minmax',
  fsComparacion: 250,
  actualizadoPor, actualizadoEn
}
```
Resultado de una comparación (efímero o guardable con la sesión): `{ referenciaId, sesionId, canalIndex, tramo: {desdeMs, hastaMs}, metodo, desfaseMs, correlacion, nrmse, bpmExp, bpmRef }`.

### 5.6 Señal de referencia (`references`)
```
{ id, nombre, origen: 'sintetica-interna'|'csv-usuario', descripcion, fs, unidades: 'normalizada'|'mV'|'adc',
  valores: Float32Array, bpmNominal, cargadoEn, validadaPor: 'texto libre: fuente/certificación' }
```

### 5.7 Evento de auditoría (`audit`, solo inserción) — enganche ISO
```
{ id, ts: ISO, actor: { rol: 'usuario'|'admin'|'sistema', usuarioId|null },
  accion: 'parametros.actualizar'|'sync.actualizar'|'usuario.crear'|'usuario.eliminar'|'sesion.iniciar'|'sesion.finalizar'
          |'sesion.exportar'|'admin.login'|'admin.login-fallido'|'admin.logout'|'alerta.disparada'|'dispositivo.desconectado',
  objetivo: { tipo, id }, detalle: { antes, despues, motivo }, integridad: /* campo reservado: hash encadenado, lo define el doc. ISO */ null }
```

---

## 6. Estrategia de rendimiento (250 Hz × 5 canales)

Carga: 1250 muestras/s y ~24 KB/s de texto en total. Es poco para la CPU **si** se evita trabajar por muestra con el DOM, Vue o asignaciones de memoria.

### 6.1 Pipeline

```
Puerto / simulador ──► Parser en flujo ──► RingBuffer (Float32Array) ──► renderScheduler (rAF) ──► uPlot.setData
                            │                    │                         (30–60 fps, 1 bucle global)
                            │                    ├──► rPeakDetector (incremental) ──► BPM ─┐
                            │                    └──► sessionRecorder (bloques 2 s) ──► IndexedDB
                            └── calidad (descartadas)                                      ▼
                                                              Pinia (escalares a ~4 Hz): bpm, estado, leadsOff, rango
```

### 6.2 Reglas

1. **Parser en flujo, sin asignaciones por línea.** `TextDecoderStream` → separador de líneas que conserva el resto incompleto → parseo manual de 4 campos (sin `split`/regex por línea; o `split` como mucho, medido) → escritura directa en arrays tipados de lote preasignados. Validación por campo; las líneas inválidas se cuentan y se descartan. La primera línea tras `open()` se descarta siempre (puede venir cortada) y la cabecera `t_ms,...` se usa para mapear columnas.
2. **Buffers circulares tipados.** `RingBuffer` por canal: `Float64Array` (tiempo) + `Float32Array` (valor) + `Uint8Array` (leads-off), con capacidad `fs × ventanaVisualSeg` (8 s → 2000) más margen. Escribir es O(1) y nunca se usa `shift()`.
3. **Render desacoplado.** Un único `requestAnimationFrame` (`renderScheduler`) recorre los canales marcados como "sucios" y, por cada uno, **linealiza** el anillo en arrays de visualización **preasignados** (copia de ≤ 2000 valores, unos microsegundos) y llama a `uplot.setData(datos, false)` + `uplot.setScale('x', {min, max})`. Tope configurable de 30 fps en el móvil / batería baja y 60 fps en el escritorio. Con la pestaña oculta, rAF se pausa solo, pero **la recepción y la grabación siguen** porque no dependen de rAF.
4. **Nada grande en la reactividad de Vue.** Las instancias de uPlot, `DataSource`, `RingBuffer` y los lotes viven en `channelRegistry` (módulo JS, fuera de Pinia) y, si algún componente las referencia, se envuelven en `markRaw()` / `shallowRef()`. Pinia solo guarda escalares (`bpm`, `estado`, `leadsOff`, `estadoRango`, `muestrasPorSeg`), actualizados con *throttle* a ~4 Hz y solo si cambian.
5. **Huecos por leads-off.** Para que uPlot dibuje huecos hace falta `null` en la serie. En la fase 2 se verificará si uPlot trata `NaN` en arrays tipados como hueco; si no, el array de visualización (no el de almacenamiento) será un `Array` preasignado donde se escribe `null`. Alternativa: banda sombreada con un *plugin* `hooks.drawClear`.
6. **Una instancia uPlot por canal** (escalas Y independientes por usuario/perfil), sin animaciones, `cursor` desactivado durante la medición en vivo (se activa en la revisión), `points.show: false` y ancho de línea de 1,5 px.
7. **Grabación por lotes.** `sessionRecorder` acumula ~500 muestras por canal en `Int16Array` y hace una sola transacción de IndexedDB cada ~2 s (o al finalizar). Las escrituras son asíncronas y no bloquean el render. Si `secureStorage` cifra (Web Crypto), lo hace por bloque, no por muestra.
8. **Tamaño del buffer del puerto.** `port.open({ baudRate: 115200, bufferSize: 8192 })` para absorber pausas del hilo principal (GC, cambio de pestaña).
9. **DSP incremental.** Detector de picos R y filtros IIR por muestra, de coste O(1) (unas decenas de operaciones). La correlación cruzada de RF14 se ejecuta bajo demanda (no en vivo), acotada a ±1 s de retardo y a tramos de ≤ 30 s; si al medir supera ~50 ms, se mueve a un Web Worker.
10. **Presupuesto y medición.** Objetivo con 5 canales en un portátil medio: < 20 % de CPU del hilo principal, ningún *long task* > 50 ms, latencia < 100 ms. Se verificará con el panel *Performance* de Chrome y con un modo de estrés del simulador (5 canales a 500 Hz).
11. **Cierre ordenado del puerto** (corrige los bugs 4–6): `keepReading = false` → `reader.cancel()` → `await readableClosed.catch(()=>{})` → `reader.releaseLock()` → `await port.close()`, en un `try/finally` idempotente. También se registra `navigator.serial.addEventListener('disconnect', e => e.target === port && finalizar('desconexion'))`.

---

## 7. Plan de implementación por fases

Cada fase termina con algo demostrable y con pruebas de las utilidades nuevas. Los enganches de seguridad se crean con una implementación mínima (passthrough) desde la fase 0 para que el agente ISO los complete sin cambiar las llamadas.

| Fase | Objetivo | Entregables | RF/RNF |
|---|---|---|---|
| **0. Andamiaje** | Proyecto base desplegable. | `npm create vite` (plantilla Vue, JS), Vue Router, Pinia, uPlot npm, Vitest; `vercel.json`; layout (`App.vue`, `AppHeader`, `SafetyBanner`, `ToastHost`); tokens CSS *mobile-first*; vistas vacías con rutas *lazy*; `useCapabilities`; enganches `secureStorage`, `auditService`, `adminAuth` y `guards.requireAdmin` (implementación mínima). Primer despliegue en Vercel. | RNF01, RNF02, RNF09 |
| **1. Núcleo de adquisición** | Datos fiables sin UI. | `RingBuffer`, `ecgCsvParser` (con validación), `DataSource`, `SimulatorSource` + `referenceEcg.js` (generador PQRST), `SerialSource` con cierre ordenado, *watchdog* y `disconnect`; `deviceProfiles`; `channelRegistry`. Pruebas unitarias: anillo, parser (líneas truncadas, NaN, CRLF, cabecera, reinicio de `t_ms`), simulador. | RF04, RF09, RNF08 |
| **2. Monitor de un canal** | Paridad mejorada con el `app.js` actual. | `renderScheduler`, `EcgChart` + `useEcgChart`, `ChannelPanel`, `BpmDisplay` (dispositivo + `rPeakDetector`), `ConnectionStatus`, `LeadsOffAlert`, `SessionControls` (conectar/desconectar). Decidir el manejo de huecos (6.2-5). Medición de rendimiento. | RF05, RF06, RF09, RF10, RNF03 |
| **3. Usuarios, sesiones y persistencia** | Medir "para alguien" y guardar. | `UserSelectView` + `users.js` (RF01–RF03 con consentimiento), `db.js`, repositorios sobre `secureStorage`, `session.js`, `sessionRecorder`, `ActivitySelector` + línea de tiempo, `SessionsView`, `SessionDetailView`, `ReplaySource`, `csvExporter`/`csvImporter`. Eventos de auditoría de sesión. | RF01–RF03, RF08, RF18, RF19 |
| **4. Multicanal** | Hasta 5 canales simultáneos. | `ChannelGrid`, `ChannelConfigDialog` (fuente + usuario + perfil por canal), varios `SerialSource` y simuladores mezclados, modo foco, prueba de estrés de 5 canales, ajuste de fps. | RF07, RF08, RNF07, RNF03 |
| **5. Parámetros, alertas y admin** | Evaluación de rangos y perfil administrador. | `defaultSettings`, `settings.js` con comprobación de rol, `rangeEvaluator` (histéresis + duración) con pruebas, `RangeIndicator`, `alerts.js` + `notifier`, `AdminLoginView`, `AdminView` (`RangeSettingsForm`, `UserAdminTable`, `AuditLogTable`). Integración con la implementación real de `adminAuth` del documento ISO. | RF15–RF17, RF20, RF25, RF26, RNF06 |
| **6. Comparación con referencia** | Validación frente a una señal de referencia. | `reference.js`, `ReferencePicker` (interna + CSV), `utils/dsp` (`filters`, `normalize`, `resample`, `crossCorrelation`, `metrics`) con pruebas sobre señales sintéticas de desfase conocido, `CompareChart`, `SyncControls` (`r-peak`/`xcorr`/`manual`), `CompareMetrics`, `SyncSettingsForm` en admin. | RF11–RF14, RF27 |
| **7. Contenido educativo** | Vista "Aprende". | `LearnView` con 4 temas en `data/learn/*`, `EcgAnatomyFigure` generada desde `referenceEcg`, recuadro de discrepancia AD8232/"infrarrojo", bibliografía (datasheet de Analog Devices, guía SparkFun, Tompkins 1993, Pan & Tompkins 1985), avisos "no es un dispositivo médico". Enlaces desde las alertas (RF20 → RF21). | RF21–RF24, RNF04 |
| **8. Endurecimiento y entrega** | Calidad final. | Revisión responsiva en móvil, tablet y escritorio; accesibilidad (contraste, foco, `aria-live` para alertas); PWA opcional sin conexión; manejo de errores con mensajes accionables; revisión con el checklist ISO; **prueba con el hardware real** (Arduino + AD8232 alimentado por batería / HC-05); README con la matriz de navegadores; despliegue final en Vercel. | RNF01–RNF09 |
| **Futuro** | Extensiones. | `BleSource` para ESP32 (definir el servicio GATT y el formato binario), canal de lactato (`signalType`), más de 5 canales, cálculo de HRV. | RNF07, RNF08 |

### 7.1 Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Sin hardware disponible durante el desarrollo o la evaluación. | `SimulatorSource` y `ReplaySource` son ciudadanos de primera clase; demo completa sin Arduino. |
| Web Serial no está en los móviles. | Degradación elegante (I5); BLE como extensión. |
| Confusión con el sensor "infrarrojo" y el esquema de lactato. | Se documenta en la app y en este documento; se recomienda al equipo corregir RF23 y el esquema. |
| La referencia sintética no es una "señal validada" en sentido estricto. | Rotulada como didáctica; la carga de CSV permite usar un registro validado real con sus metadatos de origen. |
| Datos personales (RF03) en el navegador. | Opcionales, con consentimiento, minimizados y cifrados vía `secureStorage` (documento ISO). |
| Reset del Arduino al abrir el puerto (`t_ms` vuelve a 0). | El parser detecta un salto negativo de `t_ms` y reinicia la base de tiempo del canal, registrando el evento. |
