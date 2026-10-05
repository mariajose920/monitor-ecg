# Cambios respecto al sistema original

Sistema original: `index.html` + `app.js` + `style.css` (monocanal, uPlot por CDN, sin usuarios ni persistencia).
Nuevo: SPA Vue 3 en `monitor-ecg-vue/`. Los archivos originales y `docs/` **no se modificaron**.

## Qué se hizo (por fase del plan)

| Fase | Resultado | Archivos clave |
|---|---|---|
| 0 Andamiaje | Vite + Vue Router (lazy) + Pinia, guards `requireUser`/`requireAdmin` con lista blanca de redirect, layout responsivo mobile-first con tema clínico oscuro/claro, `vercel.json` con las cabeceras exactas del doc. ISO, README | `src/router/*`, `src/App.vue`, `src/components/layout/*`, `src/assets/styles/*`, `vercel.json`, `vite.config.js` |
| 1 Adquisición | `DataSource` por eventos; `SerialSource` (cierre ordenado cancel→pipeTo→releaseLock→close, idempotente, `bufferSize` 8192, evento `disconnect` y error de lectura → fin RF09, parser reiniciado en cada apertura); `SimulatorSource` (PQRST 250 Hz, BPM/ruido variables, leads-off, pérdida de datos, desconexión); `ReplaySource`; `BleSource` (stub); parser CSV estricto en flujo; `RingBuffer` tipado; perfiles de dispositivo | `src/services/sources/*`, `src/services/parsing/ecgCsvParser.js`, `src/utils/RingBuffer.js`, `src/data/deviceProfiles.js`, `src/data/referenceEcg.js` |
| 2 Monitor | `renderScheduler` (un solo rAF con tope de fps), `EcgChart` (uPlot fuera de la reactividad, ResizeObserver, leads-off como hueco), detector de pico R incremental, BPM calculado + del dispositivo con "--", watchdog (2 s señal perdida, 10 s fin) | `src/services/acquisition/*`, `src/components/monitor/*`, `src/utils/dsp/rPeakDetector.js` |
| 3 Usuarios y sesiones | "Usuario N" sin contraseña + alias validado, consentimiento (modal, checkbox no premarcado, versión), datos opcionales minimizados (edad por rangos, peso, nivel), retiro de consentimiento, "Eliminar mis datos", `/privacidad`, sesiones con línea de tiempo de actividad y eventos, grabación en bloques cifrados de 2 s, historial y detalle | `src/stores/users.js`, `src/stores/session.js`, `src/views/UserSelectView.vue`, `SessionsView.vue`, `SessionDetailView.vue`, `PrivacyView.vue` |
| 4 Multicanal | Hasta 5 canales (máximo forzado en el store), fuente/perfil/usuario por canal, un usuario por canal, modo foco, estado por canal (RF10) | `src/stores/channels.js`, `ChannelGrid.vue`, `ChannelPanel.vue` |
| 5 Admin | PIN en primer uso (sin valor por defecto, rechaza triviales), PBKDF2-SHA-256 600k, comparación en tiempo constante, bloqueo 5 intentos con backoff 5/10/20/40/60 min persistente, sesión en sessionStorage (10 min inactividad, 60 máx.), reautenticación para exportar todo/borrar todo, cambio de PIN, "Olvidé el PIN" = borrar todo; rangos global/por actividad, histéresis y duración de alerta, método de sync, retención; evaluador con histéresis + alertas (toast, sonido, evento, auditoría, enlace a RF21); auditoría con cadena SHA-256, verificación, filtro, exportación JSON, rotación 5000/180 días con ancla | `src/services/security/*`, `src/stores/auth.js`, `settings.js`, `alerts.js`, `admin.js`, `src/services/audit/*`, `src/views/admin/*`, `src/components/admin/*` |
| 6 Almacenamiento | `secureStorage` AES-GCM 256 (clave no extraíble en IndexedDB, IV aleatorio por cifrado, AAD = clave), fallo seguro con aviso + `INTEGRITY_ERROR`, purga por retención al iniciar, borrado total con crypto-shredding | `src/services/storage/*` |
| 7 Comparación | Referencia sintética interna, CSV de ejemplo (`public/referencias/ejemplo_referencia.csv`), carga de CSV ≤ 5 MB validada; filtro + remuestreo + normalización; sync por pico R, correlación cruzada y manual (deslizador ±1 muestra, "auto y ajustar"); gráfico superpuesto y métricas (Pearson, RMSE, NRMSE, ΔBPM, desfase) | `src/services/compare/compareSignals.js`, `src/utils/dsp/*`, `src/views/CompareView.vue`, `src/components/compare/*` |
| 8 Exportación | CSV seudonimizado con línea de clasificación, neutralización de fórmulas, nombre sin datos personales, advertencia previa, participante solo lo suyo, admin todo con reautenticación y opcionales solo con consentimiento | `src/services/export/*` |
| 9 Educación | FC y fisiología (figura PQRST generada), causas de variación (incl. artefactos), AD8232 real + recuadro sobre el "sensor infrarrojo"/PPG, ingeniería (Nyquist, 250 Hz, ADC, filtros, umbral adaptativo), seguridad eléctrica; todo como texto, sin v-html | `src/data/learn/*`, `src/views/LearnView.vue` |
| 10 Pruebas | 84 pruebas Vitest (7 archivos) | `tests/*.spec.js` |

