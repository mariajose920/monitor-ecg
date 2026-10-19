import { test, expect } from '@playwright/test'

// Cámara del celular con dispositivo falso de Chromium (sin dedo real).
test.use({
  viewport: { width: 375, height: 812 },
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
})

test('el asistente pide consentimiento, abre la cámara y muestra la calidad en vivo', async ({ page }) => {
  await page.goto('/usuarios')
  await page.getByTestId('nuevo-usuario').first().click()
  await page.getByRole('button', { name: 'Crear usuario' }).click()
  await expect(page.getByTestId('usuario-activo')).toContainText('Usuario')
  await page.goto('/monitor')
  await page.getByTestId('camara-guia').click()

  const iniciar = page.getByTestId('camara-iniciar')
  await expect(iniciar).toBeDisabled()
  await expect(page.getByText('No es un dispositivo médico').first()).toBeVisible()
  await page.getByTestId('camara-consentimiento').check()
  await iniciar.click()

  await expect(page.getByRole('heading', { name: /2\. Coloca el dedo/ })).toBeVisible({ timeout: 15_000 })
  // La imagen falsa no es un dedo: debe pedir ajustar el dedo (leads_off equivalente)
  await expect(page.getByTestId('camara-calidad')).toHaveText(/Ajusta el dedo/)

  // Cancelar apaga la cámara
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByTestId('camara-guia')).toBeVisible()
})
