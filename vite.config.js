import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

// `vite preview` aplica las MISMAS cabeceras de seguridad que vercel.json (incluida la CSP),
// para verificar localmente que la app funciona con ellas (SEC-49). HSTS se omite en http local.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
const previewHeaders = Object.fromEntries(
  vercel.headers[0].headers
    .filter((h) => h.key !== 'Strict-Transport-Security')
    .map((h) => [h.key, h.key === 'Content-Security-Policy' ? h.value.replace('; upgrade-insecure-requests', '') : h.value]),
)

// Configuración de Vite + Vitest.
// SEC-54: sin source maps en producción y eliminación de console/debugger del bundle.
export default defineConfig(({ mode }) => ({
  plugins: [vue()],
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
