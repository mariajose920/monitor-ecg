# Seguridad de la información — ISO/IEC 27001:2013 aplicada al Monitor ECG Web

> **Documento:** ISO27001_controles.md · **Versión:** 3.0 · **Fecha:** 2026-10-20
> **Proyecto:** Monitor ECG web (asignatura Programación Web) — sensor AD8232 + Arduino/ESP32 + frontend Vue 3 + Supabase (opcional)
> **Clasificación de este documento:** Uso interno (académico)
> **Norma de referencia:** **UNE-EN ISO/IEC 27001:2017**, versión española de **ISO/IEC 27001:2013** con sus corrigendos **Cor 1:2014** y **Cor 2:2015** (cláusulas 4 a 10 y Anexo A con **114 controles en 14 dominios, A.5 a A.18**). Guía de controles: ISO/IEC 27002:2013. Gestión de riesgos: ISO 31000:2009 e ISO/IEC 27005.
> **Cambios de la v3.0 (2026-10-20):** se incorporan las TANDAS 1 y 2 derivadas de `AUDITORIA_SISTEMA.md` (ver `CAMBIOS_TANDA1.md` y `CAMBIOS_TANDA2.md`): SoA con estados reales, riesgos residuales y nuevos (R28 a R38), requisitos SEC-85 a SEC-102 y evidencias `archivo:línea` re-verificadas. **Criterio de honestidad:** «Implementado» significa que existe en el código/SQL del repositorio y tiene pruebas automáticas (343 unitarias, 75 E2E con Supabase simulado; SQL probado en PGlite, no en Supabase real); todo lo que depende de configuración de paneles o de una verificación en el proyecto real (claim `amr`, RLS con dos cuentas, SMTP, CAPTCHA, protección de rama, DPA) figura como «Parcial» o «Documentado».
> **Cambios respecto a la v1.0:** la v1.0 usaba ISO/IEC 27001:2022 (93 controles, numeración 5.x–8.x). Esta versión se alinea con la edición entregada por la asignatura; la equivalencia está en la sección 9. Se incorpora la capa de nube (Supabase) y los documentos del SGSI de `docs/sgsi/`.

Este documento adapta el Sistema de Gestión de Seguridad de la Información (SGSI) de ISO/IEC 27001:2013 a un proyecto universitario de alcance reducido. No pretende ser una certificación. Justifica las decisiones de seguridad del software, entrega requisitos verificables al equipo (en especial para **RNF06 — Seguridad**) y contiene la **Declaración de Aplicabilidad** exigida por 6.1.3 d).

**Documentos del SGSI** (información documentada, cláusula 7.5):

| Documento | Cláusula / control |
|---|---|
| [`sgsi/politica_seguridad.md`](sgsi/politica_seguridad.md) | 5.2, A.5.1.1, A.5.1.2 |
| [`sgsi/roles_responsabilidades.md`](sgsi/roles_responsabilidades.md) | 5.3, A.6.1.1, A.6.1.2 |
| [`sgsi/metodologia_riesgos.md`](sgsi/metodologia_riesgos.md) | 6.1.2, 8.2 |
| [`sgsi/plan_tratamiento_riesgos.md`](sgsi/plan_tratamiento_riesgos.md) | 6.1.3 e)–f), 8.3 |
| [`sgsi/objetivos_seguridad.md`](sgsi/objetivos_seguridad.md) | 6.2, 9.1 |
| [`sgsi/control_acceso.md`](sgsi/control_acceso.md) | A.9.1.1 (y A.9.2–A.9.4) |
| [`sgsi/recuperacion_acceso_admin.md`](sgsi/recuperacion_acceso_admin.md) | A.9.2.3–A.9.2.6, A.9.4.2 |
| [`sgsi/uso_aceptable_y_clasificacion.md`](sgsi/uso_aceptable_y_clasificacion.md) | A.8.1.3, A.8.2.1–A.8.2.3 |
| [`sgsi/procedimiento_incidentes.md`](sgsi/procedimiento_incidentes.md) | A.16.1.1–A.16.1.7 |
| [`sgsi/plan_continuidad.md`](sgsi/plan_continuidad.md) | A.17.1.1–A.17.2.1 |
| [`sgsi/auditoria_interna_y_revision.md`](sgsi/auditoria_interna_y_revision.md) | 9.2, 9.3 |
| [`sgsi/registro_no_conformidades.md`](sgsi/registro_no_conformidades.md) | 10.1, 10.2 |
| [`AUDITORIA_SISTEMA.md`](AUDITORIA_SISTEMA.md) (con «Estado de implementación»), [`CAMBIOS_TANDA1.md`](CAMBIOS_TANDA1.md), [`CAMBIOS_TANDA2.md`](CAMBIOS_TANDA2.md), [`PENDIENTES_MANUALES.md`](PENDIENTES_MANUALES.md) | 9.2 (insumo), 10.1 |

---

## 1. Contexto de la organización (cláusula 4)

### 1.1 Cuestiones externas e internas (4.1)

| Tipo | Cuestión | Efecto en el SGSI |
|---|---|---|
| Externa | Ley 19.628 (vida privada) y **Ley 21.719** (protección de datos personales, vigencia programada para diciembre de 2026; datos de salud = datos sensibles); Ley 20.584 como referencia | Requisitos legales de A.18.1.1 y A.18.1.4 |
| Externa | Proveedores en la nube: Vercel (hosting estático), Supabase (PostgreSQL + Auth), GitHub (repositorio), npm | Controles A.15 y A.13.1.2 |
| Externa | Navegadores con Web Serial (Chrome/Edge) y equipos de laboratorio compartidos | Riesgo de acceso físico al equipo (A.11.2.8, A.11.2.9) |
| Interna | Equipo estudiantil pequeño, sin presupuesto, plazo semestral | Segregación de funciones limitada (A.6.1.2), controles proporcionados |
| Interna | Sistema educativo, **no es un dispositivo médico** | Fuera del alcance: certificación IEC 60601 y uso clínico |

### 1.2 Partes interesadas y sus requisitos (4.2)

| Parte interesada | Requisitos relevantes para la seguridad |
|---|---|
| Participantes (titulares de los datos) | Confidencialidad de su señal ECG, consentimiento informado (RF03), derecho de supresión, seguridad eléctrica |
| Docente supervisor (dirección del SGSI) | Cumplimiento de RNF06, evidencia documentada, aceptación de riesgos residuales |
| Administrador de la plataforma | Funciones restringidas a su perfil, trazabilidad, recuperación ante incidentes |
| Equipo de desarrollo | Reglas de desarrollo seguro, sin datos reales en pruebas |
| Universidad / comité de ética | Uso académico, minimización, normativa ética |
| Proveedores (Vercel, Supabase, GitHub) | Términos de servicio, DPA, uso legítimo de su plataforma |

### 1.3 Alcance (4.3)

> *El SGSI cubre el diseño, desarrollo, despliegue y operación de la aplicación web "Monitor ECG": captura de señales de hasta 5 canales (sensor óptico PPG MAX30100 con ESP32, firmware AD8232/ECG original por Web Serial, cámara del celular como PPG y simulador), visualización y comparación, identificación seudonimizada de participantes, datos opcionales con consentimiento (edad, peso, actividad), configuración administrativa (rangos y sincronización), exportación CSV, almacenamiento cifrado en el navegador (IndexedDB, AES-GCM), auditoría encadenada SHA-256, copia opcional en Supabase (apagada por defecto, activada por la persona desde «Mi cuenta» y solo al pulsar «Guardar»: RLS, cuentas con correo y contraseña (Supabase Auth), pacientes propiedad de cada cuenta, monitoreos privados o publicables solo con consentimiento por monitoreo y vistos por otras cuentas como «Paciente anónimo» con fecha truncada, administrador con cuenta, TOTP reciente y acceso excepcional motivado; proyecto en la región us-east-1), notificación de incidentes y despliegue estático en Vercel. Incluye el firmware del sensor en lo que respecta a la integridad del flujo de datos.*
>
> **Interfaces y dependencias (4.3 c):** Vercel (entrega de la SPA), Supabase (base de datos y autenticación), GitHub y npm (cadena de suministro de software).
>
> **Exclusiones:** seguridad física y red de las instalaciones universitarias (A.11.1), infraestructura interna de Vercel/Supabase/GitHub (se gestiona como proveedor, A.15), certificación eléctrica o médica (IEC 60601) y uso clínico.

### 1.4 Inventario y propiedad de activos (A.8.1.1, A.8.1.2) y clasificación (A.8.2.1)

Esquema de clasificación: **Público**, **Interno**, **Confidencial** y **Confidencial-Sensible** (datos de salud). Detalle en `sgsi/uso_aceptable_y_clasificacion.md`.

| ID | Activo | Tipo | Ubicación | Propietario | Clasificación | C / I / D* |
|---|---|---|---|---|---|---|
| A01 | Señal ECG cruda y BPM por sesión | Información | Memoria; IndexedDB cifrado; Supabase `bloques_muestras`; CSV | Participante (titular) / administrador (custodio) | **Confidencial-Sensible** | 3 / 3 / 2 |
| A02 | Seudónimo «Paciente N» (el alias y las notas se quedan solo en el dispositivo) | Información | IndexedDB cifrado; `pacientes` en Supabase solo con la nube activada | Titular de la cuenta | Interno | 1 / 2 / 2 |
| A03 | Datos opcionales: edad (rango), peso, actividad | Información | IndexedDB cifrado | Participante | **Confidencial-Sensible** | 3 / 2 / 1 |
| A04 | Registro de consentimiento (v2.0), declaración de mayoría de edad y consentimiento de publicación por monitoreo | Evidencia | IndexedDB cifrado; `pacientes`/`sesiones.datos` en Supabase | Titular de la cuenta | Confidencial | 2 / 3 / 2 |
| A05 | Configuración (rangos, sincronización, retención) | Información | IndexedDB cifrado; Supabase `parametros` | Administrador | Interno | 1 / **3** / 2 |
| A06 | Credencial del administrador local (hash PBKDF2 + sal) | Autenticación | localStorage | Administrador | Confidencial | 3 / 3 / 2 |
| A07 | Registro de auditoría | Evidencia | IndexedDB (cadena SHA-256); Supabase `auditoria` | Administrador | Confidencial | 2 / **3** / 2 |
| A08 | Señal de referencia (RF11) | Información | Bundle / CSV cargado | Equipo | Interno | 1 / **3** / 2 |
| A09 | Código fuente, `vercel.json`, dependencias | Software | GitHub y equipos | Equipo | Interno | 1 / 3 / 2 |
| A10 | Firmware `sensor_ecg_ad8232.ino` | Software | Repositorio y placa | Equipo | Interno | 1 / 3 / 2 |
| A11 | Sensor (AD8232 + Arduino/ESP32, electrodos, HC-05) | Hardware | Laboratorio | Equipo | — | — / 3 / 3 |
| A12 | Equipo cliente (PC con Chrome/Edge) | Hardware | Laboratorio | Usuario / administrador | — | 3 / 3 / 3 |
| A13 | Hosting Vercel y dominio | Servicio | Nube | Equipo | — | 1 / 3 / 3 |
| A14 | CSV exportados | Información | Disco del equipo | Quien exporta | **Confidencial-Sensible** | 3 / 2 / 1 |
| A15 | Proyecto Supabase (BD PostgreSQL, Auth, claves; región us-east-1) | Servicio / información | Nube | Equipo (cuenta del docente) | Confidencial | 3 / 3 / 2 |
| A16 | Cuenta de administrador en Supabase (correo + contraseña) | Autenticación | Supabase Auth | Administrador | Confidencial | 3 / 3 / 2 |
| A17 | Registro de incidentes | Evidencia | IndexedDB cifrado; Supabase `incidentes` | Responsable de seguridad | Confidencial | 2 / 3 / 2 |
| A18 | Registro de accesos excepcionales del administrador (`accesos_admin`) y reportes de contenido (`reportes_contenido`) | Evidencia | Supabase | Responsable de seguridad | Confidencial | 2 / 3 / 2 |
| A19 | Copia de respaldo temporal en el esquema privado `respaldo_20261020` (creada al migrar; contiene datos de salud) | Información | Supabase (esquema no expuesto por la API) | Docente | **Confidencial-Sensible** | 3 / 2 / 1 |

\* C/I/D = Confidencialidad / Integridad / Disponibilidad, escala 1 (baja) a 3 (alta).

### 1.5 Sistema de gestión (4.4)

El SGSI se establece con este documento y `docs/sgsi/`, se implementa en el código (sección 5), se verifica con pruebas, indicadores en la app y auditoría interna (sección 6) y se mejora con el registro de no conformidades (sección 7). Ciclo PDCA por hito del curso.

---

## 2. Liderazgo (cláusula 5)

- **5.1 Liderazgo y compromiso:** el docente supervisor actúa como alta dirección: aprueba la política, asigna recursos (horas de laboratorio, cuentas de Vercel/Supabase), revisa el SGSI en cada hito y acepta los riesgos residuales.
- **5.2 Política:** `sgsi/politica_seguridad.md` (incluye el marco de objetivos, el compromiso de cumplir requisitos y de mejora continua). Se comunica dentro de la app en **`/seguridad`** (`src/views/SecurityView.vue`, `src/data/securityPolicy.js`) y está disponible para las partes interesadas (5.2 e–g).
- **5.3 Roles, responsabilidades y autoridades:** `sgsi/roles_responsabilidades.md` (matriz RACI). El responsable de seguridad informa al docente del desempeño del SGSI.

---

## 3. Planificación (cláusula 6)

### 3.1 Acciones para tratar riesgos y oportunidades (6.1.1)

Oportunidades identificadas: la nube opcional permite autenticación real del administrador (mitiga R02, R11) y una copia de respaldo (R10, sin restauración automática hacia otro equipo); la app mide indicadores de seguridad de forma automática (9.1).

### 3.2 Apreciación de riesgos (6.1.2, 8.2)

**Metodología** (detalle en `sgsi/metodologia_riesgos.md`): probabilidad (P) e impacto (I) en escala 1–3. **Nivel = P × I** (1–2 Bajo, 3–4 Medio, 6–9 Alto). **Criterio de aceptación:** se aceptan los riesgos Bajos; Medios y Altos se tratan y el riesgo residual lo acepta el dueño del riesgo (docente). Se repite en cada hito y ante cambios importantes (8.2), p. ej. la incorporación de Supabase.

