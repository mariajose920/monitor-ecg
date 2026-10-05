# Seguridad de la información — ISO/IEC 27001:2022 aplicada al Monitor ECG Web

> **Documento:** ISO27001_controles.md · **Versión:** 1.0 · **Fecha:** 2026-10-05
> **Proyecto:** Monitor ECG web (asignatura Programación Web) — sensor AD8232 + Arduino/ESP32 + frontend Vue 3
> **Clasificación de este documento:** Uso interno (académico)
> **Referencias normativas:** ISO/IEC 27001:2022 (incluida la Enmienda 1:2024 sobre cambio climático, no relevante aquí), ISO/IEC 27002:2022 (guía de los controles), ISO/IEC 27701 (privacidad, como referencia).

Este documento adapta el Sistema de Gestión de Seguridad de la Información (SGSI) de la ISO/IEC 27001:2022 a un proyecto universitario de alcance reducido. No pretende ser una certificación. Su objetivo es justificar las decisiones de seguridad del software y entregar requisitos concretos al equipo de desarrollo, en especial para cumplir **RNF06 (Seguridad)**.

---

## 1. Alcance del SGSI y activos de información

### 1.1 Contexto (cláusula 4)

| Elemento | Descripción |
|---|---|
| **Organización** | Equipo de estudiantes del proyecto (desarrolladores, administrador de la plataforma y docente supervisor). |
| **Partes interesadas (4.2)** | Participantes que se miden (titulares de los datos), administrador (docente o ayudante), equipo de desarrollo, universidad o comité de ética, Vercel (proveedor de alojamiento) y GitHub (repositorio). |
| **Requisitos de las partes interesadas** | Confidencialidad de los datos de salud, consentimiento informado (RF03, "condiciones éticas"), funciones administrativas restringidas (RNF06), disponibilidad durante las sesiones (RNF05) y seguridad eléctrica del participante. |
| **Arquitectura evaluada** | SPA Vue 3 + Vite + Vue Router + Pinia, **solo frontend**, alojada como sitio estático en Vercel. Los datos llegan del sensor por **Web Serial API** (CSV `t_ms,ecg_raw,leads_off,bpm` a 250 Hz, 115200 baudios) y se procesan y guardan **únicamente en el navegador** (localStorage/IndexedDB). No hay backend ni base de datos remota. |

### 1.2 Declaración de alcance (cláusula 4.3)

> *El SGSI cubre el diseño, desarrollo, despliegue y operación de la aplicación web "Monitor ECG": captura de señales ECG de hasta 5 sensores mediante Web Serial, visualización y comparación, identificación seudonimizada de participantes, registro opcional de datos complementarios (edad, peso, actividad), configuración administrativa (rangos mín./máx. y método de sincronización), exportación CSV, registro de auditoría local y despliegue estático en Vercel. Incluye el firmware del sensor en lo que respecta a la integridad del flujo de datos.*
>
> **Exclusiones:** la seguridad física y la red de las instalaciones universitarias, la infraestructura interna de Vercel y GitHub (se gestionan como proveedores, controles 5.19–5.23), la certificación eléctrica o médica del dispositivo (corresponde a IEC 60601, no a ISO 27001) y el uso clínico o diagnóstico. **El sistema es educativo y no es un dispositivo médico.**

### 1.3 Inventario de activos (control 5.9) y clasificación (5.12)

Esquema de clasificación del proyecto: **Público**, **Interno**, **Confidencial** y **Confidencial-Sensible** (datos de salud).

| ID | Activo | Tipo | Ubicación | Propietario | Clasificación | C / I / D* |
|---|---|---|---|---|---|---|
| A01 | Señal ECG cruda y BPM por sesión (datos fisiológicos) | Información | Memoria del navegador; IndexedDB/localStorage cifrado; CSV exportados | Participante (titular) / administrador (custodio) | **Confidencial-Sensible** | 3 / 3 / 2 |
| A02 | Perfil del participante: ID seudónimo ("Usuario N") | Información | localStorage cifrado | Administrador | Interno | 1 / 2 / 2 |
| A03 | Datos opcionales: edad, peso, actividad física, contexto de medición (RF03, RF18, RF19) | Información | localStorage cifrado | Participante | **Confidencial-Sensible** | 3 / 2 / 1 |
| A04 | Registro de consentimiento (versión, fecha y hora, ID) | Información / evidencia | localStorage cifrado | Administrador | Confidencial | 2 / 3 / 2 |
| A05 | Configuración del administrador: rangos mín./máx., método de sincronización, retención (RF15, RF26, RF27) | Información | localStorage (con integridad) | Administrador | Interno | 1 / **3** / 2 |
| A06 | Credencial del administrador (hash PBKDF2 + sal) | Información de autenticación | localStorage | Administrador | Confidencial | 3 / 3 / 2 |
| A07 | Registro de auditoría (eventos de seguridad) | Información / evidencia | IndexedDB | Administrador | Confidencial | 2 / **3** / 2 |
| A08 | Señal de referencia validada (RF11) | Información | Bundle estático o archivo cargado | Equipo | Interno | 1 / **3** / 2 |
| A09 | Código fuente Vue/Vite, `vercel.json` y dependencias npm | Software | GitHub y equipos de desarrollo | Equipo de desarrollo | Interno (o Público si el repositorio es abierto) | 1 / 3 / 2 |
| A10 | Firmware `sensor_ecg_ad8232.ino` | Software | Repositorio y placa | Equipo | Interno | 1 / 3 / 2 |
| A11 | Dispositivo sensor (AD8232 + Arduino UNO/Nano o ESP32, electrodos, HC-05 opcional) | Hardware | Laboratorio | Equipo | — | — / 3 / 3 |
| A12 | Equipo cliente (PC con Chrome/Edge que ejecuta la app) | Hardware | Laboratorio o personal | Usuario o administrador | — | 3 / 3 / 3 |
| A13 | Servicio de alojamiento (Vercel) y dominio | Servicio | Nube | Equipo (cuenta) | — | 1 / 3 / 3 |
| A14 | Archivos CSV exportados | Información | Disco del equipo cliente | Quien exporta | **Confidencial-Sensible** (si incluyen A01 + A03) | 3 / 2 / 1 |

\* C/I/D = Confidencialidad / Integridad / Disponibilidad, escala 1 (baja) a 3 (alta).

---

## 2. Análisis de riesgos (cláusulas 6.1.2 y 8.2)

**Metodología:** probabilidad (P) e impacto (I) en escala 1–3. **Nivel = P × I** (1–2 Bajo, 3–4 Medio, 6–9 Alto). **Criterio de aceptación:** se aceptan los riesgos de nivel Bajo. Los riesgos Medio y Alto se tratan (mitigar, transferir o evitar) y, si quedan con riesgo residual, este se documenta y lo acepta el responsable del proyecto.

