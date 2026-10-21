# Matriz de trazabilidad — Requerimientos → componentes → pruebas → controles ISO/IEC 27001:2013

Versión 2.0 · 2026-10-20 · Propietario: equipo de desarrollo · Aprobación: docente responsable (pendiente). Actualizada con las TANDAS 1 y 2 (sección 8). Pruebas vigentes: **343 unitarias (28 archivos) y 75 E2E (16 archivos)**, con Supabase simulado en los E2E de nube; el SQL se probó en PGlite y no en Supabase real.

Rutas relativas a `monitor-ecg-vue/` salvo `supabase/` y `docs/`. Pruebas: **U** = unitaria Vitest (`tests/`), **E** = E2E Playwright (`e2e/`), **M** = verificación manual (`docs/VERIFICACION.md`). Los controles se citan solo por número del Anexo A.

## 1. Erratas de `Requerimientos funcionales.md` (no se modifica el original)

| Punto | Texto original | Interpretación vigente | Motivo |
|---|---|---|---|
| RF04, RNF08 | "sensor … conectado al ESP32"; "compatible con los ESP32" | **ESP32 con sensor óptico PPG MAX30100** (firmware `sensor_ppg_max30100_esp32`), cámara del celular como PPG y, opcionalmente, AD8232 (Arduino UNO/Nano o ESP32) | El sensor real del prototipo es PPG, no ECG; la app admite perfiles de 10 y 12 bits (`src/data/deviceProfiles.js`). Ver `docs/ERRATAS_REQUERIMIENTOS.md` |
| RF23 | "funcionamiento del sensor infrarrojo" | **Sensor óptico infrarrojo PPG (MAX30100) y cámara**; AD8232 (ECG) como contenido complementario | PPG ≠ ECG: el PPG mide volumen sanguíneo por luz, el ECG la actividad eléctrica. El texto original (infrarrojo) es correcto para el MAX30100; el contenido actual `sensorAd8232.js` solo cubre el ECG (pendiente ficha PPG). Ver `docs/ERRATAS_REQUERIMIENTOS.md` |
| Esquema | `esquema_circuito.svg` (raíz) | `docs/esquema_circuito_ad8232.svg` (ECG original); **falta** el esquema ESP32 + MAX30100 | El SVG de la raíz describe un sensor de lactato (LMP91000), ajeno al proyecto; ninguno refleja aún el MAX30100 |

## 2. Requerimientos funcionales

