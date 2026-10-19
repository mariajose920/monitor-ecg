import { test, expect } from '@playwright/test'

test('la grabación empieza sola y Finalizar pregunta guardar, descartar o decidir después', async ({ page }) => {
  await page.goto('/monitor')
  await page.getByTestId('quien-se-mide').selectOption('__nuevo__')
  await page.getByTestId('crear-usuario-rapido').click()
  await page.getByRole('button', { name: 'Iniciar fuente' }).first().click()
  await expect(page.getByTestId('bpm').first()).toHaveText(/\d{2,3}\s*BPM/, { timeout: 15_000 })

  // Empieza a grabar sola; el menú no ofrece "Iniciar monitoreo"
  await expect(page.getByLabel('Control del monitoreo').getByText('● Grabando')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('canal-acciones').click()
  await expect(page.getByTestId('accion-iniciar')).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: /Marcar evento/ })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /Finalizar|Descartar|Detener|Iniciar/ })).toHaveCount(0)
  await page.keyboard.press('Escape')

  // Finalizar: ventana emergente con las cuatro opciones
  await page.getByTestId('canal-finalizar').click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo).toBeVisible({ timeout: 15_000 })
  await expect(dialogo.getByRole('button', { name: /Guardar/ })).toBeVisible()
  await expect(dialogo.getByRole('button', { name: /Descartar/ })).toBeVisible()
  await expect(dialogo.getByRole('button', { name: /Decidir/ })).toBeVisible()
  await dialogo.getByRole('button', { name: /Decidir/ }).click()

  // Borrador pendiente: se puede guardar luego
  await expect(page.getByTestId('abrir-guardar')).toBeVisible()
  await page.getByTestId('abrir-guardar').click()
  await expect(page.getByRole('dialog')).toBeVisible()
})
