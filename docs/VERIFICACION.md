# Verificación independiente — monitor-ecg-vue

Fecha: 2026-10-05. Verificación hecha directamente sobre el código, sin tomar como base los informes previos ni CAMBIOS.md.

## 1. Resultados de los comandos

| Comando | Resultado |
|---|---|
| `npm run build` | OK (exit 0), vite build en ~3,5 s; chunks por vista, uPlot 52 kB, index 152 kB |
| `npm test` | OK: 7 archivos, **84/84 tests** pasan (ringBuffer 5, ecgCsvParser 27, rangeEvaluator 7, csvExport 13, rPeakDetector 8, crossCorrelation 10, security 14) |
| `npm run lint` | OK (exit 0, sin advertencias) |
| `npx vite preview --port 4179` | `GET /` → 200 text/html, `<title>Monitor ECG`; `GET /monitor` → 200 (fallback SPA). Servidor detenido después (la conexión posterior falla, como se esperaba) |

Tras la corrección del punto 5, volví a ejecutar build, test y lint: los tres siguen pasando.

## 2. Requisitos funcionales y no funcionales

| Req. | Evidencia | Estado |
|---|---|---|
| RF01 Identificación | src/stores/users.js:70, src/services/storage/userRepository.js:4, src/router/guards.js:22 | Cumple |
| RF02 Inicio sin contraseña | src/stores/users.js:93, guards.js:22 (elegir el participante, sin PIN) | Cumple |
| RF03 Datos opcionales | src/components/users/OptionalDataForm.vue:8 | Cumple |
| RF04 Recepción de datos | src/services/sources/SerialSource.js (115200 baudios, parser de flujo), src/services/parsing/ecgCsvParser.js | Cumple |
| RF05 Señal en tiempo real | src/components/monitor/EcgChart.vue:8, src/services/acquisition/renderScheduler.js | Cumple |
| RF06 Valor de frecuencia | src/components/monitor/BpmDisplay.vue:2 | Cumple |
| RF07 Múltiples mediciones | ChannelGrid.vue:6, defaultSettings.js:3 (MAX_CHANNELS=5) | Cumple |
| RF08 Inicio de medición | SessionControls.vue:9, stores/session.js:33 | Cumple |
| RF09 Fin de medición | SessionControls.vue:9, SerialSource.js:12 (fin manual o por desconexión) | Cumple |
| RF10 Estado de conexión | ConnectionStatus.vue:5, stores/channels.js:36 | Cumple |
| RF11 Señal validada | CompareView.vue:18, csvImporter.js:5, data/referenceEcg.js:3 | Parcial: la referencia incluida es **sintética** (lo declara su cabecera), no un registro clínico validado |
| RF12 Comparación | services/compare/compareSignals.js:9, CompareMetrics.vue:2 | Cumple |
| RF13 Visualización comparativa | SignalChart.vue:6, CompareView.vue:284 | Cumple |
| RF14 Sincronización | SyncControls.vue:4, rPeakDetector.js:113, crossCorrelation | Cumple |
| RF15 Configuración de parámetros | RangeSettingsForm.vue:8, stores/settings.js:35 | Cumple |
| RF16 Comparación con parámetros | stores/settings.js:51, channels.js:270 | Cumple |
| RF17 Estado de la medición | RangeIndicator.vue:4, utils/rangeEvaluator.js:2 | Cumple |
| RF18 Actividad | ActivitySelector.vue:4, data/activities.js:2 | Cumple |
| RF19 Contexto de medición | stores/session.js:91, SessionDetailView.vue:13 | Cumple |
| RF20 Alerta fuera de rango | stores/alerts.js:8, channels.js:270 | Cumple |
| RF21 Posibles causas | data/learn/variationFactors.js, LearnView.vue:12 | Cumple |
| RF22 Información sobre FC | data/learn/heartRate.js:4 | Cumple (completado: ver punto 5) |
| RF23 Información sobre el sensor | data/learn/sensorAd8232.js | Parcial: el requisito habla de un sensor *infrarrojo*, pero el prototipo usa el AD8232 (ECG). La app explica la diferencia y recomienda cambiar la redacción del requisito |
| RF24 Información de ingeniería | data/learn/engineering.js | Cumple |
| RF25 Perfil de administrador | security/adminAuth.js:8, AdminLoginView.vue:10 | Cumple |
| RF26 Gestión de parámetros | RangeSettingsForm.vue:49, settings.js:65 (assertAdmin) | Cumple |
| RF27 Configuración de sincronización | SyncSettingsForm.vue:7, settings.js:75 | Cumple |
| RNF01 Responsividad | assets/styles/base.css, tokens.css:28 | Cumple (no probado en dispositivos reales) |
| RNF02 Multiplataforma | composables/useCapabilities.js:3 | Parcial: Web Serial solo funciona en Chrome/Edge de escritorio; en el resto hay simulador y reproducción |
| RNF03 Tiempo real | renderScheduler.js:2 (un único rAF), RingBuffer | Cumple |
| RNF04 Usabilidad | tokens.css, vistas | Cumple (evaluación cualitativa) |
| RNF05 Disponibilidad | Sitio estático y datos locales; no hay service worker ni PWA | Parcial |
| RNF06 Seguridad | Ver punto 3 | Cumple |
| RNF07 Escalabilidad | defaultSettings.js:3 (constante MAX_CHANNELS) | Cumple |
| RNF08 Compatibilidad con ESP32 | deviceProfiles.js (perfil ESP32 por USB serie); BleSource.js:4 es solo un esqueleto (`connect()` lanza un error) | Parcial |
| RNF09 Despliegue en Vercel | vercel.json, vite.config.js | Cumple |