| # | Amenaza | Vulnerabilidad | Activos | Dueño | I | P | Nivel | Tratamiento (controles 2013) |
|---|---|---|---|---|---|---|---|---|
| R01 | Acceso no autorizado a datos de salud en un equipo compartido | Datos en claro; sesión abierta | A01, A03 | Docente | 3 | 3 | **9 Alto** | Mitigar: cifrado AES-GCM (alcance limitado: la clave vive en el mismo navegador), retención local 30 d, borrado, «equipo compartido» con token en `sessionStorage` y cierre por inactividad de 15 min, nube apagada por defecto, borradores que nunca se suben (A.10.1.1, A.8.3.2, A.18.1.4, A.11.2.8, A.11.2.9) |
| R02 | Un participante modifica rangos o sincronización | Autenticación del admin débil (RF02 elimina contraseña de usuario) | A05 | Docente | 2 | 3 | **6 Alto** | Mitigar: con nube, `parametros` solo con `es_admin()` (rol + `aal2` + TOTP ≤ 15 min); sin nube, PIN PBKDF2, bloqueo, guard y auditoría (A.9.1.1, A.9.2.3, A.9.4.2, A.12.4.1) |
| R03 | XSS que roba o altera datos | `v-html`, scripts de terceros | A01–A07 | Equipo | 3 | 2 | **6 Alto** | Mitigar: CSP, sin `v-html`, dependencias empaquetadas (A.14.1.2, A.14.2.5, A.14.2.1) |
| R04 | Datos seriales malformados o maliciosos | Parseo sin validación; buffer ilimitado | A01, A12 | Equipo | 2 | 3 | **6 Alto** | Mitigar: parser estricto, límite de buffer (A.14.1.3, A.12.2.1) |
| R05 | Cadena de suministro comprometida (npm/CDN) | Dependencias sin fijar; CDN sin SRI | A09, A01 | Equipo | 3 | 2 | **6 Alto** | Mitigar: sin CDN, lockfile, `npm audit` (A.15.1.3, A.12.6.1, A.14.2.4) |
| R06 | Fuga por CSV exportado | Exportación sin control | A14 | Administrador | 3 | 2 | **6 Alto** | Mitigar: seudonimización, advertencia, auditoría, neutralización de fórmulas (A.13.2.1, A.8.2.3, A.8.3.1) |
| R07 | Reidentificación del participante | Nombres reales o combinación de atributos | A02, A03 | Docente | 3 | 2 | **6 Alto** | Mitigar: seudónimos, edad por rangos (A.18.1.4) |
| R08 | Tratamiento sin base legal | Sin consentimiento | A03, A04 | Docente | 3 | 2 | **6 Alto** | Mitigar: consentimiento, aviso, retiro y supresión (A.18.1.1, A.18.1.4) |
| R09 | Clickjacking, sniffing MIME, degradación a HTTP | Sin cabeceras | A12, A05 | Equipo | 2 | 2 | **4 Medio** | Mitigar: `vercel.json` (A.13.1.1, A.13.1.2, A.14.1.2) |
| R10 | Pérdida de datos por borrado del navegador | Solo almacenamiento local; la nube es opcional | A01, A05, A07 | Administrador | 2 | 2 | **4 Medio** | Mitigar parcialmente: copia opcional en Supabase (365 días) y exportación manual; **no existe** restauración de monitoreos propios desde la nube en otro equipo y la prueba de restauración está pendiente (A.12.3.1, A.17.2.1) |
| R11 | Manipulación del registro de auditoría | Log local editable desde DevTools | A07 | Administrador | 2 | 2 | **4 Medio** | Mitigar: cadena SHA-256 local; en la nube, `registrar_evento` con actor y hora del servidor, hash encadenado en servidor, INSERT/UPDATE/DELETE directos revocados y `verificar_cadena_auditoria()` (A.12.4.2, A.18.1.3) |
| R12 | Secretos en el bundle o source maps | Todo JS cliente es público | A06, A09, A15 | Equipo | 2 | 2 | **4 Medio** | Evitar: solo clave publicable de Supabase, sin source maps, sin `service_role` (A.9.4.5, A.10.1.2, A.14.2.6) |
| R13 | Indisponibilidad durante una sesión | Red, Vercel, desconexión USB | A11, A13 | Equipo | 2 | 1 | **2 Bajo** | Aceptar: detección de desconexión, simulador, local-first y PWA con service worker (app shell sin conexión; no cubre la nube) (A.17.1.2) |
| R14 | Descarga eléctrica al participante | USB directo con electrodos | A11 (persona) | Docente | 3 | 2 | **6 Alto** | Mitigar (seguridad de personas): aviso obligatorio, batería/Bluetooth (A.11.2.1, A.11.2.2) |
| R15 | **Fuga entre participantes en la nube** | Política RLS mal escrita o tabla sin RLS | A01, A02, A15 | Equipo | 3 | 2 | **6 Alto** | Mitigar: RLS en TODAS las tablas, `propietario = auth.uid()`, sin lectura masiva del administrador, `supabase/pruebas_rls.sql` (101 casos, 0 fallos en PGlite); **la prueba con dos cuentas reales sigue pendiente** (A.9.4.1, A.14.2.8, A.18.2.3) |
| R16 | **Abuso del registro de cuentas** (altas masivas, spam de filas, fuerza bruta de contraseñas) | Cualquiera con la clave publicable puede intentar registrarse o iniciar sesión | A15 | Equipo | 2 | 2 | **4 Medio** | Mitigar: confirmación de correo, contraseña ≥ 10, límite de intentos en el cliente, límites de tasa de Supabase Auth (a verificar), cuotas del servidor (50 MB por cuenta, 1000 sesiones, 200 pacientes) y CHECK de tamaño. CAPTCHA: el código lo envía solo en el registro y está desactivado sin `VITE_CAPTCHA_*` (A.13.1.2, A.12.1.3, A.9.2.1, A.9.4.2) |
| R17 | **Compromiso de la cuenta admin de Supabase o de la clave `service_role`** | Contraseña débil, sin MFA, clave en el repositorio | A15, A16 | Docente | 3 | 1 | **3 Medio** | Mitigar: contraseña robusta + MFA del panel (manual), admin solo vía tabla `administradores` sin escritura desde la app, nunca `service_role` en el frontend (A.9.2.3, A.9.2.4, A.9.4.2, A.10.1.2) |
| R18 | **Transferencia internacional de datos de salud al proveedor** | Proyecto Supabase en la región **us-east-1** (EE. UU.), fuera de Chile | A01, A15 | Docente | 3 | 2 | **6 Alto** | Mitigar: nube opcional apagada por defecto y consentimiento informado que declara la transferencia, seudonimización (sin alias, nombre ni notas), opción 100 % local; pendiente: DPA y decisión sobre la región (A.15.1.1, A.15.1.2, A.18.1.4) |
| R19 | **Incidente no notificado o no gestionado** | Sin canal ni procedimiento | Todos | Responsable de seguridad | 2 | 2 | **4 Medio** | Mitigar: formulario en `/seguridad`, tabla `incidentes`, procedimiento (A.16.1.1–A.16.1.6) |
| R20 | **Marcas de tiempo inconsistentes** entre equipos | Relojes locales desfasados | A07, A17 | Equipo | 1 | 2 | **2 Bajo** | Aceptar con control: UTC ISO-8601 + comparación con `hora_servidor()` (A.12.4.4) |
| R21 | **Uso indebido de la cámara del celular** (captura de imágenes, flash/cámara encendidos fuera de la medición) | Permiso de cámara concedido a la PWA | A01, A02 | Equipo | 3 | 2 | **6 Alto** | Mitigar: solo se extraen promedios R/G/B de una zona central (los fotogramas nunca se guardan ni envían); consentimiento explícito en el asistente; `Permissions-Policy: camera=(self)`; cámara y flash se apagan al desconectar, al ocultar la pestaña (`visibilitychange`/`pagehide`) y al perder la pista; eventos `CAMERA_STARTED/STOPPED/DENIED` y `TORCH_UNAVAILABLE` en la auditoría (A.18.1.4, A.14.2.5, A.12.4.1, A.13.2.1) |
| R22 | **Publicación de datos de salud** (monitoreo público con datos identificables o sin consentimiento) | El titular puede marcar un monitoreo como público; divulgación irreversible en la práctica | A01, A03 | Docente | 3 | 2 | **6 Alto** | Mitigar: privado por defecto; el servidor rechaza `publico` sin consentimiento de publicación v2.0 por monitoreo y sin declaración de mayoría de edad del paciente (`tg_sesion_paciente`); solo cuentas registradas, «Paciente anónimo», fecha truncada al día; retirar el consentimiento devuelve a privado; reporte y retiro por el administrador con motivo (A.8.2.3, A.13.2.1, A.18.1.4) |
| R23 | **Compromiso de cuentas y credenciales de usuarios** (contraseñas débiles o reutilizadas, correo no confirmado) | Cuentas con correo y contraseña; SMTP propio y protección de contraseñas filtradas pendientes en el panel | A15 | Equipo | 3 | 2 | **6 Alto** | Mitigar: contraseña ≥ 10 con letras y números, sin correo ni contraseñas comunes (política de cliente), confirmación de correo, mensajes genéricos, RLS por propietario, `signOut` de otras sesiones al cambiar la contraseña, reautenticación en el cliente para acciones críticas; el administrador además exige TOTP (R27); pendiente (manual): SMTP propio, protección de contraseñas filtradas, desactivar inicios anónimos (docs/PENDIENTES_MANUALES.md) (A.9.2.1, A.9.2.4, A.9.4.3) |
| R24 | **Exposición por la vista/función pública** (vista security definer que salta RLS, columnas de más, acceso anónimo, extracción masiva) | La antigua vista monitoreos_publicos corría con los derechos de su dueño | A01, A15 | Equipo | 3 | 2 | **6 Alto** | Mitigar: vista eliminada; solo las RPC `listar_monitoreos_publicos`, `monitoreo_publico` y `senal_publica` (security definer, `search_path` fijo, REVOKE a public y anon, solo `authenticated` con cuenta registrada, máx. 60 bloques por llamada) y política pública de `bloques_muestras` eliminada; migraciones ya aplicadas en el proyecto real (A.9.4.1, A.14.2.5, A.18.1.4) |
| R25 | **Datos conservados más de lo necesario** (monitoreos, auditoría y cuentas inactivas) | Purga no verificada en el proyecto real; cuentas inactivas sin automatizar | A01, A15 | Docente | 2 | 2 | **4 Medio** | Mitigar: monitoreos en la nube 365 d (`purga-ecg`) y auditoría 2 años (`purga-auditoria`) con pg_cron (verificar `cron.job`), purga local 30 d configurable, cuentas sin acceso en 24 meses: aviso y eliminación manual (A.18.1.3, A.8.3.2, A.18.1.4) |
| R26 | **Uso de la señal PPG (MAX30100/cámara) como diagnóstico** o interpretación errónea; artefactos de movimiento | El PPG no es un ECG y la cámara no es un dispositivo médico | A01, A12 | Docente | 2 | 2 | **4 Medio** | Mitigar: aviso «no es dispositivo médico» (SafetyBanner), rótulo de la fuente de la señal, docs/ERRATAS_REQUERIMIENTOS.md (A.18.1.1, A.14.2.9) |
| R27 | **Cuenta privilegiada comprometida** (contraseña del administrador robada, phishing, restablecimiento por correo abusado, pérdida del dispositivo TOTP) | Administrador = cuenta con correo y contraseña; recuperación por correo | A15, A16 | Docente | 3 | 2 | **6 Alto** | Mitigar: `es_admin()` = rol + `aal2` + TOTP de ≤ 15 min y `es_admin_reciente(300)` para acciones sensibles (SEC-77, SEC-87), renovación de TOTP en el cliente, el restablecimiento por correo no concede privilegios, recuperación solo por procedimiento formal con regla de dos personas (SEC-80), auditoría `ADMIN_*`, al menos 2 administradores y revisión trimestral (A.9.2.3–A.9.2.6, A.9.4.2). Residual: el formato real de `amr` no se ha verificado con un JWT real (R28) |
| R28 | **El claim `amr` no se comporta como se supone** (sin entrada `totp` reciente o marca que no se renueva): ningún administrador tendría privilegios, o los tendría más tiempo del previsto | La función `totp_reciente` se probó con stubs en PGlite, no con un JWT real | A15, A16 | Docente | 2 | 2 | **4 Medio** | Mitigar: función tolerante a formatos, caso 0 de `pruebas_rls.sql`, contingencia por SQL del dueño (`sgsi/recuperacion_acceso_admin.md`); pendiente verificar con 2 administradores (A.9.2.3, A.9.4.2, A.14.2.8) |
| R29 | **Divergencia entre lo probado y lo desplegado** (SQL probado en PGlite; migraciones aplicadas al proyecto real sin `pruebas_rls.sql` con cuentas reales) | Entorno de prueba distinto de Supabase real | A01, A15 | Equipo | 3 | 2 | **6 Alto** | Mitigar: ejecutar `pruebas_rls.sql` con tres cuentas de prueba y archivar la salida; Advisors de Supabase (A.14.2.8, A.18.2.3) |
| R30 | **Reautenticación solo en el cliente** (borrado de datos o cuenta con un token robado, llamando al RPC sin pasar por la interfaz) | `borrar_mis_datos()` y `eliminar_mi_cuenta()` no exigen contraseña reciente en el servidor | A01, A15 | Equipo | 3 | 1 | **3 Medio** | Aceptar temporalmente: diálogo de contraseña en el cliente, sesión de equipo compartido de corta vida; diferido: exigir `amr` con `password` reciente en el servidor (A.9.4.2, A.9.4.3) |
| R31 | **Cifrado local de alcance limitado** (la clave AES vive en el mismo navegador; una sola clave para todos los espacios) | Sin bóveda con frase ni clave por espacio | A01, A03 | Docente | 3 | 2 | **6 Alto** | Mitigar con aviso honesto del alcance, equipo compartido y borrado al cerrar sesión; diferido: bóveda con frase (cambia la clave de los datos existentes) (A.10.1.1, A.10.1.2) |
| R32 | **Copia de respaldo temporal olvidada** (esquema `respaldo_20261020` con datos de salud) | Copia creada al migrar, sin fecha de borrado | A19 | Docente | 3 | 2 | **6 Alto** | Mitigar: eliminar el esquema tras validar la migración (docs/PENDIENTES_MANUALES.md); registrar fecha y evidencia (A.8.3.2, A.18.1.3) |
| R33 | **Monitoreos ya públicos antes del consentimiento 2.0** | Publicados bajo el modelo anterior, sin consentimiento de publicación por monitoreo | A01 | Docente | 3 | 2 | **6 Alto** | Mitigar: decisión de la responsable sobre pasarlos a privado (consulta opcional comentada en `migracion_tanda2.sql`); mientras tanto el titular puede retirarlos y cualquier cuenta puede reportarlos (A.18.1.1, A.18.1.4) |
| R34 | **Declaración de mayoría de edad falsa o ausente** (medición de menores) | La declaración es autodeclarada y no se verifica | A01, A03 | Docente | 3 | 1 | **3 Medio** | Mitigar: casilla en el registro y por paciente, sin declaración no se sube ni publica, avisos de uso; se acepta la autodeclaración (A.18.1.1, A.18.1.4) |
| R35 | **Fallas de auditoría no detectadas** (eventos de fallo sin registrar, cadena sin anclaje externo, dueño del proyecto con acceso a la BD) | No se emiten `ACCOUNT_LOGIN_FAILED`, `CLOUD_SYNC_FAILED`, `QUOTA_EXCEEDED`, `SESSION_EXPIRED`, `CONSENT_UPDATED` | A07 | Responsable de seguridad | 2 | 1 | **2 Bajo** | Aceptar: revisión trimestral de los registros de Auth y verificación periódica de la cadena (A.12.4.1, A.12.4.2) |
| R36 | **Configuración manual del panel sin verificar** (inicios anónimos, SMTP propio, CAPTCHA, contraseñas filtradas, *time-box* de sesiones, URLs de redirección, protección de rama, MFA en GitHub y Vercel) | Depende de acciones de la responsable fuera del repositorio | A15, A09 | Docente | 2 | 3 | **6 Alto** | Mitigar: lista priorizada en docs/PENDIENTES_MANUALES.md con evidencia por paso (A.9.2.4, A.9.4.2, A.12.1.2, A.9.4.5) |
| R37 | **Incumplimiento de la Ley 21.719** (registro de tratamientos, evaluación de impacto, procedimiento de brechas, DPA y región sin formalizar) | Entra en vigor en diciembre de 2026; sin asesoría legal consultada | A01, A04 | Docente | 3 | 2 | **6 Alto** | Mitigar: revisión legal (C-28), textos de privacidad coherentes con el comportamiento (`tests/privacy.spec.js`), responsable configurable (A.18.1.1, A.18.1.4, A.15.1.2) |
| R38 | **Abuso del acceso excepcional del administrador** (leer datos de salud ajenos) | El rol puede leer una sesión con `admin_leer_sesion` | A01 | Docente | 3 | 1 | **3 Medio** | Mitigar: motivo escrito de 10 a 300 caracteres, TOTP de ≤ 5 min, evento `ADMIN_DATA_ACCESS` insertado antes de leer, solo `datos` sin señal, acceso visible para el titular (`mis_accesos_admin`) (A.9.4.1, A.12.4.3, A.18.1.4) |


