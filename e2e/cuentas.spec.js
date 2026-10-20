import { test, expect } from '@playwright/test'

/**
 * Cuentas y visibilidad. La copia E2E se construye SIN nube (sin variables de Supabase), así que
 * aquí se prueban las validaciones del cliente, los enlaces, el modo sin cuenta y la interfaz de
 * visibilidad; el envío real a Supabase queda fuera (no hay red ni claves en esta configuración).
 */

async function sinDesborde(page, ruta) {
  const a = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }))
  expect(a.sw, `desborde horizontal en ${ruta}`).toBeLessThanOrEqual(a.iw)
}

test.describe('Acceso (/acceso)', () => {
  test('muestra el formulario, los enlaces y valida los campos', async ({ page }) => {
    await page.goto('/acceso')
    await expect(page.getByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Crear una cuenta' })).toHaveAttribute('href', '/registro')
    await expect(page.getByRole('link', { name: '¿Olvidaste tu contraseña?' })).toHaveAttribute('href', '/recuperar')
    await expect(page.getByTestId('usar-sin-cuenta')).toBeVisible()

    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page.getByText('Escribe tu correo.')).toBeVisible()
    await expect(page.getByText('Escribe tu contraseña.')).toBeVisible()

    await page.getByLabel('Correo').fill('no-es-un-correo')
    await page.getByLabel('Contraseña').fill('algo')
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page.getByText('El correo no tiene un formato válido.')).toBeVisible()
  })

  test('sin nube configurada informa que las cuentas no están disponibles y no revela nada más', async ({ page }) => {
    await page.goto('/acceso')
    await page.getByLabel('Correo').fill('persona@ejemplo.cl')
    await page.getByLabel('Contraseña').fill('claveSegura2026')
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page.getByTestId('error-acceso')).toContainText('no están disponibles')
  })

  test('"Usar sin cuenta" lleva a Pacientes en modo local', async ({ page }) => {
    await page.goto('/acceso')
    await page.getByTestId('usar-sin-cuenta').click()
    await expect(page).toHaveURL(/\/pacientes$/)
    await expect(page.getByTestId('intro-sin-cuenta')).toContainText('sin cuenta')
    await expect(page.getByTestId('chip-cuenta')).toContainText('Sin cuenta')
  })

  test('el encabezado ofrece iniciar sesión y /usuarios redirige a /pacientes', async ({ page }) => {
    await page.goto('/usuarios')
    await expect(page).toHaveURL(/\/pacientes$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Pacientes' })).toBeVisible()
    await page.setViewportSize({ width: 375, height: 812 })
    await page.getByRole('button', { name: 'Menú' }).click()
    await expect(page.getByTestId('enlace-acceso')).toBeVisible()
    await page.getByTestId('enlace-acceso').click()
    await expect(page).toHaveURL(/\/acceso$/)
  })
})

