# Sugerencias de cambio — Monitor ECG (Vue 3) frente a ISO/IEC 27001:2013

Revisión de solo lectura del estado actual del repositorio (oct-2026). Referencia normativa: UNE-EN ISO/IEC 27001:2017 (equivale a ISO/IEC 27001:2013). Se citan solo número y nombre de cláusula/control. Complementa el trabajo en curso de migración de la documentación a 2013 (`docs/sgsi/`).

Esfuerzo: S = menos de 2 h, M = medio día a 1 día, L = más de 1 día.

## 1. Sugerencias

| ID | Prioridad | Categoría | Problema detectado (evidencia) | Cambio propuesto | Esfuerzo |
|---|---|---|---|---|---|
| SUG-01 | Alta | Cumplimiento ISO [4.3, 5.2, 6.1.2, 6.1.3] | `docs/ISO27001_controles.md` es un listado de controles numerado según 2022; no hay alcance, política, metodología de riesgos ni SoA formales (información documentada obligatoria, 7.5). | En `docs/sgsi/`: alcance (4.3), política de seguridad (5.2), metodología y registro de riesgos (6.1.2/8.2), plan de tratamiento (6.1.3 e/8.3), objetivos (6.2). Cada documento con versión, fecha, propietario y aprobación (7.5.2). | M |
| SUG-02 | Alta | Cumplimiento ISO [6.1.3 d) SoA] | No existe Declaración de Aplicabilidad con los 114 controles A.5–A.18. | `docs/sgsi/SoA.md`: tabla de 114 filas (control, aplica S/N, justificación, estado, evidencia archivo:línea). Exclusiones típicas justificadas: A.11 (física), A.7 (RR.HH.), A.14.2.7 (desarrollo externalizado). | M |
| SUG-03 | Alta | Cumplimiento ISO [9.2, 9.3, 10.1] | No hay auditoría interna, revisión por la dirección ni registro de no conformidades/acciones correctivas. | Agregar `auditoria_interna.md` (programa, criterios, hallazgos), `revision_direccion.md` (entradas 9.3 a–f, decisiones) y `no_conformidades.md` (NC, causa raíz, acción, cierre). Usar este documento como entrada de la auditoría. | M |
| SUG-04 | Alta | Despliegue/Supabase [A.9.2.1, A.9.4.2] | `src/services/cloud/cloudSync.js:26` usa `signInAnonymously()`: cualquiera puede crear identidades ilimitadas y escribir en `sesiones`, `bloques_muestras` y `auditoria` (`supabase/schema.sql:79,116,139`). | Activar CAPTCHA (Turnstile/hCaptcha) en Auth anónimo, limitar tasa de sign-ups en el panel de Supabase, o pasar a inicio por enlace mágico para administradores; documentar el riesgo aceptado en el registro de riesgos. | M |
| SUG-05 | Alta | Despliegue/Supabase [A.12.1.3, A.13.1.1] | Sin límites de tamaño ni cantidad: `bloques_muestras` acepta inserciones sin tope por usuario; `auditoria` acepta inserción libre (schema.sql:139) → llenado de cuota del plan gratuito (500 MB) y envenenamiento del registro. | Restricciones `CHECK` (longitud de `datos`, nº canal 1–5), trigger que limite filas/sesiones por `auth.uid()` y por hora; columna `evento` con lista blanca; tarea de purga programada (pg_cron) llamando a `purgar_sesiones` (schema.sql:157). | M |
| SUG-06 | Alta | Cumplimiento ISO [A.18.1.4] / Ley 19.628 y 21.719 | Datos de ECG son datos sensibles de salud; la nube (región de Supabase) implica transferencia internacional; `PrivacyView.vue` y `ConsentDialog.vue` no citan base legal ni derechos ARCO+portabilidad que exige la Ley 21.719 (vigencia dic-2026). | Añadir en la vista de privacidad: responsable, finalidad, base (consentimiento expreso), región del proveedor, plazo de conservación, derechos (acceso, rectificación, supresión, oposición, portabilidad) y vía de ejercicio; botón "borrar mis datos en la nube" que llame a `deleteCloudSessions` (cloudSync.js:80) para todas las sesiones del propietario. Usar seudónimos, nunca RUT ni nombre completo. | M |
| SUG-07 | Alta | Requerimiento funcional [RF23, RNF ESP32] | `Requerimientos funcionales.md:105` describe un sensor infrarrojo; el proyecto usa AD8232 (biopotencial). Líneas 23 y 157 exigen ESP32, mientras el firmware `sensor_ecg_ad8232.ino` y la app apuntan también a Arduino UNO. | Reescribir RF23 como "información sobre el sensor AD8232 (electrodos, derivación, leads-off)"; declarar plataformas soportadas "Arduino UNO o ESP32" y añadir matriz de trazabilidad RF→componente→prueba. | S |
| SUG-08 | Alta | Documentación académica | `esquema_circuito.svg` (raíz) corresponde a un sensor de lactato, no al AD8232. | Reemplazar por esquema AD8232 ↔ UNO/ESP32 (3.3 V, OUTPUT→A0/GPIO34, LO+/LO−→D10/D11, SDN), con electrodos RA/LA/RL. | S |
| SUG-09 | Alta | Seguridad técnica / Seguridad eléctrica | El usuario conecta electrodos al cuerpo con el PC enchufado a la red. Hay contenido en `src/data/learn/electricalSafety.js` pero no un bloqueo operativo. | Banner obligatorio antes de conectar por Web Serial: usar portátil a batería (desenchufado), nunca con cargador ni en personas con marcapasos; confirmar con casilla y registrar el acuse en auditoría. | S |
| SUG-10 | Alta | CI en GitHub [A.14.2.8, A.12.6.1] | No existe `.github/workflows/`; build, test, lint y `npm audit` dependen de la máquina local. | Workflow `ci.yml` (push/PR): `npm ci`, `npm run lint`, `npm test`, `npm run build`, `npm audit --audit-level=high`; Dependabot semanal para npm y Actions; protección de rama `main`. | S |
| SUG-11 | Media | Cumplimiento ISO [A.14.2.8, A.14.2.9] | Solo pruebas unitarias (`tests/*.spec.js`, 7 archivos); no hay E2E ni pruebas de aceptación. | Playwright con 4–5 flujos: seleccionar usuario + consentimiento, simulador 5 canales, exportar CSV, login admin con bloqueo tras PIN errado, comparar señales. Ejecutarlo en CI. | M |
| SUG-12 | Media | Cumplimiento ISO [A.9.4.2, A.9.4.3] | Admin con PIN local (`src/services/security/adminAuth.js`, `pinHash.js`, `lockout.js`): el bloqueo y el hash viven en el navegador y se eluden borrando IndexedDB; el rol admin real en la nube depende de `administradores` (schema.sql:15). | Documentar que el PIN protege solo la UI local; exigir longitud mínima ≥6 y PBKDF2 ≥310 000 iteraciones; para acciones en la nube exigir sesión Supabase no anónima del administrador. | M |
| SUG-13 | Media | Cumplimiento ISO [A.10.1.1, A.10.1.2] | IndexedDB cifrado (`secureStorage.js`) sin política criptográfica ni gestión de claves documentada (dónde vive la clave, rotación, pérdida). | `docs/sgsi/politica_criptografica.md`: AES-GCM 256, derivación, IV único, almacenamiento de clave, procedimiento de rotación y efecto del borrado (`wipe.js`). | S |
| SUG-14 | Media | Cumplimiento ISO [A.12.4.1–A.12.4.3] | Auditoría local (`services/audit/auditLog.js`) es modificable por el propio usuario; en la nube cualquier autenticado inserta (schema.sql:139). Sin sincronización horaria (A.12.4.4) ni revisión periódica. | Cadena de hashes (cada evento incluye hash del anterior) para detectar manipulación; timestamp de servidor (`default now()`); en la nube, insertar vía función `security definer` con validación; revisión mensual registrada. | M |
| SUG-15 | Media | Cumplimiento ISO [A.15.1.1–A.15.2.1] | Supabase y Vercel son proveedores críticos sin evaluación documentada. | Ficha de proveedor: servicio, datos tratados, región, certificaciones (SOC 2), DPA aceptado, plan, límites, salida (export). Revisión semestral (A.15.2.1). | S |
| SUG-16 | Media | Cumplimiento ISO [A.16.1.1–A.16.1.7] | No hay procedimiento de incidentes (p. ej. filtración de la clave `service_role`, abuso de cuota). | Procedimiento breve: detección, clasificación, contención (rotar claves, desactivar auth anónimo), notificación (Ley 21.719 a la Agencia), lecciones aprendidas; registro de incidentes. | S |
| SUG-17 | Media | Cumplimiento ISO [A.17.1.1–A.17.2.1] | Sin plan de continuidad: el proyecto Supabase gratuito se pausa por inactividad; no hay copias de seguridad ni prueba de restauración. | Exportación periódica (`pg_dump` o export CSV), modo 100 % local documentado como contingencia, prueba de restauración registrada una vez. | S |
| SUG-18 | Media | Cumplimiento ISO [A.12.6.1] | Dependencias con rango `^` (`@supabase/supabase-js ^2.117.2` en package.json) mientras el resto usa `~`; no hay registro de vulnerabilidades. | Uniformar rangos, ejecutar `npm audit` en CI y llevar registro de vulnerabilidades con fecha de revisión. | S |
| SUG-19 | Media | Despliegue/Vercel [A.13.1.1, A.14.1.2] | `vercel.json:11` CSP fija el host Supabase; correcto, pero falta `Permissions-Policy` (serial, usb, bluetooth, camera) y HSTS explícito; `.env.local` existe en disco (verificar que nunca se suba). | Añadir `Permissions-Policy: serial=(self), bluetooth=(self), camera=(), microphone=(), geolocation=()` y `Strict-Transport-Security`; comprobar `git log -- .env.local` y escanear secretos (gitleaks) en CI. | S |
| SUG-20 | Media | Calidad/UX – Accesibilidad (WCAG 2.1 AA) | Gráficos uPlot (`EcgChart.vue`, `SignalChart.vue`) no tienen alternativa textual; alertas de rango dependen del color. | `role="img"` + `aria-label` con BPM y estado; región `aria-live="polite"` para alertas leads-off/rango; contraste ≥4.5:1 en tokens.css; foco visible y trampa de foco en `BaseDialog.vue`; auditar con axe/Lighthouse y adjuntar resultado. | M |
| SUG-21 | Media | Rendimiento | 5 canales a ~250–500 Hz con renderizado continuo. | Medir con Performance de Chrome y reportar FPS/CPU; lotes de inserción en la nube (p. ej. 1 s por bloque) y compresión; `requestAnimationFrame` ya centralizado en `renderScheduler.js`: documentar resultados. | S |
| SUG-22 | Media | Cumplimiento ISO [A.8.1.1, A.8.2.1] | `DataClassBadge.vue` sugiere clasificación, pero no hay inventario de activos. | Inventario: activos (código, BD Supabase, claves, datos ECG, firmware, hardware), propietario, clasificación, ubicación. | S |
| SUG-23 | Baja | Cumplimiento ISO [7.2, 7.3, 7.4] | No hay evidencias de competencia, concienciación ni plan de comunicación. | Tabla de roles del equipo (responsable SGSI, desarrollador, administrador), formación recibida y matriz de comunicación. | S |
| SUG-24 | Baja | Cumplimiento ISO [A.14.2.2, A.12.1.2] | Cambios registrados en `monitor-ecg-vue/CAMBIOS.md` sin vínculo a PR ni aprobación. | Flujo de PR con revisión, plantilla de PR con checklist de seguridad y `CHANGELOG` versionado (SemVer). | S |
| SUG-25 | Baja | Documentación académica | Restos de la versión antigua (`app.js`, `index.html`, `style.css` en la raíz) confunden qué se entrega. | Mover a `legacy/` o eliminar en la rama de entrega, y aclararlo en el README. | S |
| SUG-26 | Baja | Documentación académica | README del subproyecto no incluye capturas, diagrama ni enlace al despliegue/demo. | README raíz con: objetivo, demo (https://monitor-ecg1.vercel.app/), capturas/GIF, diagrama de arquitectura (Mermaid: fuentes → stores Pinia → vistas → IndexedDB/Supabase), instalación, scripts, pruebas, limitaciones ("no es dispositivo médico"), créditos. | S |
| SUG-27 | Baja | Documentación académica | Falta material de presentación. | 10–12 diapositivas: problema, hardware, arquitectura, demo en vivo con simulador, seguridad ISO 27001 (riesgos + SoA), pruebas/CI, lecciones aprendidas. | M |
| SUG-28 | Baja | Calidad/UX | `package.json` muestra mojibake en la descripción ("mÃ©dico") al leerse con codificación ANSI; posible doble codificación. | Verificar que todos los archivos estén en UTF-8 sin BOM y añadir `.editorconfig`. | S |

## 2. Top 10 para la entrega

1. **SUG-02** SoA de 114 controles con justificación y evidencia.
2. **SUG-01** Documentación obligatoria del SGSI (alcance, política, riesgos, tratamiento).
3. **SUG-03** Auditoría interna, revisión por la dirección y no conformidades.
4. **SUG-04** Mitigar abuso de sesiones anónimas de Supabase (CAPTCHA + límite de tasa).
5. **SUG-05** Límites y purga en BD para proteger cuota y la integridad de la auditoría.
6. **SUG-06** Privacidad Ley 19.628/21.719 y borrado de datos en la nube.
7. **SUG-07 + SUG-08** Corregir RF23, plataforma ESP32/UNO y el esquema del circuito.
8. **SUG-09** Confirmación obligatoria de seguridad eléctrica.
9. **SUG-10 + SUG-11** CI en GitHub Actions y pruebas E2E con Playwright.
10. **SUG-26** README con demo, capturas y diagrama de arquitectura.

## 3. Resumen por prioridad

| Prioridad | Cantidad | IDs |
|---|---|---|
| Alta | 10 | SUG-01 a SUG-10 |
| Media | 12 | SUG-11 a SUG-22 |
| Baja | 6 | SUG-23 a SUG-28 |
| **Total** | **28** | |

## 4. Estado de implementación (verificado contra el código, 2026-10-15)

Cada sugerencia se contrastó con el contenido real de los archivos (no solo con sus nombres). Rutas relativas a `monitor-ecg-vue/` salvo `docs/` y `supabase/`.

| SUG | Estado | Evidencia / justificación | Acción humana pendiente |
|---|---|---|---|
| SUG-01 | Ya resuelta | `docs/ISO27001_controles.md` v2.0 (cláusulas 4–10) y `docs/sgsi/` (política, metodología y plan de tratamiento de riesgos, objetivos) con versión, fecha y aprobación | Firma del docente en el plan de tratamiento |
| SUG-02 | Ya resuelta | SoA de 114 controles en `docs/ISO27001_controles.md` §8 (actualizada hoy con evidencias nuevas) | — |
| SUG-03 | Ya resuelta | `docs/sgsi/auditoria_interna_y_revision.md`, `docs/sgsi/registro_no_conformidades.md` | Ejecutar y registrar la auditoría del hito |
| SUG-04 | Implementada ahora | CAPTCHA opcional Turnstile/hCaptcha por `VITE_CAPTCHA_PROVIDER`/`VITE_CAPTCHA_SITE_KEY` (`src/services/cloud/captcha.js`, `options.captchaToken` en `cloudSync.js`), límite de altas anónimas y de escrituras en el cliente (`src/utils/rateLimiter.js`); sin variables no se carga nada externo. Dominios CSP documentados en README | Activar CAPTCHA y rate limit de altas anónimas en Supabase; ampliar CSP solo si se activa |
| SUG-05 | Implementada ahora | `supabase/schema.sql`: `CHECK` de tamaño (JSON de sesión ≤ 64 KB, `seq ≤ 5400`, BPM consistente), lista blanca de tipos de auditoría, triggers de cuota (50 sesiones/día, 300 bloques/min, 200 eventos/h, 10 incidentes/día), purga con `pg_cron` documentada. Validado en PostgreSQL embebido (dos ejecuciones = idempotente; cuota de 50 sesiones bloquea la 51.ª; upsert de sesión existente no consume cuota). Se corrigieron además dos errores de sintaxis previos (literales sin comillas en `incidentes` y `$` en `hora_servidor`) | Volver a ejecutar `schema.sql`; activar `pg_cron` y programar la purga |
| SUG-06 | Implementada ahora | `src/views/PrivacyView.vue`: consentimiento expreso como base legal, transferencia internacional, tabla de derechos (acceso, rectificación, supresión, oposición, portabilidad), plazo de 30 días y botón "Eliminar mis datos en la nube" → `deleteAllMyCloudData()` → RPC `borrar_mis_datos()`; evento `CLOUD_DATA_DELETED` | Anotar la región real del proyecto Supabase en `docs/sgsi/proveedores.md` |
| SUG-07 | Implementada ahora | Erratas RF04/RF23/RNF08 documentadas en `docs/TRAZABILIDAD.md` §1 (el archivo original de la raíz no se modifica por instrucción) | Si el docente lo permite, corregir `Requerimientos funcionales.md` |
| SUG-08 | Implementada ahora | `docs/esquema_circuito_ad8232.svg` (AD8232 ↔ UNO/ESP32, RA/LA/RL, pines del firmware) | Sustituir o retirar `esquema_circuito.svg` (lactato) de la raíz al armar el repositorio |
| SUG-09 | Implementada ahora | Ya existía el diálogo obligatorio; se agregó texto (sin cargador, marcapasos) y el registro del acuse `ELECTRICAL_SAFETY_ACK` en auditoría (`src/views/MonitorView.vue`) | Prueba con hardware real |
| SUG-10 | Implementada ahora | `.github/workflows/ci.yml` (npm ci, lint, test, build, `npm audit --audit-level=high --omit=dev`, E2E, gitleaks) y `.github/dependabot.yml`, en la raíz del repo al copiar `monitor-ecg-vue/` | Activar protección de la rama `main` con CI obligatorio |
| SUG-11 | Implementada ahora | `playwright.config.js` + `e2e/` (9 pruebas: inicio sin errores de CSP, teclado, privacidad, `/seguridad`, cabeceras, guard admin ×2, guard participante, simulador con BPM). `npm run test:e2e`: 9/9 en este equipo | — |
| SUG-12 | Ya resuelta | PIN ≥ 8 caracteres y PBKDF2 600 000 iteraciones (`src/services/security/pinHash.js:7-8`); acciones en la nube exigen cuenta Supabase de administrador (`cloudAdminLogin`, `pushCloudParametros`); limitación documentada en `/privacidad` y README | — |
| SUG-13 | Implementada ahora | `docs/sgsi/politica_criptografica.md` (algoritmos, ciclo de vida de claves, rotación, pérdida, crypto-shredding) | Aprobación del docente |
| SUG-14 | Implementada ahora | Local: cadena SHA-256 ya existía (`auditLog.js`). Nube (nuevo): trigger que fija `ts = now()` y `usuario = auth.uid()`, lista blanca de tipos, detalle ≤ 2 KB, tasa máxima; prueba `tests/abuseControls.spec.js` verifica que la lista blanca coincide con `AUDIT_EVENTS` | Revisión mensual registrada del registro |
| SUG-15 | Implementada ahora | `docs/sgsi/proveedores.md` §1 (fichas Supabase, Vercel, GitHub) | Registrar fecha de aceptación de DPA y región |
| SUG-16 | Ya resuelta | `docs/sgsi/procedimiento_incidentes.md`, formulario `/seguridad`, tabla `incidentes` | — |
| SUG-17 | Ya resuelta | `docs/sgsi/plan_continuidad.md` (modo local, exportación) | Ejecutar y registrar una prueba de restauración |
| SUG-18 | Implementada ahora | `@supabase/supabase-js` pasa a `~2.117.2`; `npm audit` en CI; registro de vulnerabilidades en `docs/sgsi/proveedores.md` §2 (vulnerabilidad crítica de `tinypool` solo en desarrollo, vía `vitest` 3) | Migrar a `vitest` 5 cuando Dependabot lo proponga |
| SUG-19 | Ya resuelta | `vercel.json` ya tenía `Permissions-Policy` y HSTS; `.gitignore` excluye `.env.*`; ahora se suma gitleaks en CI | Comprobar en GitHub que `.env.local` nunca se subió |
| SUG-20 | Implementada ahora | `role="status"`/`aria-live` en BPM y rango, alternativa textual dinámica del gráfico (`ChannelPanel.vue` → `EcgChart.vue`), trampa de foco en `BaseDialog.vue`, contraste del tema claro corregido (`--accent` 3,5:1 → 5,4:1; `--warn` 4,1:1 → 5,5:1 sobre `--bg-elev-2`); foco visible y enlace de salto ya existían | Auditoría Lighthouse/axe y adjuntar resultado |
| SUG-21 | Pendiente | Requiere medir FPS/CPU con Chrome Performance en el equipo del laboratorio (5 canales) | Medir y documentar |
| SUG-22 | Ya resuelta | Inventario de activos en `docs/ISO27001_controles.md` §1.4 | — |
| SUG-23 | Ya resuelta | Roles (RACI) y comunicación en `docs/sgsi/roles_responsabilidades.md`; 7.2/7.3 en `ISO27001_controles.md` §4 | Registrar la formación/lectura en el acta del hito |
| SUG-24 | Implementada ahora | `.github/pull_request_template.md` con checklist de seguridad; `CAMBIOS.md` con secciones fechadas | Exigir revisión de PR en GitHub |
| SUG-25 | Ya resuelta | El repositorio se arma con la versión antigua en `legacy/` (aclarado en README) | — |
| SUG-26 | Implementada ahora | `README.md`: demo, ejecución, diagrama Mermaid, configuración Supabase/Vercel/CAPTCHA, CI y limitaciones | Agregar capturas o GIF |
| SUG-27 | Pendiente | Material de presentación (diapositivas) fuera del alcance del código | Equipo/docente |
| SUG-28 | Implementada ahora | `package.json` está en UTF-8 sin BOM (el mojibake era de la consola ANSI); se añadió `.editorconfig` | — |

**Resumen:** Ya resuelta 10 · Implementada ahora 16 · Pendiente 2 · No aplica 0 (total 28).