| # | Amenaza | Vulnerabilidad | Activos | I | P | Nivel | Tratamiento (controles) |
|---|---|---|---|---|---|---|---|
| R01 | Acceso no autorizado a datos de salud en un equipo compartido del laboratorio | Datos guardados en claro en localStorage; sin bloqueo de sesión | A01, A03 | 3 | 3 | **9 Alto** | Mitigar: cifrado AES-GCM en reposo, retención limitada, botón de borrado, cierre de sesión por inactividad (8.24, 8.10, 5.34, 7.7) |
| R02 | Un participante u otra persona modifica los rangos mín./máx. o la sincronización | Autenticación del administrador inexistente o débil (RF02 elimina la contraseña de usuario) | A05 | 2 | 3 | **6 Alto** | Mitigar: PIN de administrador con hash PBKDF2, bloqueo tras intentos fallidos, guard de rutas y auditoría (5.15, 8.2, 8.5, 8.15) |
| R03 | Cross-Site Scripting (XSS) que roba o altera datos del mismo origen | Uso de `v-html`, `innerHTML` o scripts de terceros por CDN | A01–A07 | 3 | 2 | **6 Alto** | Mitigar: CSP estricta, prohibición de `v-html`, dependencias empaquetadas y saneamiento (8.26, 8.28, 8.23) |
| R04 | Datos seriales malformados o maliciosos (otro dispositivo, ruido, firmware alterado) | Parseo sin validación (`parseInt`/`parseFloat` sin rangos en el `app.js` actual); buffer sin límite | A01, A12 | 2 | 3 | **6 Alto** | Mitigar: validación estricta de cada línea, límite de buffer y descarte con contador (8.26, 8.28, 8.7) |
| R05 | Compromiso de la cadena de suministro (paquete npm o CDN `unpkg` comprometido) | Carga de uPlot desde `unpkg.com` sin SRI en el `index.html` actual; dependencias sin fijar | A09, A01 | 3 | 2 | **6 Alto** | Mitigar: empaquetar dependencias, lockfile, `npm audit` y Dependabot (5.21, 8.8, 8.25) |
| R06 | Fuga de datos mediante CSV exportado (correo, USB o nube personal) | Exportación sin control ni minimización | A14 | 3 | 2 | **6 Alto** | Mitigar: exportación seudonimizada por defecto, advertencia, registro en auditoría e inyección de fórmulas neutralizada (8.11, 8.12, 5.14) |
| R07 | Reidentificación del participante | Uso de nombres reales como ID o combinación edad + peso + fecha | A02, A03 | 3 | 2 | **6 Alto** | Mitigar: seudónimos "Usuario N", prohibir nombres, edad por rangos y minimización (5.34, 8.11) |
| R08 | Tratamiento de datos de salud sin base legal ni consentimiento | Formulario opcional sin consentimiento informado | A03, A04 | 3 | 2 | **6 Alto** | Mitigar: consentimiento previo, aviso de privacidad y derecho a retirar el consentimiento y borrar (5.31, 5.34) |
| R09 | Clickjacking, sniffing de MIME o degradación a HTTP | Ausencia de cabeceras de seguridad | A12, A05 | 2 | 2 | **4 Medio** | Mitigar: `vercel.json` con CSP `frame-ancestors`, HSTS y `nosniff` (8.20, 8.21, 8.27) |
| R10 | Pérdida de datos por borrado del almacenamiento del navegador | Almacenamiento solo local, sin respaldo | A01, A05, A07 | 2 | 2 | **4 Medio** | Aceptar parcialmente: exportación manual cifrada o CSV por el administrador. Recomendar backend futuro (8.13) |
| R11 | Manipulación del registro de auditoría | Log editable desde DevTools | A07 | 2 | 2 | **4 Medio** | Mitigar parcialmente: cadena de hashes SHA-256 para detectar alteraciones. Riesgo residual aceptado por ser solo frontend (8.15, 5.33) |
| R12 | Exposición de secretos en el bundle (variables `VITE_*`) o en source maps | Desconocimiento de que todo el JS cliente es público | A06, A09 | 2 | 2 | **4 Medio** | Evitar: no incluir secretos en el código, desactivar source maps en producción y eliminar `console.*` (8.4, 8.9, 8.12) |
| R13 | Indisponibilidad durante una sesión de medición (caída de Vercel o desconexión del sensor) | Dependencia de la red para cargar la SPA; desconexión USB o Bluetooth | A11, A13 | 2 | 1 | **2 Bajo** | Aceptar: detección de desconexión (RF09/RF10) y PWA en caché opcional (5.29, 8.14) |
| R14 | Descarga eléctrica al participante por fuga del PC conectado a la red | Conexión USB directa con electrodos puestos | A11 (persona) | 3 | 2 | **6 Alto** | Mitigar (fuera del alcance de ISO 27001, se registra por la seguridad de las personas): aviso obligatorio de usar batería o Bluetooth aislado (7.5, 7.8) |

> **Riesgo residual principal:** en una arquitectura solo-frontend, quien tenga acceso al equipo y a las DevTools del navegador puede saltarse los controles del cliente. Ver la sección 4.0.

---

## 3. Declaración de Aplicabilidad simplificada (SoA) — Anexo A 2022

Leyenda: **Sí** = aplica e implementado o por implementar · **Parcial** = aplica con limitaciones · **No** = excluido, con justificación.

### 3.1 Controles organizacionales (cláusula 5 del Anexo A, 5.1–5.37)