#### 3.2.1 Riesgo residual tras las TANDAS 1 y 2 (valoración del equipo, pendiente de aceptación por el docente)

«Inicial» es el nivel de la tabla anterior; «Residual» es la valoración con los controles **implementados en el código** (no con los pendientes). Un residual **Alto** no se acepta sin decisión documentada de la dirección (`sgsi/metodologia_riesgos.md` §1).

| Riesgo | Inicial | Residual | Condición o motivo |
|---|---|---|---|
| R01 Acceso en equipo compartido | 9 Alto | 6 Alto | El cifrado local no protege frente a quien controle el equipo; depende de que se marque «equipo compartido» (marcado por defecto en pantallas de escritorio) |
| R02 Cambio de parámetros | 6 Alto | 3 Medio | Con nube, el servidor impone rol + `aal2` + TOTP reciente; sujeto a R28 |
| R10 Pérdida de datos locales | 4 Medio | 4 Medio | No hay restauración desde la nube en otro equipo |
| R11 Manipulación de auditoría | 4 Medio | 2 Bajo | Cadena de servidor probada solo en PGlite |
| R15 Fuga entre participantes | 6 Alto | 6 Alto | Hasta ejecutar `pruebas_rls.sql` con cuentas reales (R29); después se prevé 3 Medio |
| R16 Abuso del registro | 4 Medio | 4 Medio | CAPTCHA y SMTP propio sin configurar |
| R18 Transferencia internacional | 6 Alto | 4 Medio | Nube opcional, sin alias/nombre/notas; DPA y región por decidir |
| R22 Publicación de datos de salud | 6 Alto | 3 Medio | Consentimiento 2.0 exigido por el servidor; persiste R33 |
| R23 Credenciales de cuentas | 6 Alto | 6 Alto | Contraseñas filtradas y SMTP propio pendientes; política solo en el cliente |
| R24 Función pública | 6 Alto | 3 Medio | RPC sin acceso anónimo; falta prueba real |
| R25 Retención excesiva | 4 Medio | 4 Medio | Verificar `cron.job`; cuentas inactivas manual |
| R27 Cuenta privilegiada | 6 Alto | 3 Medio | Condicionado a verificar `amr` y a tener al menos 2 administradores |
| R28 a R38 | ver tabla | ver tabla | Riesgos nuevos; los Altos (R29, R31, R32, R33, R36, R37) requieren decisión de la dirección |

> **Riesgo residual principal:** en la parte solo-frontend, quien controle el equipo y las DevTools puede saltarse los controles del cliente (sección 5.0). Con la nube, la autorización real la impone RLS en el servidor. Riesgos residuales aceptados por el docente en `sgsi/plan_tratamiento_riesgos.md`.

### 3.3 Tratamiento de riesgos (6.1.3)

Opciones elegidas en la tabla anterior; los controles se compararon con el Anexo A completo (6.1.3 c) y el resultado es la **Declaración de Aplicabilidad** de la sección 8. El plan con responsables y plazos y la aceptación de los riesgos residuales (6.1.3 e–f) están en `sgsi/plan_tratamiento_riesgos.md`.

### 3.4 Objetivos de seguridad (6.2)

Doce objetivos (OBJ-1 a OBJ-12) con meta, responsable, plazo y método en `sgsi/objetivos_seguridad.md`. Los seis primeros se calculan automáticamente en **Administración → SGSI** (`src/services/security/isms.js:53`, `evaluateObjectives`) sobre la auditoría local; OBJ-7 a OBJ-12 se miden fuera de la app (CI, consultas de solo lectura a la nube, registros de Auth, actas) y están **pendientes de primera medición**.

---

## 4. Soporte (cláusula 7)

- **7.1 Recursos:** horas del equipo, cuentas gratuitas de Vercel y Supabase, laboratorio y sensores prestados.
- **7.2 Competencia:** los integrantes que administran o desarrollan deben haber leído este documento y la política; evidencia: registro de lectura en el acta del hito (`sgsi/auditoria_interna_y_revision.md`).
- **7.3 Concienciación:** la app exige al administrador **aceptar la política vigente** antes de operar (pestaña SGSI, evento `POLICY_ACCEPTED`, `src/stores/isms.js:108`); contenido educativo en **Aprende → Seguridad de la información** (`src/data/learn/informationSecurity.js`); avisos de clasificación y seguridad eléctrica en la UI.
- **7.4 Comunicación:** qué / cuándo / a quién / quién / cómo en `sgsi/roles_responsabilidades.md` §4 (incidentes: inmediato al responsable de seguridad y al docente; brechas con datos personales: evaluación de notificación a la autoridad según la Ley 21.719).
- **7.5 Información documentada:** documentos en `docs/` y `docs/sgsi/` con cabecera de versión, fecha y clasificación (7.5.2); control de cambios con git y CHANGELOG (`monitor-ecg-vue/CAMBIOS.md`) (7.5.3). La norma original (material con licencia AENOR) **no se copia** en el repositorio: se cita solo por número y nombre de control (información de origen externo, 7.5.3).

---

## 5. Operación (cláusula 8): requisitos de implementación del frontend

**8.1 Planificación y control operacional:** los requisitos `SEC-xx` siguientes son los procesos operativos que implementan el tratamiento de riesgos (8.3). Cada uno indica sus controles del Anexo A (2013) y un criterio verificable. **[M]** obligatorio, **[S]** recomendado. Los cambios se controlan según A.12.1.2/A.14.2.2 y los procesos externalizados (Vercel, Supabase) según A.15.

### 5.0 Limitaciones de un sistema con controles en el cliente (leer primero)

1. **La autenticación local (PIN) no es seguridad real frente a quien controla el equipo.** Todo el código del cliente puede inspeccionarse. El PIN **disuade** el uso indebido casual. Para la nube, la autenticación del administrador sí es real (Supabase Auth + RLS en el servidor).
2. **El cifrado en IndexedDB protege frente a la lectura casual de los archivos del navegador**, no frente a XSS, extensiones ni ante quien controla el equipo o copia el perfil del navegador (la clave convive en el mismo origen y es una sola para todos los espacios). La bóveda con frase está diferida (R31).
3. **Sin nube no hay respaldo central** ni auditoría inalterable: cada navegador es una isla. Con nube, la auditoría replicada no admite UPDATE/DELETE desde la app.
4. **Todo lo que está en el bundle es público**, incluidas las variables `VITE_*`: solo se usa la clave **publicable** de Supabase; la `service_role` nunca va al frontend.
5. **Transferencia a la nube:** solo con una cuenta y con «Guardar mis datos en la nube» activado (apagado por defecto), y solo al pulsar «Guardar monitoreo», los datos seudonimizados salen del equipo hacia Supabase (us-east-1, R18); los borradores, el alias, el nombre y las notas nunca salen. Se informa en `/privacidad`.

Estas limitaciones aparecen resumidas en `/privacidad` y en el README (transparencia, A.18.1.4).

### 5.1 Roles, router y control de acceso — A.9.1.1, A.9.2.3, A.9.4.1

- **SEC-01 [M]** Dos roles en `stores/auth.js`: `participant` (por defecto) y `admin`. Estado `{ role, adminSessionExpiresAt, failedAttempts, lockedUntil }`. *(A.9.1.1)*
- **SEC-02 [M]** Rutas `/admin/*` con `meta.requiresAdmin` y guard global (`src/router/guards.js:17`); `redirect` validado contra lista blanca de nombres de ruta (sin *open redirect*). *(A.9.4.1, A.14.1.2)*
- **SEC-03 [M]** **Doble verificación:** toda acción privilegiada de Pinia llama a `assertAdmin()` (`src/stores/auth.js:63`). No basta con ocultar botones. *(A.9.2.3)*
- **SEC-04 [M]** Vistas de administración con *lazy loading*. *(A.9.4.1)*
- **SEC-05 [M]** La vista multisensor muestra solo seudónimo, señal y BPM; nunca edad, peso ni actividad de otros. *(A.9.4.1, A.18.1.4)*

### 5.2 Autenticación del administrador — A.9.2.4, A.9.3.1, A.9.4.2, A.9.4.3, A.10.1.1

- **SEC-06 [M]** Primer uso `/admin/setup`: **sin PIN por defecto**; mínimo 8 caracteres; rechaza triviales (`src/services/security/pinHash.js:15`). *(A.9.2.4, A.9.4.3)*
- **SEC-07 [M]** Se guarda solo `{ v, alg: 'PBKDF2-SHA256', iter: 600000, salt, hash }` (`pinHash.js:7`). Nunca el PIN en claro, en logs ni en la URL. *(A.9.4.3, A.10.1.1)*
- **SEC-08 [M]** Comparación en tiempo constante (`pinHash.js:50`). *(A.9.4.2)*
- **SEC-09 [M]** Bloqueo tras **5** fallos: 5, 10, 20… máx. 60 min, persistente tras recargar; fallos y bloqueos auditados (`src/services/security/lockout.js:20`). *(A.9.4.2)*
- **SEC-10 [M]** Sesión con **10 min de inactividad** y **60 min máximo** en `sessionStorage` (`lockout.js:8`); botón "Cerrar sesión" visible. *(A.9.4.2, A.11.2.8)*
- **SEC-11 [M]** Reautenticación para borrar todo, exportar todo, cambiar el PIN (`src/stores/auth.js:135`). *(A.9.2.3)*
- **SEC-12 [S]** "Cambiar PIN" exige el actual; "Olvidé el PIN" solo restablece borrando todo. *(A.9.2.4, A.9.3.1)*

### 5.3 Identificación de participantes sin contraseña (RF01, RF02) — A.9.2.1, A.18.1.4

- **SEC-13 [M]** IDs `Usuario N` generados por el sistema + `crypto.randomUUID()`; alias validado `^[A-Za-z0-9 _-]{1,20}$` con aviso de no usar datos identificables. *(A.9.2.1)*
- **SEC-14 [M]** No se piden nombre, RUT, correo, teléfono, fecha de nacimiento ni fotos. *(A.18.1.4)*
- **SEC-15 [M]** La tabla seudónimo↔persona, si existe, se custodia fuera de la app (docente). *(A.18.1.4, A.8.2.3)*

### 5.4 Consentimiento, aviso de privacidad y minimización (RF03) — A.18.1.1, A.18.1.4

- **SEC-16 [M]** Modal de consentimiento (checkbox no premarcado, finalidad, dónde se guardan, retención, quién accede, retiro, no es dispositivo médico). Sin consentimiento, se mide sin datos opcionales.
- **SEC-17 [M]** Registro `{ userId, consentVersion, acceptedAt UTC, scope, otorgadoPor, canal, declaraMayorEdad, alcance }`; `CONSENT_VERSION = '2.0'` (`src/services/privacidad/consentimiento.js:8`); un consentimiento de otra versión se trata como no vigente (no se usan ni suben datos opcionales) y se vuelve a pedir.
- **SEC-18 [M]** Retirar el consentimiento borra de inmediato los datos opcionales (`src/stores/users.js:149`) y, con nube, el servidor devuelve a privado todo lo público del paciente (`tg_paciente_perfil`, `supabase/schema.sql:1775`).
- **SEC-19 [M]** Ruta pública `/privacidad` (responsable, finalidad, base legal, derechos según Ley 19.628/21.719, retención, nube y limitaciones). Enlace en el pie.
- **SEC-20 [M]** Minimización: edad por **rangos**; peso 30–250 kg; actividad de **lista cerrada**, sin texto libre.
- **SEC-21 [M]** Recordatorio de seguridad eléctrica antes de conectar. *(A.11.2.1)*

### 5.5 Clasificación y etiquetado visibles — A.8.2.1, A.8.2.2, A.8.2.3

- **SEC-22 [M]** `<DataClassBadge>` (`src/components/common/DataClassBadge.vue`) en medición, datos opcionales, exportación, auditoría, incidentes y política. *(A.8.2.2)*
- **SEC-23 [M]** Cada CSV comienza con `# CLASIFICACION: CONFIDENCIAL-SENSIBLE …` (`src/services/export/csvExporter.js:12`). *(A.8.2.2, A.8.2.3)*

### 5.6 Cifrado en reposo — A.10.1.1, A.10.1.2, A.18.1.5

- **SEC-24 [M]** `secureStorage` (`setItem/getItem/removeItem/wipe`); prohibido `localStorage` para datos Confidenciales o superiores. *(A.10.1.1)*
- **SEC-25 [M]** **AES-GCM 256**, IV aleatorio de 12 bytes por cifrado, `additionalData` = nombre de la clave (`src/services/storage/secureStorage.js:47`). *(A.10.1.1)*
- **SEC-26 [M]** `CryptoKey` **no extraíble** en IndexedDB (`secureStorage.js:27`). *(A.10.1.2)*
- **SEC-27 [M]** Fallo seguro: descifrado fallido ⇒ descarte, aviso e `INTEGRITY_ERROR` (`src/main.js:27`). *(A.12.4.1, A.16.1.2)*
- **SEC-28 [M]** Se cifran mediciones, perfiles, consentimientos, configuración e incidentes. *(A.10.1.1)*
- **SEC-29 [S]** Señales largas en bloques cifrados de 2 s en IndexedDB. *(A.12.1.3)*

### 5.7 Retención y borrado — A.8.3.2, A.11.2.7, A.18.1.4

- **SEC-30 [M]** «Eliminar mis datos» del participante (local y, con nube, `borrar_mis_datos()`, `supabase/schema.sql:1678`, con contraseña en el cliente) con `USER_DATA_DELETED` sin datos personales (`src/stores/users.js:198`). Los borrados y el retiro del consentimiento se propagan aunque la nube esté apagada.
- **SEC-31 [M]** "Borrar todos los datos" (admin + reautenticación): datos, **clave AES** (*crypto-shredding*, `secureStorage.js:91`) y sesiones en la nube (`src/services/storage/wipe.js:15`).
- **SEC-32 [M]** Retención: local según el administrador (30 días por defecto, máx. 180), `RETENTION_PURGE` al iniciar y al abrir el espacio de una cuenta (`src/main.js:43`); nube **365 días desde el inicio del monitoreo** (`purgar_sesiones(365)`, `supabase/schema.sql:1192`, tarea `purga-ecg` creada por `migracion_endurecimiento.sql`; verificar con `select jobname from cron.job`); auditoría de la nube 2 años (`purgar_auditoria(730)`, tarea `purga-auditoria`, `schema.sql:1710`). Cuentas inactivas 24 meses: aviso y eliminación **manual** (sin automatizar). Las copias de respaldo del proveedor pueden conservar datos ya borrados durante su propia ventana.
- **SEC-33 [M]** Buffers en memoria vaciados al desconectar o cambiar de usuario.

