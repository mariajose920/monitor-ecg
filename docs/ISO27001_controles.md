# Seguridad de la información — ISO/IEC 27001:2013 aplicada al Monitor ECG Web

> **Documento:** ISO27001_controles.md · **Versión:** 2.0 · **Fecha:** 2026-10-15
> **Proyecto:** Monitor ECG web (asignatura Programación Web) — sensor AD8232 + Arduino/ESP32 + frontend Vue 3 + Supabase (opcional)
> **Clasificación de este documento:** Uso interno (académico)
> **Norma de referencia:** **UNE-EN ISO/IEC 27001:2017**, versión española de **ISO/IEC 27001:2013** con sus corrigendos **Cor 1:2014** y **Cor 2:2015** (cláusulas 4 a 10 y Anexo A con **114 controles en 14 dominios, A.5 a A.18**). Guía de controles: ISO/IEC 27002:2013. Gestión de riesgos: ISO 31000:2009 e ISO/IEC 27005.
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

> *El SGSI cubre el diseño, desarrollo, despliegue y operación de la aplicación web "Monitor ECG": captura de señales de hasta 5 canales (sensor óptico PPG MAX30100 con ESP32, firmware AD8232/ECG original por Web Serial, cámara del celular como PPG y simulador), visualización y comparación, identificación seudonimizada de participantes, datos opcionales con consentimiento (edad, peso, actividad), configuración administrativa (rangos y sincronización), exportación CSV, almacenamiento cifrado en el navegador (IndexedDB, AES-GCM), auditoría encadenada SHA-256, sincronización opcional con Supabase (RLS, cuentas de usuario con correo y contraseña (Supabase Auth), pacientes propiedad de cada cuenta, monitoreos privados o públicos anónimos y autenticación real del administrador; proyecto alojado en la región us-east-1), notificación de incidentes y despliegue estático en Vercel. Incluye el firmware del sensor en lo que respecta a la integridad del flujo de datos.*
>
> **Interfaces y dependencias (4.3 c):** Vercel (entrega de la SPA), Supabase (base de datos y autenticación), GitHub y npm (cadena de suministro de software).
>
> **Exclusiones:** seguridad física y red de las instalaciones universitarias (A.11.1), infraestructura interna de Vercel/Supabase/GitHub (se gestiona como proveedor, A.15), certificación eléctrica o médica (IEC 60601) y uso clínico.

### 1.4 Inventario y propiedad de activos (A.8.1.1, A.8.1.2) y clasificación (A.8.2.1)

Esquema de clasificación: **Público**, **Interno**, **Confidencial** y **Confidencial-Sensible** (datos de salud). Detalle en `sgsi/uso_aceptable_y_clasificacion.md`.

| ID | Activo | Tipo | Ubicación | Propietario | Clasificación | C / I / D* |
|---|---|---|---|---|---|---|
| A01 | Señal ECG cruda y BPM por sesión | Información | Memoria; IndexedDB cifrado; Supabase `bloques_muestras`; CSV | Participante (titular) / administrador (custodio) | **Confidencial-Sensible** | 3 / 3 / 2 |
| A02 | Perfil seudónimo ("Usuario N") | Información | IndexedDB cifrado; `sesiones.datos` en Supabase | Administrador | Interno | 1 / 2 / 2 |
| A03 | Datos opcionales: edad (rango), peso, actividad | Información | IndexedDB cifrado | Participante | **Confidencial-Sensible** | 3 / 2 / 1 |
| A04 | Registro de consentimiento | Evidencia | IndexedDB cifrado | Administrador | Confidencial | 2 / 3 / 2 |
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
| A15 | Proyecto Supabase (BD PostgreSQL, Auth, claves) | Servicio / información | Nube | Equipo (cuenta del docente) | Confidencial | 3 / 3 / 2 |
| A16 | Cuenta de administrador en Supabase (correo + contraseña) | Autenticación | Supabase Auth | Administrador | Confidencial | 3 / 3 / 2 |
| A17 | Registro de incidentes | Evidencia | IndexedDB cifrado; Supabase `incidentes` | Responsable de seguridad | Confidencial | 2 / 3 / 2 |

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

Oportunidades identificadas: la nube permite respaldo y autenticación real del administrador (mitiga R02, R10, R11); la app permite medir indicadores de seguridad de forma automática (9.1).

### 3.2 Apreciación de riesgos (6.1.2, 8.2)

**Metodología** (detalle en `sgsi/metodologia_riesgos.md`): probabilidad (P) e impacto (I) en escala 1–3. **Nivel = P × I** (1–2 Bajo, 3–4 Medio, 6–9 Alto). **Criterio de aceptación:** se aceptan los riesgos Bajos; Medios y Altos se tratan y el riesgo residual lo acepta el dueño del riesgo (docente). Se repite en cada hito y ante cambios importantes (8.2), p. ej. la incorporación de Supabase.