| Control | Nombre | Aplica | Justificación | Implementación |
|---|---|---|---|---|
| 5.1 | Políticas de seguridad de la información | Sí | Se necesita una política mínima del proyecto | Este documento junto con la sección "Seguridad" del README; aprobación del docente |
| 5.2 | Roles y responsabilidades de seguridad | Sí | Distinguir administrador, participante y desarrollador | Matriz de roles: el administrador configura y exporta, el participante mide y borra sus datos, el desarrollador mantiene el código |
| 5.3 | Segregación de funciones | Parcial | Equipo pequeño | El participante no puede configurar rangos. El merge a `main` requiere revisión de otro integrante |
| 5.4 | Responsabilidades de la dirección | Parcial | El docente supervisa | Revisión del SoA en los hitos del curso |
| 5.5 / 5.6 | Contacto con autoridades / grupos de interés | No | Proyecto académico sin operación productiva | — (se reevalúa si pasa a producción) |
| 5.7 | Inteligencia de amenazas | Parcial | Vulnerabilidades en npm | Alertas de Dependabot y GitHub Security Advisories |
| 5.8 | Seguridad en la gestión de proyectos | Sí | La seguridad debe estar en el plan desde el inicio | Requisitos de seguridad en el backlog (sección 4) con criterios de aceptación |
| 5.9 | Inventario de información y activos | Sí | Base del análisis | Tabla 1.3 |
| 5.10 | Uso aceptable de la información | Sí | Datos de salud | Aviso de privacidad y reglas de uso: solo con fines académicos, sin fotos de pantalla con datos identificables |
| 5.11 | Devolución de activos | Parcial | Sensores prestados por el laboratorio | Registro de préstamo de hardware |
| 5.12 | Clasificación de la información | Sí | Datos sensibles mezclados con datos públicos | Esquema de 4 niveles y etiqueta visible en la UI |
| 5.13 | Etiquetado de la información | Sí | El usuario debe saber qué es sensible | Insignias "Confidencial-Sensible" en vistas y CSV, y encabezado de clasificación en el CSV |
| 5.14 | Transferencia de información | Sí | Exportación CSV y canal serial/Bluetooth | Exportación con advertencia, seudonimizada y registrada en auditoría. El canal serial es local |
| 5.15 | Control de acceso | Sí | RNF06: limitar las funciones administrativas | Modelo RBAC con 2 roles (`participant` y `admin`), guards de router y verificación de rol en las acciones de Pinia |
| 5.16 | Gestión de identidades | Sí | RF01: IDs de usuario | IDs seudónimos únicos generados por el sistema ("Usuario N"); alta y baja por el administrador |
| 5.17 | Información de autenticación | Sí | PIN del administrador | Definido en el primer uso, sin valor por defecto, guardado como hash PBKDF2 con sal y cambio de PIN disponible |
| 5.18 | Derechos de acceso | Sí | Asignación de rol administrador | Un solo administrador local. Revisar y regenerar el PIN al cambiar de responsable |
| 5.19–5.22 | Proveedores y cadena de suministro TIC | Parcial | Vercel, GitHub y paquetes npm | 5.19/5.20: aceptar los términos de Vercel y GitHub y revisar su DPA. **5.21: dependencias fijadas, lockfile y auditoría**. 5.22: revisar avisos de los proveedores |
| 5.23 | Seguridad en el uso de servicios en la nube | Sí | Despliegue en Vercel (RNF09) | Solo assets estáticos, sin datos de salud en la nube, MFA en las cuentas de Vercel y GitHub, Vercel Analytics y Speed Insights desactivados |
| 5.24–5.27 | Gestión de incidentes | Parcial | Puede ocurrir una fuga de CSV o una alteración | Procedimiento breve: detectar (auditoría), contener (borrar datos y rotar el PIN), notificar al docente y documentar las lecciones aprendidas |
| 5.28 | Recolección de evidencias | Parcial | Investigación de incidentes | Exportación del log de auditoría con cadena de hashes |
| 5.29 / 5.30 | Seguridad durante interrupciones / continuidad TIC | Parcial | RNF05 | Detección de desconexión (RF09) y opción PWA offline (sección 4.13) |
| 5.31 | Requisitos legales, estatutarios, regulatorios y contractuales | Sí | Datos de salud = datos sensibles | Chile: Ley 19.628 (vida privada) y **Ley 21.719** (nueva ley de protección de datos personales, con entrada en vigencia programada para diciembre de 2026), Ley 20.584 como referencia de confidencialidad de datos de salud. RGPD art. 9 como buena práctica. Normativa ética de la universidad |
| 5.32 | Derechos de propiedad intelectual | Sí | Librerías de terceros y señal de referencia | Revisar licencias (uPlot MIT, Vue MIT). Citar el origen de la señal de referencia (p. ej. PhysioNet y su licencia) |
| 5.33 | Protección de registros | Sí | Consentimientos y auditoría como evidencia | Log append-only con cadena de hashes y retención definida |
| 5.34 | Privacidad y protección de la PII | Sí | **Control central**: datos de salud de participantes | Seudonimización, consentimiento, minimización, cifrado, borrado, aviso de privacidad y retención limitada |
| 5.35 | Revisión independiente | Parcial | Evaluación académica | Revisión del docente o de otro grupo (peer review) |
| 5.36 | Cumplimiento de políticas y normas | Sí | Verificar que se cumple el SoA | Lista de verificación de la sección 4 en cada release |
| 5.37 | Procedimientos operativos documentados | Sí | Operación de sesiones de medición | Manual breve: conexión segura (batería o Bluetooth), inicio y fin de sesión, exportación y borrado |

### 3.2 Controles de personas (cláusula 6, 6.1–6.8)

| Control | Nombre | Aplica | Justificación / implementación |
|---|---|---|---|
| 6.1 | Investigación de antecedentes | No | Equipo estudiantil, sin contratación |
| 6.2 | Términos y condiciones de empleo | No | No hay relación laboral |
| 6.3 | Concienciación, educación y formación | Sí | Breve inducción al equipo y al administrador sobre datos sensibles, uso del PIN y riesgo eléctrico. La UI muestra avisos educativos |
| 6.4 | Proceso disciplinario | No | Lo cubre el reglamento universitario |
| 6.5 | Responsabilidades al terminar o cambiar de rol | Parcial | Al terminar el curso: borrar los datos locales, rotar el PIN y retirar el acceso a Vercel y GitHub |
| 6.6 | Acuerdos de confidencialidad | Sí | Compromiso de confidencialidad firmado por los integrantes que acceden a los datos de los participantes |
| 6.7 | Trabajo remoto | Parcial | Desarrollo remoto: no usar datos reales en desarrollo (ver 8.33) |
| 6.8 | Notificación de eventos de seguridad | Sí | Canal definido (docente o correo del equipo) y enlace "Reportar un problema" en el pie de la app (sin enviar datos) |

### 3.3 Controles físicos (cláusula 7, 7.1–7.14)

| Control | Nombre | Aplica | Justificación / implementación |
|---|---|---|---|
| 7.1–7.4 | Perímetros, entrada, oficinas, monitorización | No | Instalaciones de la universidad, fuera del alcance |
| 7.5 | Protección contra amenazas físicas y ambientales | Parcial | Riesgo eléctrico del participante: aviso obligatorio y procedimiento de alimentación por batería o Bluetooth |
| 7.6 | Trabajo en áreas seguras | No | — |
| 7.7 | Escritorio y pantalla limpios | Sí | Cierre de sesión del administrador por inactividad, botón "Cerrar sesión" y "modo presentación" que oculta los datos opcionales |
| 7.8 | Ubicación y protección de equipos | Parcial | Sensor y PC ubicados para evitar tirones y fugas eléctricas |
| 7.9 | Seguridad de activos fuera de las instalaciones | Parcial | Portátiles con datos: cifrado de disco del SO recomendado |
| 7.10 | Medios de almacenamiento | Sí | Los CSV exportados en USB deben ir cifrados o borrarse tras su uso |
| 7.11–7.13 | Servicios de suministro, cableado, mantenimiento | Parcial / No | Mantenimiento de electrodos y cables del sensor; lo demás fuera del alcance |
| 7.14 | Eliminación o reutilización segura de equipos | Parcial | Antes de devolver un PC prestado: "Borrar todos los datos" en la app y borrar el almacenamiento del sitio |

### 3.4 Controles tecnológicos (cláusula 8, 8.1–8.34)