test.describe('Registro (/registro)', () => {
  test('valida correo, contraseña de 10 caracteres, coincidencia y aviso de privacidad', async ({ page }) => {
    await page.goto('/registro')
    await expect(page.getByRole('heading', { level: 1, name: 'Crear cuenta' })).toBeVisible()
    await page.getByRole('button', { name: 'Crear cuenta' }).click()
    await expect(page.getByText('Escribe tu correo.')).toBeVisible()
    await expect(page.getByText('al menos 10 caracteres')).toBeVisible()
    await expect(page.getByText('Debes aceptar el aviso de privacidad')).toBeVisible()

    await page.getByLabel('Correo').fill('persona@ejemplo.cl')
    await page.getByLabel('Contraseña', { exact: true }).fill('corta1')
    await page.getByRole('button', { name: 'Crear cuenta' }).click()
    await expect(page.getByText('al menos 10 caracteres')).toBeVisible()

    await page.getByLabel('Contraseña', { exact: true }).fill('claveSegura2026')
    await page.getByLabel('Repite la contraseña').fill('otraDistinta2026')
    await page.getByTestId('acepta-privacidad').check()
    await page.getByRole('button', { name: 'Crear cuenta' }).click()
    await expect(page.getByText('Las contraseñas no coinciden.')).toBeVisible()
    await expect(page.getByText('Debes declarar que eres mayor de 18 años')).toBeVisible()
  })

  test('con datos válidos pero sin nube no simula un alta ni confirma la existencia de cuentas', async ({ page }) => {
    await page.goto('/registro')
    await page.getByLabel('Correo').fill('persona@ejemplo.cl')
    await page.getByLabel('Contraseña', { exact: true }).fill('claveSegura2026')
    await page.getByLabel('Repite la contraseña').fill('claveSegura2026')
    await page.getByTestId('acepta-privacidad').check()
    await page.getByTestId('mayor-edad').check()
    await page.getByRole('button', { name: 'Crear cuenta' }).click()
    await expect(page.getByTestId('error-registro')).toContainText('no están disponibles')
    await expect(page.getByTestId('registro-ok')).toBeHidden()
  })

  test('enlaces y modo sin cuenta; recuperar contraseña valida el correo', async ({ page }) => {
    await page.goto('/registro')
    await expect(page.getByRole('link', { name: 'Ya tengo cuenta: iniciar sesión' })).toHaveAttribute('href', '/acceso')
    await expect(page.getByTestId('usar-sin-cuenta')).toBeVisible()
    await page.goto('/recuperar')
    await page.getByRole('button', { name: 'Enviar enlace' }).click()
    await expect(page.getByText('Escribe tu correo.')).toBeVisible()
    await page.goto('/restablecer')
    await expect(page.getByTestId('restablecer-sin-enlace')).toBeVisible()
  })

  test('sin desborde horizontal a 375 px y sin errores de consola', async ({ page }) => {
    const errores = []
    page.on('pageerror', (e) => errores.push(e.message))
    await page.setViewportSize({ width: 375, height: 812 })
    for (const ruta of ['/acceso', '/registro', '/recuperar', '/restablecer']) {
      await page.goto(ruta)
      await sinDesborde(page, ruta)
    }
    expect(errores).toEqual([])
  })
})

test('el diálogo de guardar ofrece visibilidad: privado por defecto y público solo con cuenta', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/pacientes')
  await page.getByTestId('nuevo-usuario').click()
  await page.getByTestId('declara-mayor-edad').check()
  await page.getByRole('button', { name: 'Crear paciente' }).click()
  await expect(page.getByTestId('usuario-activo')).toContainText('Paciente 1')
  await page.goto('/monitor')
  await page.getByRole('button', { name: 'Iniciar fuente' }).first().click()
  await expect(page.getByLabel('Control del monitoreo').getByText('● Grabando')).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(4000)
  await page.getByTestId('canal-finalizar').click()
  const dlg = page.getByRole('dialog', { name: 'Guardar monitoreo' })
  await expect(dlg).toBeVisible()
  const bloque = dlg.getByTestId('bloque-visibilidad')
  await expect(bloque).toBeVisible()
  await expect(bloque.getByRole('radio', { name: /Privado/ })).toBeChecked()
  await expect(bloque.getByRole('radio', { name: /Público/ })).toBeDisabled()
  await expect(dlg.getByTestId('aviso-sin-cuenta')).toBeVisible()
  await expect(dlg.getByTestId('consentimiento-publicar')).toBeHidden()
  await dlg.getByRole('button', { name: 'Guardar monitoreo' }).click()
  await expect(dlg).toBeHidden()
  // Detalle: el botón de visibilidad existe y avisa que publicar requiere cuenta
  await page.goto('/monitoreos')
  await page.getByRole('button', { name: /Cambiar visibilidad de/ }).click()
  await expect(page.getByText('necesitas iniciar sesión con una cuenta')).toBeVisible()
  await expect(page.getByTestId('guardar-visibilidad')).toBeDisabled()
})
