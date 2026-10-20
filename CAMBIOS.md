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

## Alineación ISO/IEC 27001:2013

La asignatura entrega **UNE-EN ISO/IEC 27001:2017 = ISO/IEC 27001:2013** (+Cor 1:2014, Cor 2:2015; Anexo A de 114 controles, A.5–A.18). La documentación y el código citaban la edición 2022 (5.x–8.x); se alineó todo a 2013.

| Ámbito | Cambio | Archivos |
|---|---|---|
| Documentación | `ISO27001_controles.md` v2.0: estructura por cláusulas 4–10, riesgos R01–R20 (nuevos R15–R20 de Supabase: RLS, auth anónima, admin de la nube, transferencia internacional, incidentes, reloj), **SoA de 114 controles** (71 Sí, 27 Parcial, 16 No) con justificación, estado y evidencia `archivo:línea`, SEC-01..SEC-62 renumerados + SEC-63..SEC-69, tabla de equivalencia 2022→2013 y mapeo RNF06 | `docs/ISO27001_controles.md`, `docs/VERIFICACION.md`, `docs/ARQUITECTURA_VUE.md` |
| SGSI | 11 documentos nuevos: política, roles (RACI), metodología de riesgos, plan de tratamiento, objetivos e indicadores, incidentes, continuidad, control de acceso, uso aceptable y clasificación, auditoría interna y revisión por la dirección (plantillas), no conformidades | `docs/sgsi/*.md` |
| Política visible (A.5.1.1, A.8.1.3) | Ruta pública `/seguridad` con política, uso aceptable, roles y clasificación; enlaces en el pie | `src/views/SecurityView.vue`, `src/data/securityPolicy.js`, `src/router/index.js`, `AppFooter.vue` |
| Incidentes (A.16.1.2–A.16.1.6) | Formulario para cualquier usuario (sin datos personales ni de salud), ciclo abierto → en análisis → cerrado/descartado con respuesta y lección obligatorias, cifrado local y tabla `incidentes` con RLS | `src/services/security/incidents.js`, `src/stores/isms.js`, `src/components/security/IncidentReportForm.vue`, `supabase/schema.sql` |
| Panel SGSI (admin) | Aceptación de la política (A.7.2.2), revisión de derechos de acceso cada 90 días (A.9.2.5), indicadores 9.1 y objetivos 6.2, reloj frente a `hora_servidor()` (A.12.4.4), gestión de incidentes | `src/components/admin/IsmsPanel.vue`, `src/services/security/isms.js`, `src/views/admin/AdminView.vue` |
| Auditoría | Eventos `INCIDENT_REPORTED`, `INCIDENT_UPDATED`, `POLICY_ACCEPTED`, `ACCESS_REVIEW_DONE`, `CLOCK_SKEW`; marcas UTC visibles en `/admin/auditoria` | `src/services/audit/auditLog.js`, `src/views/admin/AuditView.vue` |
| Supabase | Cabecera con controles 2013; tabla `incidentes` (RLS: notifica cualquiera, lee reportante/admin, gestiona admin, sin DELETE) y función `hora_servidor()`; idempotente | `supabase/schema.sql` |
| Contenido visible | `/privacidad` actualizado (nube, RLS, proveedores, A.18.1.4); Aprende → "Seguridad de la información"; insignias con A.8.2.1/A.8.2.2 | `PrivacyView.vue`, `src/data/learn/informationSecurity.js`, `LearnView.vue`, `DataClassBadge.vue` |
| Comentarios | Referencias 5.16, 8.3, 8.5, 8.9, 8.15, 8.28… → A.9.2.1, A.9.4.1, A.9.4.2, A.12.1.2/A.14.2.5, A.12.4.1, A.14.2.5 | `src/**`, `README.md` |
| Pruebas | +10 pruebas (`tests/isms.spec.js`): validación y ciclo de vida de incidentes, política, revisión de accesos, desfase de reloj, indicadores y objetivos | `tests/isms.spec.js` |

Verificación: `npm run build` OK, `npm test` 94/94 (8 archivos), `npm run lint` 0 problemas.

Pendiente: volver a ejecutar `supabase/schema.sql` en el proyecto (crea `incidentes` y `hora_servidor`); CI con `npm audit`; prueba automatizada de RLS; aprobación firmada del plan de tratamiento por el docente.

