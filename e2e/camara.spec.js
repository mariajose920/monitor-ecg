import { test, expect } from '@playwright/test'

// Cámara del celular con dispositivo falso de Chromium (sin dedo real).
test.use({
  viewport: { width: 375, height: 812 },
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
})

test('el asistente pide consentimiento, abre la cámara y muestra la calidad en vivo', async ({ page }) => {
  await page.goto('/pacientes')
  await page.getByTestId('nuevo-usuario').first().click()
  await page.getByTestId('declara-mayor-edad').check()
  await page.getByRole('button', { name: 'Crear paciente' }).click()
  await expect(page.getByTestId('usuario-activo')).toContainText('Paciente')
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

  // Vista previa de la cámara con la guía de huella y botón de flash siempre visible
  const prev = page.getByTestId('camara-preview')
  await expect(prev).toBeVisible()
  await expect(prev.locator('video')).toBeVisible()
  await expect(prev.locator('svg.huella')).toBeVisible()
  await expect(page.getByTestId('camara-encender-flash')).toBeVisible()
  await expect(page.getByTestId('camara-flash-estado')).toHaveText(/apagado|encendido/)
  const vid = await prev.locator('video').evaluate((v) => ({ conSenal: !!v.srcObject }))
  expect(vid.conSenal).toBe(true)

  // Cancelar apaga la cámara
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByTestId('camara-guia')).toBeVisible()
})