| Control | Nombre | Aplica | Justificación | Implementación |
|---|---|---|---|---|
| 8.1 | Dispositivos de punto final del usuario | Sí | Los datos viven en el navegador del PC cliente | Cuenta del SO con contraseña, navegador actualizado y no usar perfiles de navegador compartidos/sincronizados para la app |
| 8.2 | Derechos de acceso privilegiado | Sí | Rol administrador | Las acciones privilegiadas (rangos, sincronización, auditoría, borrado global, exportación global) solo con sesión de administrador válida, y reautenticación para acciones destructivas |
| 8.3 | Restricción del acceso a la información | Sí | El participante solo debe ver sus datos | La vista del participante filtra por su ID. Los datos opcionales de otros usuarios no se muestran en la vista multisensor |
| 8.4 | Acceso al código fuente | Sí | Repositorio | GitHub con acceso mínimo, rama `main` protegida y sin secretos en el repositorio |
| 8.5 | Autenticación segura | Sí | Administrador (los participantes quedan exentos por RF02) | PBKDF2-SHA-256 (600 000 iteraciones), bloqueo progresivo, expiración por inactividad y comparación en tiempo constante |
| 8.6 | Gestión de capacidad | Parcial | 5 sensores × 250 Hz = 1250 muestras/s | Buffers circulares de tamaño fijo, cuota de almacenamiento y advertencia al acercarse al límite |
| 8.7 | Protección contra malware | Parcial | Entrada de datos externa | Validación de la entrada serial y de los archivos de referencia cargados. Sin `eval` ni `new Function` |
| 8.8 | Gestión de vulnerabilidades técnicas | Sí | Dependencias npm | `npm audit` en CI, Dependabot y actualización mensual |
| 8.9 | Gestión de la configuración | Sí | `vercel.json`, Vite y configuración del administrador | Configuración versionada en git. Configuración de la app con esquema validado, valores por defecto seguros y versión |
| 8.10 | Eliminación de información | Sí | Derecho de supresión y retención | "Eliminar mis datos" (participante), "Borrar todo" (administrador) y purga automática por retención |
| 8.11 | Enmascaramiento de datos | Sí | Seudonimización y vistas | IDs seudónimos, edad por rangos, datos opcionales ocultos por defecto y exportación seudonimizada |
| 8.12 | Prevención de fuga de datos | Sí | CSV, consola, source maps y analítica | Exportación controlada y registrada, sin `console.log` de datos, sin source maps en producción y sin analítica ni telemetría |
| 8.13 | Copias de seguridad de la información | Parcial | Solo almacenamiento local | Exportación manual de respaldo por el administrador. Riesgo residual aceptado (ver 4.0) |
| 8.14 | Redundancia de instalaciones | Parcial | Disponibilidad de la SPA | CDN de Vercel y PWA opcional para uso offline |
| 8.15 | Registro de eventos (logging) | Sí | Trazabilidad de acciones administrativas | Log de auditoría local, consultable por el administrador (sección 4.9) |
| 8.16 | Actividades de monitorización | Parcial | Detección de abuso | Alertas en la UI por intentos fallidos de PIN y por manipulación del log (cadena rota) |
| 8.17 | Sincronización de relojes | Parcial | Marcas de tiempo en el log y en los datos | ISO 8601 UTC desde el reloj del sistema. Tiempo relativo del sensor (`t_ms`) para la señal |
| 8.18 | Uso de programas utilitarios privilegiados | No | No aplica a la SPA | — |
| 8.19 | Instalación de software en sistemas operativos | Parcial | Despliegue | Solo se despliega desde CI/Vercel a partir de `main` |
| 8.20 | Seguridad de redes | Parcial | Solo HTTPS | HSTS y `upgrade-insecure-requests` |
| 8.21 | Seguridad de los servicios de red | Sí | Cabeceras HTTP en Vercel | `vercel.json` con cabeceras de seguridad (sección 4.11) |
| 8.22 | Segregación de redes | No | No hay red propia | — |
| 8.23 | Filtrado web | Parcial | Limitar los orígenes de contenido | CSP con `default-src 'self'` y `connect-src 'self'` |
| 8.24 | Uso de criptografía | Sí | Datos sensibles en reposo | Web Crypto: AES-GCM 256 para el almacenamiento, PBKDF2 para el PIN, SHA-256 para la cadena de auditoría y TLS en tránsito (Vercel) |
| 8.25 | Ciclo de vida de desarrollo seguro | Sí | Proyecto de desarrollo | Requisitos, revisión de código, lint de seguridad, pruebas y despliegue controlado |
| 8.26 | Requisitos de seguridad de las aplicaciones | Sí | **Control central** del frontend | Sección 4 completa |
| 8.27 | Arquitectura y principios de ingeniería de sistemas seguros | Sí | Diseño | Defensa en profundidad, mínimo privilegio, *privacy by design*, *secure by default* y fallo seguro |
| 8.28 | Codificación segura | Sí | Vue/JS | Sin `v-html`, sin `eval`, validación con esquemas, ESLint con reglas de seguridad y TypeScript recomendado |
| 8.29 | Pruebas de seguridad en desarrollo y aceptación | Sí | Verificar los controles | Pruebas unitarias del parser serial, del cifrado, de los guards y del bloqueo. Verificación de cabeceras en securityheaders.com |
| 8.30 | Desarrollo externalizado | No | Lo desarrolla el propio equipo | — |
| 8.31 | Separación de entornos de desarrollo, prueba y producción | Sí | Vercel Preview frente a Production | Previews de Vercel por PR, producción solo desde `main` y almacenamiento separado por origen |
| 8.32 | Gestión de cambios | Sí | Cambios en el código y en la configuración | PR con revisión, CHANGELOG y registro de cambios de parámetros en la auditoría |
| 8.33 | Información de prueba | Sí | No usar datos reales en desarrollo | Generador de señal sintética y señal de referencia pública para las pruebas |
| 8.34 | Protección durante pruebas de auditoría | No | No hay auditorías sobre producción | — |

---

## 4. Requisitos de implementación para el frontend Vue

Cada requisito tiene un ID (`SEC-xx`), los controles que cubre y un criterio de aceptación verificable. Prioridad: **[M]** obligatorio para la entrega, **[S]** recomendado.

### 4.0 Limitaciones de un sistema solo-frontend (leer primero)

1. **La autenticación en el cliente no es seguridad real.** Todo el código, incluidos los guards y la verificación del PIN, se ejecuta en el navegador y puede inspeccionarse o modificarse con DevTools. El PIN del administrador **disuade** el uso indebido casual (por ejemplo, un participante que toca la pantalla del laboratorio), pero **no detiene a un atacante con acceso al equipo**.
2. **El cifrado en localStorage/IndexedDB protege frente a la lectura casual, la copia del perfil del navegador y las herramientas que vuelcan el almacenamiento, pero no frente a XSS ni ante quien controla el navegador abierto.** La clave convive en el mismo origen que los datos.
3. **No hay respaldo central, ni auditoría inalterable, ni control de acceso entre dispositivos.** Cada navegador es una isla de datos.
4. **Todo lo que está en el bundle es público**, incluidas las variables `VITE_*`. No debe contener secretos, claves ni hashes por defecto.
5. **Recomendación (trabajo futuro):** incorporar un backend (por ejemplo, Vercel Functions o Supabase con Row Level Security) con autenticación del administrador en el servidor (Argon2id, cookies `HttpOnly; Secure; SameSite=Strict`), autorización en la API, base de datos cifrada, auditoría en el servidor, respaldos y, si se ofrece a terceros, un DPA y una evaluación de impacto (EIPD). Hasta entonces, **los datos de salud no deben salir del equipo local** salvo por exportación explícita.

