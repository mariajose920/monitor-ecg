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

async function conectarConUsuario(page) {
  await page.getByTestId('quien-se-mide').selectOption('__nuevo__')
  await page.getByTestId('crear-usuario-rapido').click()
  await page.getByRole('button', { name: 'Iniciar fuente' }).first().click()
  await expect(page.getByTestId('bpm').first()).toHaveText(/\d{2,3}\s*BPM/, { timeout: 15_000 })
}

test('Finalizar (A) volver a Monitor con la fuente conectada y finalizar', async ({ page }) => {
  await page.goto('/monitor')
  await conectarConUsuario(page)
  await expect(page.getByLabel('Control del monitoreo').getByText('● Grabando')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('link', { name: 'Inicio' }).first().click()
  await page.getByRole('link', { name: 'Monitor' }).first().click()
  page.once('dialog', (d) => d.accept())
  await page.getByTestId('canal-finalizar').click()
  await expect(page.getByRole('dialog', { name: 'Guardar monitoreo' })).toBeVisible({ timeout: 8000 })
})

test('Finalizar (B) tras "Decidir después", el siguiente monitoreo y su Finalizar', async ({ page }) => {
  await page.goto('/monitor')
  await conectarConUsuario(page)
  await expect(page.getByLabel('Control del monitoreo').getByText('● Grabando')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('canal-finalizar').click()
  await page.getByRole('dialog').getByRole('button', { name: /Decidir/ }).click()
  await page.getByRole('button', { name: 'Iniciar fuente' }).first().click()
  await expect(page.getByTestId('bpm').first()).toHaveText(/\d{2,3}\s*BPM/, { timeout: 15_000 })
  await page.getByTestId('canal-finalizar').click()
  await expect(page.getByRole('dialog', { name: 'Guardar monitoreo' })).toBeVisible({ timeout: 8000 })
})

test('Finalizar (C) conectar primero y elegir usuario después', async ({ page }) => {
  await page.goto('/monitor')
  await page.getByRole('button', { name: 'Iniciar fuente' }).first().click()
  await expect(page.getByTestId('bpm').first()).toHaveText(/\d{2,3}\s*BPM/, { timeout: 15_000 })
  await page.getByTestId('quien-se-mide').selectOption('__nuevo__')
  await page.getByTestId('crear-usuario-rapido').click()
  await expect(page.getByLabel('Control del monitoreo').getByText('● Grabando')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('canal-finalizar').click()
  await expect(page.getByRole('dialog', { name: 'Guardar monitoreo' })).toBeVisible({ timeout: 8000 })
})

test('Finalizar (D) finalizar sin usuario avisa que no se grabó', async ({ page }) => {
  await page.goto('/monitor')
  await page.getByRole('button', { name: 'Iniciar fuente' }).first().click()
  await expect(page.getByTestId('bpm').first()).toHaveText(/\d{2,3}\s*BPM/, { timeout: 15_000 })
  await page.getByTestId('canal-finalizar').click()
  await expect(page.getByRole('alert').filter({ hasText: /No se grabó nada/ })).toBeVisible({ timeout: 5000 })
})
