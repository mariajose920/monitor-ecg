import { test, expect } from '@playwright/test'

test.describe('Inicio y páginas públicas', () => {
  test('carga la portada sin errores de CSP ni de consola', async ({ page }) => {
    const errores = []
    page.on('console', (m) => m.type() === 'error' && errores.push(m.text()))
    page.on('pageerror', (e) => errores.push(e.message))
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Monitor ECG educativo' })).toBeVisible()
    await expect(page).toHaveTitle(/Monitor ECG/)
    expect(errores).toEqual([])
  })

  test('el enlace "Saltar al contenido" es accesible por teclado', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused()
  })

  test('/privacidad muestra base legal, derechos y transferencia internacional', async ({ page }) => {
    await page.goto('/privacidad')
    await expect(page.getByRole('heading', { name: 'Base legal' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Transferencia internacional' })).toBeVisible()
    for (const d of ['Acceso', 'Rectificación', 'Supresión', 'Portabilidad']) {
      await expect(page.getByRole('rowheader', { name: d })).toBeVisible()
    }
  })
})