| # | Amenaza | Vulnerabilidad | Activos | Dueño | I | P | Nivel | Tratamiento (controles 2013) |
|---|---|---|---|---|---|---|---|---|
| R01 | Acceso no autorizado a datos de salud en un equipo compartido | Datos en claro; sesión abierta | A01, A03 | Docente | 3 | 3 | **9 Alto** | Mitigar: cifrado AES-GCM, retención, borrado, expiración de sesión (A.10.1.1, A.8.3.2, A.18.1.4, A.11.2.8, A.11.2.9) |
| R02 | Un participante modifica rangos o sincronización | Autenticación del admin débil (RF02 elimina contraseña de usuario) | A05 | Docente | 2 | 3 | **6 Alto** | Mitigar: PIN PBKDF2, bloqueo, guard, auditoría y RLS en `parametros` (A.9.1.1, A.9.2.3, A.9.4.2, A.12.4.1) |
| R03 | XSS que roba o altera datos | `v-html`, scripts de terceros | A01–A07 | Equipo | 3 | 2 | **6 Alto** | Mitigar: CSP, sin `v-html`, dependencias empaquetadas (A.14.1.2, A.14.2.5, A.14.2.1) |
| R04 | Datos seriales malformados o maliciosos | Parseo sin validación; buffer ilimitado | A01, A12 | Equipo | 2 | 3 | **6 Alto** | Mitigar: parser estricto, límite de buffer (A.14.1.3, A.12.2.1) |
| R05 | Cadena de suministro comprometida (npm/CDN) | Dependencias sin fijar; CDN sin SRI | A09, A01 | Equipo | 3 | 2 | **6 Alto** | Mitigar: sin CDN, lockfile, `npm audit` (A.15.1.3, A.12.6.1, A.14.2.4) |
| R06 | Fuga por CSV exportado | Exportación sin control | A14 | Administrador | 3 | 2 | **6 Alto** | Mitigar: seudonimización, advertencia, auditoría, neutralización de fórmulas (A.13.2.1, A.8.2.3, A.8.3.1) |
| R07 | Reidentificación del participante | Nombres reales o combinación de atributos | A02, A03 | Docente | 3 | 2 | **6 Alto** | Mitigar: seudónimos, edad por rangos (A.18.1.4) |
| R08 | Tratamiento sin base legal | Sin consentimiento | A03, A04 | Docente | 3 | 2 | **6 Alto** | Mitigar: consentimiento, aviso, retiro y supresión (A.18.1.1, A.18.1.4) |
| R09 | Clickjacking, sniffing MIME, degradación a HTTP | Sin cabeceras | A12, A05 | Equipo | 2 | 2 | **4 Medio** | Mitigar: `vercel.json` (A.13.1.1, A.13.1.2, A.14.1.2) |
| R10 | Pérdida de datos por borrado del navegador | Solo almacenamiento local | A01, A05, A07 | Administrador | 2 | 2 | **4 Medio** | Mitigar con la nube (copia en Supabase, retención 365 días) + exportación manual (A.12.3.1, A.17.2.1) |
| R11 | Manipulación del registro de auditoría | Log editable desde DevTools | A07 | Administrador | 2 | 2 | **4 Medio** | Mitigar: cadena SHA-256 + réplica en `auditoria` sin UPDATE/DELETE (A.12.4.2, A.18.1.3) |
| R12 | Secretos en el bundle o source maps | Todo JS cliente es público | A06, A09, A15 | Equipo | 2 | 2 | **4 Medio** | Evitar: solo clave publicable de Supabase, sin source maps, sin `service_role` (A.9.4.5, A.10.1.2, A.14.2.6) |
| R13 | Indisponibilidad durante una sesión | Red, Vercel, desconexión USB | A11, A13 | Equipo | 2 | 1 | **2 Bajo** | Aceptar: detección de desconexión, simulador, local-first y PWA con service worker (app shell sin conexión; no cubre la nube) (A.17.1.2) |
| R14 | Descarga eléctrica al participante | USB directo con electrodos | A11 (persona) | Docente | 3 | 2 | **6 Alto** | Mitigar (seguridad de personas): aviso obligatorio, batería/Bluetooth (A.11.2.1, A.11.2.2) |
| R15 | **Fuga entre participantes en la nube** | Política RLS mal escrita o tabla sin RLS | A01, A02, A15 | Equipo | 3 | 2 | **6 Alto** | Mitigar: RLS en TODAS las tablas, `propietario = auth.uid()`, pruebas de políticas (A.9.4.1, A.14.2.8, A.18.2.3) |
| R16 | **Abuso del registro de cuentas** (altas masivas, spam de filas, fuerza bruta de contraseñas) | Cualquiera con la clave publicable puede intentar registrarse o iniciar sesión | A15 | Equipo | 2 | 2 | **4 Medio** | Mitigar: confirmación de correo, contraseña ≥ 10, límite de intentos en el cliente, límites de tasa de Supabase Auth, CAPTCHA opcional (captcha.js), CHECK de tamaño y cuotas en el servidor, purga (A.13.1.2, A.12.1.3, A.9.2.1, A.9.4.2) |
| R17 | **Compromiso de la cuenta admin de Supabase o de la clave `service_role`** | Contraseña débil, sin MFA, clave en el repositorio | A15, A16 | Docente | 3 | 1 | **3 Medio** | Mitigar: contraseña robusta + MFA del panel (manual), admin solo vía tabla `administradores` sin escritura desde la app, nunca `service_role` en el frontend (A.9.2.3, A.9.2.4, A.9.4.2, A.10.1.2) |
| R18 | **Transferencia internacional de datos de salud al proveedor** | Proyecto Supabase en la región **us-east-1** (EE. UU.), fuera de Chile | A01, A15 | Docente | 3 | 2 | **6 Alto** | Mitigar: consentimiento informado que lo declara, seudonimización, DPA del proveedor, opción local-only (A.15.1.1, A.15.1.2, A.18.1.4) |
| R19 | **Incidente no notificado o no gestionado** | Sin canal ni procedimiento | Todos | Responsable de seguridad | 2 | 2 | **4 Medio** | Mitigar: formulario en `/seguridad`, tabla `incidentes`, procedimiento (A.16.1.1–A.16.1.6) |
| R20 | **Marcas de tiempo inconsistentes** entre equipos | Relojes locales desfasados | A07, A17 | Equipo | 1 | 2 | **2 Bajo** | Aceptar con control: UTC ISO-8601 + comparación con `hora_servidor()` (A.12.4.4) |
| R21 | **Uso indebido de la cámara del celular** (captura de imágenes, flash/cámara encendidos fuera de la medición) | Permiso de cámara concedido a la PWA | A01, A02 | Equipo | 3 | 2 | **6 Alto** | Mitigar: solo se extraen promedios R/G/B de una zona central (los fotogramas nunca se guardan ni envían); consentimiento explícito en el asistente; `Permissions-Policy: camera=(self)`; cámara y flash se apagan al desconectar, al ocultar la pestaña (`visibilitychange`/`pagehide`) y al perder la pista; eventos `CAMERA_STARTED/STOPPED/DENIED` y `TORCH_UNAVAILABLE` en la auditoría (A.18.1.4, A.14.2.5, A.12.4.1, A.13.2.1) |

| R22 | **Publicación de datos de salud** (monitoreo público con datos identificables o sin consentimiento) | El titular puede marcar un monitoreo como público; divulgación irreversible en la práctica | A01, A03 | Docente | 3 | 2 | **6 Alto** | Mitigar: privado por defecto, casilla de consentimiento no premarcada, publicación solo anónima («Paciente anónimo»), perfil solo con segunda casilla, retiro registrado, reporte en /seguridad (A.8.2.3, A.13.2.1, A.18.1.4) |
| R23 | **Compromiso de cuentas y credenciales de usuarios** (contraseñas débiles o reutilizadas, correo no confirmado) | Cuentas con correo y contraseña; SMTP propio y protección de contraseñas filtradas pendientes en el panel | A15 | Equipo | 3 | 2 | **6 Alto** | Mitigar: contraseña ≥ 10, confirmación de correo, mensajes genéricos, RLS por propietario; el administrador además exige TOTP (R27); pendiente (manual): SMTP propio, protección de contraseñas filtradas (docs/PENDIENTES_MANUALES.md) (A.9.2.1, A.9.2.4, A.9.4.3) |
| R24 | **Exposición por la vista/función pública** (vista security definer que salta RLS, columnas de más, acceso anónimo, extracción masiva) | La vista monitoreos_publicos corría con los derechos de su dueño (alerta del asesor de Supabase) | A01, A15 | Equipo | 3 | 2 | **6 Alto** | Mitigar: sustituida por las funciones RPC listar_monitoreos_publicos y monitoreo_publico (security definer con search_path fijo, solo columnas permitidas, máx. 100 filas, REVOKE a public y anon, GRANT a authenticated) en migracion_endurecimiento.sql (pendiente de aplicar en la base real) (A.9.4.1, A.14.2.5, A.18.1.4) |
| R25 | **Datos conservados más de lo necesario** (monitoreos y cuentas inactivas) | Purga no programada; sin proceso para cuentas inactivas | A01, A15 | Docente | 2 | 2 | **4 Medio** | Mitigar: política de 365 días en la nube con la tarea diaria purga-ecg (pg_cron); cuentas sin acceso en 24 meses: aviso y eliminación manual (A.18.1.3, A.8.3.2, A.18.1.4) |
| R26 | **Uso de la señal PPG (MAX30100/cámara) como diagnóstico** o interpretación errónea; artefactos de movimiento | El PPG no es un ECG y la cámara no es un dispositivo médico | A01, A12 | Docente | 2 | 2 | **4 Medio** | Mitigar: aviso «no es dispositivo médico» (SafetyBanner), rótulo de la fuente de la señal, docs/ERRATAS_REQUERIMIENTOS.md (A.18.1.1, A.14.2.9) |
| R27 | **Cuenta privilegiada comprometida** (contraseña del administrador robada, phishing, restablecimiento por correo abusado, pérdida del dispositivo TOTP) | Administrador = cuenta con correo y contraseña; recuperación por correo | A15, A16 | Docente | 3 | 2 | **6 Alto** | Mitigar: segundo factor TOTP obligatorio (`es_admin()` exige `aal2` en el servidor, SEC-77/78), el restablecimiento por correo no concede privilegios, recuperación solo por procedimiento formal con regla de dos personas (SEC-80), sesión privilegiada de 15 min, reautenticación TOTP en acciones destructivas, auditoría `ADMIN_*`, al menos 2 administradores, revisión trimestral (A.9.2.3–A.9.2.6, A.9.4.2). Riesgo residual: token `aal2` vigente hasta su expiración (JWT expiry) |

> **Riesgo residual principal:** en la parte solo-frontend, quien controle el equipo y las DevTools puede saltarse los controles del cliente (sección 5.0). Con la nube, la autorización real la impone RLS en el servidor. Riesgos residuales aceptados por el docente en `sgsi/plan_tratamiento_riesgos.md`.

### 3.3 Tratamiento de riesgos (6.1.3)

Opciones elegidas en la tabla anterior; los controles se compararon con el Anexo A completo (6.1.3 c) y el resultado es la **Declaración de Aplicabilidad** de la sección 8. El plan con responsables y plazos y la aceptación de los riesgos residuales (6.1.3 e–f) están en `sgsi/plan_tratamiento_riesgos.md`.

### 3.4 Objetivos de seguridad (6.2)

Seis objetivos medibles (OBJ-1 a OBJ-6) con meta, responsable, plazo y método de evaluación en `sgsi/objetivos_seguridad.md`. La app los evalúa automáticamente en **Administración → SGSI** (`src/services/security/isms.js:evaluateObjectives`).