| RF | Requerimiento (resumen) | Componentes principales | Pruebas | Controles |
|---|---|---|---|---|
| RF01 | Identificación de la persona medida (paciente «Paciente N», con declaración de mayoría de edad) | `stores/users.js`, `views/UserSelectView.vue` (`/pacientes`; `/usuarios` redirige), `router/guards.js` (`requireUser`) | E `admin.spec.js` (redirige a /pacientes), E `simulador.spec.js`, U `etiquetas.spec.js` | A.9.2.1, A.18.1.4 |
| RF02 | Sesión sin contraseña para la persona medida: sin cuenta todo es local; con cuenta (correo y contraseña, Supabase Auth) la nube es opcional. **Ya no existe la sesión anónima** | `stores/users.js`, `stores/account.js`, `services/accounts/authService.js`, `services/cloud/nubeOptIn.js` | U `abuseControls.spec.js` (límite de tasa, CAPTCHA), U `cuentas.spec.js`, U `nubeOptIn.spec.js` | A.9.2.1, A.9.4.2 |
| RF03 | Datos opcionales con consentimiento v2.0 | `components/users/ConsentDialog.vue`, `OptionalDataForm.vue`, `views/PrivacyView.vue`, `services/privacidad/consentimiento.js`, `data/privacidad.js` | E `inicio.spec.js` (privacidad), U `privacy.spec.js`, U `privacidadTanda2.spec.js`, M | A.18.1.4, A.8.2.1 |
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
| SUG-04 | `services/cloud/captcha.js` (el token se envía solo en el registro y solo si hay `VITE_CAPTCHA_*`), `utils/rateLimiter.js`, `services/accounts/authService.js` | U `abuseControls.spec.js` | A.9.2.1, A.9.4.2 |
| SUG-05, SUG-14 | `supabase/schema.sql` (CHECK, lista blanca, triggers de cuota, `ts` y `usuario` del servidor) | U `abuseControls.spec.js`; validado en PostgreSQL embebido (PGlite) | A.12.1.3, A.12.4.2, A.13.1.1 |
| SUG-06 | `views/PrivacyView.vue`, `deleteAllMyCloudData()`, `borrar_mis_datos()` | E `inicio.spec.js` | A.18.1.1, A.18.1.4 |
| SUG-09 | `views/MonitorView.vue` (acuse obligatorio + evento `ELECTRICAL_SAFETY_ACK`) | M (Web Serial requiere hardware) | A.12.4.1 |
| SUG-10/11 | `.github/workflows/ci.yml`, `playwright.config.js`, `e2e/*.spec.js` | CI | A.14.2.8, A.14.2.9 |
| MOVIL-01 (PWA instalable) | `public/manifest.webmanifest`, `public/sw.js`, `composables/usePwaInstall.js`, `components/pwa/PwaPrompt.vue`, `vercel.json` (CSP sin cambios, `camera=(self)`) | E `pwa.spec.js` | A.14.2.5, A.13.1.1 |
| MOVIL-02 (fuente cámara PPG) | `services/sources/CameraSource.js`, `utils/dsp/ppgCamera.js`, `components/camera/CameraWizard.vue`, `data/deviceProfiles.js` | U `ppgCamera.spec.js`; E `camara.spec.js`; M (dedo real) | A.18.1.4, A.14.2.5 |
| MOVIL-03 (auditoría de cámara) | `auditLog.js` (`CAMERA_STARTED`, `CAMERA_STOPPED`, `CAMERA_DENIED`, `TORCH_UNAVAILABLE`), `supabase/schema.sql`, `supabase/migracion_eventos_camara.sql` | U `schema.spec.js` | A.12.4.1, A.12.4.2 |

## 5. Rediseño visual (oct-2026)

| Requisito de la usuaria | Implementación | Pruebas | Controles |
|---|---|---|---|
| Mantenedor de usuarios (CRUD) | `views/UserSelectView.vue`, `services/users/userList.js`, `stores/users.js` (`updateAlias`, `deleteUserData`) | U `monitoreoCatalog.spec.js`, E `monitoreos.spec.js` | A.9.2.1, A.18.1.4 |
| Guardar / descartar monitoreo | `components/monitoreos/SaveMonitoringDialog.vue`, `stores/session.js`, `services/monitoreos/monitoreoService.js` | U `monitoreoService.spec.js`, E `monitoreos.spec.js` | A.12.4.1, A.8.2.1 |
| Gestión de monitoreos (filtros, editar, eliminar, exportar) | `views/SessionsView.vue`, `SessionDetailView.vue`, `services/monitoreos/catalog.js`, `composables/useExportMonitoreos.js` | U `monitoreoCatalog.spec.js`, `informes.spec.js` | A.9.4.1, A.12.4.1, A.18.1.4 |
| Comparar / Aprende con monitoreos guardados | `components/compare/MonitoreoPicker.vue`, `views/CompareView.vue`, `components/learn/MyMonitorings.vue`, `services/monitoreos/analysis.js` | U `informes.spec.js`, E `monitoreos.spec.js` | — |
| Informes PDF/CSV seudonimizados e historial | `services/report/pdfWriter.js`, `informes.js`, `historial.js` | U `informes.spec.js`, `historial.spec.js` | A.8.2.2, A.18.1.4 |
| Reimportar CSV exportados | `services/export/csvImporter.js` | U `importarExportado.spec.js` | A.14.2.5 |
| Aviso de perfil incorrecto | `services/parsing/ecgCsvParser.js`, `stores/channels.js` | U `ecgCsvParser.spec.js` | A.14.2.5 |
| Nuevos eventos de auditoría | `auditLog.js`, `supabase/schema.sql` | U `schema.spec.js` | A.12.4.1 |
| Navegación y 375 px | `components/layout/AppHeader.vue`, `assets/styles/base.css` | E `monitoreos.spec.js`, `pwa.spec.js` | — |

