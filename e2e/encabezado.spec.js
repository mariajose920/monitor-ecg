import { test, expect } from '@playwright/test'

/**
 * Encabezado adaptable en 3 niveles (solo CSS): fila con ícono + texto (>= 1760 px), dos filas compactas
 * (600–1359 px) y solo íconos con desplegable (< 600 px). Sin desbordes horizontales en ningún ancho.
 */
const ANCHOS = [375, 600, 768, 899, 900, 1024, 1280, 1440, 1800]

async function medir(page) {
  return page.evaluate(() => {
    const h = document.querySelector('.app-header').getBoundingClientRect()
    const cw = document.documentElement.clientWidth
    const fuera = [...document.querySelectorAll('.app-header a, .app-header button')]
      .filter((e) => e.offsetParent !== null)
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 2 && (r.right > cw + 0.5 || r.left < -0.5)).length
    return { alto: h.height, sw: document.documentElement.scrollWidth, cw, fuera }
  })
}

for (const ancho of ANCHOS) {
  test(`sin desbordes horizontales a ${ancho} px`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 800 })
    for (const ruta of ['/', '/pacientes', '/aprende']) {
      await page.goto(ruta)
      const m = await medir(page)
      expect(m.sw, `scroll horizontal en ${ruta}`).toBeLessThanOrEqual(m.cw)
      expect(m.fuera, 'controles del encabezado fuera de la pantalla').toBe(0)
    }
  })
}

test('nivel 1 (1800 px): una fila con ícono y texto visibles', async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 900 })
  await page.goto('/')
  const m = await medir(page)
  expect(m.alto).toBeLessThan(80)
  const nav1 = page.getByRole('navigation', { name: 'Principal' })
  const [p1, p2] = [await nav1.getByRole('link', { name: 'Inicio', exact: true }).boundingBox(), await nav1.getByRole('link', { name: 'Aprende', exact: true }).boundingBox()]
  expect(Math.abs(p1.y - p2.y), 'una sola fila').toBeLessThan(4)
  const enlace = nav1.getByRole('link', { name: 'Monitoreos', exact: true })
  const box = await enlace.boundingBox()
  expect(box.width).toBeGreaterThan(90) // texto visible, no solo ícono
  await expect(enlace.locator('svg')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Menú' })).toBeHidden()
})

test('nivel 2 (900–1440 px): dos filas compactas con ícono y texto pequeño', async ({ page }) => {
  for (const ancho of [900, 1024, 1280, 1440]) {
    await page.setViewportSize({ width: ancho, height: 800 })
    await page.goto('/')
    await page.waitForSelector('.app-header')
    const m = await medir(page)
    expect(m.alto, `alto a ${ancho}`).toBeGreaterThan(80)
    expect(m.alto, `alto a ${ancho}`).toBeLessThan(120)
    const inicio = page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Inicio', exact: true })
    const pacientes = page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Pacientes', exact: true })
    const [a, b] = [await inicio.boundingBox(), await pacientes.boundingBox()]
    expect(b.y, 'segunda fila de la rejilla').toBeGreaterThan(a.y + a.height - 2)
    await expect(inicio).toContainText('Inicio')
    await expect(page.getByRole('button', { name: 'Menú' })).toBeHidden()
  }
})

test('nivel 3 (375 px): solo íconos, objetivos >= 44 px, nombre accesible y desplegable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  const m = await medir(page)
  expect(m.alto).toBeLessThan(70)
  const nav = page.getByRole('navigation', { name: 'Principal' })
  for (const nombre of ['Monitor', 'Monitoreos']) {
    const enlace = nav.getByRole('link', { name: nombre, exact: true })
    await expect(enlace).toBeVisible()
    await expect(enlace).toHaveAttribute('title', nombre)
    const box = await enlace.boundingBox()
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
    // el texto no se ve (solo ícono): ningún texto visible ocupa espacio
    const ancho = await enlace.locator('.txt').evaluate((e) => e.getBoundingClientRect().width)
    expect(ancho).toBeLessThanOrEqual(2)
  }
  // chips de paciente y cuenta como íconos con estado accesible y objetivo táctil
  for (const id of ['usuario-activo', 'chip-cuenta']) {
    const chip = page.getByTestId(id)
    const box = await chip.boundingBox()
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
  await expect(page.getByTestId('usuario-activo')).toContainText('Sin paciente')
  await expect(page.getByTestId('chip-cuenta')).toContainText('Sin cuenta')
  // foco visible
  await nav.getByRole('link', { name: 'Monitor', exact: true }).focus()
  const contorno = await nav.getByRole('link', { name: 'Monitor', exact: true }).evaluate((e) => getComputedStyle(e).outlineStyle)
  expect(contorno).not.toBe('none')
  // desplegable "más": enlaces que no caben + cuenta + tema, sin duplicados visibles
  const boton = page.getByRole('button', { name: 'Menú' })
  const bb = await boton.boundingBox()
  expect(bb.height).toBeGreaterThanOrEqual(44)
  await expect(boton).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('link', { name: 'Pacientes', exact: true })).toBeHidden()
  await boton.click()
  await expect(boton).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('link', { name: 'Pacientes', exact: true })).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Pacientes', exact: true })).toBeVisible()
  await expect(page.getByTestId('enlace-acceso')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tema claro' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(boton).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('button', { name: 'Menú' }).click()
  await page.getByRole('link', { name: 'Pacientes', exact: true }).click()
  await expect(page).toHaveURL(/\/pacientes$/)
  await expect(boton).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('link', { name: 'Monitoreos', exact: true })).toBeVisible()
})

test('el encabezado se oculta al bajar y reaparece al subir (< 1760 px)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 600 })
  await page.goto('/')
  await page.evaluate(() => { document.body.style.minHeight = '3000px' })
  await page.mouse.wheel(0, 600)
  await page.waitForTimeout(400)
  await page.mouse.wheel(0, 300)
  await page.waitForTimeout(500)
  const y = await page.evaluate(() => document.querySelector('.app-header').getBoundingClientRect().bottom)
  expect(y).toBeLessThanOrEqual(1)
  await page.mouse.wheel(0, -200)
  await page.waitForTimeout(500)
  const y2 = await page.evaluate(() => document.querySelector('.app-header').getBoundingClientRect().bottom)
  expect(y2).toBeGreaterThan(20)
})