---

## 4. Soporte (cláusula 7)

- **7.1 Recursos:** horas del equipo, cuentas gratuitas de Vercel y Supabase, laboratorio y sensores prestados.
- **7.2 Competencia:** los integrantes que administran o desarrollan deben haber leído este documento y la política; evidencia: registro de lectura en el acta del hito (`sgsi/auditoria_interna_y_revision.md`).
- **7.3 Concienciación:** la app exige al administrador **aceptar la política vigente** antes de operar (pestaña SGSI, evento `POLICY_ACCEPTED`, `src/stores/isms.js:82`); contenido educativo en **Aprende → Seguridad de la información** (`src/data/learn/informationSecurity.js`); avisos de clasificación y seguridad eléctrica en la UI.
- **7.4 Comunicación:** qué / cuándo / a quién / quién / cómo en `sgsi/roles_responsabilidades.md` §4 (incidentes: inmediato al responsable de seguridad y al docente; brechas con datos personales: evaluación de notificación a la autoridad según la Ley 21.719).
- **7.5 Información documentada:** documentos en `docs/` y `docs/sgsi/` con cabecera de versión, fecha y clasificación (7.5.2); control de cambios con git y CHANGELOG (`monitor-ecg-vue/CAMBIOS.md`) (7.5.3). La norma original (material con licencia AENOR) **no se copia** en el repositorio: se cita solo por número y nombre de control (información de origen externo, 7.5.3).

---

## 5. Operación (cláusula 8): requisitos de implementación del frontend

**8.1 Planificación y control operacional:** los requisitos `SEC-xx` siguientes son los procesos operativos que implementan el tratamiento de riesgos (8.3). Cada uno indica sus controles del Anexo A (2013) y un criterio verificable. **[M]** obligatorio, **[S]** recomendado. Los cambios se controlan según A.12.1.2/A.14.2.2 y los procesos externalizados (Vercel, Supabase) según A.15.

### 5.0 Limitaciones de un sistema con controles en el cliente (leer primero)

1. **La autenticación local (PIN) no es seguridad real frente a quien controla el equipo.** Todo el código del cliente puede inspeccionarse. El PIN **disuade** el uso indebido casual. Para la nube, la autenticación del administrador sí es real (Supabase Auth + RLS en el servidor).
2. **El cifrado en IndexedDB protege frente a copias o volcados del almacenamiento**, no frente a XSS ni ante quien controla el navegador abierto (la clave convive en el mismo origen).
3. **Sin nube no hay respaldo central** ni auditoría inalterable: cada navegador es una isla. Con nube, la auditoría replicada no admite UPDATE/DELETE desde la app.
4. **Todo lo que está en el bundle es público**, incluidas las variables `VITE_*`: solo se usa la clave **publicable** de Supabase; la `service_role` nunca va al frontend.
5. **Transferencia a la nube:** al activar Supabase, los datos seudonimizados salen del equipo hacia el proveedor (R18); se informa en `/privacidad`.

Estas limitaciones aparecen resumidas en `/privacidad` y en el README (transparencia, A.18.1.4).

### 5.1 Roles, router y control de acceso — A.9.1.1, A.9.2.3, A.9.4.1

- **SEC-01 [M]** Dos roles en `stores/auth.js`: `participant` (por defecto) y `admin`. Estado `{ role, adminSessionExpiresAt, failedAttempts, lockedUntil }`. *(A.9.1.1)*
- **SEC-02 [M]** Rutas `/admin/*` con `meta.requiresAdmin` y guard global (`src/router/guards.js:14`); `redirect` validado contra lista blanca de nombres de ruta (sin *open redirect*). *(A.9.4.1, A.14.1.2)*
- **SEC-03 [M]** **Doble verificación:** toda acción privilegiada de Pinia llama a `assertAdmin()` (`src/stores/auth.js:40`). No basta con ocultar botones. *(A.9.2.3)*
- **SEC-04 [M]** Vistas de administración con *lazy loading*. *(A.9.4.1)*
- **SEC-05 [M]** La vista multisensor muestra solo seudónimo, señal y BPM; nunca edad, peso ni actividad de otros. *(A.9.4.1, A.18.1.4)*

### 5.2 Autenticación del administrador — A.9.2.4, A.9.3.1, A.9.4.2, A.9.4.3, A.10.1.1

- **SEC-06 [M]** Primer uso `/admin/setup`: **sin PIN por defecto**; mínimo 8 caracteres; rechaza triviales (`src/services/security/pinHash.js:15`). *(A.9.2.4, A.9.4.3)*
- **SEC-07 [M]** Se guarda solo `{ v, alg: 'PBKDF2-SHA256', iter: 600000, salt, hash }` (`pinHash.js:7`). Nunca el PIN en claro, en logs ni en la URL. *(A.9.4.3, A.10.1.1)*
- **SEC-08 [M]** Comparación en tiempo constante (`pinHash.js:50`). *(A.9.4.2)*
- **SEC-09 [M]** Bloqueo tras **5** fallos: 5, 10, 20… máx. 60 min, persistente tras recargar; fallos y bloqueos auditados (`src/services/security/lockout.js:20`). *(A.9.4.2)*
- **SEC-10 [M]** Sesión con **10 min de inactividad** y **60 min máximo** en `sessionStorage` (`lockout.js:8`); botón "Cerrar sesión" visible. *(A.9.4.2, A.11.2.8)*
- **SEC-11 [M]** Reautenticación para borrar todo, exportar todo, cambiar el PIN (`src/stores/auth.js:99`). *(A.9.2.3)*
- **SEC-12 [S]** "Cambiar PIN" exige el actual; "Olvidé el PIN" solo restablece borrando todo. *(A.9.2.4, A.9.3.1)*

### 5.3 Identificación de participantes sin contraseña (RF01, RF02) — A.9.2.1, A.18.1.4

- **SEC-13 [M]** IDs `Usuario N` generados por el sistema + `crypto.randomUUID()`; alias validado `^[A-Za-z0-9 _-]{1,20}$` con aviso de no usar datos identificables. *(A.9.2.1)*
- **SEC-14 [M]** No se piden nombre, RUT, correo, teléfono, fecha de nacimiento ni fotos. *(A.18.1.4)*
- **SEC-15 [M]** La tabla seudónimo↔persona, si existe, se custodia fuera de la app (docente). *(A.18.1.4, A.8.2.3)*

### 5.4 Consentimiento, aviso de privacidad y minimización (RF03) — A.18.1.1, A.18.1.4

- **SEC-16 [M]** Modal de consentimiento (checkbox no premarcado, finalidad, dónde se guardan, retención, quién accede, retiro, no es dispositivo médico). Sin consentimiento, se mide sin datos opcionales.
- **SEC-17 [M]** Registro `{ userId, consentVersion, acceptedAt UTC, scope }`; cambio de versión ⇒ se vuelve a pedir (`src/stores/users.js:11`).
- **SEC-18 [M]** Retirar el consentimiento borra de inmediato los datos opcionales (`users.js:116`).
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
- **SEC-27 [M]** Fallo seguro: descifrado fallido ⇒ descarte, aviso e `INTEGRITY_ERROR` (`src/main.js:22`). *(A.12.4.1, A.16.1.2)*
- **SEC-28 [M]** Se cifran mediciones, perfiles, consentimientos, configuración e incidentes. *(A.10.1.1)*
- **SEC-29 [S]** Señales largas en bloques cifrados de 2 s en IndexedDB. *(A.12.1.3)*

### 5.7 Retención y borrado — A.8.3.2, A.11.2.7, A.18.1.4

- **SEC-30 [M]** "Eliminar mis datos" del participante (local y nube) con `USER_DATA_DELETED` sin datos personales (`users.js:138`).
- **SEC-31 [M]** "Borrar todos los datos" (admin + reautenticación): datos, **clave AES** (*crypto-shredding*, `secureStorage.js:91`) y sesiones en la nube (`src/services/storage/wipe.js:14`).
- **SEC-32 [M]** Retención: local según el administrador (30 días por defecto, máx. 180), `RETENTION_PURGE` al iniciar (`src/main.js:34`); en la nube **365 días desde el inicio del monitoreo** con la tarea diaria `purga-ecg` (pg_cron → `purgar_sesiones(365)`, en `supabase/migracion_endurecimiento.sql`; falta aplicarla en la base real y verificarla en `cron.job_run_details`). Cuentas inactivas 24 meses: aviso y eliminación **manual** (sin automatizar).
- **SEC-33 [M]** Buffers en memoria vaciados al desconectar o cambiar de usuario.