Estas limitaciones deben aparecer resumidas en el aviso de privacidad y en el README (transparencia, 5.34).

---

### 4.1 Roles, router y control de acceso — 5.15, 5.18, 8.2, 8.3

- **SEC-01 [M]** Definir dos roles en `stores/auth.js` (Pinia): `participant` (por defecto) y `admin`. Estado: `{ role, adminSessionExpiresAt, failedAttempts, lockedUntil }`.
- **SEC-02 [M]** Rutas administrativas bajo `/admin/*` con `meta: { requiresAdmin: true }`. Guard global `router.beforeEach`:
  ```js
  router.beforeEach((to) => {
    const auth = useAuthStore();
    if (to.matched.some(r => r.meta.requiresAdmin) && !auth.isAdminSessionValid()) {
      return { name: 'admin-login', query: { redirect: to.name } }; // redirect = nombre de ruta, nunca URL libre
    }
  });
  ```
  Validar `redirect` contra una lista blanca de nombres de ruta (evita el *open redirect*).
- **SEC-03 [M]** **Doble verificación:** toda acción de Pinia privilegiada (`setRanges`, `setSyncMethod`, `wipeAll`, `exportAll`, `readAudit`, `setRetention`) llama a `assertAdmin()`, que lanza un error si la sesión no es válida. No basta con ocultar botones.
- **SEC-04 [M]** Cargar las vistas de administración con *lazy loading* (`() => import('./views/admin/...')`). No es una medida de seguridad en sí misma, pero reduce la exposición en la vista del participante.
- **SEC-05 [M]** La vista multisensor (RF07, hasta 5 sensores) muestra solo el ID seudónimo, la señal y el BPM. **No muestra edad, peso ni actividad** de otros usuarios (8.3).

### 4.2 Autenticación del administrador — 5.17, 8.5, 8.24

- **SEC-06 [M]** **Primer uso:** si no existe una credencial, la ruta `/admin/setup` obliga a crear el PIN o la contraseña. **No hay PIN por defecto en el código.** Longitud mínima: 8 caracteres (o 6 dígitos si es PIN numérico, con 8 recomendado). Rechazar valores triviales (`12345678`, `00000000`, `password`).
- **SEC-07 [M]** Almacenar **solo** `{ v: 1, alg: 'PBKDF2-SHA256', iter: 600000, salt: base64(16 bytes aleatorios), hash: base64(32 bytes) }`, con `crypto.getRandomValues` para la sal y `crypto.subtle.importKey('raw', pin, 'PBKDF2')` + `deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 }, key, 256)`. **Nunca** guardar el PIN en texto plano, en Pinia persistido, en logs ni en la URL.
- **SEC-08 [M]** Comparación del hash **en tiempo constante** (XOR acumulado sobre todos los bytes, sin salir antes al primer byte distinto).
- **SEC-09 [M]** **Bloqueo:** tras **5** intentos fallidos consecutivos, bloquear el login durante 5 minutos. El bloqueo se duplica en cada nuevo ciclo (5, 10, 20 min…, con un máximo de 60). `failedAttempts` y `lockedUntil` se guardan en localStorage para que una recarga no reinicie el contador. Mostrar el tiempo restante. Registrar cada fallo y cada bloqueo en la auditoría.
- **SEC-10 [M]** **Sesión:** expira por **inactividad de 10 minutos** (con reinicio en `pointerdown`, `keydown` y `visibilitychange`) y tiene un **máximo absoluto de 60 minutos**. Guardar solo `adminSessionExpiresAt` en `sessionStorage` (se pierde al cerrar la pestaña), nunca en localStorage. Botón "Cerrar sesión" siempre visible en el layout de administración. Al expirar: limpiar el estado, redirigir a `/` y registrar `ADMIN_SESSION_EXPIRED`.
- **SEC-11 [M]** **Reautenticación** (volver a pedir el PIN) para: borrar todos los datos, exportar todos los datos, cambiar el PIN y vaciar la auditoría.
- **SEC-12 [S]** "Cambiar PIN" exige el PIN actual. "Olvidé el PIN" solo ofrece **restablecer la app borrando todos los datos** (no hay recuperación que permita eludir la protección).

### 4.3 Identificación de participantes sin contraseña (RF01, RF02) — 5.16, 5.34, 8.11

- **SEC-13 [M]** Los IDs los **genera el sistema** con el formato `Usuario N` (N incremental) y un identificador interno aleatorio (`crypto.randomUUID()`) como clave. El campo de "alias" opcional, si existe, se valida con `^[A-Za-z0-9 _-]{1,20}$` y muestra el aviso **"No uses tu nombre real, RUT, correo ni otros datos identificables"**.
- **SEC-14 [M]** No pedir ni guardar nombre, RUT, correo, teléfono, fecha de nacimiento exacta ni fotos.
- **SEC-15 [M]** La tabla de correspondencia entre seudónimo y persona real (si el investigador la necesita) **se gestiona fuera de la app**, en papel o en un documento aparte custodiado por el docente. Nunca dentro del sistema.

### 4.4 Consentimiento informado, aviso de privacidad y minimización (RF03) — 5.31, 5.34

- **SEC-16 [M]** Antes de mostrar los campos opcionales (edad, peso, actividad), mostrar un **modal de consentimiento** con: finalidad (académica), datos tratados, dónde se guardan (solo en este equipo, cifrados), plazo de retención, quién accede (el administrador del curso), cómo retirar el consentimiento y borrar, y que el sistema **no es un dispositivo médico ni hace diagnóstico**. Usar un checkbox **no premarcado** y botones "Acepto" y "No acepto". Si no acepta, la medición continúa **sin** datos opcionales.
- **SEC-17 [M]** Guardar el registro del consentimiento: `{ userId, consentVersion: '1.0', acceptedAt: ISO-UTC, scope: ['age','weight','activity'] }`. Si cambia la versión del texto, volver a pedir el consentimiento.
- **SEC-18 [M]** **Retirar el consentimiento** borra de inmediato los datos opcionales de ese usuario (y opcionalmente sus mediciones).
- **SEC-19 [M]** Ruta pública `/privacidad` con el aviso de privacidad completo (responsable, finalidad, base legal = consentimiento, derechos ARCO/supresión según la Ley 19.628 y la Ley 21.719, retención, limitaciones de la sección 4.0 y contacto). Enlace permanente en el pie de página.
- **SEC-20 [M]** **Minimización:**
  - Edad: selector por **rangos** (`18–24`, `25–34`, `35–44`, `45–54`, `55–64`, `65+`) en vez de un número exacto. Si se exige un número, validar un entero entre 18 y 100 (los participantes son mayores de edad; los menores requieren el consentimiento del tutor y quedan fuera del alcance).
  - Peso: número entre 30 y 250 kg, con 1 decimal como máximo. Opcional.
  - Actividad física y contexto (RF18/RF19): **lista cerrada** (`reposo`, `caminata`, `movimiento`, `post-ejercicio`), **sin texto libre**.