### 5.8 Validación de entradas — A.14.1.3, A.14.2.5, A.12.2.1

- **SEC-34 [M]** Parser serial estricto (`src/services/parsing/ecgCsvParser.js`): línea ≤ 64 caracteres, buffer ≤ 1024, regex completa, rangos (`ecg_raw` 0–1023, `leads_off` 0/1, `bpm` 0–300), `t_ms` monótono (`DEVICE_RESET`), líneas inválidas contadas y `SERIAL_INVALID_DATA` una vez por sesión.
- **SEC-35 [M]** `baudRate` 115200 fijo; `requestPort()` solo tras gesto del usuario (`src/services/sources/SerialSource.js:58`).
- **SEC-36 [M]** Formularios validados en la UI **y** en la acción de Pinia (`src/data/defaultSettings.js:47`); en la nube, `CHECK` en el esquema.
- **SEC-37 [M]** CSV de referencia: solo `.csv`, ≤ 5 MB, validado fila a fila (`src/services/export/csvImporter.js`).

### 5.9 Registro de auditoría — A.12.4.1, A.12.4.2, A.12.4.3, A.12.4.4, A.16.1.7, A.18.1.3

- **SEC-38 [M]** `auditLog` en IndexedDB, solo inserción, `hash = SHA-256(JSON canónico + prevHash)` (`src/services/audit/auditLog.js`). Réplica en Supabase `auditoria` sin UPDATE/DELETE.
- **SEC-39 [M]** Eventos mínimos (la lista completa vive en `AUDIT_EVENTS`, `src/services/audit/auditLog.js`, y en `tipos_evento`): `ADMIN_SETUP`, `ADMIN_LOGIN_OK/FAIL`, `ADMIN_LOCKED`, `ADMIN_LOGOUT`, `ADMIN_SESSION_EXPIRED`, `ADMIN_PIN_CHANGED`, `PARAM_CHANGED`, `USER_CREATED`, `CONSENT_GIVEN/WITHDRAWN`, `USER_DATA_DELETED`, `ALL_DATA_WIPED`, `RETENTION_PURGE`, `EXPORT_CSV`, `SERIAL_*`, `DEVICE_RESET`, `INTEGRITY_ERROR`, `AUDIT_EXPORTED`, `CLOUD_ADMIN_LOGIN/LOGOUT` y, nuevos con la alineación 2013: `INCIDENT_REPORTED`, `INCIDENT_UPDATED`, `POLICY_ACCEPTED`, `ACCESS_REVIEW_DONE`, `CLOCK_SKEW`.
- **SEC-40 [M]** Prohibido registrar ECG, BPM, edad, peso, PIN o hashes (`src/services/audit/auditLog.js:57`, `sanitizeDetails`).
- **SEC-41 [M]** `/admin/auditoria`: filtro, verificación de la cadena al abrir, exportación JSON; marcas **UTC ISO-8601** con hora local visible (A.12.4.4).
- **SEC-42 [M]** Rotación 5000 entradas / 180 días con ancla (`auditLog.js:133`).

### 5.10 Exportación CSV segura — A.13.2.1, A.8.2.3, A.8.3.1

- **SEC-43 [M]** Participante: solo lo suyo; admin: todo con reautenticación. *(A.9.4.1)*
- **SEC-44 [M]** Exportación **seudonimizada** por defecto; opcionales solo con consentimiento y marca explícita. *(A.18.1.4)*
- **SEC-45 [M]** Diálogo de advertencia previo (`ExportWarningDialog.vue`). *(A.8.2.3)*
- **SEC-46 [M]** Neutralización de inyección de fórmulas CSV (`=`, `+`, `-`, `@`, tab, CR). *(A.14.1.3)*
- **SEC-47 [M]** Nombre de archivo sin datos personales; `EXPORT_CSV` auditado. *(A.12.4.1)*

### 5.11 Cabeceras y despliegue — A.13.1.1, A.13.1.2, A.14.1.2, A.15.1.1

- **SEC-48 [M]** `monitor-ecg-vue/vercel.json`: CSP (`default-src 'self'`, `connect-src` limitado al proyecto Supabase, `frame-ancestors 'none'`), `nosniff`, `X-Frame-Options DENY`, `Referrer-Policy no-referrer`, Permissions-Policy con `serial=(self)`, HSTS, COOP y CORP (`vercel.json:11`).
- **SEC-49 [M]** Verificación en el despliegue con `curl -I` y securityheaders.com (objetivo A). *(A.18.2.3)*
- **SEC-50 [M]** MFA en Vercel, GitHub y **Supabase**; previews protegidos; sin analítica de terceros. *(A.9.2.4, A.15.1.1)*

### 5.12 Dependencias, build y desarrollo seguro — A.14.2.1, A.14.2.4, A.14.2.6, A.14.2.8, A.14.3.1, A.12.6.1, A.9.4.5

- **SEC-51 [M]** Sin CDN externos (uPlot por npm, sin fuentes remotas). *(A.15.1.3)*
- **SEC-52 [M]** Lockfile, `npm ci`, `npm audit --audit-level=high`, Dependabot (**implementados**: `.github/workflows/ci.yml` y `.github/dependabot.yml` en `monitor-ecg-vue/`). *(A.12.6.1, A.14.2.4)*
- **SEC-53 [M]** Prohibido `v-html`, `innerHTML`, `eval`, `new Function`…; ESLint `vue/no-v-html`, `eslint-plugin-security` (`eslint.config.js:35`). *(A.14.2.1, A.14.2.5)*
- **SEC-54 [M]** Sin source maps y sin `console` en producción (`vite.config.js:44`). *(A.14.2.6, A.13.2.1)*
- **SEC-55 [M]** Sin secretos en el repositorio; `.env*` ignorado; solo clave publicable de Supabase (`src/services/cloud/supabaseClient.js`). *(A.9.4.5, A.10.1.2)*
- **SEC-56 [M]** Sin datos reales en desarrollo: simulador y referencia sintética. *(A.14.3.1)*
- **SEC-57 [M]** Pruebas Vitest de parser, cifrado, PBKDF2, bloqueo, sesión, redirect, CSV, auditoría y, desde la v2.0, incidentes, revisión de accesos, reloj e indicadores (`tests/isms.spec.js`). *(A.14.2.8, A.14.2.9)*
- **SEC-58 [M]** CI y Dependabot implementados; **falta la protección de la rama `main`** (acción manual en GitHub: PR con revisión y comprobaciones obligatorias) y producción solo desde `main`. *(A.12.1.4, A.14.2.2, A.6.1.2)*

### 5.13 Disponibilidad y continuidad (RNF05) — A.17.1.2, A.17.2.1, A.12.1.3, A.12.3.1

- **SEC-59 [M]** Detección de desconexión del puerto: "Señal perdida", `SERIAL_LOST`, datos conservados. *(A.17.1.2)*
- **SEC-60 [M]** Buffers circulares fijos y máximo de **5 sensores** (`src/stores/channels.js:50`). *(A.12.1.3)*
- **SEC-61 [S]** `navigator.storage.estimate()` con aviso al 80 % y `persist()` (`src/main.js:49`). *(A.12.1.3)*
- **SEC-62 [S]** PWA con service worker escrito a mano (`public/sw.js`): app shell en caché (precache de `/`, `index.html`, manifiesto e iconos; `/assets/*` cache-first; navegación network-first con respaldo a `index.html`); no intercepta otros orígenes ni métodos distintos de GET. **Cubre:** abrir la app y trabajar con datos locales sin conexión. **No cubre:** la nube (Supabase), la sincronización ni la lista pública de la comunidad sin red. *(A.17.2.1)* Prueba: `e2e/pwa.spec.js`.

### 5.14 Requisitos nuevos de la alineación 2013 (funcionalidad del SGSI en la app)

| ID | Requisito | Control | Evidencia |
|---|---|---|---|
| SEC-63 [M] | Política de seguridad y uso aceptable visible en `/seguridad` | A.5.1.1, A.8.1.3 | `src/views/SecurityView.vue`, `src/data/securityPolicy.js` |
| SEC-64 [M] | El admin acepta la política vigente antes de operar (auditado) | A.7.2.2, 7.3 | `src/stores/isms.js:108`, `src/services/security/isms.js:17` |
| SEC-65 [M] | Notificación de eventos y puntos débiles por cualquier usuario, sin datos personales ni de salud, cifrada local y en la tabla `incidentes` con RLS | A.16.1.2, A.16.1.3 | `src/services/security/incidents.js:48`, `src/stores/isms.js:74`, `supabase/schema.sql` |
| SEC-66 [M] | Evaluación, respuesta y cierre con lección aprendida (solo admin) | A.16.1.4–A.16.1.6 | `incidents.js:88`, `src/components/admin/IsmsPanel.vue` |
| SEC-67 [M] | Revisión periódica (90 días) de derechos de acceso con registro | A.9.2.5 | `isms.js:22`, `stores/isms.js:116` |
| SEC-68 [S] | Comparación del reloj con `hora_servidor()` y evento `CLOCK_SKEW` | A.12.4.4 | `isms.js:34`, `src/services/cloud/cloudSync.js:288` |
| SEC-69 [M] | Indicadores de seguridad y objetivos en el panel admin | 9.1, 6.2 | `isms.js:53` (`computeSecurityMetrics`, `evaluateObjectives`) |

### 5.14b Cuentas, pacientes propios y publicación de monitoreos — A.9.2.x, A.9.4.x, A.13.2.x, A.18.1.4

**Riesgo nuevo R-PUB (publicación de datos de salud).** Un usuario podría publicar un monitoreo con datos que identifiquen a una persona, o publicarlo sin su consentimiento. Valoración inherente: alta (dato de salud, divulgación irreversible en la práctica). Tratamiento: visibilidad privada por defecto; casilla de consentimiento explícita no premarcada; publicación solo anónima (funciones RPC `listar_monitoreos_publicos`/`monitoreo_publico`, riesgos R22 y R24: sin etiqueta, alias, nombre, nota ni propietario); datos del paciente solo con segunda casilla y consentimiento vigente; retiro inmediato y registrado; lectura solo para cuentas autenticadas (nunca anon). Riesgo residual: medio (copia previa por terceros que ya vieron el dato).

- **SEC-70 (A.9.2.1, A.9.2.2, A.9.4.2).** Cuentas con Supabase Auth, contraseña ≥ 10 con letras y números, confirmación por correo, mensajes genéricos y límite de intentos en el cliente (servidor: rate limits de Auth).
- **SEC-71 (A.9.1.1, A.9.4.1).** Pacientes propiedad de la cuenta con RLS (`propietario = (select auth.uid())`); el administrador no tiene política sobre `pacientes` (decisión de minimización).
- **SEC-72 (A.13.2.1, A.18.1.4).** Visibilidad `privado`/`publico`; `sesiones` y `bloques_muestras` solo las lee su propietario (la política pública de bloques y `sesion_es_publica()` se eliminaron); lo público sale **solo** por las RPC `listar_monitoreos_publicos`, `monitoreo_publico` y `senal_publica` (`supabase/schema.sql:1268`, `:1310`, `:1349`): solo cuentas registradas (no anónimas), fecha truncada al día, duración en lugar de `fin`, máx. 60 bloques por llamada.
- **SEC-73 (A.18.1.4).** El perfil del paciente solo se publica con `compartir_perfil`; retirar el consentimiento lo retira de los monitoreos (trigger `tg_paciente_perfil`).
- **SEC-74 (A.11.2.7, A.8.3.2).** Datos locales por espacio de cuenta; al cerrar sesión en «equipo compartido» se quita el espacio local de la cuenta sin preguntar, en equipo personal se pregunta (`src/stores/account.js:214`, `src/services/cloud/almacenSesion.js:77` para los tokens).
- **SEC-75 (A.12.4.1).** Auditoría de `ACCOUNT_*`, `PATIENT_*`, `VISIBILITY_CHANGED`, `LOCAL_DATA_LINKED` y, desde las TANDAS 1-2, `ACCOUNT_PASSWORD_CHANGED`, `ADMIN_DATA_ACCESS`, `CONTENT_REPORTED`, `CONTENT_REPORT_REVIEWED`, `CONTENT_REMOVED`, `CLOUD_SYNC_CHANGED`, `SESSION_IDLE_TIMEOUT` e `ISMS_EVIDENCE_RECORDED` (sin correos ni datos de salud), todos en la tabla `tipos_evento` (única lista blanca del servidor).
- **SEC-76 (A.18.1.4).** Supresión: `borrar_mis_datos()` incluye pacientes; `eliminar_mi_cuenta()` elimina cuenta y datos.

### 5.14c Administrador con cuenta y segundo factor (TOTP) — A.9.2.3, A.9.2.4, A.9.2.5, A.9.2.6, A.9.4.2

Con la nube activa el administrador **es una cuenta normal** (se entra en `/acceso`) con rol asignado y TOTP; el PIN local deja de intervenir. Sin nube, el administrador local con PIN sigue siendo el único mecanismo (limitación en `sgsi/control_acceso.md`).

