import { test, expect } from '@playwright/test'

test.describe('PWA y responsivo (375x812)', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })

  test('manifest válido, iconos y service worker registrado', async ({ page, request }) => {
    await page.goto('/')
    const href = await page.locator('link[rel="manifest"]').getAttribute('href')
    const res = await request.get(href)
    expect(res.ok()).toBe(true)
    const m = await res.json()
    expect(m.name).toBeTruthy()
    expect(m.display).toBe('standalone')
    expect(m.start_url).toBe('/')
    const tamanos = m.icons.map((i) => i.sizes)
    expect(tamanos).toContain('192x192')
    expect(tamanos).toContain('512x512')
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true)
    for (const i of m.icons.filter((x) => x.src.endsWith('.png'))) expect((await request.get(i.src)).ok()).toBe(true)
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1)
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1)

    const activo = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready
      return !!reg.active
    })
    expect(activo).toBe(true)
  })

  test('sin scroll horizontal en las pantallas principales', async ({ page }) => {
    for (const ruta of ['/', '/usuarios', '/privacidad', '/seguridad', '/aprende']) {
      await page.goto(ruta)
      const ancho = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
      expect(ancho.sw, `scroll horizontal en ${ruta}`).toBeLessThanOrEqual(ancho.cw)
    }
  })

  test('el menú móvil se despliega y los botones miden >= 44 px', async ({ page }) => {
    await page.goto('/')
    const boton = page.getByRole('button', { name: 'Menú' })
    await expect(boton).toBeVisible()
    const box = await boton.boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(44)
    await boton.click()
    await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Monitor', exact: true })).toBeVisible()
  })
})