- **SEC-21 [M]** Recordatorio de seguridad eléctrica visible antes de conectar ("Usa batería o Bluetooth aislado si tienes electrodos puestos"), como ya existe en el `index.html` actual.

### 4.5 Clasificación y etiquetado visibles — 5.12, 5.13

- **SEC-22 [M]** Componente `<DataClassBadge level="sensitive|confidential|internal|public" />`. Mostrarlo en: la vista de medición ("Datos de salud — Confidencial-Sensible"), el formulario de datos opcionales, el diálogo de exportación y el panel de auditoría.
- **SEC-23 [M]** Cada CSV exportado comienza con una línea de comentario: `# CLASIFICACION: CONFIDENCIAL-SENSIBLE - Datos de salud seudonimizados - Uso exclusivamente academico - Exportado: <ISO-UTC>`.

### 4.6 Cifrado de datos en reposo — 8.24, 5.34

- **SEC-24 [M]** Crear el módulo `services/secureStorage.js` con la API `setItem(key, obj)`, `getItem(key)`, `removeItem(key)` y `wipe()`. **Prohibido** usar `localStorage.setItem` directamente fuera de este módulo para datos clasificados como Confidencial o superior (regla de ESLint `no-restricted-properties` o revisión de código).
- **SEC-25 [M]** Algoritmo **AES-GCM 256** (`crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, /*extractable*/ false, ['encrypt','decrypt'])`). **IV aleatorio de 12 bytes por cada cifrado** (nunca reutilizarlo). Formato guardado: `{ v: 1, iv: base64, ct: base64 }`. Usar `additionalData` = nombre de la clave (`key`) para atar el texto cifrado a su ranura.
- **SEC-26 [M]** **Gestión de la clave:** la `CryptoKey` **no extraíble** se guarda en **IndexedDB** (admite el clon estructurado de `CryptoKey`), nunca en localStorage ni en el código. Opcional [S]: envolver (*wrap*) la clave de datos con una clave derivada del PIN del administrador para las vistas de administración. Documentar que esto protege frente a la copia o el volcado del almacenamiento, no frente a XSS (ver 4.0).
- **SEC-27 [M]** Si el descifrado falla (datos alterados o clave perdida): no romper la app, descartar el registro, avisar "Datos dañados o manipulados" y registrar `INTEGRITY_ERROR` en la auditoría (fallo seguro).
- **SEC-28 [M]** Datos que se cifran: mediciones (A01), perfiles con datos opcionales (A02/A03) y consentimientos (A04). La configuración del administrador (A05) puede ir en claro pero **con integridad** (HMAC-SHA-256 o almacenada cifrada) y validada con un esquema al cargarla.
- **SEC-29 [S]** Las señales largas en IndexedDB (no en localStorage, cuyo límite ronda los 5 MB) se guardan en bloques cifrados de N segundos.

### 4.7 Retención y derecho a borrado — 8.10, 5.34

- **SEC-30 [M]** Botón **"Eliminar mis datos"** en la vista del participante (perfil, datos opcionales, mediciones y consentimiento de ese ID), con confirmación explícita. Registrar `USER_DATA_DELETED` en la auditoría **sin** datos personales (solo el ID seudónimo y la fecha).
- **SEC-31 [M]** Botón **"Borrar todos los datos"** para el administrador (con reautenticación), que borra el almacenamiento cifrado, la clave AES de IndexedDB (lo que deja ilegible cualquier residuo: *crypto-shredding*) y las sesiones. Conservar solo el evento `ALL_DATA_WIPED` en un nuevo log.
- **SEC-32 [M]** **Retención automática** configurable por el administrador (por defecto **30 días**, máximo 180). Al iniciar la app se purgan las mediciones con `createdAt` más antiguo que el plazo y se registra `RETENTION_PURGE` con la cantidad.
- **SEC-33 [M]** Los buffers en memoria de la señal se vacían al desconectar o al cambiar de usuario.

### 4.8 Validación y saneamiento de entradas — 8.26, 8.28, 8.7

- **SEC-34 [M]** **Parser serial estricto** (`services/serialParser.js`, puro y con pruebas unitarias):
  - Encabezado exacto `t_ms,ecg_raw,leads_off,bpm`: se ignora. Cualquier otro texto no numérico se descarta.
  - Longitud máxima de línea: **64 caracteres**. Si el buffer acumulado sin `\n` supera **1024 caracteres**, se vacía y se cuenta como error (evita el agotamiento de memoria).
  - Expresión regular completa: `^(\d{1,10}),(\d{1,4}),([01]),(\d{1,3}(?:\.\d{1,2})?)$`.
  - Rangos: `t_ms` entero entre 0 y 4 294 967 295, **monótono no decreciente** (si retrocede, se trata como reinicio de la placa: reiniciar la base de tiempo y registrar `DEVICE_RESET`). `ecg_raw` entero **0–1023**. `leads_off` exactamente **0 o 1**. `bpm` decimal **0–300** (fuera de 30–220 se muestra como "--", coherente con el filtro del firmware).
  - Convertir con `Number()` y comprobar con `Number.isFinite`. **No** usar `parseInt` o `parseFloat` sin validar (el `app.js` actual acepta `"12abc"`).
  - Las líneas inválidas se **descartan**, se cuentan en `stats.invalidLines` y, si superan el 5 % en 5 s, la UI avisa "Datos del sensor no válidos. ¿Puerto o baudios correctos?". Registrar `SERIAL_INVALID_DATA` una vez por sesión (no por cada línea).
  - Si `leads_off = 1`, la muestra se marca como inválida para el cálculo y la comparación (no se inventa un valor 512 como dato real; solo se dibuja como hueco o línea plana).
- **SEC-35 [M]** `port.open({ baudRate: 115200 })` fijo. `requestPort()` solo tras un gesto del usuario. Opcional [S]: filtros `usbVendorId` para Arduino/ESP32 conocidos.
- **SEC-36 [M]** **Formularios** (rangos del administrador y datos opcionales): validar con un esquema (p. ej. `zod` o validadores propios) en la UI **y** en la acción de Pinia. Rangos del administrador: `min` y `max` enteros con `30 ≤ min < max ≤ 220` BPM. Método de sincronización: **enum** cerrado (p. ej. `'pico-R' | 'correlacion-cruzada' | 'manual'`).
- **SEC-37 [M]** **Archivo de señal de referencia** (RF11), si se puede cargar: aceptar solo `.csv`, tamaño ≤ 5 MB y validar cada fila con el mismo criterio numérico. Nunca interpretarlo como HTML ni como código.