## 2026-10-15 — Sugerencias SUG-01..SUG-28 (revisión ISO/IEC 27001:2013)

Estado detallado por sugerencia en `../docs/SUGERENCIAS_CAMBIOS.md` §4 (10 ya resueltas, 16 implementadas, 2 pendientes).

| Ámbito | Cambio | Archivos |
|---|---|---|
| Supabase (SUG-05/14) | `CHECK` de tamaño, lista blanca de tipos de auditoría, triggers de cuota por usuario, `ts`/`usuario` de auditoría fijados por el servidor, `borrar_mis_datos()`, purga con `pg_cron` documentada. **Corregidos** dos errores de sintaxis que impedían ejecutar el script (literales sin comillas en `incidentes`, `$` en `hora_servidor`) | `../supabase/schema.sql` |
| Abuso de sesiones anónimas (SUG-04) | CAPTCHA opcional (Turnstile/hCaptcha) activable por variables públicas; límites de tasa del cliente | `src/services/cloud/captcha.js`, `src/utils/rateLimiter.js`, `src/services/cloud/cloudSync.js`, `.env.example`, `src/assets/styles/base.css` |
| Privacidad (SUG-06) | Base legal, transferencia internacional, tabla de derechos, plazos y "Eliminar mis datos en la nube" | `src/views/PrivacyView.vue`, `cloudSync.js` (`deleteAllMyCloudData`) |
| Seguridad eléctrica (SUG-09) | Acuse registrado en auditoría (`ELECTRICAL_SAFETY_ACK`) y advertencias explícitas | `src/views/MonitorView.vue`, `src/services/audit/auditLog.js` |
| Accesibilidad (SUG-20) | `aria-live` en BPM/rango, alternativa textual del gráfico, trampa de foco en diálogos, contraste AA en tema claro | `BpmDisplay.vue`, `RangeIndicator.vue`, `ChannelPanel.vue`, `EcgChart.vue`, `BaseDialog.vue`, `tokens.css` |
| CI y pruebas (SUG-10/11/18/24/28) | GitHub Actions, Dependabot, plantilla de PR, Playwright (9 E2E), `.editorconfig`, `supabase-js` con `~` | `.github/`, `playwright.config.js`, `e2e/`, `tests/abuseControls.spec.js`, `package.json`, `eslint.config.js`, `.gitignore` |
| Documentación (SUG-07/08/13/15/26) | Matriz de trazabilidad y erratas, esquema AD8232, política criptográfica, proveedores y vulnerabilidades, README, SoA actualizada | `../docs/TRAZABILIDAD.md`, `../docs/esquema_circuito_ad8232.svg`, `../docs/sgsi/politica_criptografica.md`, `../docs/sgsi/proveedores.md`, `README.md`, `../docs/ISO27001_controles.md` |

Verificación: `npm run lint` 0 problemas · `npm test` 103/103 (9 archivos) · `npm run build` OK · `npm run test:e2e` 9/9 (Chromium) · `schema.sql` ejecutado dos veces en PostgreSQL embebido (PGlite) con pruebas de cuota, lista blanca y supresión · `npm audit --omit=dev` 0 vulnerabilidades (en desarrollo: `tinypool` crítica vía `vitest` 3, registrada).

Pendiente (humano): volver a ejecutar `schema.sql`; activar CAPTCHA/rate limit en Supabase y, si se activa, ampliar la CSP; protección de rama en GitHub; región y DPA en `docs/sgsi/proveedores.md`; Lighthouse/axe; medición de rendimiento; capturas en README; presentación.

## Móvil, PWA y cámara (PPG)

- **PWA instalable**: manifiesto, íconos 192/512/maskable generados por `npm run gen:iconos` desde `public/icon.svg`, service worker propio (`public/sw.js`, versión estampada en el build), banner "Instalar aplicación" (beforeinstallprompt, "Ahora no" recordado), instrucciones iOS y aviso de nueva versión. CSP intacta; `Permissions-Policy` pasa a `camera=(self)`.
- **Fuente "Cámara del celular"** (`CameraSource`, perfil `camara-movil`, 30 Hz): linterna (torch) automática con botón "Encender flash" de respaldo, promedio R/G/B de región central, pasa-banda 0,7–4 Hz, BPM con sanidad 30–220, calidad (SNR/movimiento/presión/dedo) y dedo ausente como leads-off. Los fotogramas nunca se guardan ni envían.
- **Asistente paso a paso** (`CameraWizard.vue`) accesible (aria-live, foco) y no médico.
- **Auditoría**: `CAMERA_STARTED`, `CAMERA_STOPPED`, `CAMERA_DENIED`, `TORCH_UNAVAILABLE` (`supabase/migracion_eventos_camara.sql`).
- **Responsivo**: `responsive.css`, encabezado que se esconde al bajar y vuelve al subir, tablas-tarjeta (`table.cards`).
- Pruebas: `ppgCamera.spec.js` (unitarias), `pwa.spec.js` y `camara.spec.js` (E2E). Guía: `docs/MOVIL_PWA_CAMARA.md`.

