# Política criptográfica y gestión de claves

> **Código:** SGSI-POL-02 · **Versión:** 1.0-2013 · **Fecha:** 2026-10-15 · **Clasificación:** Interno
> **Propietario:** equipo de desarrollo · **Aprobada por:** docente supervisor (pendiente de firma) · **Revisión:** anual o al cambiar un algoritmo
> **Referencias:** ISO/IEC 27001:2013 A.10.1.1 y A.10.1.2 · `SGSI-POL-01` · `monitor-ecg-vue/src/services/storage/secureStorage.js`, `wipe.js`, `services/security/pinHash.js`

## 1. Usos aprobados

| Uso | Algoritmo y parámetros | Implementación |
|---|---|---|
| Cifrado en reposo (IndexedDB) | AES-GCM 256, IV aleatorio de 96 bits por escritura, AAD = nombre del registro | `secureStorage.js` (Web Crypto) |
| Protección del PIN de administrador | PBKDF2-HMAC-SHA-256, 600 000 iteraciones, sal aleatoria de 128 bits, comparación en tiempo constante | `pinHash.js` |
| Integridad del registro de auditoría | SHA-256 encadenado (cada evento incluye el hash del anterior) | `services/audit/auditLog.js` |
| Tránsito | TLS 1.2+ provisto por Vercel y Supabase; HSTS en `vercel.json` | Proveedores |

Prohibido: algoritmos propios, reutilizar IV, AES-ECB/CBC sin autenticación, MD5/SHA-1, claves en el código o en variables `VITE_*` que no sean públicas.

## 2. Ciclo de vida de las claves

| Fase | Regla |
|---|---|
| Generación | `crypto.subtle.generateKey` en el navegador, **no extraíble** (`extractable = false`) |
| Almacenamiento | Objeto `CryptoKey` en IndexedDB del mismo origen; nunca sale del navegador ni se exporta |
| Distribución | No aplica: cada navegador tiene su propia clave |
| Rotación | Sin rotación automática (los datos viven ≤ 180 días por la retención). Rotación manual = "Borrar todo" del administrador, que genera una clave nueva |
| Pérdida | Borrar los datos del sitio destruye la clave; los datos locales son irrecuperables (aceptado: la nube, si está activa, conserva la copia seudonimizada) |
| Destrucción | `wipe.js` borra datos **y** clave (*crypto-shredding*) |
| Claves de terceros | Supabase: solo la clave **publicable** en el frontend; `service_role` jamás en el repositorio ni en Vercel. Clave secreta del CAPTCHA solo en el panel de Supabase. Ante filtración: rotar en el panel y registrar el incidente (`procedimiento_incidentes.md`) |

## 3. Limitaciones aceptadas

El cifrado protege frente a copias del almacenamiento y lectura casual; no protege frente a código malicioso en la propia página ni frente a quien controla el navegador abierto (riesgo residual documentado en `ISO27001_controles.md` §5.0).
