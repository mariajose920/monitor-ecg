import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'

// `vite preview` aplica las MISMAS cabeceras de seguridad que vercel.json (incluida la CSP),
// para verificar localmente que la app funciona con ellas (SEC-49). HSTS se omite en http local.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
const previewHeaders = Object.fromEntries(
  vercel.headers[0].headers
    .filter((h) => h.key !== 'Strict-Transport-Security')
    .map((h) => [h.key, h.key === 'Content-Security-Policy' ? h.value.replace('; upgrade-insecure-requests', '') : h.value]),
)

// PWA: estampa un identificador de build en el service worker (para que cada despliegue lo actualice).
function swVersion() {
  let outDir = 'dist'
  return {
    name: 'sw-version',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir
    },
    closeBundle() {
      const f = fileURLToPath(new URL(`./${outDir}/sw.js`, import.meta.url))
      try {
        writeFileSync(f, readFileSync(f, 'utf8').replace('ecg-build-dev', `ecg-${Date.now().toString(36)}`))
      } catch {
        /* sin sw.js en el build */
      }
    },
  }
}

// Configuración de Vite + Vitest.
// SEC-54: sin source maps en producción y eliminación de console/debugger del bundle.
export default defineConfig(({ mode }) => ({
  plugins: [vue(), swVersion()],
  // Solo variables PÚBLICAS: la integración Supabase↔Vercel crea NEXT_PUBLIC_* (SEC-55).
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  esbuild: mode === 'production' ? { drop: ['console', 'debugger'] } : {},
  build: {
    sourcemap: false,
    target: 'es2022',
    // El CSS se extrae a archivos (compatible con CSP style-src 'self').
    cssCodeSplit: true,
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
    headers: previewHeaders,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.js'],
  },
}))