### 5.8 Validación de entradas — A.14.1.3, A.14.2.5, A.12.2.1

- **SEC-34 [M]** Parser serial estricto (`src/services/parsing/ecgCsvParser.js`): línea ≤ 64 caracteres, buffer ≤ 1024, regex completa, rangos (`ecg_raw` 0–1023, `leads_off` 0/1, `bpm` 0–300), `t_ms` monótono (`DEVICE_RESET`), líneas inválidas contadas y `SERIAL_INVALID_DATA` una vez por sesión.
- **SEC-35 [M]** `baudRate` 115200 fijo; `requestPort()` solo tras gesto del usuario (`src/services/sources/SerialSource.js:58`).
- **SEC-36 [M]** Formularios validados en la UI **y** en la acción de Pinia (`src/data/defaultSettings.js:47`); en la nube, `CHECK` en el esquema.
- **SEC-37 [M]** CSV de referencia: solo `.csv`, ≤ 5 MB, validado fila a fila (`src/services/export/csvImporter.js`).

### 5.9 Registro de auditoría — A.12.4.1, A.12.4.2, A.12.4.3, A.12.4.4, A.16.1.7, A.18.1.3

- **SEC-38 [M]** `auditLog` en IndexedDB, solo inserción, `hash = SHA-256(JSON canónico + prevHash)` (`src/services/audit/auditLog.js`). Réplica en Supabase `auditoria` sin UPDATE/DELETE.
- **SEC-39 [M]** Eventos mínimos: `ADMIN_SETUP`, `ADMIN_LOGIN_OK/FAIL`, `ADMIN_LOCKED`, `ADMIN_LOGOUT`, `ADMIN_SESSION_EXPIRED`, `ADMIN_PIN_CHANGED`, `PARAM_CHANGED`, `USER_CREATED`, `CONSENT_GIVEN/WITHDRAWN`, `USER_DATA_DELETED`, `ALL_DATA_WIPED`, `RETENTION_PURGE`, `EXPORT_CSV`, `SERIAL_*`, `DEVICE_RESET`, `INTEGRITY_ERROR`, `AUDIT_EXPORTED`, `CLOUD_ADMIN_LOGIN/LOGOUT` y, nuevos con la alineación 2013: `INCIDENT_REPORTED`, `INCIDENT_UPDATED`, `POLICY_ACCEPTED`, `ACCESS_REVIEW_DONE`, `CLOCK_SKEW`.
- **SEC-40 [M]** Prohibido registrar ECG, BPM, edad, peso, PIN o hashes (`auditLog.js:28`, `sanitizeDetails`).
- **SEC-41 [M]** `/admin/auditoria`: filtro, verificación de la cadena al abrir, exportación JSON; marcas **UTC ISO-8601** con hora local visible (A.12.4.4).
- **SEC-42 [M]** Rotación 5000 entradas / 180 días con ancla (`auditLog.js:106`).

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
- **SEC-54 [M]** Sin source maps y sin `console` en producción (`vite.config.js:24`). *(A.14.2.6, A.13.2.1)*
- **SEC-55 [M]** Sin secretos en el repositorio; `.env*` ignorado; solo clave publicable de Supabase (`src/services/cloud/supabaseClient.js`). *(A.9.4.5, A.10.1.2)*
- **SEC-56 [M]** Sin datos reales en desarrollo: simulador y referencia sintética. *(A.14.3.1)*
- **SEC-57 [M]** Pruebas Vitest de parser, cifrado, PBKDF2, bloqueo, sesión, redirect, CSV, auditoría y, desde la v2.0, incidentes, revisión de accesos, reloj e indicadores (`tests/isms.spec.js`). *(A.14.2.8, A.14.2.9)*
- **SEC-58 [M]** CI y Dependabot implementados; **falta la protección de la rama `main`** (acción manual en GitHub: PR con revisión y comprobaciones obligatorias) y producción solo desde `main`. *(A.12.1.4, A.14.2.2, A.6.1.2)*

### 5.13 Disponibilidad y continuidad (RNF05) — A.17.1.2, A.17.2.1, A.12.1.3, A.12.3.1

- **SEC-59 [M]** Detección de desconexión del puerto: "Señal perdida", `SERIAL_LOST`, datos conservados. *(A.17.1.2)*
- **SEC-60 [M]** Buffers circulares fijos y máximo de **5 sensores** (`src/stores/channels.js:6`). *(A.12.1.3)*
- **SEC-61 [S]** `navigator.storage.estimate()` con aviso al 80 % y `persist()` (`src/main.js:41`). *(A.12.1.3)*
- **SEC-62 [S]** PWA con service worker escrito a mano (`public/sw.js`): app shell en caché (precache de `/`, `index.html`, manifiesto e iconos; `/assets/*` cache-first; navegación network-first con respaldo a `index.html`); no intercepta otros orígenes ni métodos distintos de GET. **Cubre:** abrir la app y trabajar con datos locales sin conexión. **No cubre:** la nube (Supabase), la sincronización ni la lista pública de la comunidad sin red. *(A.17.2.1)* Prueba: `e2e/pwa.spec.js`.

### 5.14 Requisitos nuevos de la alineación 2013 (funcionalidad del SGSI en la app)

| ID | Requisito | Control | Evidencia |
|---|---|---|---|
| SEC-63 [M] | Política de seguridad y uso aceptable visible en `/seguridad` | A.5.1.1, A.8.1.3 | `src/views/SecurityView.vue`, `src/data/securityPolicy.js` |
| SEC-64 [M] | El admin acepta la política vigente antes de operar (auditado) | A.7.2.2, 7.3 | `src/stores/isms.js:82`, `src/services/security/isms.js:17` |
| SEC-65 [M] | Notificación de eventos y puntos débiles por cualquier usuario, sin datos personales ni de salud, cifrada local y en la tabla `incidentes` con RLS | A.16.1.2, A.16.1.3 | `src/services/security/incidents.js:48`, `src/stores/isms.js:52`, `supabase/schema.sql` |
| SEC-66 [M] | Evaluación, respuesta y cierre con lección aprendida (solo admin) | A.16.1.4–A.16.1.6 | `incidents.js:88`, `src/components/admin/IsmsPanel.vue` |
| SEC-67 [M] | Revisión periódica (90 días) de derechos de acceso con registro | A.9.2.5 | `isms.js:22`, `stores/isms.js:90` |
| SEC-68 [S] | Comparación del reloj con `hora_servidor()` y evento `CLOCK_SKEW` | A.12.4.4 | `isms.js:34`, `src/services/cloud/cloudSync.js:222` |
| SEC-69 [M] | Indicadores de seguridad y objetivos en el panel admin | 9.1, 6.2 | `isms.js:53` (`computeSecurityMetrics`, `evaluateObjectives`) |

### 5.14b Cuentas, pacientes propios y publicación de monitoreos — A.9.2.x, A.9.4.x, A.13.2.x, A.18.1.4

**Riesgo nuevo R-PUB (publicación de datos de salud).** Un usuario podría publicar un monitoreo con datos que identifiquen a una persona, o publicarlo sin su consentimiento. Valoración inherente: alta (dato de salud, divulgación irreversible en la práctica). Tratamiento: visibilidad privada por defecto; casilla de consentimiento explícita no premarcada; publicación solo anónima (funciones RPC `listar_monitoreos_publicos`/`monitoreo_publico`, riesgos R22 y R24: sin etiqueta, alias, nombre, nota ni propietario); datos del paciente solo con segunda casilla y consentimiento vigente; retiro inmediato y registrado; lectura solo para cuentas autenticadas (nunca anon). Riesgo residual: medio (copia previa por terceros que ya vieron el dato).