## 6. Cuentas, pacientes y visibilidad (oct-2026)

| Requisito | Componente | Prueba | Controles |
|---|---|---|---|
| Iniciar sesión / crear cuenta / recuperar | `views/account/*`, `services/accounts/*`, `stores/account.js` | U `cuentas.spec.js`, E `cuentas.spec.js` | A.9.2.1, A.9.4.2, A.9.4.3 |
| Pacientes propios por cuenta | `stores/users.js`, `cloudSync.js`, tabla `pacientes` (RLS) | U `visibilidad.spec.js` (SQL) | A.9.1.1, A.9.4.1, A.18.1.4 |
| Vincular datos locales / limpiar al salir | `services/accounts/linkLocal.js`, `components/account/LinkLocalBanner.vue`, `storage/index.js` | U `privacidadTanda2.spec.js`; E `privacidad.nube.spec.js` | A.8.3.2, A.11.2.7 |
| Visibilidad privado/público con consentimiento | `services/monitoreos/visibilidad.js`, `SaveMonitoringDialog.vue`, `VisibilityDialog.vue` | U `visibilidad.spec.js`, E `cuentas.spec.js` | A.13.2.1, A.18.1.4 |
| Comunidad (públicos) en Comparar y Aprende | `CommunityPicker.vue`, `stores/comunidad.js`, funciones RPC `listar_monitoreos_publicos`/`monitoreo_publico`/`senal_publica` | U `visibilidad.spec.js`; E `comunidad.nube.spec.js` | A.9.4.1, A.13.2.1 |
| Auditoría de cuentas y visibilidad | `auditLog.js`, `schema.sql` | U `schema.spec.js` | A.12.4.1 |

## 7. Administrador con cuenta y segundo factor (oct-2026)

| Requisito | Componentes | Pruebas | Controles |
|---|---|---|---|
| RF25 (revisado): el administrador inicia sesión como una cuenta y se activa el botón Admin; recuperación no por cualquier persona | `supabase/schema.sql` (`es_admin_registrado()`, `es_admin()` con `aal2` y TOTP reciente, `admin_listar_administradores()`; origen en `migracion_admin_mfa.sql`), `src/services/security/adminMfa.js`, `src/stores/auth.js`, `src/router/guards.js`, `src/views/admin/AdminMfaView.vue`, `AppHeader.vue`, `IsmsPanel.vue`, `docs/sgsi/recuperacion_acceso_admin.md` | U `tests/adminMfa.spec.js`, `tests/schema.spec.js`; E `e2e/admin-cuenta.nube.spec.js` (copia con nube y red simulada), `e2e/admin.spec.js` | A.9.2.3, A.9.2.4, A.9.2.5, A.9.2.6, A.9.4.2, A.12.4.1 (SEC-77..82) |
| Gestión de administradores desde la app (conceder, retirar, revisar; máx. 5; TOTP nuevo; mensajes genéricos) | `supabase/migracion_admin_roles.sql` (`admin_conceder_rol`, `admin_retirar_rol`, `admin_listar_administradores` con correo), `src/components/admin/AdminRolesPanel.vue`, `src/stores/admin.js`, `src/services/security/adminMfa.js`, `src/views/admin/AdminView.vue` | U `tests/adminRoles.spec.js`; E `e2e/admin-cuenta.nube.spec.js` (lista, conceder con TOTP, retirar con confirmación, error genérico) | A.9.2.3, A.9.2.5, A.9.2.6, A.12.4.1 (SEC-83) |
| RF15, RF26, RF27 con nube: el administrador (aal2) guarda y publica parámetros | `src/stores/settings.js`, `src/services/cloud/cloudSync.js` (`pushCloudParametros`), `src/components/admin/mensajesGuardado.js`, `CloudSettings.vue` | E `e2e/admin-cuenta.nube.spec.js` | A.9.2.3, A.12.1.2 (SEC-84) |
| Encabezado adaptable en 3 niveles (fila con ícono + texto, dos filas compactas, solo íconos con desplegable; objetivos ≥ 44 px, nombre accesible) | `src/components/layout/AppHeader.vue` | E `e2e/encabezado.spec.js` (375, 600, 768, 1024, 1280 y 1440 px, sin desbordes) | RNF01, RNF04 |