## 2026-10-19 — Rediseño visual y funcional (usuarios, monitoreos, comparar, aprende, informes)

Análisis y diagramas en `../docs/ANALISIS_VISUAL.md`.

| Ámbito | Cambio | Archivos |
|---|---|---|
| Usuarios (/usuarios) | Mantenedor CRUD con búsqueda, orden, contador de monitoreos, detalle, edición de alias y datos opcionales (solo con consentimiento vigente), eliminación con diálogo (reutiliza `deleteUserData`: cascada local y nube); editar/eliminar exigen usuario activo o admin; evento `USER_UPDATED` | `views/UserSelectView.vue`, `services/users/userList.js`, `stores/users.js` |
| Monitor | Pasos usuario → fuente → iniciar → detener → guardar; la sesión nace como borrador (`guardado:false`); al detener se abre "Guardar monitoreo" (nombre, nota, actividad) con "Descartar" y "Decidir después"; vista previa con picos; chip "sin guardar" en la cabecera | `components/monitor/SessionControls.vue`, `components/monitoreos/*`, `stores/session.js` |
| Monitoreos (/monitoreos) | Filtros, orden, selección múltiple, detalle (gráfico con picos, BPM, % fuera de rango, eventos, parámetros), editar, eliminar (local + `deleteCloudSessions`), CSV/JSON, informe PDF/CSV, historial; `/sesiones` redirige | `views/SessionsView.vue`, `SessionDetailView.vue`, `services/monitoreos/*`, `stores/monitoreos.js`, `composables/useExportMonitoreos.js` |
| Comparar / Aprende | Selector guiado usuario → medición (búsqueda, actividad, miniatura); monitoreos como señal A o B; "Mis monitoreos" con picos R, RR, BPM, variabilidad, actividad y calidad PPG; importación de CSV exportados por la app (monitoreo e historial) | `components/compare/MonitoreoPicker.vue`, `components/learn/MyMonitorings.vue`, `services/export/csvImporter.js` |
| Informes | PDF (escritor propio, sin dependencias nuevas, JPEG del canvas) y CSV de monitoreo, comparación e historial con tendencia, fecha UTC, parámetros, aviso de no dispositivo médico y clasificación; seudonimizados; nota solo si se pide; evento `EXPORT_REPORT` | `services/report/*` |
| Diagnóstico de perfil | El parser cuenta ecg_raw fuera del rango del ADC y emite `profile-mismatch`: "El perfil del dispositivo no coincide: elige ESP32" | `services/parsing/ecgCsvParser.js`, `stores/channels.js`, `ChannelPanel.vue` |
| Navegación | Inicio, Usuarios, Monitor, Monitoreos, Comparar, Aprende, Admin; chip de usuario activo | `components/layout/AppHeader.vue`, `router/*` |
| Auditoría | Nuevos eventos `USER_UPDATED`, `SESSION_SAVED`, `SESSION_UPDATED`, `SESSION_DISCARDED`, `SESSION_DELETED`, `EXPORT_REPORT` en `AUDIT_EVENTS` y en la lista blanca de `supabase/schema.sql` (**volver a ejecutar el script**) | `services/audit/auditLog.js`, `../supabase/schema.sql`, `tests/schema.spec.js` |
| Pruebas | Unitarias: catálogo/filtros, servicio de monitoreos, informes y PDF, análisis, historial, importación, parser de perfil, esquema; E2E `e2e/monitoreos.spec.js` | `tests/*`, `e2e/*` |

Pendiente: probar el aviso de perfil con un ESP32 + MAX30100 físico; la serie de BPM del historial usa el tramo continuo más largo (≤ 10 min) de cada monitoreo; los PDF no se firman ni cifran.

