import { test, expect } from '@playwright/test'

/**
 * Privacidad en la app (TANDA 2) con la copia construida CON nube y TODA la red a Supabase simulada con page.route
 * (nunca se contacta la base real). Verifica:
 *  - C-03: la nube viene apagada y no se envía ningún paciente ni monitoreo; un borrador nunca se sube; al guardar con la nube
 *    activada se sube sin nombre, notas ni alias; el interruptor activa y apaga (con opción de borrar lo subido, pidiendo la contraseña).
 *  - C-07: equipo compartido => el token vive en sessionStorage; equipo personal => localStorage; al salir de un equipo compartido
 *    se quitan los tokens.
 */
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const USER = { id: '22222222-2222-4222-8222-222222222222', aud: 'authenticated', role: 'authenticated', email: 'persona@ejemplo.cl', app_metadata: {}, user_metadata: {}, factors: [], created_at: '2026-01-01T00:00:00Z' }
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, aal: 'aal1', role: 'authenticated', exp: 4102444800, amr: [] })}.firm`
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function simularNube(page) {
  const estado = { escrituras: [], rpc: [], tokens: 0 }
  page.on('request', (req) => {
    const u = req.url()
    if (/\/rest\/v1\/(sesiones|pacientes|bloques_muestras)/.test(u) && req.method() !== 'GET') {
      estado.escrituras.push({ metodo: req.method(), tabla: /\/rest\/v1\/([a-z_]+)/.exec(u)[1], cuerpo: req.postData() ?? '' })
    }
  })
  await page.route('**/*.supabase.co/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/rest/v1/rpc/es_admin_registrado', (route) => json(route, false))
  await page.route('**/rest/v1/rpc/es_admin', (route) => json(route, false))
  await page.route('**/rest/v1/rpc/registrar_evento', (route) => route.fulfill({ status: 204, body: '' }))
  await page.route('**/rest/v1/rpc/borrar_mis_datos', (route) => {
    estado.rpc.push('borrar_mis_datos')
    return json(route, { sesiones: 1, incidentes: 0, pacientes: 1 })
  })
  await page.route('**/auth/v1/token?grant_type=password', (route) => {
    estado.tokens++
    return json(route, { access_token: jwt(), token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: USER })
  })
  await page.route('**/auth/v1/user', (route) => json(route, USER))
  await page.route('**/auth/v1/logout**', (route) => route.fulfill({ status: 204, body: '' }))
  return estado
}

async function iniciarSesion(page, { compartido = null } = {}) {
  await page.goto('/acceso')
  await page.getByLabel('Correo').fill('persona@ejemplo.cl')
  await page.getByLabel('Contraseña').fill('claveSegura2026')
  if (compartido !== null) await page.getByTestId('equipo-compartido').setChecked(compartido)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/pacientes/)
}

async function crearPaciente(page, alias = '') {
  await page.getByTestId('nuevo-usuario').click()
  if (alias) await page.getByLabel('Alias (opcional)').fill(alias)
  await page.getByTestId('declara-mayor-edad').check()
  await page.getByRole('button', { name: 'Crear paciente' }).click()
  await expect(page.getByTestId('usuario-activo')).toContainText('Paciente 1')
}

async function activarNube(page) {
  await page.goto('/cuenta')
  await expect(page.getByTestId('interruptor-nube')).not.toBeChecked()
  await page.getByTestId('interruptor-nube').click()
  await page.getByTestId('confirmar-activar-nube').click()
  await expect(page.getByTestId('interruptor-nube')).toBeChecked()
}

async function medirHastaDialogo(page) {
  await page.goto('/monitor')
  await page.getByRole('button', { name: 'Iniciar fuente' }).first().click()
  await expect(page.getByTestId('bpm').first()).toHaveText(/\d{2,3}\s*BPM/, { timeout: 15_000 })
  await expect(page.getByLabel('Control del monitoreo').getByText('● Grabando')).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(5000)
  await page.getByTestId('canal-finalizar').click()
  const dlg = page.getByRole('dialog', { name: 'Guardar monitoreo' })
  await expect(dlg).toBeVisible()
  return dlg
}

test('la nube viene apagada: con cuenta no se envía ningún paciente ni monitoreo, ni siquiera al guardar', async ({ page }) => {
  test.setTimeout(90_000)
  const estado = await simularNube(page)
  await iniciarSesion(page)
  await expect(page.getByTestId('banner-nube')).toBeVisible()
  await crearPaciente(page, 'Grupo A')
  const dlg = await medirHastaDialogo(page)
  await expect(dlg.getByTestId('aviso-nube-apagada')).toBeVisible()
  await dlg.getByLabel('Nombre del monitoreo').fill('Prueba local')
  await dlg.getByLabel('Nota (opcional)').fill('nota privada')
  await dlg.getByRole('button', { name: 'Guardar monitoreo' }).click()
  await expect(dlg).toBeHidden()
  await page.waitForTimeout(800)
  expect(estado.escrituras).toEqual([])
  await page.goto('/cuenta')
  await expect(page.getByTestId('interruptor-nube')).not.toBeChecked()
})

test('con la nube activada un borrador no se sube; al guardar se sube sin nombre, notas ni alias', async ({ page }) => {
  test.setTimeout(120_000)
  const estado = await simularNube(page)
  await iniciarSesion(page)
  await activarNube(page)
  await page.goto('/pacientes')
  await crearPaciente(page, 'AliasSecreto')
  await page.waitForTimeout(500)
  const paciente = estado.escrituras.find((e) => e.tabla === 'pacientes')
  expect(paciente).toBeTruthy()
  expect(paciente.cuerpo).toContain('Paciente 1')
  expect(paciente.cuerpo).not.toContain('AliasSecreto')
  estado.escrituras.length = 0

  const dlg = await medirHastaDialogo(page)
  await page.waitForTimeout(800)
  expect(estado.escrituras.filter((e) => e.tabla === 'sesiones' || e.tabla === 'bloques_muestras')).toEqual([]) // borrador: nada sale

  await dlg.getByLabel('Nombre del monitoreo').fill('NombreLibreXYZ')
  await dlg.getByLabel('Nota (opcional)').fill('NotaLibreXYZ')
  await dlg.getByRole('button', { name: 'Guardar monitoreo' }).click()
  await expect(dlg).toBeHidden()
  await expect.poll(() => estado.escrituras.some((e) => e.tabla === 'bloques_muestras'), { timeout: 20_000 }).toBe(true)
  const sesiones = estado.escrituras.filter((e) => e.tabla === 'sesiones')
  expect(sesiones.length).toBeGreaterThan(0)
  for (const s of sesiones) {
    expect(s.cuerpo).not.toMatch(/NombreLibreXYZ|NotaLibreXYZ|AliasSecreto/)
    expect(s.cuerpo).toContain('"visibilidad":"privado"')
  }
})

test('interruptor: activar pide confirmación; apagar permite conservar o borrar (borrar pide la contraseña)', async ({ page }) => {
  const estado = await simularNube(page)
  await iniciarSesion(page)
  await activarNube(page)

  await page.getByTestId('interruptor-nube').click()
  await page.getByTestId('apagar-conservar').click()
  await expect(page.getByTestId('interruptor-nube')).not.toBeChecked()
  expect(estado.rpc).toEqual([])

  await page.getByTestId('interruptor-nube').click()
  await page.getByTestId('confirmar-activar-nube').click()
  await expect(page.getByTestId('interruptor-nube')).toBeChecked()
  await page.getByTestId('interruptor-nube').click()
  await page.getByTestId('apagar-borrar').click()
  await expect(page.getByTestId('reauth-password')).toBeVisible() // acción sensible: pide la contraseña actual
  expect(estado.rpc).toEqual([])
  await page.getByTestId('reauth-password').fill('claveSegura2026')
  await page.getByTestId('reauth-confirmar').click()
  await expect.poll(() => estado.rpc).toEqual(['borrar_mis_datos'])
  await expect(page.getByTestId('interruptor-nube')).not.toBeChecked()
})

test('equipo compartido: el token vive en sessionStorage y se borra al salir', async ({ page }) => {
  await simularNube(page)
  await iniciarSesion(page, { compartido: true })
  const tokens = () => page.evaluate(() => ({ local: localStorage.getItem('ecg-cloud-auth') !== null, sesion: sessionStorage.getItem('ecg-cloud-auth') !== null }))
  expect(await tokens()).toEqual({ local: false, sesion: true })
  await page.getByTestId('cerrar-sesion-cuenta').first().click() // equipo compartido: sale y quita los datos sin preguntar
  await expect(page.getByTestId('chip-cuenta')).toContainText('Sin cuenta')
  expect(await tokens()).toEqual({ local: false, sesion: false })
})

test('equipo personal: el token vive en localStorage y el cierre de sesión pregunta qué hacer con los datos', async ({ page }) => {
  await simularNube(page)
  await iniciarSesion(page, { compartido: false })
  expect(await page.evaluate(() => ({ local: localStorage.getItem('ecg-cloud-auth') !== null, sesion: sessionStorage.getItem('ecg-cloud-auth') !== null }))).toEqual({ local: true, sesion: false })
  await page.getByTestId('cerrar-sesion-cuenta').first().click()
  await expect(page.getByTestId('salir-conservar')).toBeVisible()
  await page.getByTestId('salir-conservar').click()
  await expect(page.getByTestId('chip-cuenta')).toContainText('Sin cuenta')
  expect(await page.evaluate(() => localStorage.getItem('ecg-cloud-auth'))).toBeNull()
})
