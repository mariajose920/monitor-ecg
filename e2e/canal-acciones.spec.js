import { test, expect } from '@playwright/test'

test('el canal tiene un menú de acciones: iniciar, detener y guardar, descargar y finalizar', async ({ page }) => {
  await page.goto('/monitor')
  await page.getByTestId('quien-se-mide').selectOption('__nuevo__')
  await page.getByTestId('crear-usuario-rapido').click()
  await page.getByRole('button', { name: 'Iniciar fuente' }).first().click()
  await expect(page.getByTestId('bpm').first()).toHaveText(/\d{2,3}\s*BPM/, { timeout: 15_000 })

  // Menú del canal: iniciar el monitoreo
  await page.getByTestId('canal-acciones').click()
  await page.getByTestId('accion-iniciar').click()
  await expect(page.getByLabel('Control del monitoreo').getByText('● Grabando')).toBeVisible()

  // Detener y guardar abre el diálogo para guardar
  await page.getByTestId('canal-acciones').click()
  await page.getByTestId('accion-detener').click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 })
  await page.keyboard.press('Escape')

  // Con el borrador pendiente hay botón visible para guardar y opciones de descargar y finalizar
  await expect(page.getByTestId('canal-guardar')).toBeVisible()
  await page.getByTestId('canal-acciones').click()
  await expect(page.getByTestId('accion-guardar')).toBeVisible()
  const descarga = page.waitForEvent('download')
  await page.getByTestId('accion-descargar').click()
  expect((await descarga).suggestedFilename()).toMatch(/\.csv$/)

  // Guardar desde el menú reabre el diálogo
  await page.getByTestId('canal-acciones').click()
  await page.getByTestId('accion-guardar').click()
  await expect(page.getByRole('dialog')).toBeVisible()
})
