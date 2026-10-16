# Matriz de trazabilidad — Requerimientos → componentes → pruebas → controles ISO/IEC 27001:2013

Versión 1.0 · oct-2026 · Propietario: equipo de desarrollo · Aprobación: docente responsable (pendiente).

Rutas relativas a `monitor-ecg-vue/` salvo `supabase/` y `docs/`. Pruebas: **U** = unitaria Vitest (`tests/`), **E** = E2E Playwright (`e2e/`), **M** = verificación manual (`docs/VERIFICACION.md`). Los controles se citan solo por número del Anexo A.

## 1. Erratas de `Requerimientos funcionales.md` (no se modifica el original)

| Punto | Texto original | Interpretación vigente | Motivo |
|---|---|---|---|
| RF04, RNF08 | "sensor … conectado al ESP32"; "compatible con los ESP32" | **Arduino UNO/Nano o ESP32** con módulo AD8232 | El firmware `sensor_ecg_ad8232.ino` usa pines de UNO (A0, D10, D11) y la app tiene perfiles de 10 y 12 bits (`src/data/deviceProfiles.js`) |
| RF23 | "funcionamiento del sensor infrarrojo" | **Sensor AD8232 de biopotencial**: electrodos RA/LA/RL, derivación I, detección leads-off, filtros | El proyecto mide ECG eléctrico, no fotopletismografía; contenido en `src/data/learn/sensorAd8232.js` |
| Esquema | `esquema_circuito.svg` (raíz) | **`docs/esquema_circuito_ad8232.svg`** | El SVG de la raíz describe un sensor de lactato (LMP91000), ajeno a este proyecto |

## 2. Requerimientos funcionales

| RF | Requerimiento (resumen) | Componentes principales | Pruebas | Controles |
|---|---|---|---|---|
| RF01 | Identificación de usuario | `stores/users.js`, `views/UserSelectView.vue`, `router/guards.js` (`requireUser`) | E `admin.spec.js` (redirige a /usuarios), E `simulador.spec.js` | A.9.2.1, A.18.1.4 |
| RF02 | Sesión sin contraseña | `stores/users.js`, `services/cloud/cloudSync.js` (`ensureCloudSession`, anónima + CAPTCHA opcional) | U `abuseControls.spec.js` (límite de tasa, CAPTCHA) | A.9.2.1, A.9.4.2 |
| RF03 | Datos opcionales con consentimiento | `components/users/ConsentDialog.vue`, `OptionalDataForm.vue`, `views/PrivacyView.vue` | E `inicio.spec.js` (privacidad), M | A.18.1.4, A.8.2.1 |
| RF04 | Recepción de datos | `services/sources/SerialSource.js`, `SimulatorSource.js`, `ReplaySource.js`, `services/parsing/ecgCsvParser.js` | U `ecgCsvParser.spec.js` | A.14.2.5, A.12.2.1 |
| RF05 | Señal en tiempo real | `components/monitor/EcgChart.vue`, `services/acquisition/renderScheduler.js`, `utils/RingBuffer.js` | U `ringBuffer.spec.js`, E `simulador.spec.js` | A.12.1.3 |
| RF06 | Frecuencia (BPM) | `utils/dsp/rPeakDetector.js`, `components/monitor/BpmDisplay.vue` | U `rPeakDetector.spec.js`, E `simulador.spec.js` | — |
| RF07 | Múltiples mediciones (≤ 5) | `stores/channels.js`, `components/monitor/ChannelGrid.vue`, `ChannelPanel.vue` | M | A.12.1.3 |
| RF08–RF09 | Inicio y fin de medición | `stores/session.js`, `services/acquisition/sessionRecorder.js`, `components/monitor/SessionControls.vue` | M | A.12.4.1 |
| RF10 | Estado de conexión | `components/monitor/ConnectionStatus.vue`, `LeadsOffAlert.vue` | M | A.12.4.1 |
| RF11 | Señal validada | `ecgCsvParser.js` (descarta líneas inválidas, leads-off como hueco) | U `ecgCsvParser.spec.js` | A.14.2.5 |
| RF12–RF14 | Comparación y sincronización | `views/CompareView.vue`, `services/compare/compareSignals.js`, `utils/dsp/crossCorrelation.js` | U `crossCorrelation.spec.js` | — |
| RF15, RF26 | Parámetros del administrador | `components/admin/RangeSettingsForm.vue`, `stores/settings.js`, tabla `parametros` | U `rangeEvaluator.spec.js` (validación) | A.9.2.3, A.9.4.1 |
| RF16–RF17, RF20 | Comparar con rango, estado y alerta | `utils/rangeEvaluator.js`, `RangeIndicator.vue` (texto + icono + `aria-live`), `stores/alerts.js` | U `rangeEvaluator.spec.js` | — |
| RF18–RF19 | Actividad y contexto | `components/monitor/ActivitySelector.vue`, `data/activities.js` | M | A.18.1.4 (minimización) |
| RF21–RF24 | Contenido educativo | `views/LearnView.vue`, `data/learn/*.js` (RF23 → `sensorAd8232.js`) | M | — |
| RF25 | Perfil de administrador | `services/security/adminAuth.js`, `pinHash.js`, `lockout.js`, `views/admin/*` | U `security.spec.js`, E `admin.spec.js` | A.9.2.3, A.9.4.2, A.9.4.3 |
| RF27 | Configuración de sincronización | `components/admin/SyncSettingsForm.vue` | M | — |