### 4.9 Registro de auditoría — 8.15, 8.16, 8.17, 5.28, 5.33

- **SEC-38 [M]** Crear el módulo `services/auditLog.js` sobre IndexedDB (almacén `audit`, de solo inserción desde la API). Cada entrada: `{ seq, ts: ISO-8601 UTC, event, actor: 'admin'|'participant:Usuario N'|'system', details: {…sin datos de salud…}, prevHash, hash }`, donde `hash = SHA-256(JSON canónico de la entrada sin hash + prevHash)` (cadena de hashes para **detectar** alteraciones).
- **SEC-39 [M]** Eventos mínimos:
  `ADMIN_SETUP`, `ADMIN_LOGIN_OK`, `ADMIN_LOGIN_FAIL`, `ADMIN_LOCKED`, `ADMIN_LOGOUT`, `ADMIN_SESSION_EXPIRED`, `ADMIN_PIN_CHANGED`, `PARAM_CHANGED` (con `{field, old, new}` para los rangos mín./máx., el método de sincronización y la retención), `USER_CREATED`, `CONSENT_GIVEN`, `CONSENT_WITHDRAWN`, `USER_DATA_DELETED`, `ALL_DATA_WIPED`, `RETENTION_PURGE`, `EXPORT_CSV` (`{scope, rows, pseudonymized}`), `SERIAL_CONNECTED`, `SERIAL_DISCONNECTED`, `SERIAL_LOST` (RF09), `SERIAL_INVALID_DATA`, `DEVICE_RESET`, `INTEGRITY_ERROR`, `AUDIT_EXPORTED`.
- **SEC-40 [M]** **Prohibido** registrar en la auditoría valores de ECG, BPM, edad, peso, PIN o hashes de credenciales.
- **SEC-41 [M]** Vista `/admin/auditoria` (protegida): tabla filtrable por evento y fecha, indicador "Integridad de la cadena: OK / ROTA en #seq" (verificada al abrir) y botón "Exportar log" (JSON, registra `AUDIT_EXPORTED`).
- **SEC-42 [M]** Rotación: conservar como máximo **5000** entradas o **180 días**. Al rotar, guardar el `hash` de la última entrada descartada como ancla.

### 4.10 Exportación CSV segura — 5.14, 8.11, 8.12

- **SEC-43 [M]** **Participante:** exporta solo sus propias mediciones. **Administrador:** puede exportar todas (con reautenticación).
- **SEC-44 [M]** **Por defecto, exportación seudonimizada**: columnas `user_id, session_id, t_ms, ecg_raw, leads_off, bpm, activity`. Edad y peso solo si el administrador marca de forma explícita "Incluir datos opcionales" y existe consentimiento de ese usuario. La edad se exporta siempre como rango.
- **SEC-45 [M]** Antes de descargar, mostrar un diálogo: "Este archivo contiene datos de salud. Guárdalo en un lugar seguro y bórralo cuando ya no lo necesites. No lo compartas por canales públicos."
- **SEC-46 [M]** **Neutralizar la inyección de fórmulas CSV**: cualquier celda de texto que empiece por `=`, `+`, `-`, `@`, tabulador o retorno de carro se prefija con `'`. Escapar las comillas dobles y encerrar los textos entre comillas. Generar con `Blob` + `URL.createObjectURL` y revocar la URL tras la descarga.
- **SEC-47 [M]** Nombre de archivo sin datos personales: `ecg_Usuario3_2026-10-05T1530Z.csv`. Registrar `EXPORT_CSV`.

### 4.11 Cabeceras de seguridad y despliegue (`vercel.json`) — 8.9, 8.20, 8.21, 8.23, 8.27, 5.23

- **SEC-48 [M]** Crear `vercel.json` en la raíz del proyecto Vue:
  ```json
  {
    "rewrites": [{ "source": "/((?!assets/).*)", "destination": "/index.html" }],
    "headers": [
      {
        "source": "/(.*)",
        "headers": [
          { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" },
          { "key": "X-Content-Type-Options", "value": "nosniff" },
          { "key": "X-Frame-Options", "value": "DENY" },
          { "key": "Referrer-Policy", "value": "no-referrer" },
          { "key": "Permissions-Policy", "value": "serial=(self), usb=(), bluetooth=(), camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()" },
          { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
          { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
          { "key": "Cross-Origin-Resource-Policy", "value": "same-origin" }
        ]
      },
      {
        "source": "/assets/(.*)",
        "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
      }
    ]
  }
  ```
  Notas: `serial=(self)` es **imprescindible** para la Web Serial API. `style-src 'self'` funciona con el build de Vite (el CSS se extrae a archivos y los `:style` de Vue usan CSSOM, que la CSP no bloquea). Si alguna librería inyecta `<style>`, documentar la excepción en lugar de añadir `'unsafe-inline'` a `script-src`. **Nunca** usar `'unsafe-eval'` (usar el build de runtime de Vue, que es el de por defecto en Vite). Añadir `<meta name="referrer" content="no-referrer">` en `index.html` como respaldo.
- **SEC-49 [M]** Verificar en el despliegue con `curl -I https://<app>.vercel.app` y securityheaders.com (objetivo: nota A). Probar que Web Serial funciona con la CSP y la Permissions-Policy aplicadas.
- **SEC-50 [M]** Activar MFA en las cuentas de Vercel y GitHub. Los Preview Deployments protegidos (Vercel Authentication) si contienen cambios no revisados. Vercel Analytics y Speed Insights **desactivados** (sin telemetría de terceros).

### 4.12 Dependencias, build y codificación segura — 5.21, 8.4, 8.8, 8.25, 8.28, 8.29, 8.31–8.33

