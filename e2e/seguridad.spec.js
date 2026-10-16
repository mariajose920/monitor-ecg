import { test, expect } from '@playwright/test'

test('/seguridad publica la política (A.5.1.1) y el formulario de incidentes', async ({ page }) => {
  await page.goto('/seguridad')
  await expect(page.getByRole('heading', { level: 1, name: 'Política de seguridad' })).toBeVisible()
  await expect(page.locator('#reportar')).toBeVisible()
})

test('las cabeceras de seguridad de vercel.json se aplican', async ({ request }) => {
  const r = await request.get('/')
  const h = r.headers()
  expect(h['content-security-policy']).toContain("default-src 'self'")
  expect(h['x-frame-options']).toBe('DENY')
  expect(h['permissions-policy']).toContain('serial=(self)')
})
