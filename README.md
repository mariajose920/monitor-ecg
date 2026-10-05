# Monitor ECG (Vue 3)

SPA educativa para visualizar la señal de un sensor **AD8232** (Arduino UNO/Nano o ESP32) que emite el CSV
`t_ms,ecg_raw,leads_off,bpm` a 250 Hz y 115 200 baudios. **No es un dispositivo médico.**

Stack: Vue 3 (Composition API, `<script setup>`, JavaScript), Vite 7, Vue Router 4, Pinia 3, uPlot (npm), idb, Vitest, ESLint (`eslint-plugin-vue`, `eslint-plugin-security`).

## Scripts

```bash
npm ci            # instalación reproducible (lockfile)
npm run dev       # servidor de desarrollo (http://localhost:5173)
npm run build     # build de producción en dist/ (sin source maps, sin console.*)
npm run preview   # sirve dist/ con las MISMAS cabeceras de seguridad que vercel.json (CSP incluida)
npm test          # pruebas Vitest
npm run lint      # ESLint (vue/no-v-html en error)
npm run gen:referencia  # regenera public/referencias/ejemplo_referencia.csv (sintético)
```

## Navegadores

| Función | Chrome/Edge escritorio | Chrome Android | Safari / iOS / Firefox |
|---|---|---|---|
| Captura por cable o HC-05 (Web Serial) | Sí | No | No |
| Simulador, reproducción de CSV, comparación, sesiones, educación | Sí | Sí | Sí |

Web Serial requiere contexto seguro (HTTPS o localhost).

## Flujo de uso

1. **Participantes**: crear/elegir "Usuario N" (sin contraseña). Datos opcionales solo con consentimiento.
2. **Monitor**: hasta 5 canales; cada uno con su fuente (puerto serie, simulador o CSV), perfil y participante. Conectar → "Iniciar sesión de medición" para grabar.
3. **Sesiones**: historial, detalle (actividad, eventos, señal) y exportación CSV seudonimizada.
4. **Comparar**: referencia sintética / CSV de ejemplo / CSV cargado frente a señal simulada, sesión, canal en vivo o CSV; sincronización por pico R, correlación cruzada o manual.
5. **Admin** (`/admin`): PIN creado en el primer uso; rangos, sincronización, retención, usuarios, auditoría, exportación global y borrado total.

## Despliegue (Vercel)

`vercel.json` define el rewrite SPA y las cabeceras de seguridad (CSP sin `unsafe-eval` ni `unsafe-inline`,
`Permissions-Policy: serial=(self)`, HSTS, nosniff, etc.). Framework preset: Vite. No hay variables secretas
(todo lo que está en el bundle es público).

**Nota CSP:** se mantiene `style-src 'self'` sin `'unsafe-inline'`. Vite extrae el CSS a archivos, y tanto uPlot como
los `:style` de Vue escriben estilos por CSSOM (`element.style.x = …`), que la CSP no bloquea. Se verificó con
`npm run preview` (que aplica la misma CSP) sin errores en consola. Si alguna versión futura inyectara `<style>`,
la excepción permitida es añadir `'unsafe-inline'` **solo** en `style-src`, documentándolo aquí.

## Seguridad y limitaciones (resumen de la sección 4.0 del documento ISO)

- Todo se guarda **solo en este navegador**, cifrado con AES-GCM 256 (clave no extraíble en IndexedDB).
- El PIN de admin (PBKDF2-SHA-256, 600 000 iteraciones) disuade el uso casual, pero no detiene a quien controla el equipo y DevTools.
- El cifrado no protege frente a XSS ni frente a quien tiene el navegador abierto. No hay respaldo central.
- La auditoría usa una cadena de hashes SHA-256: detecta alteraciones, no las impide.

Ver `CAMBIOS.md` y `../docs/`.