- **SEC-51 [M]** **Sin CDN externos:** instalar `uplot` por npm (`import uPlot from 'uplot'; import 'uplot/dist/uPlot.min.css'`). Eliminar las referencias a `unpkg.com` del `index.html` actual. Sin Google Fonts remotas (fuentes locales en `/src/assets`).
- **SEC-52 [M]** Commitear `package-lock.json`, instalar con `npm ci` en CI y Vercel, fijar versiones exactas o con `~`, ejecutar `npm audit --audit-level=high` en CI (bloqueante) y activar Dependabot (actualizaciones de seguridad).
- **SEC-53 [M]** **Prohibido** `v-html`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function` y `setTimeout(string)`. ESLint con `eslint-plugin-vue` (`vue/no-v-html: error`), `no-eval`, `no-implied-eval`, `no-new-func` y `eslint-plugin-security`. Toda interpolación con `{{ }}` (escapada por Vue). El contenido educativo (RF21–RF24) se escribe como componentes o texto plano, no como HTML inyectado.
- **SEC-54 [M]** `vite.config.js`: `build.sourcemap: false` en producción y `esbuild: { drop: ['console', 'debugger'] }` en producción. No registrar datos de la señal ni del usuario en la consola durante el desarrollo.
- **SEC-55 [M]** No hay secretos en el repositorio: nada sensible en `.env` con prefijo `VITE_` (es público). Incluir `.env*` en `.gitignore`.
- **SEC-56 [M]** No usar datos reales en desarrollo ni en pruebas (8.33): crear `src/dev/syntheticEcg.js`, un generador de ECG sintético (o una señal pública de PhysioNet citada) para probar sin sensor.
- **SEC-57 [M]** Pruebas (Vitest) como mínimo para: el parser serial (líneas válidas, inválidas, límites 0/1023/300, overflow de buffer, `t_ms` decreciente), el cifrado y descifrado (incluido el fallo por manipulación), PBKDF2 (verificación correcta e incorrecta), el bloqueo tras 5 intentos, la expiración de sesión, el guard de rutas, la neutralización de la inyección CSV y la cadena de auditoría (detección de alteración).
- **SEC-58 [M]** Rama `main` protegida, PR con al menos 1 revisión (lista de verificación de esta sección 4) y despliegue a producción solo desde `main` (8.31, 8.32).

### 4.13 Disponibilidad y continuidad (RNF05) — 5.29, 5.30, 8.6, 8.14

- **SEC-59 [M]** Detectar la desconexión del puerto (`navigator.serial` evento `disconnect` y errores de `reader.read()`): detener la medición de ese sensor, mostrar el estado "Señal perdida" (RF09/RF10), registrar `SERIAL_LOST` y conservar los datos ya capturados.
- **SEC-60 [M]** Buffers circulares de tamaño fijo por sensor (p. ej. 10 s × 250 Hz = 2500 muestras), con un máximo de **5 sensores** forzado en el store (RF07). Renderizar con `requestAnimationFrame` en lotes.
- **SEC-61 [S]** Comprobar la cuota con `navigator.storage.estimate()`, avisar al superar el 80 % y solicitar `navigator.storage.persist()`.
- **SEC-62 [S]** PWA (`vite-plugin-pwa`) para cargar la app sin conexión durante las sesiones en el laboratorio.

### 4.14 Lista de verificación de aceptación (resumen para QA)

- [ ] Las rutas `/admin/*` redirigen al login sin sesión. Las acciones privilegiadas de Pinia lanzan error sin sesión.
- [ ] El PIN no aparece en texto plano en ningún almacenamiento (inspeccionar en DevTools → Application).
- [ ] 5 intentos fallidos producen un bloqueo que persiste tras recargar la página.
- [ ] La sesión de administrador expira a los 10 minutos de inactividad y al cerrar la pestaña.
- [ ] El contenido de localStorage e IndexedDB con datos de salud solo es `{v, iv, ct}`.
- [ ] Los datos opcionales no se pueden ingresar sin consentimiento. Retirar el consentimiento los borra.
- [ ] "Eliminar mis datos" y "Borrar todo" funcionan. La purga por retención se ejecuta al iniciar.
- [ ] El parser rechaza `1023x`, `1024`, `-1`, `leads_off=2`, `bpm=301` y líneas de más de 64 caracteres.
- [ ] La auditoría registra login, cambios de parámetros, exportaciones y conexiones, y detecta una entrada alterada.
- [ ] El código no contiene `v-html`. El build no hace peticiones a dominios externos (pestaña Network).
- [ ] Las cabeceras de `vercel.json` están presentes en producción y Web Serial funciona.
- [ ] El CSV lleva la línea de clasificación, está seudonimizado y neutraliza `=`, `+`, `-` y `@`.
- [ ] El aviso de privacidad y la advertencia eléctrica son visibles.

---

## 5. Mapeo RNF06 → controles ISO/IEC 27001:2022

**RNF06:** *"El sistema deberá proteger la información asociada a los usuarios y limitar las funciones administrativas al perfil correspondiente."*

| Componente de RNF06 | Objetivo de seguridad | Controles del Anexo A | Requisitos de implementación |
|---|---|---|---|
| **Proteger la información de los usuarios: confidencialidad** | Que los datos de salud no se lean sin autorización | 5.12, 5.13, 5.34, 8.3, 8.11, 8.24, 7.7 | SEC-05, SEC-13–SEC-15, SEC-20, SEC-22–SEC-29, SEC-44 |
| **Proteger la información de los usuarios: integridad** | Que la señal, la configuración y los registros no se alteren | 8.26, 8.28, 8.7, 8.9, 5.33 | SEC-27, SEC-28, SEC-34–SEC-37, SEC-38 |
| **Proteger la información de los usuarios: privacidad y legalidad** | Consentimiento, minimización, transparencia y supresión | 5.31, 5.34, 8.10, 5.10 | SEC-16–SEC-21, SEC-30–SEC-33 |
| **Proteger la información de los usuarios: fuga** | Evitar la salida no controlada de datos | 5.14, 8.12, 8.11, 7.10 | SEC-43–SEC-47, SEC-50, SEC-54 |
| **Proteger la información: plataforma y código** | Evitar XSS, la cadena de suministro comprometida y la configuración insegura | 8.4, 8.8, 8.9, 8.20, 8.21, 8.23, 8.25, 8.27–8.29, 8.31–8.33, 5.21, 5.23 | SEC-48–SEC-58 |
| **Limitar las funciones administrativas al perfil correspondiente** | Que solo el administrador configure rangos y sincronización (RF15, RF25–RF27) | 5.15, 5.16, 5.17, 5.18, 8.2, 8.5 | SEC-01–SEC-12 |
| **Trazabilidad de las funciones administrativas** | Saber quién cambió qué y cuándo | 8.15, 8.16, 8.17, 5.28 | SEC-38–SEC-42 |
| **Disponibilidad (apoya RNF05)** | La protección no debe impedir la medición | 5.29, 5.30, 8.6, 8.13, 8.14 | SEC-59–SEC-62 |
| **Gobernanza** | Responsables, revisión y mejora | 5.1, 5.2, 5.8, 5.36, 5.37, 6.3, 6.6, 6.8 | Este documento, lista de verificación 4.14 y revisión en cada hito |

**Criterio de cumplimiento de RNF06:** se considera cumplido cuando todos los requisitos **[M]** de la sección 4 superan la lista de verificación 4.14, y las limitaciones de la sección 4.0 están documentadas y aceptadas por el responsable del proyecto como riesgo residual.

---

## 6. Mejora continua (cláusulas 9 y 10)

- **Seguimiento (9.1):** en cada release, contar los fallos de la lista de verificación 4.14, las alertas de `npm audit` abiertas y la nota en securityheaders.com.
- **Revisión (9.3):** el docente y el equipo revisan este SoA en cada hito del curso o cuando cambie la arquitectura (p. ej. al incorporar un backend).
- **No conformidades (10.2):** se registran como issues de GitHub con la etiqueta `security`, la causa raíz y la acción correctiva.