- **SEC-77 [M] (A.9.2.3, A.9.4.2).** `public.es_admin_registrado()` (rol asignado, solo para mostrar el botón Admin) separada de `public.es_admin()` (rol **y** `aal2` **y** TOTP de ≤ 15 min en la claim `amr`: `totp_reciente(900)`, `supabase/schema.sql:623`, `:645`), ambas `security definer`, `search_path` fijo, `REVOKE` a `anon`. Las políticas RLS usan `es_admin()`; las acciones sensibles usan `es_admin_reciente(300)` (`:660`). Sin segundo factor reciente no hay privilegios. **No verificado con un JWT real** (R28).
- **SEC-78 [M] (A.9.4.2).** TOTP con `supabase.auth.mfa` (inscripción con QR como SVG data-URI en `<img>`, sin HTML crudo; verificación; subida a `aal2`), vista `/admin/mfa`, guard `requireAdmin` (cuenta + rol + `aal2`), límite de 5 intentos/10 min en el cliente y mensajes genéricos (`src/services/security/adminMfa.js`, `src/views/admin/AdminMfaView.vue`, `src/router/guards.js`).
- **SEC-79 [M] (A.9.2.3).** `administradores` no admite escritura directa (`revoke insert, update, delete` a `anon`/`authenticated`): el rol solo cambia con `admin_conceder_rol(correo)` y `admin_retirar_rol(id)` (pestaña Administradores, ver SEC-83) o, como contingencia, por SQL del dueño del proyecto. `/admin/acceso` y `/admin/setup` redirigen a `/acceso` cuando la nube está activa (`redirect` en lista blanca).
- **SEC-80 [M] (A.9.2.4).** Recuperación formal: el restablecimiento por correo no concede privilegios (sin TOTP no hay `aal2`); la pérdida del factor se resuelve con `sgsi/recuperacion_acceso_admin.md` (identidad por canal distinto, aprobación de otra persona, ejecución por el dueño del proyecto, registro y revisión posterior). Aviso en `/recuperar`.
- **SEC-81 [M] (A.9.2.5, A.9.2.6).** `public.admin_listar_administradores()` (solo `es_admin()`, devuelve id, correo y fecha) alimenta Administración → Administradores y SGSI → Revisión de derechos (`ACCESS_REVIEW_DONE`, botón "Registrar revisión"); el retiro del rol es inmediato en el servidor; mínimo dos administradores recomendado.
- **SEC-82 [M] (A.9.4.2, A.12.4.1).** Sesión privilegiada de 15 min de inactividad (máx. 60), cerrar la cuenta o salir del modo admin la cierra y exige un código nuevo; reautenticación TOTP en borrado total, exportación global y cambio de retención; eventos `ADMIN_ACCOUNT_LOGIN`, `ADMIN_MFA_ENROLLED`, `ADMIN_MFA_VERIFIED`, `ADMIN_MFA_FAILED`, `ADMIN_ROLE_GRANTED`, `ADMIN_ROLE_REVOKED`, `ADMIN_RECOVERY_REQUESTED` en la lista blanca de cliente y servidor (los tres últimos se anotan al registrar concesiones, retiros y recuperaciones).
- **SEC-83 [M] (A.9.2.3, A.9.2.6, A.12.4.1).** Gestión de administradores desde la app (`supabase/migracion_admin_roles.sql`, `src/components/admin/AdminRolesPanel.vue`, `src/stores/admin.js`): `admin_conceder_rol` y `admin_retirar_rol` son `security definer`, `search_path` fijo, `REVOKE` a `anon`, exigen `es_admin()` (rol + `aal2`) y bloquean la tabla para respetar el **máximo de 5 administradores**; la concesión normaliza el correo (minúsculas, formato, ≤ 254), exige cuenta existente con `email_confirmed_at` y responde con un mensaje **genérico** (no revela si el correo existe); el retiro no permite retirarse a uno mismo ni dejar menos de 1 administrador. Cada acción pide un **código TOTP nuevo** (SEC-11) y el retiro, además, confirmación explícita. Auditoría `ADMIN_ROLE_GRANTED` / `ADMIN_ROLE_REVOKED` registrada por el servidor (detalle `{objetivo, por}`, sin correos); el cliente conserva su copia en el log local y ya no la envía a la nube (se quitó el doble registro). Desde la TANDA 1 la concesión y el retiro exigen `es_admin_reciente(300)` (TOTP de ≤ 5 min).
- **SEC-84 [M] (A.9.2.3, A.12.1.2).** Los parámetros globales (rangos y sincronización) los guarda el administrador con `aal2` y se publican en la nube (`parametros`, RLS `es_admin()`); antes de publicar se vuelve a consultar `es_admin()` y el aviso indica si se publicó o no. El PIN local no interviene con nube (`src/stores/settings.js`, `src/services/cloud/cloudSync.js`).
- **Limitación.** Un token `aal2` ya emitido sigue siendo válido para `es_admin()` mientras su último TOTP tenga ≤ 15 min (≤ 5 min para acciones sensibles) y no haya expirado; la retirada del rol sí es inmediata. Si el claim `amr` no trajera una entrada `totp` reciente, ningún administrador tendría privilegios: contingencia por SQL del dueño (`sgsi/recuperacion_acceso_admin.md`).
- **Limitación.** Un monitoreo público ya visto o descargado por otra cuenta no puede "des-publicarse" en el equipo de esa persona.

### 5.14d Requisitos de las TANDAS 1 y 2 (auditoría `AUDITORIA_SISTEMA.md`)

Origen: `CAMBIOS_TANDA1.md` (servidor) y `CAMBIOS_TANDA2.md` (privacidad en la app). «Estado» es el real: **I** = implementado y con pruebas (simuladas), **P** = parcial.

| ID | Requisito | Control | Evidencia | Estado |
|---|---|---|---|---|
| SEC-85 [M] | Lo público solo por RPC a cuentas registradas: fecha truncada, duración, sin propietario ni etiqueta; sin lectura directa de bloques | A.9.4.1, A.13.2.1, A.18.1.4 | `supabase/schema.sql:1268`, `:1310`, `:1349`; `src/services/cloud/cloudSync.js:375` | I |
| SEC-86 [M] | Moderación: reporte (3-200 caracteres, 5 al día), revisión y retiro con motivo; una sesión retirada no vuelve a `publico` | A.16.1.2, A.13.2.1 | `schema.sql:1387`, `:1445`, `:1232`; `src/components/community/CommunityPicker.vue`, `src/components/admin/SoportePanel.vue` | I |
| SEC-87 [M] | El privilegio del administrador caduca en el servidor: `es_admin()` con TOTP ≤ 15 min, `es_admin_reciente(300)`, renovación de TOTP en el cliente, cierre de otras sesiones al cambiar la contraseña | A.9.2.3, A.9.4.2 | `schema.sql:623-672`; `src/services/security/adminTotp.js:13`, `adminRenovacion.js:26`; `src/services/accounts/authService.js:98` | P (claim `amr` sin verificar) |
| SEC-88 [M] | El administrador no tiene lectura masiva: acceso excepcional `admin_leer_sesion(id, motivo)`, auditado antes de leer y visible para el titular | A.9.4.1, A.12.4.3, A.18.1.4 | `schema.sql:1522`, `:1556`; `src/services/security/soporte.js:16`; `src/components/account/AccesosAdminAviso.vue` | I |
| SEC-89 [M] | Auditoría de nube confiable: `registrar_evento` con actor y hora del servidor, `tipos_evento` como única lista blanca, hash encadenado, `verificar_cadena_auditoria()`, purga a 2 años, cola persistente con reintentos | A.12.4.1, A.12.4.2, A.12.4.3 | `schema.sql:758`, `:810`, `:865`, `:921`, `:954`; `src/services/cloud/auditOutbox.js:43`; `src/views/admin/AuditView.vue` | P (sin anclaje externo ni eventos de fallo) |
| SEC-90 [M] | Incidentes de extremo a extremo: alta restringida, trigger de privacidad, ciclo validado en servidor, el reportante ve estado y respuesta | A.16.1.2 a A.16.1.6 | `schema.sql:1590`, `:1625`; `src/components/security/MisIncidentes.vue`; `tests/incidentesNube.spec.js` | I |
| SEC-91 [M] | Hora y cuotas del servidor: `creado_en`, CHECK de `inicio`, topes por bloque (32 KB), sesión (25 MB), cuenta (50 MB), 1000 sesiones y 200 pacientes; error `ECG01` | A.12.1.3, A.12.4.4 | `schema.sql:576`, `:984`, `:1028`, `:1052` | I (concurrencia no probada) |
| SEC-92 [M] | Etiquetas «Paciente N» únicas por cuenta (regex corregidas, índice único, reintento ante `23505`) | A.14.1.3 | `src/services/users/etiquetas.js`; `schema.sql:1670`; `tests/etiquetas.spec.js` | I |
| SEC-93 [M] | La nube es opcional por cuenta y apagada por defecto; los borradores nunca se suben; se sube solo al «Guardar» | A.18.1.4, A.13.2.1 | `src/services/cloud/nubeOptIn.js:30`, `subidaMonitoreo.js:23`; `e2e/privacidad.nube.spec.js` | I |
| SEC-94 [M] | Minimización: alias, nombre, notas, parámetros, eventos y `fuente.info` no se suben (cliente y limpieza en servidor); alias con heurística de rechazo de nombres | A.18.1.4 | `src/services/cloud/datosNube.js:26`; `src/services/privacidad/alias.js:7`; `schema.sql:1738` | I |
| SEC-95 [M] | Sesión de cuenta: «equipo compartido» (token en `sessionStorage`) y cierre por inactividad de 15 min con aviso | A.9.4.2, A.11.2.8 | `src/services/cloud/almacenSesion.js:55`; `src/services/security/inactividad.js:5`; `src/App.vue:16` | P (*time-box* de Supabase pendiente) |
| SEC-96 [M] | Reautenticación con contraseña actual (cliente, ventana de 5 min) y política de contraseñas | A.9.4.3, A.9.2.4 | `src/services/security/reauth.js:5`; `src/services/accounts/validation.js:5`; `authService.js:108` | P (no impuesta por el servidor) |
| SEC-97 [M] | Vincular datos locales solo con selección explícita por paciente y confirmación | A.9.4.1, A.8.2.3 | `src/services/accounts/linkLocal.js:29`, `:84` | I |
| SEC-98 [M] | El service worker solo cachea estáticos de la app, nunca datos, respuestas `no-store/private` ni URLs con `code/token` | A.13.2.1, A.18.1.4 | `public/sw.js:10` | I |
| SEC-99 [M] | Consentimiento 2.0, consentimiento de publicación por monitoreo y declaración de mayoría de edad exigidos por el servidor | A.18.1.1, A.18.1.4 | `schema.sql:1807`; `src/services/privacidad/consentimiento.js:8`, `:52` | I |
| SEC-100 [S] | Registro de evidencias del SGSI (auditoría interna 9.2, revisión por la dirección 9.3) con fecha y responsable; no guarda resultados | 9.2, 9.3, A.18.2.2 | `src/services/security/evidencias.js:13`; `src/stores/isms.js:127` | I (las actas están pendientes de ejecución) |
| SEC-101 [M] | Responsable del tratamiento configurable (`VITE_RESPONSABLE_NOMBRE`, `VITE_RESPONSABLE_CORREO`); si faltan, el aviso lo dice | A.18.1.1 | `src/services/privacidad/responsable.js:8` | P (variables por definir en Vercel) |
| SEC-102 [M] | Los textos de privacidad leen de un único origen de hechos y una prueba vigila frases falsas | A.18.1.4, A.18.2.2 | `src/data/privacidad.js`; `tests/privacy.spec.js` | I |

### 5.15 Lista de verificación de aceptación (QA, A.14.2.9)

- [ ] `/admin/*` redirige al login sin sesión; las acciones privilegiadas lanzan error sin sesión.
- [ ] El PIN no aparece en claro en ningún almacenamiento; 5 fallos ⇒ bloqueo persistente.
- [ ] La sesión de admin expira a los 10 min y al cerrar la pestaña.
- [ ] IndexedDB con datos de salud solo contiene `{v, iv, ct}`.
- [ ] Sin consentimiento no hay datos opcionales; retirarlo los borra.
- [ ] "Eliminar mis datos", "Borrar todo" y la purga por retención funcionan (también en la nube).
- [ ] El parser rechaza `1023x`, `1024`, `-1`, `leads_off=2`, `bpm=301` y líneas > 64 caracteres.
- [ ] La auditoría detecta una entrada alterada ("ROTA en #n").
- [ ] Sin `v-html`; sin peticiones a dominios externos salvo el proyecto Supabase.
- [ ] Cabeceras de `vercel.json` presentes y Web Serial funcional.
- [ ] CSV con línea de clasificación, seudonimizado y fórmulas neutralizadas.
- [ ] Con dos cuentas A y B (`supabase/pruebas_rls.sql` y prueba manual), B no lee nada de A, ni siquiera lo público por consulta directa; el administrador tampoco (solo `admin_leer_sesion` con motivo). **Pendiente en el proyecto real.**
- [ ] `/seguridad` visible; un participante puede notificar un incidente; el admin lo cierra solo con respuesta y lección.
- [ ] El panel SGSI muestra indicadores, objetivos, revisión de accesos y reloj.
- [ ] Con nube: sin rol de administrador no aparece el botón Admin; con rol pero sin TOTP, `/admin` lleva a `/admin/mfa`; sin `aal2` las consultas privilegiadas (p. ej. `admin_listar_administradores()`) fallan en el servidor.
- [ ] `/admin/acceso` redirige a `/acceso` con la nube activa; el restablecimiento por correo no da acceso al panel.
- [ ] Caso 0: tras ingresar el TOTP el JWT trae una entrada `totp` reciente en `amr`; con un TOTP de más de 15 min el panel pide un código nuevo. **Pendiente.**
- [ ] Sin pulsar «Guardar» no sale ninguna petición a `sesiones`/`bloques_muestras`; con la nube apagada no se sube nada (`e2e/privacidad.nube.spec.js`).
- [ ] Un monitoreo no puede pasar a `publico` sin consentimiento de publicación 2.0 ni declaración del paciente (error 22023).
- [ ] `select jobname from cron.job` lista `purga-ecg` y `purga-auditoria`. **Pendiente de verificar en el proyecto real.**
- [ ] El esquema `respaldo_20261020` se eliminó tras validar. **Pendiente.**

---

## 6. Evaluación del desempeño (cláusula 9)

- **9.1 Seguimiento y medición:** indicadores automáticos en **Administración → SGSI** (inicios fallidos y bloqueos en 30 días, integridad de la auditoría, incidentes abiertos y de severidad alta, exportaciones, desfase del reloj, revisión de accesos, aceptación de la política) y manuales (resultado de `npm test`, `npm audit`, nota de securityheaders.com, checklist 5.15). Qué, cómo, cuándo y quién: `sgsi/objetivos_seguridad.md` §3.
- **9.2 Auditoría interna:** programa por hito, con auditor de otro grupo para objetividad; plantilla en `sgsi/auditoria_interna_y_revision.md` §1. **Estado: no ejecutada** (AI-01 pendiente); `AUDITORIA_SISTEMA.md` es la entrada propuesta, no un acta firmada.
- **9.3 Revisión por la dirección:** el docente revisa al cierre de cada hito con las entradas 9.3 a)–f); plantilla de acta en `sgsi/auditoria_interna_y_revision.md` §2. **Estado: no ejecutada** (RD-01 pendiente); la app solo permite registrar que se hizo (SEC-100).

## 7. Mejora (cláusula 10)

- **10.1 No conformidad y acción correctiva:** registro con causa raíz, corrección, acción correctiva y verificación de eficacia en `sgsi/registro_no_conformidades.md` (incluye las NC detectadas en esta alineación y en la auditoría de sistema: NC-01 a NC-18).
- **10.2 Mejora continua:** las oportunidades de mejora de la revisión por la dirección y las lecciones de incidentes (A.16.1.6) alimentan el backlog.

---

## 8. Declaración de Aplicabilidad (SoA) — Anexo A de ISO/IEC 27001:2013 (114 controles)

Leyenda. **Aplica:** Sí / Parcial (aplica con alcance reducido) / No (excluido, con justificación). **Estado:** Implementado (existe en código/SQL con pruebas automáticas; nunca si depende de verificación o configuración manual en el entorno real) · Documentado (control organizativo con procedimiento escrito, sin ejecución verificable) · Parcial · Pendiente · N/A. Las evidencias de código usan `archivo:línea` relativos a `monitor-ecg-vue/` salvo `supabase/` y `docs/`.

### A.5 Políticas de seguridad de la información

| Control | Nombre | Aplica | Justificación | Estado | Evidencia |
|---|---|---|---|---|---|
| A.5.1.1 | Políticas para la seguridad de la información | Sí | Exigida por 5.2; marco para RNF06 | Implementado | `docs/sgsi/politica_seguridad.md`; `/seguridad` (`src/views/SecurityView.vue`) |
| A.5.1.2 | Revisión de las políticas para la seguridad de la información | Sí | Cambios de arquitectura (nube) obligan a revisar | Documentado | Revisión por hito, `sgsi/auditoria_interna_y_revision.md`; `POLICY_VERSION` (`src/services/security/isms.js:11`) |

### A.6 Organización de la seguridad de la información

