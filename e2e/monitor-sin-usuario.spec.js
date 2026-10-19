import { test, expect } from '@playwright/test'

test.describe('Monitor sin pasar por Usuarios (PC)', () => {
  test('abre sin usuario, crea uno rápido, lo recuerda y exige usuario solo para iniciar', async ({ page }) => {
    await page.goto('/monitor')
    await expect(page).toHaveURL(/\/monitor$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Monitor' })).toBeVisible()

    // Conectar y ver la señal sin usuario
    await page.getByRole('button', { name: 'Iniciar fuente' }).first().click()
    await expect(page.getByTestId('bpm').first()).toHaveText(/\d{2,3}\s*BPM/, { timeout: 15_000 })
    // Iniciar sin usuario avisa
    await page.getByTestId('iniciar-monitoreo').click()
    await expect(page.getByText(/asígnale un usuario/)).toBeVisible()

    // Nuevo usuario sin salir del Monitor
    await page.getByTestId('quien-se-mide').selectOption('__nuevo__')
    await page.getByTestId('crear-usuario-rapido').click()
    await expect(page.getByTestId('usuario-activo')).toContainText('Usuario 1')
    await expect(page.getByTestId('quien-se-mide')).toHaveValue(/.+/)
    await expect(page).toHaveURL(/\/monitor$/)

    // Se recuerda el último elegido en una pestaña nueva
    const otra = await page.context().newPage()
    await otra.goto('/monitor')
    await expect(otra.getByTestId('usuario-activo')).toContainText('Usuario 1')
    await otra.close()
  })

  test('las rutas de monitoreos siguen pidiendo un usuario', async ({ page }) => {
    await page.goto('/monitoreos')
    await expect(page).toHaveURL(/\/usuarios\?redirect=monitoreos/)
  })
})

test.describe('Monitor en celular Android (375x812)', () => {
  test.use({
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    isMobile: true,
    hasTouch: true,
  })

  test('la fuente por defecto es la cámara y el sensor externo queda en un apartado secundario', async ({ page }) => {
    await page.goto('/monitor')
    await expect(page.getByTestId('camara-guia')).toHaveText('Medir con la cámara')
    await expect(page.getByRole('button', { name: 'Conectar puerto serie' })).toHaveCount(0)
    await expect(page.getByLabel('Fuente', { exact: true })).toBeHidden()
    const detalle = page.getByText('Usar sensor externo (solo PC)')
    await expect(detalle).toBeVisible()
    await detalle.click()
    await expect(page.getByLabel('Fuente', { exact: true }).first()).toBeVisible()
    const ancho = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }))
    expect(ancho.sw).toBeLessThanOrEqual(ancho.iw)
  })
})
