# Política criptográfica y gestión de claves

> **Código:** SGSI-POL-02 · **Versión:** 2.0-2013 · **Fecha:** 2026-10-20 · **Clasificación:** Interno
> **Propietario:** equipo de desarrollo · **Aprobada por:** docente supervisor (pendiente de firma) · **Revisión:** anual o al cambiar un algoritmo
> **Referencias:** ISO/IEC 27001:2013 A.10.1.1 y A.10.1.2 · `SGSI-POL-01` · `monitor-ecg-vue/src/services/storage/secureStorage.js`, `wipe.js`, `services/security/pinHash.js`

## 1. Usos aprobados

| Uso | Algoritmo y parámetros | Implementación |
|---|---|---|
| Cifrado en reposo (IndexedDB) | AES-GCM 256, IV aleatorio de 96 bits por escritura, AAD = nombre del registro | `secureStorage.js` (Web Crypto) |
| Protección del PIN de administrador | PBKDF2-HMAC-SHA-256, 600 000 iteraciones, sal aleatoria de 128 bits, comparación en tiempo constante | `pinHash.js` |
| Integridad del registro de auditoría | SHA-256 encadenado (cada evento incluye el hash del anterior) | `services/audit/auditLog.js` |
| Tránsito | TLS 1.2+ provisto por Vercel y Supabase; HSTS en `vercel.json` | Proveedores |
| Integridad de la auditoría de la nube | Hash encadenado en el servidor (cada fila incluye el hash de la anterior), calculado bajo `pg_advisory_xact_lock`; verificable con `verificar_cadena_auditoria()` (solo administrador). Sin anclaje externo ni clave: detecta edición accidental, no a quien controla la base | `supabase/schema.sql` (`tg_auditoria_servidor`, `_hash_auditoria`) |
| Sesión de cuenta | Token de Supabase Auth guardado por supabase-js: en `sessionStorage` si la persona marca «equipo compartido»; en `localStorage` en equipo personal. **No está cifrado por la app** | `src/services/cloud/almacenSesion.js` |
| Segundo factor del administrador | TOTP (RFC 6238) gestionado por Supabase Auth; el servidor exige un código de ≤ 15 min (≤ 5 min en acciones sensibles) | `supabase/schema.sql` (`totp_reciente`) |

Prohibido: algoritmos propios, reutilizar IV, AES-ECB/CBC sin autenticación, MD5/SHA-1, claves en el código o en variables `VITE_*` que no sean públicas.

## 2. Ciclo de vida de las claves

| Fase | Regla |
|---|---|
| Generación | `crypto.subtle.generateKey` en el navegador, **no extraíble** (`extractable = false`) |
| Almacenamiento | Objeto `CryptoKey` en IndexedDB del mismo origen; nunca sale del navegador ni se exporta |
| Distribución | No aplica: cada navegador tiene su propia clave |
| Rotación | Sin rotación automática (los datos locales viven 30 días por defecto, máx. 180). Rotación manual = «Borrar todo» del administrador, que genera una clave nueva. Hoy hay **una sola clave `aes-gcm-v1`** para todos los espacios del navegador (sin clave por cuenta) |
| Pérdida | Borrar los datos del sitio destruye la clave; los datos locales son irrecuperables (aceptado: la nube, si está activa, conserva la copia seudonimizada) |
| Destrucción | `wipe.js` borra datos **y** clave (*crypto-shredding*) |
| Claves de terceros | Supabase: solo la clave **publicable** en el frontend; `service_role` jamás en el repositorio ni en Vercel. Clave secreta del CAPTCHA solo en el panel de Supabase. Ante filtración: rotar en el panel y registrar el incidente (`procedimiento_incidentes.md`) |

## 3. Limitaciones aceptadas

El cifrado local protege la **lectura casual** de los archivos de datos del navegador. **No** protege frente a quien controle el equipo o su sesión del sistema operativo (puede copiar el perfil del navegador, que incluye la clave), frente a extensiones del navegador ni frente a código malicioso que se ejecute en la propia página (XSS). La app lo dice así en `/privacidad` y en el aviso de consentimiento (`src/data/privacidad.js`, `CIFRADO_LOCAL_ALCANCE`). Riesgo residual R31, documentado en `ISO27001_controles.md` §3.2 y §5.0.

**Mejoras diferidas (no implementadas):** bóveda local con frase del usuario (PBKDF2 de al menos 600 000 iteraciones envolviendo una clave por espacio), que cambiaría la clave de los datos existentes y exige una migración segura; destrucción de la clave por cuenta (*crypto-shredding* por espacio); cifrado del almacén de auditoría local; exigir en el servidor una contraseña reciente (`amr`) para borrar datos o la cuenta.

**Aprobación:** la política sigue **pendiente de firma** del docente (ver `registro_no_conformidades.md`, NC-14).