- **SEC-70 (A.9.2.1, A.9.2.2, A.9.4.2).** Cuentas con Supabase Auth, contraseña ≥ 10 con letras y números, confirmación por correo, mensajes genéricos y límite de intentos en el cliente (servidor: rate limits de Auth).
- **SEC-71 (A.9.1.1, A.9.4.1).** Pacientes propiedad de la cuenta con RLS (`propietario = (select auth.uid())`); el administrador no tiene política sobre `pacientes` (decisión de minimización).
- **SEC-72 (A.13.2.1, A.18.1.4).** Visibilidad `privado`/`publico` con consentimiento; la tabla `sesiones` no tiene SELECT público: lo público sale solo por las funciones RPC de columnas permitidas (sustituyen a la vista; `migracion_endurecimiento.sql`); `bloques_muestras` de sesiones públicas se leen mediante `sesion_es_publica()`.
- **SEC-73 (A.18.1.4).** El perfil del paciente solo se publica con `compartir_perfil`; retirar el consentimiento lo retira de los monitoreos (trigger `tg_paciente_perfil`).
- **SEC-74 (A.11.2.7, A.8.3.2).** Datos locales por espacio de cuenta; al cerrar sesión se ofrecen quitar los datos del equipo.
- **SEC-75 (A.12.4.1).** Auditoría de `ACCOUNT_*`, `PATIENT_*`, `VISIBILITY_CHANGED` y `LOCAL_DATA_LINKED` (sin correos ni datos de salud) en la lista blanca de cliente y servidor.
- **SEC-76 (A.18.1.4).** Supresión: `borrar_mis_datos()` incluye pacientes; `eliminar_mi_cuenta()` elimina cuenta y datos.

### 5.14c Administrador con cuenta y segundo factor (TOTP) — A.9.2.3, A.9.2.4, A.9.2.5, A.9.2.6, A.9.4.2

Con la nube activa el administrador **es una cuenta normal** (se entra en `/acceso`) con rol asignado y TOTP; el PIN local deja de intervenir. Sin nube, el administrador local con PIN sigue siendo el único mecanismo (limitación en `sgsi/control_acceso.md`).

- **SEC-77 [M] (A.9.2.3, A.9.4.2).** `public.es_admin_registrado()` (rol asignado, solo para mostrar el botón Admin) separada de `public.es_admin()` (rol **y** `auth.jwt() ->> 'aal' = 'aal2'`), ambas `security definer`, `search_path` fijo, `REVOKE` a `anon`, `(select auth.uid())`. Todas las políticas RLS siguen usando `es_admin()`: sin segundo factor no hay privilegios. `supabase/migracion_admin_mfa.sql`, `schema.sql`.
- **SEC-78 [M] (A.9.4.2).** TOTP con `supabase.auth.mfa` (inscripción con QR como SVG data-URI en `<img>`, sin HTML crudo; verificación; subida a `aal2`), vista `/admin/mfa`, guard `requireAdmin` (cuenta + rol + `aal2`), límite de 5 intentos/10 min en el cliente y mensajes genéricos (`src/services/security/adminMfa.js`, `src/views/admin/AdminMfaView.vue`, `src/router/guards.js`).
- **SEC-79 [M] (A.9.2.3).** `administradores` no admite escritura directa (`revoke insert, update, delete` a `anon`/`authenticated`): el rol solo cambia con `admin_conceder_rol(correo)` y `admin_retirar_rol(id)` (pestaña Administradores, ver SEC-83) o, como contingencia, por SQL del dueño del proyecto. `/admin/acceso` y `/admin/setup` redirigen a `/acceso` cuando la nube está activa (`redirect` en lista blanca).
- **SEC-80 [M] (A.9.2.4).** Recuperación formal: el restablecimiento por correo no concede privilegios (sin TOTP no hay `aal2`); la pérdida del factor se resuelve con `sgsi/recuperacion_acceso_admin.md` (identidad por canal distinto, aprobación de otra persona, ejecución por el dueño del proyecto, registro y revisión posterior). Aviso en `/recuperar`.
- **SEC-81 [M] (A.9.2.5, A.9.2.6).** `public.admin_listar_administradores()` (solo `es_admin()`, devuelve id, correo y fecha) alimenta Administración → Administradores y SGSI → Revisión de derechos (`ACCESS_REVIEW_DONE`, botón "Registrar revisión"); el retiro del rol es inmediato en el servidor; mínimo dos administradores recomendado.
- **SEC-82 [M] (A.9.4.2, A.12.4.1).** Sesión privilegiada de 15 min de inactividad (máx. 60), cerrar la cuenta o salir del modo admin la cierra y exige un código nuevo; reautenticación TOTP en borrado total, exportación global y cambio de retención; eventos `ADMIN_ACCOUNT_LOGIN`, `ADMIN_MFA_ENROLLED`, `ADMIN_MFA_VERIFIED`, `ADMIN_MFA_FAILED`, `ADMIN_ROLE_GRANTED`, `ADMIN_ROLE_REVOKED`, `ADMIN_RECOVERY_REQUESTED` en la lista blanca de cliente y servidor (los tres últimos se anotan al registrar concesiones, retiros y recuperaciones).
- **SEC-83 [M] (A.9.2.3, A.9.2.6, A.12.4.1).** Gestión de administradores desde la app (`supabase/migracion_admin_roles.sql`, `src/components/admin/AdminRolesPanel.vue`, `src/stores/admin.js`): `admin_conceder_rol` y `admin_retirar_rol` son `security definer`, `search_path` fijo, `REVOKE` a `anon`, exigen `es_admin()` (rol + `aal2`) y bloquean la tabla para respetar el **máximo de 5 administradores**; la concesión normaliza el correo (minúsculas, formato, ≤ 254), exige cuenta existente con `email_confirmed_at` y responde con un mensaje **genérico** (no revela si el correo existe); el retiro no permite retirarse a uno mismo ni dejar menos de 1 administrador. Cada acción pide un **código TOTP nuevo** (SEC-11) y el retiro, además, confirmación explícita. Auditoría `ADMIN_ROLE_GRANTED` / `ADMIN_ROLE_REVOKED` en el servidor (detalle `{objetivo, por}`, sin correos) y en el registro local/nube del cliente (la copia de la nube puede aparecer duplicada: servidor y cliente).
- **SEC-84 [M] (A.9.2.3, A.12.1.2).** Los parámetros globales (rangos y sincronización) los guarda el administrador con `aal2` y se publican en la nube (`parametros`, RLS `es_admin()`); antes de publicar se vuelve a consultar `es_admin()` y el aviso indica si se publicó o no. El PIN local no interviene con nube (`src/stores/settings.js`, `src/services/cloud/cloudSync.js`).
- **Limitación.** El servidor valida el `aal` del token de acceso: tras cerrar el modo admin en la app, un token `aal2` ya emitido sigue aceptado hasta expirar (JWT expiry, 1 h por defecto); la retirada del rol sí es inmediata.
- **Limitación.** Un monitoreo público ya visto o descargado por otra cuenta no puede "des-publicarse" en el equipo de esa persona.

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
- [ ] Con dos sesiones anónimas distintas, ninguna lee las filas de la otra (RLS) y el admin sí.
- [ ] `/seguridad` visible; un participante puede notificar un incidente; el admin lo cierra solo con respuesta y lección.
- [ ] El panel SGSI muestra indicadores, objetivos, revisión de accesos y reloj.
- [ ] Con nube: sin rol de administrador no aparece el botón Admin; con rol pero sin TOTP, `/admin` lleva a `/admin/mfa`; sin `aal2` las consultas privilegiadas (p. ej. `admin_listar_administradores()`) fallan en el servidor.
- [ ] `/admin/acceso` redirige a `/acceso` con la nube activa; el restablecimiento por correo no da acceso al panel.

---

## 6. Evaluación del desempeño (cláusula 9)

- **9.1 Seguimiento y medición:** indicadores automáticos en **Administración → SGSI** (inicios fallidos y bloqueos en 30 días, integridad de la auditoría, incidentes abiertos y de severidad alta, exportaciones, desfase del reloj, revisión de accesos, aceptación de la política) y manuales (resultado de `npm test`, `npm audit`, nota de securityheaders.com, checklist 5.15). Qué, cómo, cuándo y quién: `sgsi/objetivos_seguridad.md` §3.
- **9.2 Auditoría interna:** programa por hito, con auditor de otro grupo para objetividad; plantilla en `sgsi/auditoria_interna_y_revision.md` §1.
- **9.3 Revisión por la dirección:** el docente revisa al cierre de cada hito con las entradas 9.3 a)–f); plantilla de acta en `sgsi/auditoria_interna_y_revision.md` §2.

## 7. Mejora (cláusula 10)

