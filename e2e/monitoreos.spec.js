import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

/** Flujo completo: usuario → monitoreo con simulador → guardar → ver → editar → exportar → comparar → aprender → eliminar. */

async function crearUsuario(page) {
  await page.goto('/usuarios')
  await page.getByTestId('nuevo-usuario').click()
  await page.getByRole('button', { name: 'Crear usuario' }).click()
  await expect(page.getByTestId('usuario-activo')).toContainText('Usuario 1')
}

async function grabar(page, nombre, { guardar = true, segundos = 7 } = {}) {
  await page.goto('/monitor')
  await page.getByRole('button', { name: 'Iniciar fuente' }).first().click()
  await expect(page.getByTestId('bpm').first()).toHaveText(/\d{2,3}\s*BPM/, { timeout: 15_000 })
  // La grabación empieza sola al haber fuente y usuario
  await expect(page.getByLabel('Control del monitoreo').getByText('● Grabando')).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(segundos * 1000)
  await page.getByTestId('canal-finalizar').click()
  const dlg = page.getByRole('dialog', { name: 'Guardar monitoreo' })
  await expect(dlg).toBeVisible()
  if (!guardar) return dlg
  await dlg.getByLabel('Nombre del monitoreo').fill(nombre)
  await dlg.getByLabel('Actividad principal').selectOption('caminata')
  await dlg.getByLabel('Nota (opcional)').fill('prueba automática')
  await dlg.getByRole('button', { name: 'Guardar monitoreo' }).click()
  await expect(dlg).toBeHidden()
  return null
}