| Control | Nombre | Aplica | Justificación | Estado | Evidencia |
|---|---|---|---|---|---|
| A.6.1.1 | Roles y responsabilidades en seguridad de la información | Sí | Distinguir docente, responsable, admin, participante, desarrollador | Documentado | `sgsi/roles_responsabilidades.md`; tabla de roles en `/seguridad` |
| A.6.1.2 | Segregación de tareas | Parcial | Equipo pequeño | Parcial | Participante no configura; admin no aprueba su propio PR (`SEC-58`, protección de rama pendiente); auditor interno de otro grupo (no designado) |
| A.6.1.3 | Contacto con las autoridades | Parcial | Ley 21.719 puede exigir notificar brechas | Documentado | `sgsi/procedimiento_incidentes.md` §5 (Agencia de Protección de Datos Personales, CSIRT de Gobierno) |
| A.6.1.4 | Contacto con grupos de interés especial | Parcial | Avisos de vulnerabilidades del ecosistema | Documentado | GitHub Security Advisories, avisos de Supabase/Vercel (`sgsi/roles_responsabilidades.md`) |
| A.6.1.5 | Seguridad de la información en la gestión de proyectos | Sí | Seguridad desde el inicio del proyecto | Implementado | Requisitos SEC en el backlog (sección 5) |
| A.6.2.1 | Política de dispositivos móviles | Parcial | UI mobile-first; tablets/portátiles en el laboratorio | Documentado | `sgsi/uso_aceptable_y_clasificacion.md` §2 (bloqueo de pantalla, sin perfiles compartidos) |
| A.6.2.2 | Teletrabajo | Parcial | Desarrollo remoto del equipo | Documentado | Sin datos reales fuera del laboratorio (`SEC-56`); MFA en cuentas (`SEC-50`) |

### A.7 Seguridad relativa a los recursos humanos

| Control | Nombre | Aplica | Justificación | Estado | Evidencia |
|---|---|---|---|---|---|
| A.7.1.1 | Investigación de antecedentes | No | Equipo estudiantil, sin contratación | N/A | — |
| A.7.1.2 | Términos y condiciones del empleo | No | Sin relación laboral; el compromiso de confidencialidad se cubre en A.13.2.4 | N/A | — |
| A.7.2.1 | Responsabilidades de gestión | Sí | El docente exige aplicar la política | Documentado | `sgsi/roles_responsabilidades.md` |
| A.7.2.2 | Concienciación, educación y capacitación en seguridad de la información | Sí | Administrador y equipo manejan datos de salud | Implementado | Aceptación de política en la app (`src/stores/isms.js:108`); Aprende → Seguridad de la información (`src/data/learn/informationSecurity.js`) |
| A.7.2.3 | Proceso disciplinario | No | Lo cubre el reglamento universitario | N/A | Referencia en la política §6 |
| A.7.3.1 | Responsabilidades ante la finalización o cambio | Parcial | Fin de semestre o cambio de administrador | Documentado | Rotar PIN, revocar admin en `administradores`, borrar datos locales (`sgsi/control_acceso.md` §5) |

### A.8 Gestión de activos

| Control | Nombre | Aplica | Justificación | Estado | Evidencia |
|---|---|---|---|---|---|
| A.8.1.1 | Inventario de activos | Sí | Base del análisis de riesgos | Implementado | Tabla 1.4 (A01–A17) |
| A.8.1.2 | Propiedad de los activos | Sí | Cada activo con dueño | Implementado | Columna "Propietario" de la tabla 1.4 |
| A.8.1.3 | Uso aceptable de los activos | Sí | Datos de salud y equipos compartidos | Implementado | `sgsi/uso_aceptable_y_clasificacion.md`; `/seguridad` (`src/data/securityPolicy.js`) |
| A.8.1.4 | Devolución de activos | Parcial | Sensores prestados por el laboratorio | Documentado | Registro de préstamo (`sgsi/uso_aceptable_y_clasificacion.md` §5) |
| A.8.2.1 | Clasificación de la información | Sí | Datos sensibles junto a públicos | Implementado | Esquema de 4 niveles; tabla 1.4 |
| A.8.2.2 | Etiquetado de la información | Sí | El usuario debe ver qué es sensible | Implementado | `src/components/common/DataClassBadge.vue`; cabecera CSV (`src/services/export/csvExporter.js:12`) |
| A.8.2.3 | Manipulado de la información | Sí | Reglas por nivel (exportar, compartir, borrar) | Implementado | Diálogo de exportación, seudonimización, `sgsi/uso_aceptable_y_clasificacion.md` §4 |
| A.8.3.1 | Gestión de soportes extraíbles | Parcial | CSV en USB | Documentado | Regla: USB cifrado o borrado tras uso (§4 de uso aceptable) |
| A.8.3.2 | Eliminación de soportes | Sí | Derecho de supresión y fin del curso | Parcial | *Crypto-shredding* (`src/services/storage/secureStorage.js:91`, `src/services/storage/wipe.js:15`); nube: `borrar_mis_datos()` (`supabase/schema.sql:1678`) y purga a 365 días (`:1192`, verificar `cron.job`); la copia temporal `respaldo_20261020` debe eliminarse (R32) |
| A.8.3.3 | Soportes físicos en tránsito | Parcial | Portátiles/USB fuera del laboratorio | Documentado | Prohibido trasladar CSV sin cifrar (uso aceptable §4) |

### A.9 Control de acceso

| Control | Nombre | Aplica | Justificación | Estado | Evidencia |
|---|---|---|---|---|---|
| A.9.1.1 | Política de control de acceso | Sí | RNF06: limitar funciones administrativas | Parcial | `sgsi/control_acceso.md` v2.0; RBAC (`src/stores/auth.js:63`); RLS en todas las tablas y `es_admin()` (`supabase/schema.sql:645`). Probado en PGlite (`supabase/pruebas_rls.sql`, 101 casos, 0 fallos); **no** ejecutado con dos cuentas reales |
| A.9.1.2 | Acceso a las redes y a los servicios de red | Parcial | Solo el proyecto Supabase y el propio origen | Implementado | CSP `connect-src` (`vercel.json:11`; incluye `wss://` del proyecto aunque no se usa Realtime, H-25); solo clave publicable (`src/services/cloud/supabaseClient.js:13`) |
| A.9.2.1 | Registro y baja de usuario | Sí | Cuentas de usuario con correo y contraseña; pacientes propios | Parcial | Supabase Auth (`src/services/accounts/authService.js:40`, `:51`); declaración de mayoría de edad (`src/services/accounts/validation.js:6`); alta, acceso y baja auditados (`ACCOUNT_*`); `eliminar_mi_cuenta()` (`supabase/schema.sql:547`). **Manual pendiente:** desactivar inicios anónimos, SMTP propio y CAPTCHA (el código lo envía solo en el registro, `authService.js:56`, y solo con `VITE_CAPTCHA_*`) |
| A.9.2.2 | Provisión de acceso de usuario | Sí | Rol admin solo por alta explícita | Parcial | Rol de administrador concedido por otro administrador desde la app: `admin_conceder_rol` (`supabase/schema.sql:675`, exige `es_admin_reciente(300)`, máx. 5, cuenta confirmada, respuesta genérica); el SQL del dueño del proyecto es solo contingencia (`sgsi/recuperacion_acceso_admin.md` §3); sin nube, setup único de PIN (`src/router/guards.js:64`). Depende de verificar `amr` (R28) |
| A.9.2.3 | Gestión de privilegios de acceso | Sí | Acciones privilegiadas restringidas | Parcial | `assertAdmin()` (`src/stores/auth.js:63`); `es_admin()` = rol + `aal2` + TOTP ≤ 15 min (`supabase/schema.sql:645`) y `es_admin_reciente(300)` (`:660`); renovación de TOTP en el cliente (`src/services/security/adminRenovacion.js:26`); `administradores` sin escritura directa (SEC-77/79/83/87). **Sin verificar** con un JWT real (caso 0 de `pruebas_rls.sql`) |
| A.9.2.4 | Gestión de la información secreta de autenticación de los usuarios | Sí | Contraseña de la cuenta, secreto TOTP y PIN local (sin nube) | Parcial | Sin PIN por defecto, PBKDF2 (`src/services/security/pinHash.js:7`); contraseña ≥ 10 con letras y números, sin correo ni contraseñas comunes (`src/services/accounts/validation.js:5`); TOTP del administrador (SEC-78); `signOut({scope:'others'})` al cambiar la contraseña (`authService.js:98`); recuperación formal `docs/sgsi/recuperacion_acceso_admin.md`. Pendiente (manual): protección de contraseñas filtradas, SMTP propio, MFA del panel de Supabase (`SEC-50`) |
| A.9.2.5 | Revisión de los derechos de acceso de usuario | Sí | Administradores (nube) y admin local (sin nube) | Parcial | Administración → Administradores y SGSI → Revisión con `admin_listar_administradores()` (`supabase/schema.sql:102`) y «Registrar revisión» (`src/stores/isms.js:116`, `src/services/security/isms.js:22`; SEC-81). No consta una revisión ejecutada: la primera está pendiente |
| A.9.2.6 | Retirada o reasignación de los derechos de acceso | Sí | Cambio de administrador o baja de participante | Parcial | «Retirar rol» (`admin_retirar_rol`, `supabase/schema.sql:717`: TOTP reciente, no a uno mismo, mínimo 1); contingencia: `delete` del dueño del proyecto (`docs/sgsi/recuperacion_acceso_admin.md` §4); cerrar la sesión de la cuenta cierra el modo admin; «Eliminar mis datos» (`src/stores/users.js:198`) |
| A.9.3.1 | Uso de la información secreta de autenticación | Sí | El admin no comparte el PIN | Documentado | `sgsi/control_acceso.md` §4; política de uso aceptable |
| A.9.4.1 | Restricción del acceso a la información | Sí | El participante solo ve lo suyo | Parcial | `listSessions` por usuario (`src/services/storage/sessionRepository.js:36`); RLS por propietario sin lectura masiva del administrador: acceso excepcional `admin_leer_sesion` con motivo y aviso al titular (`supabase/schema.sql:1522`, `:1556`); lo público solo por RPC (`:1268`, `:1310`, `:1349`). Probado en PGlite; prueba real con dos cuentas pendiente |
| A.9.4.2 | Procedimientos seguros de inicio de sesión | Sí | Cuentas, administrador con TOTP (nube) y admin local (sin nube) | Parcial | Administrador = cuenta + `aal2` + TOTP ≤ 15 min exigidos por el servidor (SEC-77..82, SEC-87); sin nube: bloqueo del PIN (`src/services/security/lockout.js:20`) y expiración (`lockout.js:8`); cuentas: cierre por inactividad de 15 min (`src/services/security/inactividad.js:5`, `src/App.vue:16`), token en `sessionStorage` en equipo compartido (`src/services/cloud/almacenSesion.js:55`), límite de intentos en el cliente. Pendiente (manual): *time-box* de Supabase, CAPTCHA en el acceso, verificación de `amr` |
| A.9.4.3 | Sistema de gestión de contraseñas | Sí | Calidad del PIN | Parcial | PIN: `validateNewPin` (`src/services/security/pinHash.js:15`); contraseñas de cuentas: política de cliente (`src/services/accounts/validation.js:5`; el servidor aplica la longitud mínima configurada en Supabase Auth, no verificada); protección de contraseñas filtradas pendiente (manual) |
| A.9.4.4 | Uso de utilidades con privilegios del sistema | No | La SPA no usa ni ofrece utilidades privilegiadas; la clave `service_role` no se usa | N/A | — |
| A.9.4.5 | Control de acceso al código fuente de los programas | Sí | Repositorio | Parcial | Repositorio con CI y Dependabot (`.github/workflows/ci.yml`, `.github/dependabot.yml`); **protección de `main` pendiente** (manual, `SEC-58`) |

> Actualización 2026-10-20 (v3.0): los estados de A.9 reflejan lo real tras las TANDAS 1 y 2: el código y el SQL existen y tienen pruebas simuladas, pero la verificación en el proyecto real (claim `amr`, RLS con dos cuentas) y los ajustes de panel son manuales, por lo que no se declaran «Implementado». Ver secciones 5.14b, 5.14c y 5.14d.

### A.10 Criptografía

| Control | Nombre | Aplica | Justificación | Estado | Evidencia |
|---|---|---|---|---|---|
| A.10.1.1 | Política de uso de los controles criptográficos | Sí | Datos sensibles en reposo y tránsito | Parcial | AES-GCM 256 (`src/services/storage/secureStorage.js:47`), PBKDF2, SHA-256, TLS; `docs/sgsi/politica_criptografica.md` v2.0. Alcance real: protege la lectura casual de los archivos del navegador, no a quien controle el equipo ni frente a XSS (`src/data/privacidad.js`, `CIFRADO_LOCAL_ALCANCE`); bóveda con frase diferida (R31) |
| A.10.1.2 | Gestión de claves | Sí | Ciclo de vida de la clave AES y de las claves de Supabase | Parcial | Clave no extraíble en IndexedDB (`secureStorage.js:27`), destrucción (`secureStorage.js:91`); una sola clave `aes-gcm-v1` para todos los espacios (`secureStorage.js:20`), sin rotación; Supabase: solo clave publicable, `service_role` jamás en el frontend |

### A.11 Seguridad física y del entorno

| Control | Nombre | Aplica | Justificación | Estado | Evidencia |
|---|---|---|---|---|---|
| A.11.1.1 | Perímetro de seguridad física | No | Instalaciones de la universidad, fuera del alcance | N/A | — |
| A.11.1.2 | Controles físicos de entrada | No | Fuera del alcance | N/A | — |
| A.11.1.3 | Seguridad de oficinas, despachos y recursos | No | Fuera del alcance | N/A | — |
| A.11.1.4 | Protección contra las amenazas externas y ambientales | No | Fuera del alcance (el riesgo eléctrico se trata en A.11.2.1/A.11.2.2) | N/A | — |
| A.11.1.5 | El trabajo en áreas seguras | No | No hay áreas seguras propias | N/A | — |
| A.11.1.6 | Áreas de carga y descarga | No | No aplica a un proyecto de software | N/A | — |
| A.11.2.1 | Emplazamiento y protección de equipos | Parcial | Sensor y PC junto al participante | Implementado | Aviso eléctrico (`src/components/layout/SafetyBanner.vue`, `SEC-21`) |
| A.11.2.2 | Instalaciones de suministro | Parcial | Riesgo de fuga eléctrica por el suministro | Documentado | Alimentación por batería o Bluetooth aislado (`src/data/learn/electricalSafety.js`) |
| A.11.2.3 | Seguridad del cableado | Parcial | Cables de electrodos y USB | Documentado | Revisión de cables antes de cada sesión (`sgsi/plan_continuidad.md`) |
| A.11.2.4 | Mantenimiento de los equipos | Parcial | Electrodos y sensores | Documentado | Reposición de electrodos, prueba con simulador |
| A.11.2.5 | Retirada de materiales propiedad de la empresa | Parcial | Sensores del laboratorio | Documentado | Registro de préstamo (uso aceptable §5) |
| A.11.2.6 | Seguridad de los equipos fuera de las instalaciones | Parcial | Portátiles con datos | Documentado | Cifrado de disco del SO recomendado; bloqueo de pantalla |
| A.11.2.7 | Reutilización o eliminación segura de equipos | Sí | PC prestado devuelto con datos | Implementado | «Borrar todos los datos» con *crypto-shredding* (`src/services/storage/wipe.js:15`); en equipo compartido, cerrar sesión quita el espacio local de la cuenta sin preguntar |
| A.11.2.8 | Equipo de usuario desatendido | Sí | Laboratorio compartido | Parcial | Cuentas: cierre por inactividad de 15 min con aviso 1 min antes (`src/services/security/inactividad.js:5`; una medición en curso cuenta como actividad); «equipo compartido» con token en `sessionStorage` (`almacenSesion.js:55`; marcado por defecto en escritorio, el usuario puede cambiarlo); admin local: 10 min (`lockout.js:8`). En equipo personal el token permanece en `localStorage` |
| A.11.2.9 | Política de puesto de trabajo despejado y pantalla limpia | Sí | Datos de salud en pantalla | Implementado | Datos opcionales ocultos en multisensor (`SEC-05`); regla en uso aceptable §3 |