## 8. TANDAS 1 y 2 (auditoría de sistema, 2026-10-20)

Origen: `docs/AUDITORIA_SISTEMA.md` (H-01 a H-30, C-01 a C-29); detalle de lo hecho y diferido: `docs/CAMBIOS_TANDA1.md` y `docs/CAMBIOS_TANDA2.md`; estado fila por fila: sección «Estado de implementación» de la auditoría. Rutas de pantalla nuevas: `/cuenta`, `/acceso`, `/registro`, `/pacientes`, `/monitoreos`, `/admin`, `/admin/auditoria`, `/admin/mfa` (pestañas «Soporte y moderación» y «SGSI», esta con «Evidencias del SGSI», dentro de `/admin`; pestaña «Nube» en `/admin/auditoria`).

### 8.1 Servidor (TANDA 1)

| Cambio | Componentes | Pruebas | Controles | Estado |
|---|---|---|---|---|
| C-04 Lo público solo por RPC, fecha truncada, reportes y retiro | `supabase/schema.sql` (`senal_publica`, `listar_monitoreos_publicos`, `monitoreo_publico`, `reportes_contenido`, `reportar_monitoreo`, `admin_retirar_publicacion`, `retiros_contenido`), `services/cloud/cloudSync.js`, `components/community/CommunityPicker.vue` | U `visibilidad.spec.js`, `schema.spec.js`; E `comunidad.nube.spec.js`; SQL `supabase/pruebas_rls.sql` (PGlite) | A.9.4.1, A.13.2.1, A.18.1.4 | Implementado (prueba real pendiente) |
| C-05 El privilegio del admin caduca en el servidor | `schema.sql` (`totp_reciente`, `es_admin`, `es_admin_reciente`), `services/security/adminTotp.js`, `adminRenovacion.js`, `components/admin/TotpRenovarDialog.vue` | U `adminTotp.spec.js`, `adminRoles.spec.js`; E `admin-soporte.nube.spec.js` | A.9.2.3, A.9.4.2 | Parcial (claim `amr` sin verificar, NC-08) |
| C-06 Mínimo privilegio del administrador | `schema.sql` (`admin_leer_sesion`, `mis_accesos_admin`, `accesos_admin`), `services/security/soporte.js`, `components/admin/SoportePanel.vue`, `components/account/AccesosAdminAviso.vue` | E `admin-soporte.nube.spec.js` | A.9.4.1, A.12.4.3, A.18.1.4 | Implementado |
| C-08 Auditoría de la nube fiable | `schema.sql` (`tipos_evento`, `registrar_evento`, `tg_auditoria_servidor`, `verificar_cadena_auditoria`, `admin_leer_auditoria`, `purgar_auditoria`), `services/cloud/auditOutbox.js`, `views/admin/AuditView.vue` | U `auditOutbox.spec.js`, `schema.spec.js`; E `auditoria.nube.spec.js` | A.12.4.1, A.12.4.2, A.12.4.3 | Parcial (sin anclaje ni eventos de fallo, NC-16) |
| C-09 Incidentes de extremo a extremo | `schema.sql` (`tg_incidentes_servidor`, `admin_actualizar_incidente`), `components/security/MisIncidentes.vue`, `stores/isms.js` | U `incidentesNube.spec.js`, `isms.spec.js` | A.16.1.2–A.16.1.6 | Implementado |
| C-11 Cuotas y hora del servidor | `schema.sql` (`creado_en`, `tg_sesion_tiempo`, `cuota`, `uso_cuenta`, `tg_cuota_bloques`) | U `abuseControls.spec.js`, `schema.spec.js` | A.12.1.3, A.12.4.4 | Implementado (concurrencia no probada) |
| C-21 Etiquetas únicas | `services/users/etiquetas.js`, `schema.sql` (`pacientes_etiqueta_unica`) | U `etiquetas.spec.js` | A.14.1.3 | Implementado |

