import { test, expect } from '@playwright/test'

/**
 * Administrador = cuenta + TOTP, con la copia construida CON nube. Toda la red a Supabase se simula con
 * page.route (no se contacta la base real). Cubre: el botón Admin solo aparece con rol asignado,
 * /admin/acceso redirige a /acceso y el panel exige el segundo factor (A.9.2.3, A.9.4.2).
 */
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const USER = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'persona@ejemplo.cl', app_metadata: {}, user_metadata: {}, factors: [], created_at: '2026-01-01T00:00:00Z' }
const jwt = (aal) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, aal, role: 'authenticated', exp: 4102444800, amr: [] })}.firm`
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

// ---------------------------------------------------------------------------------------------
// Gestión de administradores desde la app (A.9.2.3 / A.9.2.5 / A.9.2.6) con red simulada.
// ---------------------------------------------------------------------------------------------
const FACTOR = { id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'admin', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const USER_MFA = { ...USER, factors: [FACTOR] }
const OTRO = '22222222-2222-4222-8222-222222222222'
const NUEVO = '33333333-3333-4333-8333-333333333333'

/** Simula una sesión de administrador que sube a aal2 con un código y las funciones RPC de roles. */
async function simularAdmin(page) {
  const estado = {
    admins: [
      { user_id: USER.id, email: 'persona@ejemplo.cl', creado_en: '2026-01-01T10:00:00Z' },
      { user_id: OTRO, email: 'otra@ejemplo.cl', creado_en: '2026-02-01T10:00:00Z' },
    ],
    conceder: [], retirar: [], parametros: [], rechazarConceder: false,
  }
  await simularNube(page, { admin: true })
  await page.route('**/rest/v1/rpc/es_admin', (route) => json(route, true))
  await page.route('**/auth/v1/token?grant_type=password', (route) =>
    json(route, { access_token: jwt('aal1'), token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: USER_MFA }))
  await page.route('**/auth/v1/user', (route) => json(route, USER_MFA))
  await page.route('**/auth/v1/factors/f1/challenge', (route) => json(route, { id: 'c1', type: 'totp', expires_at: 4102444800 }))
  await page.route('**/auth/v1/factors/f1/verify', (route) =>
    json(route, { access_token: jwt('aal2'), token_type: 'bearer', expires_in: 3600, refresh_token: 'r2', user: USER_MFA }))
  await page.route('**/rest/v1/rpc/admin_listar_administradores', (route) => json(route, estado.admins))
  await page.route('**/rest/v1/rpc/admin_conceder_rol', (route) => {
    const cuerpo = route.request().postDataJSON()
    estado.conceder.push(cuerpo.p_correo)
    if (estado.rechazarConceder) return json(route, { code: 'P0001', message: 'No se pudo conceder el rol', details: null, hint: null }, 400)
    const fila = { user_id: NUEVO, email: cuerpo.p_correo, creado_en: '2026-03-01T10:00:00Z' }
    estado.admins.push(fila)
    return json(route, [{ user_id: fila.user_id, creado_en: fila.creado_en }])
  })
  await page.route('**/rest/v1/rpc/admin_retirar_rol', (route) => {
    const { p_user_id: id } = route.request().postDataJSON()
    estado.retirar.push(id)
    estado.admins = estado.admins.filter((a) => a.user_id !== id)
    return json(route, true)
  })
  await page.route('**/rest/v1/parametros**', (route) => {
    if (route.request().method() !== 'POST') return json(route, null)
    estado.parametros.push(route.request().postDataJSON())
    return route.fulfill({ status: 201, contentType: 'application/json', body: '' })
  })
  return estado
}

async function entrarComoAdmin(page) {
  await iniciarSesion(page)
  await page.getByTestId('enlace-admin').click()
  await expect(page).toHaveURL(/\/admin\/mfa/)
  await page.getByLabel('Código de 6 dígitos').fill('123456')
  await page.getByRole('button', { name: 'Verificar' }).click()
  await expect(page).toHaveURL(/\/admin$/)
}

test('el administrador (aal2) guarda parámetros y se publican en la nube', async ({ page }) => {
  const estado = await simularAdmin(page)
  await entrarComoAdmin(page)
  await page.getByRole('tab', { name: 'Parámetros' }).click()
  await page.getByRole('button', { name: 'Guardar parámetros' }).click()
  await expect(page.getByText('Parámetros guardados y auditados y publicados en la nube.')).toBeVisible()
  expect(estado.parametros.length).toBeGreaterThan(0)
  expect(estado.parametros[0].parametros.bpm).toBeTruthy()
  // El botón de la pestaña Nube también está disponible para el administrador con aal2
  await page.getByRole('tab', { name: 'Nube' }).click()
  await expect(page.getByRole('button', { name: 'Publicar configuración ahora' })).toBeEnabled()
})

test('pestaña Administradores: lista con "tú", concede con código TOTP y retira con confirmación', async ({ page }) => {
  const estado = await simularAdmin(page)
  await entrarComoAdmin(page)
  await page.getByRole('tab', { name: 'Administradores' }).click()

  const tabla = page.getByTestId('tabla-admins')
  await expect(tabla.getByRole('row')).toHaveCount(3) // encabezado + 2
  await expect(tabla.getByRole('row', { name: /persona@ejemplo\.cl/ })).toContainText('tú')
  await expect(tabla.getByRole('row', { name: /otra@ejemplo\.cl/ })).not.toContainText('tú')
  // no se puede retirar el propio rol: sin botón en la fila propia
  await expect(tabla.getByRole('row', { name: /persona@ejemplo\.cl/ }).getByRole('button')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Administradores (2 de 5)' })).toBeVisible()

  // correo inválido: no llega al servidor
  await page.getByLabel(/Dar rol de administrador a/).fill('no-es-correo')
  await page.getByRole('button', { name: 'Dar rol de administrador' }).click()
  await expect(page.getByText('Escribe un correo válido.')).toBeVisible()
  expect(estado.conceder).toHaveLength(0)

  // conceder: pide un código nuevo
  await page.getByLabel(/Dar rol de administrador a/).fill('  Nueva@Ejemplo.CL ')
  await page.getByRole('button', { name: 'Dar rol de administrador' }).click()
  const dlg = page.getByRole('dialog', { name: 'Confirmar concesión del rol' })
  await expect(dlg).toBeVisible()
  await dlg.getByLabel(/Código de 6 dígitos/).fill('654321')
  await dlg.getByRole('button', { name: 'Dar rol' }).click()
  await expect(page.getByText('Rol de administrador concedido y registrado en la auditoría.')).toBeVisible()
  expect(estado.conceder).toEqual(['nueva@ejemplo.cl'])
  await expect(tabla.getByRole('row', { name: /nueva@ejemplo\.cl/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Administradores (3 de 5)' })).toBeVisible()

  // retirar: primero confirmación explícita y después el código
  await tabla.getByRole('row', { name: /otra@ejemplo\.cl/ }).getByRole('button', { name: /Retirar rol/ }).click()
  const conf = page.getByRole('dialog', { name: 'Retirar rol de administrador' })
  await expect(conf).toContainText('otra@ejemplo.cl')
  await conf.getByRole('button', { name: 'Cancelar' }).click()
  expect(estado.retirar).toHaveLength(0)
  await tabla.getByRole('row', { name: /otra@ejemplo\.cl/ }).getByRole('button', { name: /Retirar rol/ }).click()
  await page.getByRole('dialog', { name: 'Retirar rol de administrador' }).getByRole('button', { name: 'Sí, retirar' }).click()
  const cod = page.getByRole('dialog', { name: 'Confirmar retiro del rol' })
  await cod.getByLabel(/Código de 6 dígitos/).fill('111222')
  await cod.getByRole('button', { name: 'Retirar rol' }).click()
  await expect(page.getByText('Rol de administrador retirado y registrado en la auditoría.')).toBeVisible()
  expect(estado.retirar).toEqual([OTRO])
  await expect(tabla.getByRole('row', { name: /otra@ejemplo\.cl/ })).toHaveCount(0)

  // revisión de derechos (A.9.2.5) reutiliza el registro existente
  await page.getByLabel(/Revisé la lista de administradores/).check()
  await page.getByRole('button', { name: 'Registrar revisión' }).click()
  await expect(page.getByText('Revisión de accesos registrada en la auditoría.')).toBeVisible()
})

test('pestaña Administradores: el error del servidor es genérico (no revela si el correo existe)', async ({ page }) => {
  const estado = await simularAdmin(page)
  estado.rechazarConceder = true
  await entrarComoAdmin(page)
  await page.getByRole('tab', { name: 'Administradores' }).click()
  await page.getByLabel(/Dar rol de administrador a/).fill('desconocido@ejemplo.cl')
  await page.getByRole('button', { name: 'Dar rol de administrador' }).click()
  const dlg = page.getByRole('dialog', { name: 'Confirmar concesión del rol' })
  await dlg.getByLabel(/Código de 6 dígitos/).fill('123456')
  await dlg.getByRole('button', { name: 'Dar rol' }).click()
  await expect(page.getByText('No se pudo completar la operación. Revisa los datos e inténtalo de nuevo.')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/no existe|no registrad/i)
})

test('con cuenta y sesión de administrador el encabezado nunca superpone textos (1280 a 1800 px)', async ({ page }) => {
  await simularAdmin(page)
  await entrarComoAdmin(page)
  for (const ancho of [375, 600, 768, 899, 900, 1024, 1280, 1440, 1600, 1800]) {
    await page.setViewportSize({ width: ancho, height: 900 })
    await page.waitForTimeout(200)
    const choques = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.app-header a, .app-header button, .app-header .chip, .app-header .brand')]
        .filter((e) => e.offsetParent !== null)
        .map((e) => ({ n: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 24), r: e.getBoundingClientRect() }))
        .filter((x) => x.r.width > 2 && x.r.height > 2)
      const sol = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2
      const malos = []
      for (let i = 0; i < els.length; i++) {
        for (let j = i + 1; j < els.length; j++) {
          // un elemento contenido dentro de otro (p. ej. chip dentro de enlace) no cuenta como choque
          const a = els[i].r
          const b = els[j].r
          const dentro = (x, y) => x.left >= y.left - 1 && x.right <= y.right + 1 && x.top >= y.top - 1 && x.bottom <= y.bottom + 1
          if (sol(a, b) && !dentro(a, b) && !dentro(b, a)) malos.push(`${els[i].n} × ${els[j].n}`)
        }
      }
      return malos
    })
    expect(choques, `superposiciones a ${ancho} px`).toEqual([])
  }
})