test('crear usuario, monitorear, guardar, ver, editar, exportar, comparar, aprender y eliminar', async ({ page }) => {
  test.setTimeout(180_000)
  const errores = []
  page.on('pageerror', (e) => errores.push(e.message))

  await crearUsuario(page)
  await expect(page.getByTestId('conteo-1')).toHaveText('0')

  // Un monitoreo descartado no queda registrado
  const d = await grabar(page, 'x', { guardar: false, segundos: 4 })
  await d.getByRole('button', { name: 'Descartar' }).click()
  await d.getByRole('button', { name: /Sí, descartar/ }).click()
  await expect(d).toBeHidden()

  await grabar(page, 'Prueba A')
  await grabar(page, 'Prueba B')

  // Lista de monitoreos
  await page.getByLabel('Principal').getByRole('link', { name: 'Monitoreos' }).click()
  await expect(page).toHaveURL(/\/monitoreos$/)
  await expect(page.getByRole('link', { name: 'Prueba A', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Prueba B', exact: true })).toBeVisible()
  await page.getByLabel('Buscar (nombre, nota, usuario)').fill('prueba b')
  await expect(page.getByRole('link', { name: 'Prueba A', exact: true })).toBeHidden()
  await page.getByLabel('Buscar (nombre, nota, usuario)').fill('')

  // Exportar CSV de la selección
  await page.getByLabel('Seleccionar todos los monitoreos mostrados').check()
  await page.getByTestId('exportar-csv-seleccion').click()
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Entiendo, descargar CSV' }).click()])
  expect(csv.suggestedFilename()).toMatch(/^ecg_Usuario1_\d{4}-\d\d-\d\dT\d{4}Z\.csv$/)
  const texto = readFileSync(await csv.path(), 'utf8')
  expect(texto.startsWith('# CLASIFICACION')).toBe(true)
  expect(texto).toContain('"Usuario 1"')

  // Detalle, edición y PDF
  await page.getByRole('link', { name: 'Prueba A', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Prueba A' })).toBeVisible()
  await expect(page.getByTestId('bpm-medio')).toHaveText(/\d+/)
  await page.getByTestId('editar-monitoreo').click()
  await page.getByLabel('Nombre del monitoreo').fill('Prueba A editada')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Prueba A editada' })).toBeVisible()
  await page.getByTestId('informe-pdf').click()
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Entiendo, descargar informe PDF' }).click()])
  expect(pdf.suggestedFilename()).toMatch(/^informe_Usuario1_.*\.pdf$/)
  const bytes = readFileSync(await pdf.path())
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  expect(bytes.toString('latin1')).toContain('Usuario 1')

  // Historial del usuario (CSV)
  await page.goto('/monitoreos')
  await page.getByTestId('descargar-historial').click()
  const [hist] = await Promise.all([page.waitForEvent('download'), page.getByTestId('confirmar-historial').click()])
  expect(hist.suggestedFilename()).toMatch(/^historial_Usuario1_.*\.csv$/)
  expect(readFileSync(await hist.path(), 'utf8')).toContain('# SERIE DE BPM POR MONITOREO')

  // Comparar A y B con el selector guiado
  await page.goto('/comparar')
  const grupoA = page.getByRole('group', { name: /Señal A/ })
  await grupoA.getByLabel('Monitoreo guardado').check()
  await grupoA.getByRole('radio', { name: /Prueba A editada/ }).click()
  const grupoB = page.getByRole('group', { name: /Señal B/ })
  await grupoB.getByLabel('Monitoreo guardado').check()
  await grupoB.getByRole('radio', { name: /Prueba B/ }).click()
  await page.getByRole('button', { name: 'Comparar', exact: true }).click()
  await expect(page.getByText('Correlación de Pearson')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('informe-comparacion-pdf').click()
  const [cmp] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Entiendo, descargar PDF' }).click()])
  expect(cmp.suggestedFilename()).toMatch(/^comparacion_Usuario1_.*\.pdf$/)

  // Aprende → Mis monitoreos
  await page.goto('/aprende/mis-monitoreos')
  await page.getByRole('radio', { name: /Prueba B/ }).click()
  await expect(page.getByTestId('kpi-picos')).toHaveText(/\d+/, { timeout: 20_000 })
  await expect(page.getByTestId('exp-picos')).toBeVisible()
  await expect(page.getByTestId('exp-calidad')).toBeVisible()

  // Usuarios: contador y eliminación de un monitoreo
  await page.goto('/usuarios')
  await expect(page.getByTestId('conteo-1')).toHaveText('2')
  await page.goto('/monitoreos')
  await page.getByRole('button', { name: 'Eliminar Prueba B' }).click()
  await page.getByTestId('confirmar-eliminar').click()
  await expect(page.getByRole('link', { name: 'Prueba B', exact: true })).toBeHidden()
  await page.goto('/usuarios')
  await expect(page.getByTestId('conteo-1')).toHaveText('1')

  // Eliminar usuario (flujo "Eliminar mis datos")
  await page.getByRole('button', { name: 'Eliminar Usuario 1' }).click()
  await page.getByTestId('confirmar-eliminar-usuario').click()
  await expect(page.getByText('Aún no hay usuarios')).toBeVisible()
  expect(errores).toEqual([])
})

test('mantenedor de usuarios: crear, buscar, editar alias y estados vacíos', async ({ page }) => {
  await page.goto('/usuarios')
  await expect(page.getByText('Aún no hay usuarios')).toBeVisible()
  for (const alias of ['Grupo A', 'Grupo B']) {
    await page.getByTestId('nuevo-usuario').click()
    await page.getByLabel('Alias (opcional)').fill(alias)
    await page.getByRole('button', { name: 'Crear usuario' }).click()
  }
  await page.getByLabel('Buscar por seudónimo o alias').fill('grupo a')
  await expect(page.getByTestId('tabla-usuarios').locator('tbody tr')).toHaveCount(1)
  await page.getByLabel('Buscar por seudónimo o alias').fill('zzz')
  await expect(page.getByText('Sin resultados')).toBeVisible()
  await page.getByLabel('Buscar por seudónimo o alias').fill('')
  await page.getByRole('button', { name: 'Editar Usuario 2' }).click()
  await page.getByLabel('Alias (opcional)').fill('Renombrado')
  await page.getByRole('button', { name: 'Guardar alias' }).click()
  await expect(page.getByRole('cell', { name: 'Renombrado' })).toBeVisible()
  // Usuario 1 no es el activo: editar y eliminar están deshabilitados hasta "Elegir"
  await expect(page.getByRole('button', { name: 'Editar Usuario 1' })).toBeDisabled()
  await page.getByRole('button', { name: 'Elegir Usuario 1' }).click()
  await expect(page.getByRole('button', { name: 'Editar Usuario 1' })).toBeEnabled()
})

test('vistas principales sin desborde horizontal a 375 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/usuarios')
  await page.getByTestId('nuevo-usuario').click()
  await page.getByRole('button', { name: 'Crear usuario' }).click()
  for (const ruta of ['/', '/usuarios', '/monitor', '/monitoreos', '/comparar', '/aprende/mis-monitoreos']) {
    await page.goto(ruta)
    await page.waitForTimeout(300)
    const ancho = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }))
    expect(ancho.sw, `desborde en ${ruta}`).toBeLessThanOrEqual(ancho.iw)
  }
})
