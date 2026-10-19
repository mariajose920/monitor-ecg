import { test, expect } from '@playwright/test'

test('un solo botón Finalizar pregunta guardar, descartar o decidir después; el menú no repite acciones', async ({ page }) => {
  await page.goto('/monitor')
  await page.getByTestId('quien-se-mide').selectOption('__nuevo__')
  await page.getByTestId('crear-usuario-rapido').click()
  await page.getByRole('button', { name: 'Iniciar fuente' }).first().click()
  await expect(page.getByTestId('bpm').first()).toHaveText(/\d{2,3}\s*BPM/, { timeout: 15_000 })

  // Antes de grabar el menú ofrece iniciar; no hay "Desconectar" ni "Descartar" sueltos
  await page.getByTestId('canal-acciones').click()
  await expect(page.getByTestId('accion-iniciar')).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /Finalizar|Descartar|Detener/ })).toHaveCount(0)
  await page.getByTestId('accion-iniciar').click()
  await expect(page.getByLabel('Control del monitoreo').getByText('● Grabando')).toBeVisible()

  // Ya grabando: el menú NO ofrece "Iniciar monitoreo"
  await page.getByTestId('canal-acciones').click()
  await expect(page.getByTestId('accion-iniciar')).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: /Marcar evento/ })).toBeVisible()
  await page.keyboard.press('Escape')

  // Finalizar: detiene y pregunta qué hacer (guardar / descartar / decidir después)
  await page.getByTestId('canal-finalizar').click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo).toBeVisible({ timeout: 15_000 })
  await expect(dialogo.getByRole('button', { name: /Guardar/ })).toBeVisible()
  await expect(dialogo.getByRole('button', { name: /Descartar/ })).toBeVisible()
  await expect(dialogo.getByRole('button', { name: /Decidir/ })).toBeVisible()
  await dialogo.getByRole('button', { name: /Decidir/ }).click()

  // Borrador pendiente: botón visible para guardar y descarga desde el menú
  await expect(page.getByTestId('accion-guardar')).toHaveCount(0)
  await expect(page.getByTestId('abrir-guardar')).toBeVisible()
  await page.getByTestId('abrir-guardar').click()
  await expect(page.getByRole('dialog')).toBeVisible()
})
