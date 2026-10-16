import { test, expect } from '@playwright/test'

test('guard de administración: /admin redirige a la configuración del PIN (A.9.4.1)', async ({ page }) => {
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/setup/)
  await expect(page.getByRole('heading', { level: 1, name: 'Configurar administrador' })).toBeVisible()
})

test('guard de administración: /admin/auditoria tampoco es accesible sin sesión', async ({ page }) => {
  await page.goto('/admin/auditoria')
  await expect(page).not.toHaveURL(/\/admin\/auditoria$/)
})

test('rutas de participante exigen elegir usuario (RF01)', async ({ page }) => {
  await page.goto('/monitor')
  await expect(page).toHaveURL(/\/usuarios\?redirect=monitor/)
})