### A.12 Seguridad de las operaciones

| Control | Nombre | Aplica | Justificación | Estado | Evidencia |
|---|---|---|---|---|---|
| A.12.1.1 | Documentación de procedimientos operacionales | Sí | Sesiones de medición, exportación, borrado | Documentado | README, `sgsi/plan_continuidad.md`, `docs/VERIFICACION.md` |
| A.12.1.2 | Gestión de cambios | Sí | Código y parámetros | Parcial | `PARAM_CHANGED` (`src/stores/settings.js:89`); CAMBIOS.md; orden formal de migraciones en las cabeceras de `supabase/*.sql`; la revisión por PR no está impuesta (protección de rama pendiente) |
| A.12.1.3 | Gestión de capacidades | Sí | 5 sensores × 250 Hz; cuota del navegador | Implementado | `MAX_CHANNELS` (`src/stores/channels.js:50`); `storage.estimate()` (`src/main.js:49`); topes por bloque 32 KB, sesión 25 MB, cuenta 50 MB, 1000 sesiones y 200 pacientes (`public.cuota()`, `supabase/schema.sql:576`; `tg_cuota_bloques`, `:1052`; `uso_cuenta`, `:1028`), error `ECG01`; límites del cliente `rateLimiter.js`. Concurrencia real no probada |
| A.12.1.4 | Separación de los recursos de desarrollo, prueba y operación | Sí | Previews vs producción | Documentado | Vercel Preview/Production; `.env.local` fuera del repositorio |
| A.12.2.1 | Controles contra el código malicioso | Parcial | Entrada serial y CSV externos | Implementado | Parser estricto, sin `eval` (ESLint `no-eval`), CSP |
| A.12.3.1 | Copias de seguridad de la información | Parcial | Local-first con copia opcional en la nube | Parcial | Local-first; copia opcional en la nube solo con «Guardar mis datos en la nube» y al pulsar «Guardar» (`src/services/cloud/subidaMonitoreo.js:23`); **no existe** restauración de monitoreos propios desde la nube; exportación CSV/JSON; respaldo del proveedor según el plan; copia temporal `respaldo_20261020` por eliminar; prueba de restauración pendiente |
| A.12.4.1 | Registro de eventos | Sí | Trazabilidad | Parcial | Log local (`src/services/audit/auditLog.js`); nube: `registrar_evento` con actor y hora del servidor (`supabase/schema.sql:865`), lista blanca `tipos_evento` (`:758`), cola persistente con reintentos (`src/services/cloud/auditOutbox.js:43`). Faltan `ACCOUNT_LOGIN_FAILED`, `CLOUD_SYNC_FAILED`, `QUOTA_EXCEEDED`, `SESSION_EXPIRED` y `CONSENT_UPDATED` |
| A.12.4.2 | Protección de la información del registro | Sí | Evitar manipulación | Parcial | Cadena SHA-256 local y `verify()` (`auditLog.js:154`); nube: hash encadenado en el servidor bajo `pg_advisory_xact_lock` (`supabase/schema.sql:810`), `verificar_cadena_auditoria()` (`:921`), INSERT/UPDATE/DELETE directos revocados, purga a 2 años (`:954`). Sin anclaje externo; cadena local sin clave; verificada solo en PGlite |
| A.12.4.3 | Registros de administración y operación | Sí | Acciones del administrador | Parcial | Eventos `ADMIN_*` emitidos por el servidor (`ADMIN_ROLE_*`; `ADMIN_DATA_ACCESS` en `admin_leer_sesion`, `supabase/schema.sql:1522`), `PARAM_CHANGED`, `ACCESS_REVIEW_DONE`; `/admin/auditoria` con pestaña «Nube» (`admin_leer_auditoria`, `:897`); el titular ve los accesos del administrador (`mis_accesos_admin`, `:1556`). Sin revisión periódica ejecutada |
| A.12.4.4 | Sincronización del reloj | Sí | Correlación de eventos entre equipos | Implementado | UTC ISO-8601 (`src/services/audit/auditLog.js:118`); `hora_servidor()` + `clockSkew` (`src/services/security/isms.js:34`); cuotas, purga y CHECK de `inicio` por `creado_en` del servidor (`supabase/schema.sql:984`) |
| A.12.5.1 | Instalación del software en explotación | Sí | Despliegue | Documentado | Solo desde `main` vía Vercel; `npm ci` |
| A.12.6.1 | Gestión de las vulnerabilidades técnicas | Sí | Dependencias npm | Implementado | `npm audit --audit-level=high --omit=dev` en `.github/workflows/ci.yml` (0 vulnerabilidades de producción el 2026-10-20); `.github/dependabot.yml`; registro en `docs/sgsi/proveedores.md` §2 (`tinypool`, solo desarrollo) — SUG-10/18 |
| A.12.6.2 | Restricción en la instalación de software | No | La app no instala software; los PCs del laboratorio los gestiona la universidad | N/A | — |
| A.12.7.1 | Controles de auditoría de sistemas de información | No | No se auditan sistemas en producción con herramientas intrusivas | N/A | — |

### A.13 Seguridad de las comunicaciones

| Control | Nombre | Aplica | Justificación | Estado | Evidencia |
|---|---|---|---|---|---|
| A.13.1.1 | Controles de red | Parcial | Solo HTTPS | Implementado | HSTS, `upgrade-insecure-requests` (`vercel.json:11`); cuotas del servidor frente a abuso de la API (`supabase/schema.sql`) |
| A.13.1.2 | Seguridad de los servicios de red | Sí | Vercel y Supabase | Parcial | Cabeceras de seguridad (`vercel.json`); TLS de Supabase; límites de tasa de Supabase Auth (configuración del panel, no verificada); CAPTCHA no activado |
| A.13.1.3 | Segregación en redes | No | No hay red propia | N/A | — |
| A.13.2.1 | Políticas y procedimientos de intercambio de información | Sí | Exportación CSV y sincronización | Parcial | Exportación seudonimizada y auditada (`src/stores/admin.js:51`); sincronización solo con la nube activada por la persona y datos filtrados (`src/services/cloud/datosNube.js:26`); publicación por RPC con fecha truncada, consentimiento 2.0 por monitoreo y reporte/retiro (`supabase/schema.sql:1268-1503`); service worker sin datos (`public/sw.js:10`). Probado en PGlite; prueba real pendiente |
| A.13.2.2 | Acuerdos de intercambio de información | Parcial | Entrega de CSV a terceros (docente/investigador) | Documentado | Solo a personal autorizado; uso aceptable §4 |
| A.13.2.3 | Mensajería electrónica | No | La app no envía correos ni mensajes | N/A | — |
| A.13.2.4 | Acuerdos de confidencialidad o no revelación | Sí | Integrantes con acceso a datos | Documentado | Compromiso de confidencialidad (`sgsi/roles_responsabilidades.md` §3) |

### A.14 Adquisición, desarrollo y mantenimiento de los sistemas de información

| Control | Nombre | Aplica | Justificación | Estado | Evidencia |
|---|---|---|---|---|---|
| A.14.1.1 | Análisis de requisitos y especificaciones de seguridad de la información | Sí | RNF06 | Implementado | Sección 5 (SEC-01..SEC-102) |
| A.14.1.2 | Asegurar los servicios de aplicaciones en redes públicas | Sí | SPA pública en Internet | Implementado | CSP, HSTS, RLS en Supabase |
| A.14.1.3 | Protección de las transacciones de servicios de aplicaciones | Sí | Escrituras a Supabase | Implementado | Upsert idempotente por clave primaria, `CHECK` de consistencia, índice único de etiquetas (`supabase/schema.sql:1670`), cola serie (`src/services/cloud/cloudSync.js`); `sesiones.datos` solo se limpia (`schema.sql:1738`), no se valida con lista blanca (C-20 diferido) |
| A.14.2.1 | Política de desarrollo seguro | Sí | Proyecto de desarrollo | Implementado | ESLint seguridad (`eslint.config.js:35`), reglas SEC-53 |
| A.14.2.2 | Procedimiento de control de cambios en sistemas | Sí | Cambios de código y esquema | Documentado | PR + CAMBIOS.md; orden formal de migraciones y esquema idempotente; plantilla de PR (`.github/pull_request_template.md`); la protección de rama no está activa |
| A.14.2.3 | Revisión técnica de las aplicaciones tras efectuar cambios en el sistema operativo | No | La SPA corre en el navegador, no depende del SO del servidor | N/A | Se reemplaza por pruebas tras actualizar el navegador (A.14.2.9) |
| A.14.2.4 | Restricciones a los cambios en los paquetes de software | Sí | No parchear `node_modules` | Implementado | Versiones fijadas `~` y lockfile (`package.json`) |
| A.14.2.5 | Principios de ingeniería de sistemas seguros | Sí | Diseño | Implementado | Defensa en profundidad, mínimo privilegio, fallo seguro (`src/stores/settings.js:53`) |
| A.14.2.6 | Entorno de desarrollo seguro | Sí | Equipos y secretos del equipo | Parcial | `.env.local` ignorado, sin source maps (`vite.config.js:46`) y sin `console` (`vite.config.js:44`); el proyecto vive en OneDrive (excluir `.env.local` y `node_modules` de la sincronización) y no existe `SECURITY.md` |
| A.14.2.7 | Externalización del desarrollo de software | No | Lo desarrolla el propio equipo | N/A | — |
| A.14.2.8 | Pruebas funcionales de seguridad de sistemas | Sí | Verificar controles | Parcial | 343 pruebas unitarias (28 archivos, p. ej. `tests/security.spec.js`, `tests/isms.spec.js`, `tests/schema.spec.js`, `tests/privacy.spec.js`) y 75 E2E (16 archivos) con Supabase simulado; SQL en PGlite y `supabase/pruebas_rls.sql` (101 casos) fuera del CI; CI `.github/workflows/ci.yml`. Falta la prueba real de RLS y del claim `amr` |
| A.14.2.9 | Pruebas de aceptación de sistemas | Sí | Entrega por hito | Parcial | Checklist 5.15 (sin ejecutar contra la nube real); `docs/VERIFICACION.md`; E2E Playwright `e2e/*.spec.js` en CI; matriz `docs/TRAZABILIDAD.md` — SUG-11 |
| A.14.3.1 | Protección de los datos de prueba | Sí | No usar datos reales | Implementado | Simulador (`src/services/sources/SimulatorSource.js`), referencia sintética |

### A.15 Relación con proveedores

| Control | Nombre | Aplica | Justificación | Estado | Evidencia |
|---|---|---|---|---|---|
| A.15.1.1 | Política de seguridad de la información en las relaciones con los proveedores | Sí | Supabase almacena datos de salud seudonimizados; Vercel sirve la app | Documentado | Política §5 (proveedores en la nube); fichas en `docs/sgsi/proveedores.md`; términos y DPA de Supabase/Vercel **sin registrar** (pendiente) — SUG-15 |
| A.15.1.2 | Requisitos de seguridad en contratos con terceros | Parcial | Planes gratuitos con términos estándar | Parcial | Revisión de DPA, región (us-east-1) y certificaciones por registrar con fecha en `docs/sgsi/proveedores.md` (R18, R37) |
| A.15.1.3 | Cadena de suministro de tecnología de la información y de las comunicaciones | Sí | Paquetes npm | Implementado | Sin CDN, lockfile, `npm audit` |
| A.15.2.1 | Control y revisión de la provisión de servicios del proveedor | Parcial | Disponibilidad de Vercel/Supabase | Documentado | Revisión de la página de estado y avisos en cada hito; revisión semestral registrada en `docs/sgsi/proveedores.md` |
| A.15.2.2 | Gestión de cambios en la provisión del servicio del proveedor | Parcial | Cambios de API/planes del proveedor | Documentado | Reapreciación del riesgo ante cambios (8.2) |

### A.16 Gestión de incidentes de seguridad de la información

| Control | Nombre | Aplica | Justificación | Estado | Evidencia |
|---|---|---|---|---|---|
| A.16.1.1 | Responsabilidades y procedimientos | Sí | Fuga de CSV, alteración, acceso indebido | Documentado | `sgsi/procedimiento_incidentes.md` |
| A.16.1.2 | Notificación de los eventos de seguridad de la información | Sí | Canal rápido para cualquier usuario | Implementado | `/seguridad#reportar` (`src/components/security/IncidentReportForm.vue`), `src/stores/isms.js:74`, tabla `incidentes` con trigger que rechaza RUT, correos y valores de salud (`supabase/schema.sql:1590`); reporte de contenido público (`reportar_monitoreo`, `:1387`) |
| A.16.1.3 | Notificación de puntos débiles de la seguridad | Sí | Debilidades observadas | Implementado | Tipo `debilidad` (`src/services/security/incidents.js`) |
| A.16.1.4 | Evaluación y decisión sobre los eventos de seguridad de información | Sí | Clasificar evento vs. incidente | Parcial | Estados `en_analisis`/`descartado` (`src/services/security/incidents.js:88`) y ciclo validado en el servidor (`admin_actualizar_incidente`, `supabase/schema.sql:1625`); sin simulacro ejecutado |
| A.16.1.5 | Respuesta a incidentes de seguridad de la información | Sí | Contención y recuperación | Parcial | Respuesta obligatoria para cerrar (`incidents.js:88`, `schema.sql:1625`); procedimiento §3. Sin aviso automático al responsable ni plantilla de notificación a la Agencia; simulacro pendiente |
| A.16.1.6 | Aprendizaje de los incidentes de seguridad de la información | Sí | Mejora continua | Parcial | Lección aprendida obligatoria para cerrar; entrada a 10.1; no hay lecciones reales registradas en este repositorio |
| A.16.1.7 | Recopilación de evidencias | Sí | Investigación | Parcial | Exportación JSON de la auditoría con verificación (`src/stores/admin.js:34`); en la nube, `admin_leer_auditoria` y `verificar_cadena_auditoria()`; incidentes sin DELETE; cadena sin anclaje externo |

### A.17 Aspectos de seguridad de la información para la gestión de la continuidad de negocio

| Control | Nombre | Aplica | Justificación | Estado | Evidencia |
|---|---|---|---|---|---|
| A.17.1.1 | Planificación de la continuidad de la seguridad de la información | Sí | Sesiones de medición en clase | Documentado | `sgsi/plan_continuidad.md` |
| A.17.1.2 | Implementar la continuidad de la seguridad de la información | Parcial | Fallos de sensor, red o nube | Implementado | Local-first, detección de desconexión (`SEC-59`), simulador como respaldo |
| A.17.1.3 | Verificación, revisión y evaluación de la continuidad de la seguridad de la información | Parcial | Probar el plan | Documentado | Simulacro por hito (plan de continuidad §5) |
| A.17.2.1 | Disponibilidad de los recursos de tratamiento de la información | Parcial | CDN de Vercel, service worker (app shell) y copia en Supabase | Parcial | PWA con app shell sin conexión (`public/sw.js`, `SEC-62`); la nube no está disponible sin red y no hay conmutación por error del proveedor |

### A.18 Cumplimiento

