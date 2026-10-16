import { defineConfig, devices } from '@playwright/test'

/**
 * Pruebas E2E / aceptación (SUG-11, ISO/IEC 27001:2013 A.14.2.8 y A.14.2.9).
 * Se construye una copia SIN nube (variables Supabase vacías: tienen prioridad sobre .env.local)
 * en dist-e2e/ y se sirve con `vite preview`, que aplica las mismas cabeceras y CSP que vercel.json.
 * Requiere el navegador: `npm run test:e2e:install` (una vez).
 */
const PORT = 4174

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    locale: 'es-CL',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_PUBLISHABLE_KEY: '',
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
      VITE_CAPTCHA_PROVIDER: '',
    },
  },
})