### 8.2 Privacidad en la app (TANDA 2)

| Cambio | Componentes | Pruebas | Controles | Estado |
|---|---|---|---|---|
| C-02 Consentimiento v2.0 y textos veraces; responsable configurable (`VITE_RESPONSABLE_NOMBRE`, `VITE_RESPONSABLE_CORREO`) | `services/privacidad/consentimiento.js`, `responsable.js`, `data/privacidad.js`, `views/PrivacyView.vue`, `components/users/ConsentDialog.vue` | U `privacy.spec.js`, `privacidadTanda2.spec.js` | A.18.1.1, A.18.1.4 | Implementado (revisión legal pendiente) |
| C-03 Nube opcional, borradores locales, subida al «Guardar» | `services/cloud/nubeOptIn.js`, `subidaMonitoreo.js`, `datosNube.js`, `views/account/CuentaView.vue`, `components/account/CloudOptInBanner.vue` | U `nubeOptIn.spec.js`, `cloudSyncNube.spec.js`; E `privacidad.nube.spec.js` | A.18.1.4, A.13.2.1 | Implementado |
| C-07 Equipo compartido e inactividad de 15 min | `services/cloud/almacenSesion.js`, `services/security/inactividad.js`, `composables/useInactividad.js`, `App.vue` | U `privacidadTanda2.spec.js`; E `privacidad.nube.spec.js` | A.9.4.2, A.11.2.8 | Implementado (*time-box* de Supabase: manual) |
| C-13 Reautenticación (cliente) y política de contraseñas | `services/security/reauth.js`, `components/account/ReauthDialog.vue`, `services/accounts/validation.js` | U `privacidadTanda2.spec.js`, `cuentas.spec.js` | A.9.4.3, A.9.2.4 | Parcial (servidor no la exige, NC-15) |
| C-15 Vincular con selección explícita | `services/accounts/linkLocal.js`, `components/account/LinkLocalBanner.vue` | U `privacidadTanda2.spec.js` | A.9.4.1, A.8.2.3 | Implementado |
| C-16/17/18 Mayoría de edad, alias local, service worker sin datos, retención | `services/privacidad/alias.js`, `public/sw.js`, `services/accounts/validation.js` | U `privacidadTanda2.spec.js`; E `pwa.spec.js` | A.18.1.4, A.13.2.1 | Parcial (peso por rangos y `exportar_mis_datos()` diferidos) |
| C-10 (app) Evidencias del SGSI | `services/security/evidencias.js`, `components/admin/IsmsPanel.vue` | U `privacidadTanda2.spec.js` | 9.2, 9.3 | Implementado (las actas no existen) |

### 8.3 Diferido (ver los dos documentos de cambios)

Bóveda local con frase y clave por espacio (C-14), reautenticación impuesta por el servidor, restauración de monitoreos propios desde la nube, `exportar_mis_datos()`, conciliación de bloques (C-19), `validar_datos_sesion()` (C-20), retirar el modo PIN local (C-27), aislamiento y CRC de los sensores (C-29). Manual: prueba real de RLS con dos cuentas, claim `amr`, SMTP, CAPTCHA, protección de rama, DPA y región, actas de auditoría interna y de revisión por la dirección (`docs/PENDIENTES_MANUALES.md`).