- **10.1 No conformidad y acción correctiva:** registro con causa raíz, corrección, acción correctiva y verificación de eficacia en `sgsi/registro_no_conformidades.md` (incluye las NC detectadas en esta alineación, p. ej. la referencia a la edición 2022).
- **10.2 Mejora continua:** las oportunidades de mejora de la revisión por la dirección y las lecciones de incidentes (A.16.1.6) alimentan el backlog.

---

## 8. Declaración de Aplicabilidad (SoA) — Anexo A de ISO/IEC 27001:2013 (114 controles)

Leyenda. **Aplica:** Sí / Parcial (aplica con alcance reducido) / No (excluido, con justificación). **Estado:** Implementado · Documentado (control organizativo con procedimiento escrito) · Parcial · Pendiente · N/A. Las evidencias de código usan `archivo:línea` relativos a `monitor-ecg-vue/` salvo `supabase/` y `docs/`.

### A.5 Políticas de seguridad de la información

| Control | Nombre | Aplica | Justificación | Estado | Evidencia |
|---|---|---|---|---|---|
| A.5.1.1 | Políticas para la seguridad de la información | Sí | Exigida por 5.2; marco para RNF06 | Implementado | `docs/sgsi/politica_seguridad.md`; `/seguridad` (`src/views/SecurityView.vue`) |
| A.5.1.2 | Revisión de las políticas para la seguridad de la información | Sí | Cambios de arquitectura (nube) obligan a revisar | Documentado | Revisión por hito, `sgsi/auditoria_interna_y_revision.md`; `POLICY_VERSION` (`src/services/security/isms.js:11`) |

### A.6 Organización de la seguridad de la información

| Control | Nombre | Aplica | Justificación | Estado | Evidencia |
|---|---|---|---|---|---|
| A.6.1.1 | Roles y responsabilidades en seguridad de la información | Sí | Distinguir docente, responsable, admin, participante, desarrollador | Documentado | `sgsi/roles_responsabilidades.md`; tabla de roles en `/seguridad` |
| A.6.1.2 | Segregación de tareas | Parcial | Equipo pequeño | Parcial | Participante no configura; admin no aprueba su propio PR (`SEC-58`); auditor interno de otro grupo |
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
| A.7.2.2 | Concienciación, educación y capacitación en seguridad de la información | Sí | Administrador y equipo manejan datos de salud | Implementado | Aceptación de política en la app (`src/stores/isms.js:82`); Aprende → Seguridad de la información (`src/data/learn/informationSecurity.js`) |
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
| A.8.3.2 | Eliminación de soportes | Sí | Derecho de supresión y fin del curso | Implementado | *Crypto-shredding* (`src/services/storage/secureStorage.js:91`, `src/services/storage/wipe.js:14`); nube: purga a 365 días (pg_cron, pendiente de aplicar) |
| A.8.3.3 | Soportes físicos en tránsito | Parcial | Portátiles/USB fuera del laboratorio | Documentado | Prohibido trasladar CSV sin cifrar (uso aceptable §4) |

### A.9 Control de acceso

| Control | Nombre | Aplica | Justificación | Estado | Evidencia |
|---|---|---|---|---|---|
| A.9.1.1 | Política de control de acceso | Sí | RNF06: limitar funciones administrativas | Implementado | `sgsi/control_acceso.md`; RBAC (`src/stores/auth.js`); RLS (`supabase/schema.sql`) |
| A.9.1.2 | Acceso a las redes y a los servicios de red | Parcial | Solo el proyecto Supabase y el propio origen | Implementado | CSP `connect-src` (`vercel.json:11`); solo clave publicable (`src/services/cloud/supabaseClient.js:15`) |
| A.9.2.1 | Registro y baja de usuario | Sí | Cuentas de usuario con correo y contraseña; pacientes propios | Implementado | Supabase Auth (`src/services/accounts/authService.js`); alta, acceso y baja auditados (`ACCOUNT_*`); `eliminar_mi_cuenta()`; CAPTCHA opcional (`captcha.js`); la autenticación anónima se eliminó — SUG-04 |
| A.9.2.2 | Provisión de acceso de usuario | Sí | Rol admin solo por alta explícita | Implementado | Rol concedido por otro administrador con `aal2` desde la app (`admin_conceder_rol`, SEC-83) o, como contingencia, por el dueño del proyecto con SQL (`supabase/migracion_admin_roles.sql`); sin nube, setup único de PIN (`src/router/guards.js`) |
| A.9.2.3 | Gestión de privilegios de acceso | Sí | Acciones privilegiadas restringidas | Implementado | `assertAdmin()` (`src/stores/auth.js`); `es_admin()` = rol + `aal2` en RLS; rol solo vía `admin_conceder_rol` / `admin_retirar_rol` (sin escritura directa; máx. 5; TOTP nuevo en cada acción) (`supabase/migracion_admin_roles.sql`, SEC-77/79/83) |
| A.9.2.4 | Gestión de la información secreta de autenticación de los usuarios | Sí | Contraseña de la cuenta, secreto TOTP y PIN local (sin nube) | Implementado | Sin PIN por defecto, PBKDF2 (`src/services/security/pinHash.js:7`); TOTP del administrador, secreto mostrado solo en la inscripción (SEC-78); recuperación formal `docs/sgsi/recuperacion_acceso_admin.md` (SEC-80); MFA del panel Supabase (`SEC-50`) |
| A.9.2.5 | Revisión de los derechos de acceso de usuario | Sí | Administradores (nube) y admin local (sin nube) | Implementado | Administración → Administradores y SGSI → Revisión con la lista de `admin_listar_administradores()` y botón "Registrar revisión" (`src/components/admin/AdminRolesPanel.vue`, `IsmsPanel.vue`, `src/stores/isms.js`, `src/services/security/isms.js:22`; SEC-81) |
| A.9.2.6 | Retirada o reasignación de los derechos de acceso | Sí | Cambio de administrador o baja de participante | Implementado | "Retirar rol" en Administración → Administradores (`admin_retirar_rol`: confirmación + TOTP nuevo; no a uno mismo; mínimo 1) o, como contingencia, `delete` del dueño del proyecto (`docs/sgsi/recuperacion_acceso_admin.md`, SEC-81/83); cerrar la sesión de la cuenta cierra el modo admin; "Eliminar mis datos" (`src/stores/users.js:138`) |
| A.9.3.1 | Uso de la información secreta de autenticación | Sí | El admin no comparte el PIN | Documentado | `sgsi/control_acceso.md` §4; política de uso aceptable |
| A.9.4.1 | Restricción del acceso a la información | Sí | El participante solo ve lo suyo | Implementado | `listSessions` por usuario (`src/services/storage/sessionRepository.js:35`); RLS `propietario = auth.uid()` |
| A.9.4.2 | Procedimientos seguros de inicio de sesión | Sí | Cuentas, administrador con TOTP (nube) y admin local (sin nube) | Implementado | Administrador = cuenta + TOTP `aal2` exigido por `es_admin()` en el servidor, sesión privilegiada de 15 min y reautenticación (SEC-77..82); Bloqueo (`src/services/security/lockout.js:20`), expiración (`lockout.js:8`), Supabase Auth con confirmación de correo (`authService.js`); límite de intentos en cliente y de tasa en Supabase; CAPTCHA opcional; protección de contraseñas filtradas pendiente (manual) — SUG-04 |
| A.9.4.3 | Sistema de gestión de contraseñas | Sí | Calidad del PIN | Implementado | `validateNewPin` (`src/services/security/pinHash.js:15`) |
| A.9.4.4 | Uso de utilidades con privilegios del sistema | No | La SPA no usa ni ofrece utilidades privilegiadas; la clave `service_role` no se usa | N/A | — |
| A.9.4.5 | Control de acceso al código fuente de los programas | Sí | Repositorio | Documentado | GitHub con acceso mínimo y `main` protegida (`SEC-58`) |

> Actualización 2026-10-20 (cuentas): A.9.2.1/A.9.2.2/A.9.2.4 → aplicable, implementado con Supabase Auth (SEC-70); A.9.4.1 → RLS por propietario y vista pública (SEC-71/72); A.13.2.1/A.13.2.4 → publicación controlada y consentimiento (SEC-72); A.18.1.4 → SEC-73/76; A.11.2.7 → SEC-74. Ver sección 5.14b.

