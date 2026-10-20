import { test, expect } from '@playwright/test'

/**
 * Administrador = cuenta + TOTP, con la copia construida CON nube. Toda la red a Supabase se simula con
 * page.route (no se contacta la base real). Cubre: el botón Admin solo aparece con rol asignado,
 * /admin/acceso redirige a /acceso y el panel exige el segundo factor (A.9.2.3, A.9.4.2).
 */
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const USER = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'persona@ejemplo.cl', app_metadata: {}, user_metadata: {}, factors: [], created_at: '2026-01-01T00:00:00Z' }
const jwt = (aal) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, aal, role: 'authenticated', exp: 4102444800, amr: [] })}.firma`
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function simularNube(page, { admin }) {
  await page.route('**/*.supabase.co/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/rest/v1/rpc/es_admin_registrado', (route) => json(route, admin))
  await page.route('**/rest/v1/rpc/es_admin', (route) => json(route, false))
  await page.route('**/auth/v1/token?grant_type=password', (route) =>
    json(route, { access_token: jwt('aal1'), token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: USER }))
  await page.route('**/auth/v1/user', (route) => json(route, USER))
  await page.route('**/auth/v1/factors', (route) =>
    json(route, { id: 'f1', type: 'totp', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' } }, 200))
}

async function iniciarSesion(page) {
  await page.goto('/acceso')
  await page.getByLabel('Correo').fill('persona@ejemplo.cl')
  await page.getByLabel('Contraseña').fill('claveSegura2026')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/pacientes/)
}

test('sin rol de administrador el botón Admin no aparece', async ({ page }) => {
  await simularNube(page, { admin: false })
  await page.goto('/')
  await expect(page.getByTestId('enlace-admin')).toHaveCount(0)
  await iniciarSesion(page)
  await expect(page.getByTestId('chip-cuenta')).toContainText('Con cuenta')
  await expect(page.getByTestId('enlace-admin')).toHaveCount(0)
})

test('con rol asignado aparece el botón y lleva a configurar el segundo factor (aún sin aal2)', async ({ page }) => {
  await simularNube(page, { admin: true })
  await iniciarSesion(page)
  const enlace = page.getByTestId('enlace-admin')
  await expect(enlace).toBeVisible()
  await expect(enlace).toHaveAttribute('href', '/admin/mfa')
  await enlace.click()
  await expect(page).toHaveURL(/\/admin\/mfa/)
  await expect(page.getByRole('heading', { level: 1, name: 'Configurar el segundo factor' })).toBeVisible()
  await expect(page.getByAltText('Código QR para la aplicación de autenticación')).toBeVisible()
  await expect(page.getByTestId('mfa-secreto')).toHaveText('JBSWY3DPEHPK3PXP')
  // Un código mal formado no llega al servidor
  await page.getByLabel('Código de 6 dígitos').fill('12')
  await page.getByRole('button', { name: 'Activar y entrar' }).click()
  await expect(page.getByText('Escribe los 6 dígitos del código.')).toBeVisible()
})

test('el panel /admin exige el segundo factor aunque la cuenta tenga el rol', async ({ page }) => {
  await simularNube(page, { admin: true })
  await iniciarSesion(page)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/mfa\?redirect=admin/)
})

test('/admin/acceso y /admin/setup redirigen a /acceso (con redirect en lista blanca)', async ({ page }) => {
  await simularNube(page, { admin: false })
  await page.goto('/admin/acceso')
  await expect(page).toHaveURL(/\/acceso$/)
  await page.goto('/admin/acceso?redirect=admin')
  await expect(page).toHaveURL(/\/acceso\?redirect=admin$/)
  await page.goto('/admin/acceso?redirect=https://evil.example')
  await expect(page).toHaveURL(/\/acceso$/)
  await page.goto('/admin/setup')
  await expect(page).toHaveURL(/\/acceso$/)
})

test('sin sesión, /admin y /admin/mfa llevan a /acceso', async ({ page }) => {
  await simularNube(page, { admin: false })
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/acceso\?redirect=admin/)
  await page.goto('/admin/mfa')
  await expect(page).toHaveURL(/\/acceso/)
})