**Totales:** RF: 25 Cumple, 2 Parcial, 0 No cumple. RNF: 6 Cumple, 3 Parcial, 0 No cumple.

## 3. Controles de seguridad

| Control | Evidencia | Estado |
|---|---|---|
| PIN con PBKDF2-SHA256, 600 000 iteraciones, sal de 16 B | security/pinHash.js:7,44-48 | OK |
| Comparación en tiempo constante | pinHash.js:51-58 | OK |
| Política de PIN (8 caracteres o más, sin triviales ni secuencias) | pinHash.js:15-35 | OK |
| Bloqueo tras 5 fallos, 5 min con backoff hasta 60 min | security/lockout.js:5-30 | OK |
| Expiración de sesión: 10 min de inactividad y 60 min como máximo absoluto | lockout.js:8-9,41-50; stores/auth.js:62-67 | OK |
| Guard de rutas admin con redirect por lista blanca | router/guards.js:4-20 | OK |
| assertAdmin en los stores | stores/admin.js:19-65, settings.js:65,75,85, auth.js:115, SessionsView.vue:72 | OK |
| AES-GCM 256, IV aleatorio de 12 B, clave no extraíble, AAD con el nombre de la clave | storage/secureStorage.js:27,49-54 | OK |
| Cadena de hashes de auditoría (SHA-256, JSON canónico, génesis, saneado de PII) | audit/auditLog.js | OK |
| Parser CSV estricto | parsing/ecgCsvParser.js (27 tests) | OK |
| Escapado de inyección de fórmulas en CSV (`= + - @ \t \r`) | export/csvExporter.js:21 | OK |
| Sin v-html, innerHTML, eval ni new Function | grep: la única coincidencia es un comentario en LearnCard.vue:2 | OK |
| Sin CDN ni URL externas en src/index.html | grep `https?://`: 0 coincidencias | OK |
| CSP `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'` | vercel.json | OK |
| HSTS (2 años, preload), Permissions-Policy `serial=(self)` y bluetooth desactivado, XFO DENY, nosniff, COOP y CORP | vercel.json | OK |
| Sin source maps ni `console` en dist | vite.config.js:22-24; dist: 0 `.map`, 0 archivos con `console.` | OK |
| Sin secretos ni datos personales reales | grep de claves, tokens, correos y RUT: nada; el CSV de ejemplo es sintético | OK |

## 4. Exactitud del contenido

- FC en reposo de 60-100 BPM y de 40-60 en personas entrenadas; fórmula 220 − edad presentada como imprecisa; BPM = 60000/RR. Todo correcto.
- AD8232: amplificador de instrumentación, paso alto ~0,5 Hz y paso bajo ~40 Hz, LO+/LO− en D10/D11 (coincide con el .ino:38-39). La línea base de unas 338 cuentas (1,65 V con AREF de 5 V en un ADC de 10 bits) es correcta.
- Nyquist: señal de ~40 Hz, mínimo de 80 Hz; se eligen 250 Hz (4 ms). Coincide con el .ino:54-55.
- Coherencia con el .ino: 115200 baudios (:76), refractario de 300 ms (:63), umbral del 60 % (:65), filtro de 30-220 BPM (:137) y formato CSV `t_ms,ecg_raw,leads_off,bpm`. Coincide.
- Las referencias del Anexo A citadas en el código se migraron a ISO/IEC 27001:2013 (UNE-EN ISO/IEC 27001:2017): 5.16 → A.9.2.1 (registro y baja de usuario), 8.3 → A.9.4.1 (restricción del acceso a la información), 8.9 → A.12.1.2/A.14.2.5, 8.5 → A.9.4.2, 8.15 → A.12.4.1. Equivalencia completa en ISO27001_controles.md §9.
- **Corregido:** faltaba la definición explícita de bradicardia (<60 BPM) y taquicardia (>100 BPM) en reposo. Se añadió en src/data/learn/heartRate.js:36.
- Observación: el rango por defecto en reposo es de 50-100 BPM (defaultSettings.js:20), es decir, no marca bradicardia leve. Es razonable para población joven o activa y el administrador puede cambiarlo; no es un error.

## 5. Bugs de lógica

- SerialSource: cierre ordenado (cancel, luego pipeTo, releaseLock y close), idempotente; el listener `disconnect` se elimina. Sin fugas.
- Listeners y timers: BaseDialog, SessionControls, AdminLoginView, AdminView y MonitorView los limpian en onBeforeUnmount. Los listeners de auth.js se instalan una sola vez (flag `listenersInstalled`). Son globales a propósito y no se eliminan nunca, lo cual es aceptable.
- Imports con alias `@/`: todos existen.
- No encontré bugs de lógica claros.

## 6. Recomendaciones

1. Sustituir o complementar la referencia sintética por un registro validado (por ejemplo, PhysioNet) con su licencia, para cumplir RF11 por completo.
2. Implementar BleSource o retirarlo; documentar el ESP32 por USB como la vía soportada (RNF08).
3. Ajustar la redacción de RF23 (infrarrojo frente a ECG).
4. Si se necesita disponibilidad offline, añadir un service worker o PWA (RNF05).
5. Probar la vista móvil en dispositivos reales y la sesión con un Arduino físico.