## 2026-10-20 — Cuentas, pacientes propios y visibilidad de monitoreos

- **Cuentas (Supabase Auth, correo + contraseña):** `/acceso`, `/registro` (contraseña ≥ 10, confirmación por correo, CAPTCHA opcional), `/recuperar`, `/restablecer`, cierre de sesión y indicador de cuenta en el encabezado (también en el menú móvil). Límite de intentos en el cliente y errores genéricos. Sesión persistente por supabase-js (la app no guarda tokens).
- **Modo sin cuenta** intacto (local cifrado). Se eliminó `signInAnonymously`: sin cuenta no se sube nada a la nube.
- **Pacientes:** «Usuario N» pasa a «Paciente N» (los antiguos se muestran renombrados); `/usuarios` redirige a `/pacientes`. Con cuenta se guardan en la tabla `pacientes` (RLS solo propietario; el administrador no los lee). Datos locales separados por espacio (`acct:<uid>:`), vinculación de datos locales con confirmación y opción de quitar los datos del equipo al cerrar sesión.
- **Visibilidad:** `privado` por defecto o `publico` (casilla de consentimiento; segunda casilla para datos del paciente), editable al guardar, en el detalle y en la lista. Pestañas «Comunidad (públicos)» en Comparar y Aprende. Vista `monitoreos_publicos` (sin etiqueta/alias/nombre/nota/propietario).
- **BD:** `supabase/migracion_cuentas_pacientes.sql` (reflejada en `schema.sql`): `pacientes`, columnas de `sesiones`, vista, política de bloques públicos, auditoría ampliada (9 eventos), `borrar_mis_datos()` con pacientes, `eliminar_mi_cuenta()`, políticas con `(select auth.uid())`.
- **Pruebas:** `tests/cuentas.spec.js`, `tests/visibilidad.spec.js`, ampliado `schema.spec.js`; E2E `e2e/cuentas.spec.js`.
- **Pendiente/limitaciones:** el flujo real contra Supabase (registro, confirmación, publicación) solo se puede probar tras aplicar la migración y configurar Auth; la restauración de monitoreos propios desde la nube en otro equipo aún no está implementada (sí los pacientes).

## 2026-10-20 · Endurecimiento, retención y actualización del SGSI

- **Vista pública → funciones RPC.** Se elimina `public.monitoreos_publicos` (error `security_definer_view` del asesor de Supabase) y se crean `listar_monitoreos_publicos(p_limit, p_offset)` y `monitoreo_publico(p_id)` (security definer, `search_path` fijo, solo columnas permitidas, máx. 100 filas, REVOKE a `public`/`anon`, GRANT a `authenticated`). Archivo: `supabase/migracion_endurecimiento.sql` (idempotente; **pendiente de aplicar en la base real**). `schema.sql` coherente. `cloudSync.js`: `fetchPublicos` usa `supabase.rpc` y se añade `fetchPublico(id)`.
- **Retención.** Nube: 365 días desde el inicio del monitoreo (`purgar_sesiones(365)`, tarea diaria `purga-ecg` con pg_cron en la misma migración; desactivar con `select cron.unschedule('purga-ecg');`). Local: retención del administrador (30 días por defecto). Cuentas inactivas 24 meses: procedimiento manual. Actualizados `PrivacyView.vue`, `ConsentDialog.vue` y la documentación del SGSI.
- **Pruebas.** `tests/visibilidad.spec.js` reescrita para validar la migración de endurecimiento (funciones, límites, permisos, cron, coherencia con `schema.sql`).
- **Documentación.** Riesgos R22–R26, SoA recalculada con script (114 controles: 71 Sí, 27 Parcial, 16 No; estados 61 Implementado, 33 Documentado, 4 Parcial, 16 N/A), plan de tratamiento, metodología y continuidad actualizados, NC-05 a NC-07, `docs/ERRATAS_REQUERIMIENTOS.md` (PPG ≠ ECG), `docs/PENDIENTES_MANUALES.md`, `INFORME_FORMAL` (md y docx) regenerado.
- **Verificación (20-oct):** lint 0 problemas; Vitest 212/212 (18 archivos); build correcto; Playwright 33/33; `npm audit --omit=dev` 0 vulnerabilidades.