| Control | Nombre | Aplica | Justificación | Estado | Evidencia |
|---|---|---|---|---|---|
| A.18.1.1 | Identificación de la legislación aplicable y de los requisitos contractuales | Sí | Datos de salud | Documentado | Ley 19.628, Ley 21.719, Ley 20.584; `/privacidad`; responsable configurable (`src/services/privacidad/responsable.js:8`). Sin revisión legal ni registro de tratamientos/EIPD (R37) |
| A.18.1.2 | Derechos de Propiedad Intelectual (DPI) | Sí | Librerías y la propia norma | Implementado | Licencias MIT (Vue, uPlot); la norma UNE con licencia no se copia al repositorio |
| A.18.1.3 | Protección de los registros de la organización | Sí | Consentimientos, auditoría, incidentes | Parcial | Cifrado + cadena de hashes; auditoría local 180 días y de la nube 2 años (`purgar_auditoria`, `supabase/schema.sql:954`); monitoreos locales 30 días (configurable) y en la nube 365 días desde el inicio (`:1192`, verificar `cron.job`); cuentas inactivas: procedimiento manual |
| A.18.1.4 | Protección y privacidad de la información de carácter personal | Sí | **Control central**: datos de salud | Parcial | Control central. Nube opcional apagada por defecto (`src/services/cloud/nubeOptIn.js:30`), borradores sin subir, sin alias/nombre/notas en la nube (`datosNube.js:26`), consentimiento v2.0 (`consentimiento.js:8`), declaración de mayoría de edad (autodeclarada), publicación con consentimiento por monitoreo (`supabase/schema.sql:1807`), supresión (`borrar_mis_datos()`, `eliminar_mi_cuenta()`), `src/views/PrivacyView.vue`. Pendiente: revisión legal, DPA, prueba real de RLS, `exportar_mis_datos()` (diferido) |
| A.18.1.5 | Regulación de los controles criptográficos | Sí | Uso de criptografía estándar | Implementado | Web Crypto (algoritmos estándar, sin restricciones de exportación aplicables) |
| A.18.2.1 | Revisión independiente de la seguridad de la información | Parcial | Evaluación académica | Documentado | Auditoría por otro grupo y docente (`sgsi/auditoria_interna_y_revision.md`) |
| A.18.2.2 | Cumplimiento de las políticas y normas de seguridad | Sí | Verificar el SoA | Parcial | Indicadores y objetivos OBJ-1 a OBJ-6 en la app (`src/services/security/isms.js:53`) y registro de evidencias de auditoría/revisión (`src/services/security/evidencias.js:13`); OBJ-7 a OBJ-12 y las revisiones están sin ejecutar |
| A.18.2.3 | Comprobación del cumplimiento técnico | Sí | Pruebas técnicas | Parcial | `npm test` (343), `npm run lint`, CI, securityheaders.com; `supabase/pruebas_rls.sql` (101 casos) probado en PGlite; **la prueba real de RLS con dos cuentas y el claim `amr` siguen pendientes** (docs/PENDIENTES_MANUALES.md) |

### 8.1 Resumen de la SoA

| Dominio | Controles | Sí | Parcial | No |
|---|---|---|---|---|
| A.5 | 2 | 2 | 0 | 0 |
| A.6 | 7 | 2 | 5 | 0 |
| A.7 | 6 | 2 | 1 | 3 |
| A.8 | 10 | 7 | 3 | 0 |
| A.9 | 14 | 12 | 1 | 1 |
| A.10 | 2 | 2 | 0 | 0 |
| A.11 | 15 | 3 | 6 | 6 |
| A.12 | 14 | 10 | 2 | 2 |
| A.13 | 7 | 3 | 2 | 2 |
| A.14 | 13 | 11 | 0 | 2 |
| A.15 | 5 | 2 | 3 | 0 |
| A.16 | 7 | 7 | 0 | 0 |
| A.17 | 4 | 1 | 3 | 0 |
| A.18 | 8 | 7 | 1 | 0 |
| **Total** | **114** | **71** | **27** | **16** |

**Aplican (Sí + Parcial): 98 · Excluidos: 16.** Estados (columna «Estado», recalculados con script el 2026-10-20 tras las TANDAS 1 y 2): Implementado 31 · Documentado 31 · Parcial 36 · N/A 16. Los conteos de aplicabilidad no cambian respecto a la v2.0; lo que cambia es el **estado**: ya no se declara «Implementado» lo que depende de verificación manual o de configuración del panel (A.9.x, A.10.x, A.11.2.8, A.12.4.x, A.13.2.1, A.14.2.8/9, A.16.1.4 a A.16.1.7, A.18.1.3, A.18.1.4, A.18.2.2).

---|---|---|---|---|
| A.5 | 2 | 2 | 0 | 0 |
| A.6 | 7 | 2 | 5 | 0 |
| A.7 | 6 | 2 | 1 | 3 |
| A.8 | 10 | 7 | 3 | 0 |
| A.9 | 14 | 12 | 1 | 1 |
| A.10 | 2 | 2 | 0 | 0 |
| A.11 | 15 | 3 | 6 | 6 |
| A.12 | 14 | 10 | 2 | 2 |
| A.13 | 7 | 3 | 2 | 2 |
| A.14 | 13 | 11 | 0 | 2 |
| A.15 | 5 | 2 | 3 | 0 |
| A.16 | 7 | 7 | 0 | 0 |
| A.17 | 4 | 1 | 3 | 0 |
| A.18 | 8 | 7 | 1 | 0 |
| **Total** | **114** | **71** | **27** | **16** |

**Aplican (Sí + Parcial): 98 · Excluidos: 16.** Estados (columna «Estado», recalculados con script el 2026-10-20): Implementado 61 · Documentado 33 · N/A 16 · Parcial 4.

---

## 9. Equivalencia ISO/IEC 27001:2022 → 2013 (lo documentado en la v1.0)

"Nuevo 2022" indica controles sin equivalente directo en 2013; se indica el control 2013 que cubre su intención.

| 2022 | Nombre 2022 (resumido) | Control(es) 2013 |
|---|---|---|
| 5.1 | Políticas de seguridad | A.5.1.1, A.5.1.2 |
| 5.2 | Roles y responsabilidades | A.6.1.1 |
| 5.3 | Segregación de funciones | A.6.1.2 |
| 5.4 | Responsabilidades de la dirección | A.7.2.1 |
| 5.5 / 5.6 | Contacto con autoridades / grupos de interés | A.6.1.3 / A.6.1.4 |
| 5.7 | Inteligencia de amenazas | Nuevo 2022 → A.12.6.1, A.6.1.4 |
| 5.8 | Seguridad en la gestión de proyectos | A.6.1.5 |
| 5.9 | Inventario de información y activos | A.8.1.1, A.8.1.2 |
| 5.10 | Uso aceptable | A.8.1.3, A.8.2.3 |
| 5.11 | Devolución de activos | A.8.1.4 |
| 5.12 / 5.13 | Clasificación / etiquetado | A.8.2.1 / A.8.2.2 |
| 5.14 | Transferencia de información | A.13.2.1, A.13.2.2, A.13.2.3 |
| 5.15 | Control de acceso | A.9.1.1, A.9.1.2 |
| 5.16 | Gestión de identidades | A.9.2.1 |
| 5.17 | Información de autenticación | A.9.2.4, A.9.3.1, A.9.4.3 |
| 5.18 | Derechos de acceso | A.9.2.2, A.9.2.5, A.9.2.6 |
| 5.19 / 5.20 | Proveedores / acuerdos con proveedores | A.15.1.1 / A.15.1.2 |
| 5.21 | Cadena de suministro TIC | A.15.1.3 |
| 5.22 | Seguimiento de servicios de proveedores | A.15.2.1, A.15.2.2 |
| 5.23 | Servicios en la nube | Nuevo 2022 → A.15.1.1–A.15.2.2, A.13.1.2 |
| 5.24 – 5.27 | Gestión de incidentes | A.16.1.1, A.16.1.4, A.16.1.5, A.16.1.6 |
| 5.28 | Recolección de evidencias | A.16.1.7 |
| 5.29 | Seguridad durante interrupciones | A.17.1.1, A.17.1.2, A.17.1.3 |
| 5.30 | Preparación TIC para la continuidad | Nuevo 2022 → A.17.1.2, A.17.2.1 |
| 5.31 | Requisitos legales | A.18.1.1, A.18.1.5 |
| 5.32 | Propiedad intelectual | A.18.1.2 |
| 5.33 | Protección de registros | A.18.1.3 |
| 5.34 | Privacidad y PII | A.18.1.4 |
| 5.35 / 5.36 | Revisión independiente / cumplimiento | A.18.2.1 / A.18.2.2, A.18.2.3 |
| 5.37 | Procedimientos operativos documentados | A.12.1.1 |
| 6.1 – 6.5 | Antecedentes, empleo, concienciación, disciplina, fin de rol | A.7.1.1, A.7.1.2, A.7.2.2, A.7.2.3, A.7.3.1 |
| 6.6 | Acuerdos de confidencialidad | A.13.2.4 |
| 6.7 | Trabajo remoto | A.6.2.2 |
| 6.8 | Notificación de eventos | A.16.1.2, A.16.1.3 |
| 7.1 – 7.3, 7.6 | Perímetros, entrada, oficinas, áreas seguras | A.11.1.1, A.11.1.2 (+A.11.1.6), A.11.1.3, A.11.1.5 |
| 7.4 | Monitorización física | Nuevo 2022 → (sin equivalente; fuera del alcance) |
| 7.5 | Amenazas físicas y ambientales | A.11.1.4 |
| 7.7 | Escritorio y pantalla limpios | A.11.2.9 |
| 7.8 / 7.9 | Ubicación de equipos / activos fuera de las instalaciones | A.11.2.1 / A.11.2.6 |
| 7.10 | Medios de almacenamiento | A.8.3.1, A.8.3.2, A.8.3.3, A.11.2.5 |
| 7.11 – 7.14 | Suministro, cableado, mantenimiento, eliminación de equipos | A.11.2.2, A.11.2.3, A.11.2.4, A.11.2.7 |
| 8.1 | Dispositivos de punto final | A.6.2.1, A.11.2.8 |
| 8.2 | Derechos de acceso privilegiado | A.9.2.3 |
| 8.3 | Restricción del acceso a la información | A.9.4.1 |
| 8.4 | Acceso al código fuente | A.9.4.5 |
| 8.5 | Autenticación segura | A.9.4.2 |
| 8.6 | Gestión de capacidad | A.12.1.3 |
| 8.7 | Protección contra malware | A.12.2.1 |
| 8.8 | Vulnerabilidades técnicas | A.12.6.1, A.18.2.3 |
| 8.9 | Gestión de la configuración | Nuevo 2022 → A.12.1.2, A.14.2.2, A.14.2.5 |
| 8.10 | Eliminación de información | Nuevo 2022 → A.8.3.2, A.11.2.7, A.18.1.4 |
| 8.11 | Enmascaramiento de datos | Nuevo 2022 → A.18.1.4 |
| 8.12 | Prevención de fuga de datos | Nuevo 2022 → A.13.2.1, A.8.2.3 |
| 8.13 | Copias de seguridad | A.12.3.1 |
| 8.14 | Redundancia | A.17.2.1 |
| 8.15 | Registro de eventos | A.12.4.1, A.12.4.2, A.12.4.3 |
| 8.16 | Actividades de monitorización | Nuevo 2022 → A.12.4.1, 9.1 |
| 8.17 | Sincronización de relojes | A.12.4.4 |
| 8.18 | Programas utilitarios privilegiados | A.9.4.4 |
| 8.19 | Instalación de software | A.12.5.1, A.12.6.2 |
| 8.20 / 8.21 / 8.22 | Redes / servicios de red / segregación | A.13.1.1 / A.13.1.2 / A.13.1.3 |
| 8.23 | Filtrado web | Nuevo 2022 → A.13.1.1 |
| 8.24 | Uso de criptografía | A.10.1.1, A.10.1.2 |
| 8.25 | Ciclo de vida de desarrollo seguro | A.14.2.1 |
| 8.26 | Requisitos de seguridad de las aplicaciones | A.14.1.1, A.14.1.2, A.14.1.3 |
| 8.27 | Arquitectura e ingeniería segura | A.14.2.5 |
| 8.28 | Codificación segura | Nuevo 2022 → A.14.2.1, A.14.2.5 |
| 8.29 | Pruebas de seguridad | A.14.2.8, A.14.2.9 |
| 8.30 | Desarrollo externalizado | A.14.2.7 |
| 8.31 | Separación de entornos | A.12.1.4, A.14.2.6 |
| 8.32 | Gestión de cambios | A.12.1.2, A.14.2.2, A.14.2.3, A.14.2.4 |
| 8.33 | Información de prueba | A.14.3.1 |
| 8.34 | Protección durante pruebas de auditoría | A.12.7.1 |

---

## 10. Mapeo RNF06 → controles ISO/IEC 27001:2013

**RNF06:** *"El sistema deberá proteger la información asociada a los usuarios y limitar las funciones administrativas al perfil correspondiente."*

| Componente de RNF06 | Objetivo | Controles del Anexo A (2013) | Requisitos |
|---|---|---|---|
| Confidencialidad | Que los datos de salud no se lean sin autorización | A.8.2.1, A.8.2.2, A.9.4.1, A.10.1.1, A.10.1.2, A.11.2.8, A.18.1.4 | SEC-05, SEC-13–15, SEC-20, SEC-22–29, SEC-44, SEC-85, SEC-88, SEC-93–95 |
| Integridad | Señal, configuración y registros sin alterar | A.12.4.2, A.14.1.3, A.14.2.5, A.12.2.1, A.18.1.3 | SEC-27, SEC-28, SEC-34–38 |
| Privacidad y legalidad | Consentimiento, minimización, supresión | A.18.1.1, A.18.1.4, A.8.3.2 | SEC-16–21, SEC-30–33, SEC-93, SEC-94, SEC-99, SEC-101, SEC-102 |
| Fuga | Salida controlada de datos | A.13.2.1, A.8.2.3, A.8.3.1 | SEC-43–47, SEC-50, SEC-54 |
| Plataforma, nube y código | XSS, cadena de suministro, RLS, configuración | A.9.1.2, A.12.6.1, A.13.1.1, A.13.1.2, A.14.1.2, A.14.2.1, A.14.2.5, A.14.2.8, A.15.1.1, A.15.1.3 | SEC-48–58 |
| Limitar funciones administrativas | Solo el admin configura (RF15, RF25–RF27) | A.9.1.1, A.9.2.1–A.9.2.6, A.9.4.2, A.9.4.3 | SEC-01–12, SEC-67, SEC-77–83, SEC-87, SEC-88, SEC-96 |
| Trazabilidad | Quién cambió qué y cuándo | A.12.4.1–A.12.4.4, A.16.1.7 | SEC-38–42, SEC-68, SEC-89, SEC-91 |
| Gestión de incidentes | Detectar, notificar y aprender | A.16.1.1–A.16.1.7 | SEC-65, SEC-66, SEC-86, SEC-90 |
| Disponibilidad (RNF05) | La protección no impide medir | A.12.1.3, A.12.3.1, A.17.1.2, A.17.2.1 | SEC-59–62 |
| Gobernanza | Política, roles, concienciación, medición | A.5.1.1, A.5.1.2, A.6.1.1, A.7.2.2, A.18.2.2; cláusulas 5, 6.2, 9, 10 | SEC-63, SEC-64, SEC-69, SEC-100; `docs/sgsi/` |

**Criterio de cumplimiento de RNF06:** se cumple cuando todos los requisitos **[M]** superan la lista 5.15 y las limitaciones de la sección 5.0 están aceptadas por el docente como riesgo residual (`sgsi/plan_tratamiento_riesgos.md`).