Bugs del diagnóstico (1.3) corregidos: 1 (RingBuffer), 2 (rAF), 3 (escalares a 4 Hz), 4–6 (cierre/desconexión), 7 (reset de base de tiempo), 8 (sin ceros iniciales), 9 (validación estricta), 10 (leads-off como hueco, dato crudo guardado), 11 (escala por perfil/auto), 12 (uPlot por npm), 13 (errores visibles), 14 (bufferSize), 15 (BPM "--"), 16 (ResizeObserver), 17 (capas separadas y probadas).

## Cobertura

- **RF**: RF01–RF27 implementados (RF04 por Web Serial con perfil ESP32 por USB; ver pendientes).
- **RNF**: RNF01 (mobile-first, 600/960 px, objetivos 44 px), RNF02 (detección de capacidades + simulador), RNF03 (pipeline sin asignaciones por muestra), RNF04, RNF05 (sin CDN), RNF06, RNF07 (`MAX_CHANNELS`, fuentes intercambiables), RNF08 (perfiles 10/12 bits), RNF09 (`vercel.json`).
- **SEC**: 01–14, 16–28, 30–48, 51, 53–57, 59–61 implementados. SEC-15, 49, 50, 52, 58 son organizativos/de despliegue (documentados, no aplicables en código). SEC-29 parcial (bloques cifrados JSON, no binarios).

## Verificación realizada

`npm run build`, `npm test` (84/84) y `npm run lint` (0 problemas). Prueba manual con `vite preview` aplicando la CSP de `vercel.json`: creación de usuario, consentimiento, simulador con gráfico en vivo, sesión con cambio de actividad, leads-off y desconexión simulada (fin automático RF09), detalle de sesión, IndexedDB solo con `{v,iv,ct}` y clave no extraíble, comparación (r≈0,89, desfase 176 ms recuperado), setup de admin, cambio de parámetro auditado, detección de auditoría alterada ("ROTA en #3"), guard de `/admin` y bloqueo tras 5 intentos. Sin errores en consola.

## Pendiente o parcial (y por qué)

- **Prueba con hardware real** (Arduino + AD8232 + HC-05): no hay hardware en este entorno; `SerialSource` sigue la API documentada pero no se probó con un puerto físico.
- **BleSource (ESP32 BLE)**: solo stub; falta definir servicio GATT y formato. La Permissions-Policy deshabilita bluetooth hasta entonces.
- **PWA offline (SEC-62)** y Web Worker para la correlación: no implementados (opcionales).
- **`stores/reference.js`**: la referencia se mantiene en el estado de `CompareView` (no persiste al navegar).
- Pruebas de componentes/guards con DOM (jsdom) y de `adminAuth` con storage: se probó la lógica pura (lockout, sesión, redirect, hash); los guards se verificaron manualmente.
- No se exportan ni se cifran las preferencias de UI (tema): son no sensibles por diseño.
- `npm audit`/Dependabot/protección de rama (SEC-52, SEC-58) dependen del repositorio y CI, que no se inicializaron (por instrucción, sin git).
- Limitación inherente solo-frontend (sección 4.0 ISO): controles evitables por quien controla el navegador.