### A.10 Criptografía

| Control | Nombre | Aplica | Justificación | Estado | Evidencia |
|---|---|---|---|---|---|
| A.10.1.1 | Política de uso de los controles criptográficos | Sí | Datos sensibles en reposo y tránsito | Implementado | AES-GCM 256 (`src/services/storage/secureStorage.js:47`), PBKDF2, SHA-256, TLS; política §4; `docs/sgsi/politica_criptografica.md` — SUG-13 |
| A.10.1.2 | Gestión de claves | Sí | Ciclo de vida de la clave AES y de las claves de Supabase | Implementado | Clave no extraíble en IndexedDB (`secureStorage.js:27`), destrucción (`secureStorage.js:91`); clave publicable vs `service_role`; ciclo de vida en `docs/sgsi/politica_criptografica.md` §2 — SUG-13 |

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
| A.11.2.7 | Reutilización o eliminación segura de equipos | Sí | PC prestado devuelto con datos | Implementado | "Borrar todos los datos" con *crypto-shredding* (`src/services/storage/wipe.js:14`) |
| A.11.2.8 | Equipo de usuario desatendido | Sí | Laboratorio compartido | Implementado | Expiración por inactividad 10 min (`src/services/security/lockout.js:8`), "Cerrar sesión" |
| A.11.2.9 | Política de puesto de trabajo despejado y pantalla limpia | Sí | Datos de salud en pantalla | Implementado | Datos opcionales ocultos en multisensor (`SEC-05`); regla en uso aceptable §3 |

### A.12 Seguridad de las operaciones

| Control | Nombre | Aplica | Justificación | Estado | Evidencia |
|---|---|---|---|---|---|
| A.12.1.1 | Documentación de procedimientos operacionales | Sí | Sesiones de medición, exportación, borrado | Documentado | README, `sgsi/plan_continuidad.md`, `docs/VERIFICACION.md` |
| A.12.1.2 | Gestión de cambios | Sí | Código y parámetros | Implementado | `PARAM_CHANGED` (`src/stores/settings.js:89`); CAMBIOS.md; PR con revisión |
| A.12.1.3 | Gestión de capacidades | Sí | 5 sensores × 250 Hz; cuota del navegador | Implementado | `MAX_CHANNELS` (`src/stores/channels.js:6`); `storage.estimate()` (`src/main.js:41`); `CHECK` de 2000 muestras; cuotas por usuario (sesiones/día, bloques/min, auditoría/h, incidentes/día) y `CHECK` de tamaño en `supabase/schema.sql` (`public.cuota()`); límites del cliente `rateLimiter.js` — SUG-05 |
| A.12.1.4 | Separación de los recursos de desarrollo, prueba y operación | Sí | Previews vs producción | Documentado | Vercel Preview/Production; `.env.local` fuera del repositorio |
| A.12.2.1 | Controles contra el código malicioso | Parcial | Entrada serial y CSV externos | Implementado | Parser estricto, sin `eval` (ESLint `no-eval`), CSP |
| A.12.3.1 | Copias de seguridad de la información | Parcial | Local-first con copia opcional en la nube | Parcial | Réplica en Supabase (`cloudSync.js`), exportación CSV/JSON; respaldo de Supabase según plan del proveedor |
| A.12.4.1 | Registro de eventos | Sí | Trazabilidad | Implementado | `src/services/audit/auditLog.js`; réplica `auditoria` |
| A.12.4.2 | Protección de la información del registro | Sí | Evitar manipulación | Implementado | Cadena SHA-256 y `verify()` (`auditLog.js:127`); sin UPDATE/DELETE en `auditoria`; en la nube: lista blanca de tipos, detalle ≤ 2 KB, `ts` y `usuario` fijados por trigger del servidor (`tg_auditoria_servidor`) — SUG-14 |
| A.12.4.3 | Registros de administración y operación | Sí | Acciones del administrador | Implementado | Eventos `ADMIN_*`, `PARAM_CHANGED`, `ACCESS_REVIEW_DONE`; vista `/admin/auditoria` |
| A.12.4.4 | Sincronización del reloj | Sí | Correlación de eventos entre equipos | Implementado | UTC ISO-8601 (`auditLog.js:91`); `hora_servidor()` + `clockSkew` (`src/services/security/isms.js:34`) |
| A.12.5.1 | Instalación del software en explotación | Sí | Despliegue | Documentado | Solo desde `main` vía Vercel; `npm ci` |
| A.12.6.1 | Gestión de las vulnerabilidades técnicas | Sí | Dependencias npm | Implementado | `npm audit --audit-level=high` en `.github/workflows/ci.yml`; `.github/dependabot.yml`; registro en `docs/sgsi/proveedores.md` §2 — SUG-10/18 |
| A.12.6.2 | Restricción en la instalación de software | No | La app no instala software; los PCs del laboratorio los gestiona la universidad | N/A | — |
| A.12.7.1 | Controles de auditoría de sistemas de información | No | No se auditan sistemas en producción con herramientas intrusivas | N/A | — |

### A.13 Seguridad de las comunicaciones

| Control | Nombre | Aplica | Justificación | Estado | Evidencia |
|---|---|---|---|---|---|
| A.13.1.1 | Controles de red | Parcial | Solo HTTPS | Implementado | HSTS, `upgrade-insecure-requests` (`vercel.json:11`); cuotas del servidor frente a abuso de la API (`supabase/schema.sql`) |
| A.13.1.2 | Seguridad de los servicios de red | Sí | Vercel y Supabase | Implementado | Cabeceras de seguridad; TLS de Supabase; límites de tasa de Supabase Auth |
| A.13.1.3 | Segregación en redes | No | No hay red propia | N/A | — |
| A.13.2.1 | Políticas y procedimientos de intercambio de información | Sí | Exportación CSV y sincronización | Implementado | Exportación seudonimizada y auditada (`src/stores/admin.js`); política §4 |
| A.13.2.2 | Acuerdos de intercambio de información | Parcial | Entrega de CSV a terceros (docente/investigador) | Documentado | Solo a personal autorizado; uso aceptable §4 |
| A.13.2.3 | Mensajería electrónica | No | La app no envía correos ni mensajes | N/A | — |
| A.13.2.4 | Acuerdos de confidencialidad o no revelación | Sí | Integrantes con acceso a datos | Documentado | Compromiso de confidencialidad (`sgsi/roles_responsabilidades.md` §3) |

### A.14 Adquisición, desarrollo y mantenimiento de los sistemas de información

| Control | Nombre | Aplica | Justificación | Estado | Evidencia |
|---|---|---|---|---|---|
| A.14.1.1 | Análisis de requisitos y especificaciones de seguridad de la información | Sí | RNF06 | Implementado | Sección 5 (SEC-01..SEC-69) |
| A.14.1.2 | Asegurar los servicios de aplicaciones en redes públicas | Sí | SPA pública en Internet | Implementado | CSP, HSTS, RLS en Supabase |
| A.14.1.3 | Protección de las transacciones de servicios de aplicaciones | Sí | Escrituras a Supabase | Implementado | Upsert idempotente por clave primaria, `CHECK` de consistencia (`supabase/schema.sql`), cola serie (`cloudSync.js`) |
| A.14.2.1 | Política de desarrollo seguro | Sí | Proyecto de desarrollo | Implementado | ESLint seguridad (`eslint.config.js:35`), reglas SEC-53 |
| A.14.2.2 | Procedimiento de control de cambios en sistemas | Sí | Cambios de código y esquema | Documentado | PR + CAMBIOS.md; esquema SQL idempotente; plantilla de PR con checklist de seguridad (`.github/pull_request_template.md`) |
| A.14.2.3 | Revisión técnica de las aplicaciones tras efectuar cambios en el sistema operativo | No | La SPA corre en el navegador, no depende del SO del servidor | N/A | Se reemplaza por pruebas tras actualizar el navegador (A.14.2.9) |
| A.14.2.4 | Restricciones a los cambios en los paquetes de software | Sí | No parchear `node_modules` | Implementado | Versiones fijadas `~` y lockfile (`package.json`) |
| A.14.2.5 | Principios de ingeniería de sistemas seguros | Sí | Diseño | Implementado | Defensa en profundidad, mínimo privilegio, fallo seguro (`src/stores/settings.js:53`) |
| A.14.2.6 | Entorno de desarrollo seguro | Sí | Equipos y secretos del equipo | Implementado | `.env.local` ignorado, sin source maps (`vite.config.js:26`) |
| A.14.2.7 | Externalización del desarrollo de software | No | Lo desarrolla el propio equipo | N/A | — |
| A.14.2.8 | Pruebas funcionales de seguridad de sistemas | Sí | Verificar controles | Implementado | `tests/security.spec.js`, `tests/isms.spec.js`; `tests/abuseControls.spec.js`; CI `.github/workflows/ci.yml` — SUG-10 |
| A.14.2.9 | Pruebas de aceptación de sistemas | Sí | Entrega por hito | Implementado | Checklist 5.15; `docs/VERIFICACION.md`; E2E Playwright `e2e/*.spec.js` en CI; matriz `docs/TRAZABILIDAD.md` — SUG-11 |
| A.14.3.1 | Protección de los datos de prueba | Sí | No usar datos reales | Implementado | Simulador (`src/services/sources/SimulatorSource.js`), referencia sintética |

