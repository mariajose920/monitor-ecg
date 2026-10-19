import { test, expect } from '@playwright/test'

test('el simulador muestra BPM en vivo con alternativa textual del gráfico', async ({ page }) => {
  await page.goto('/usuarios')
  await page.getByTestId('nuevo-usuario').click()
  await page.getByRole('button', { name: 'Crear usuario' }).click()
  await expect(page.getByTestId('usuario-activo')).toContainText('Usuario 1')

  await page.goto('/monitor')
  await page.getByLabel('Fuente', { exact: true }).first().selectOption('simulator')
  await page.getByRole('button', { name: 'Iniciar fuente' }).first().click()

  const bpm = page.getByTestId('bpm').first()
  await expect(bpm).toHaveText(/\d{2,3}\s*BPM/, { timeout: 15_000 })
  await expect(page.getByRole('img', { name: /Señal ECG en vivo del canal .*BPM/ }).first()).toBeVisible()
})