## 3. Requerimientos no funcionales

| RNF | Requerimiento | Implementación | Pruebas | Controles |
|---|---|---|---|---|
| RNF01 | Responsividad | `assets/styles/*.css` (mobile-first, objetivos táctiles de 44 px) | M | — |
| RNF02 | Multiplataforma | `composables/useCapabilities.js`, `CapabilityNotice.vue` | M | — |
| RNF03 | Tiempo real | `renderScheduler.js` (rAF), bloques de 500 muestras / 2 s | E `simulador.spec.js` | A.12.1.3 |
| RNF04 | Usabilidad y accesibilidad (WCAG 2.1 AA) | `aria-live` en BPM/rango, `role="alert"` en leads-off, foco visible, trampa de foco en `BaseDialog.vue`, contraste ≥ 4,5:1 (`tokens.css`), alternativa textual del gráfico | E `inicio.spec.js` (teclado), E `simulador.spec.js` (nombre accesible del gráfico) | — |
| RNF05 | Disponibilidad | Local-first (IndexedDB), nube opcional, `docs/sgsi/plan_continuidad.md` | M | A.17.1.2, A.12.3.1 |
| RNF06 | Seguridad | `vercel.json` (CSP, HSTS, Permissions-Policy), RLS y cuotas en `supabase/schema.sql`, cifrado `secureStorage.js`, auditoría `auditLog.js` | U `security.spec.js`, U `abuseControls.spec.js`, U `isms.spec.js`, E `seguridad.spec.js` | A.9, A.10.1.1, A.12.4, A.13.1.1, A.14.1.2, A.18.1.4 |
| RNF07 | Escalabilidad | `MAX_CHANNELS`, cuotas del servidor parametrizadas (`public.cuota()`) | U `abuseControls.spec.js` | A.12.1.3 |
| RNF08 | Compatibilidad (UNO o ESP32) | `data/deviceProfiles.js`, `docs/esquema_circuito_ad8232.svg` | M (sin hardware en CI) | — |
| RNF09 | Despliegue | `vercel.json`, `.github/workflows/ci.yml`, `.github/dependabot.yml` | CI (lint, unitarias, build, audit, E2E, gitleaks) | A.14.2.8, A.14.2.9, A.12.6.1 |

## 4. Requisitos de seguridad agregados (sugerencias SUG)

| SUG | Implementación | Pruebas | Controles |
|---|---|---|---|
| SUG-04 | `services/cloud/captcha.js`, `utils/rateLimiter.js`, `cloudSync.js` | U `abuseControls.spec.js` | A.9.2.1, A.9.4.2 |
| SUG-05, SUG-14 | `supabase/schema.sql` (CHECK, lista blanca, triggers de cuota, `ts` y `usuario` del servidor) | U `abuseControls.spec.js`; validado en PostgreSQL embebido (PGlite) | A.12.1.3, A.12.4.2, A.13.1.1 |
| SUG-06 | `views/PrivacyView.vue`, `deleteAllMyCloudData()`, `borrar_mis_datos()` | E `inicio.spec.js` | A.18.1.1, A.18.1.4 |
| SUG-09 | `views/MonitorView.vue` (acuse obligatorio + evento `ELECTRICAL_SAFETY_ACK`) | M (Web Serial requiere hardware) | A.12.4.1 |
| SUG-10/11 | `.github/workflows/ci.yml`, `playwright.config.js`, `e2e/*.spec.js` | CI | A.14.2.8, A.14.2.9 |