### A.15 Relación con proveedores

| Control | Nombre | Aplica | Justificación | Estado | Evidencia |
|---|---|---|---|---|---|
| A.15.1.1 | Política de seguridad de la información en las relaciones con los proveedores | Sí | Supabase almacena datos de salud seudonimizados; Vercel sirve la app | Documentado | Política §5 (proveedores en la nube); términos y DPA de Supabase/Vercel; fichas en `docs/sgsi/proveedores.md` — SUG-15 |
| A.15.1.2 | Requisitos de seguridad en contratos con terceros | Parcial | Planes gratuitos con términos estándar | Documentado | Revisión de DPA, región del proyecto y certificaciones del proveedor (R18) |
| A.15.1.3 | Cadena de suministro de tecnología de la información y de las comunicaciones | Sí | Paquetes npm | Implementado | Sin CDN, lockfile, `npm audit` |
| A.15.2.1 | Control y revisión de la provisión de servicios del proveedor | Parcial | Disponibilidad de Vercel/Supabase | Documentado | Revisión de la página de estado y avisos en cada hito; revisión semestral registrada en `docs/sgsi/proveedores.md` |
| A.15.2.2 | Gestión de cambios en la provisión del servicio del proveedor | Parcial | Cambios de API/planes del proveedor | Documentado | Reapreciación del riesgo ante cambios (8.2) |

### A.16 Gestión de incidentes de seguridad de la información

| Control | Nombre | Aplica | Justificación | Estado | Evidencia |
|---|---|---|---|---|---|
| A.16.1.1 | Responsabilidades y procedimientos | Sí | Fuga de CSV, alteración, acceso indebido | Documentado | `sgsi/procedimiento_incidentes.md` |
| A.16.1.2 | Notificación de los eventos de seguridad de la información | Sí | Canal rápido para cualquier usuario | Implementado | `/seguridad#reportar` (`src/components/security/IncidentReportForm.vue`), `src/stores/isms.js:52`, tabla `incidentes` |
| A.16.1.3 | Notificación de puntos débiles de la seguridad | Sí | Debilidades observadas | Implementado | Tipo `debilidad` (`src/services/security/incidents.js`) |
| A.16.1.4 | Evaluación y decisión sobre los eventos de seguridad de información | Sí | Clasificar evento vs. incidente | Implementado | Estados `en_analisis`/`descartado` (`incidents.js:88`) |
| A.16.1.5 | Respuesta a incidentes de seguridad de la información | Sí | Contención y recuperación | Implementado | Respuesta obligatoria para cerrar (`incidents.js:88`); procedimiento §3 |
| A.16.1.6 | Aprendizaje de los incidentes de seguridad de la información | Sí | Mejora continua | Implementado | Lección aprendida obligatoria; entrada a 10.1 |
| A.16.1.7 | Recopilación de evidencias | Sí | Investigación | Implementado | Exportación JSON de la auditoría con verificación (`src/stores/admin.js`); incidentes sin DELETE en la nube |

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
| A.18.1.1 | Identificación de la legislación aplicable y de los requisitos contractuales | Sí | Datos de salud | Documentado | Ley 19.628, Ley 21.719, Ley 20.584; términos de proveedores; `/privacidad` |
| A.18.1.2 | Derechos de Propiedad Intelectual (DPI) | Sí | Librerías y la propia norma | Implementado | Licencias MIT (Vue, uPlot); la norma UNE con licencia no se copia al repositorio |
| A.18.1.3 | Protección de los registros de la organización | Sí | Consentimientos, auditoría, incidentes | Implementado | Cifrado + cadena de hashes; auditoría 180 días; monitoreos locales 30 días (por defecto) y en la nube 365 días desde el inicio |
| A.18.1.4 | Protección y privacidad de la información de carácter personal | Sí | **Control central**: datos de salud | Implementado | Seudónimos, consentimiento, minimización, cifrado, supresión, RLS (`src/views/PrivacyView.vue`); base legal, transferencia internacional, tabla de derechos y "Eliminar mis datos en la nube" (`borrar_mis_datos()`) — SUG-06 |
| A.18.1.5 | Regulación de los controles criptográficos | Sí | Uso de criptografía estándar | Implementado | Web Crypto (algoritmos estándar, sin restricciones de exportación aplicables) |
| A.18.2.1 | Revisión independiente de la seguridad de la información | Parcial | Evaluación académica | Documentado | Auditoría por otro grupo y docente (`sgsi/auditoria_interna_y_revision.md`) |
| A.18.2.2 | Cumplimiento de las políticas y normas de seguridad | Sí | Verificar el SoA | Implementado | Indicadores y objetivos en la app (`src/services/security/isms.js:53`) |
| A.18.2.3 | Comprobación del cumplimiento técnico | Sí | Pruebas técnicas | Parcial | `npm test`, `npm run lint`, CI, securityheaders.com; la prueba real de RLS con dos cuentas está pendiente (docs/PENDIENTES_MANUALES.md) |

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
| Confidencialidad | Que los datos de salud no se lean sin autorización | A.8.2.1, A.8.2.2, A.9.4.1, A.10.1.1, A.10.1.2, A.11.2.8, A.18.1.4 | SEC-05, SEC-13–15, SEC-20, SEC-22–29, SEC-44 |
| Integridad | Señal, configuración y registros sin alterar | A.12.4.2, A.14.1.3, A.14.2.5, A.12.2.1, A.18.1.3 | SEC-27, SEC-28, SEC-34–38 |
| Privacidad y legalidad | Consentimiento, minimización, supresión | A.18.1.1, A.18.1.4, A.8.3.2 | SEC-16–21, SEC-30–33 |
| Fuga | Salida controlada de datos | A.13.2.1, A.8.2.3, A.8.3.1 | SEC-43–47, SEC-50, SEC-54 |
| Plataforma, nube y código | XSS, cadena de suministro, RLS, configuración | A.9.1.2, A.12.6.1, A.13.1.1, A.13.1.2, A.14.1.2, A.14.2.1, A.14.2.5, A.14.2.8, A.15.1.1, A.15.1.3 | SEC-48–58 |
| Limitar funciones administrativas | Solo el admin configura (RF15, RF25–RF27) | A.9.1.1, A.9.2.1–A.9.2.6, A.9.4.2, A.9.4.3 | SEC-01–12, SEC-67, SEC-77–82 |
| Trazabilidad | Quién cambió qué y cuándo | A.12.4.1–A.12.4.4, A.16.1.7 | SEC-38–42, SEC-68 |
| Gestión de incidentes | Detectar, notificar y aprender | A.16.1.1–A.16.1.7 | SEC-65, SEC-66 |
| Disponibilidad (RNF05) | La protección no impide medir | A.12.1.3, A.12.3.1, A.17.1.2, A.17.2.1 | SEC-59–62 |
| Gobernanza | Política, roles, concienciación, medición | A.5.1.1, A.5.1.2, A.6.1.1, A.7.2.2, A.18.2.2; cláusulas 5, 6.2, 9, 10 | SEC-63, SEC-64, SEC-69; `docs/sgsi/` |

**Criterio de cumplimiento de RNF06:** se cumple cuando todos los requisitos **[M]** superan la lista 5.15 y las limitaciones de la sección 5.0 están aceptadas por el docente como riesgo residual (`sgsi/plan_tratamiento_riesgos.md`).
