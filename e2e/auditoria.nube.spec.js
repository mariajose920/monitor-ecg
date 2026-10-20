import { test, expect } from '@playwright/test'

/**
 * Cuenta común con la copia CON nube y TODA la red simulada (nunca la base real). Cubre la TANDA 1:
 *  C-08  la auditoría pasa por la RPC registrar_evento (sin actor del cliente, sin INSERT directo) y los eventos generados
 *        sin red quedan en una cola persistente que se reenvía al volver la conexión
 *  C-09  la persona que reportó un incidente ve el estado y la respuesta que dio el administrador (sincronizados desde la nube)
 *  C-06  si un administrador leyó datos suyos, la persona lo ve con su motivo
 */
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const USER = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'persona@ejemplo.cl', app_metadata: {}, user_metadata: {}, factors: [], created_at: '2026-01-01T00:00:00Z' }
const jwt = (aal) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, aal, role: 'authenticated', exp: 4102444800, amr: [] })}.firm`
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function simularNube(page, extra = {}) {
  const estado = { eventos: [], directos: [], incidentesEnviados: [], enLinea: true, incidentesNube: [], accesos: [], ...extra }
  await page.route('**/*.supabase.co/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/rest/v1/rpc/es_admin_registrado', (route) => json(route, false))
  await page.route('**/rest/v1/rpc/es_admin', (route) => json(route, false))
  await page.route('**/auth/v1/token?grant_type=password', (route) =>
    json(route, { access_token: jwt('aal1'), token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: USER }))
  await page.route('**/auth/v1/user', (route) => json(route, USER))
  await page.route('**/rest/v1/auditoria**', (route) => {
    estado.directos.push(route.request().method())
    return json(route, { code: '42501', message: 'permission denied' }, 403)
  })
  await page.route('**/rest/v1/rpc/registrar_evento', (route) => {
    if (!estado.enLinea) return route.abort('failed')
    estado.eventos.push(route.request().postDataJSON())
    return route.fulfill({ status: 204, body: '' })
  })
  await page.route('**/rest/v1/incidentes**', (route) => {
    if (route.request().method() === 'GET') return json(route, estado.incidentesNube)
    estado.incidentesEnviados.push({ cuerpo: route.request().postDataJSON(), prefer: route.request().headers().prefer ?? '' })
    return route.fulfill({ status: 201, contentType: 'application/json', body: '' })
  })
  await page.route('**/rest/v1/rpc/mis_accesos_admin', (route) => json(route, estado.accesos))
  return estado
}

async function iniciarSesion(page) {
  await page.goto('/acceso')
  await page.getByLabel('Correo').fill('persona@ejemplo.cl')
  await page.getByLabel('Contraseña').fill('claveSegura2026')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/pacientes/)
}

const leerCola = (page) =>
  page.evaluate(() => new Promise((resolve, reject) => {
    const r = indexedDB.open('monitor-ecg')
    r.onerror = () => reject(r.error)
    r.onsuccess = () => {
      const g = r.result.transaction('meta').objectStore('meta').get('outbox:audit')
      g.onsuccess = () => resolve(g.result ?? [])
      g.onerror = () => reject(g.error)
    }
  }))

test('la auditoría usa registrar_evento sin actor del cliente y nunca inserta directo en la tabla', async ({ page }) => {
  const estado = await simularNube(page)
  await iniciarSesion(page)
  await expect.poll(() => estado.eventos.length).toBeGreaterThan(0)
  const login = estado.eventos.find((e) => e.p_tipo === 'ACCOUNT_LOGIN')
  expect(login).toBeTruthy()
  expect(Object.keys(login).sort()).toEqual(['p_detalle', 'p_tipo']) // sin "actor" ni "usuario": los fija el servidor
  expect(estado.directos).toEqual([])
})

test('sin red los eventos quedan en la cola persistente y se reenvían al volver la conexión', async ({ page }) => {
  const estado = await simularNube(page, { enLinea: false })
  await iniciarSesion(page)
  await expect.poll(async () => (await leerCola(page)).some((e) => e.tipo === 'ACCOUNT_LOGIN')).toBe(true) // persistido, no perdido
  expect(estado.eventos).toHaveLength(0)

  estado.enLinea = true
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(() => estado.eventos.some((e) => e.p_tipo === 'ACCOUNT_LOGIN')).toBe(true)
  await expect.poll(async () => (await leerCola(page)).length).toBe(0)
  expect(estado.directos).toEqual([])
})

test('un incidente se envía sin respuesta ni fechas del cliente, y la persona ve después la respuesta del administrador', async ({ page }) => {
  const estado = await simularNube(page)
  await iniciarSesion(page)
  await page.goto('/seguridad')
  await page.getByLabel('Qué observaste').fill('Vi una sesión abierta en el equipo del laboratorio')
  await page.getByRole('button', { name: 'Enviar notificación' }).click()
  await expect.poll(() => estado.incidentesEnviados.length).toBe(1)
  const { cuerpo, prefer } = estado.incidentesEnviados[0]
  expect(prefer).toContain('ignore-duplicates')
  for (const prohibido of ['respuesta', 'leccion', 'creado_en', 'actualizado_en']) expect(cuerpo).not.toHaveProperty(prohibido)
  expect(cuerpo).toMatchObject({ tipo: 'debilidad', estado: 'abierto' })
  await expect(page.getByTestId('mis-incidentes')).toContainText('abierto')

  // El administrador (en otro navegador) lo cierra: la persona ve el estado y la respuesta al actualizar.
  estado.incidentesNube = [{
    ...cuerpo, creado_en: '2026-10-01T10:00:00Z', actualizado_en: '2026-10-02T10:00:00Z', estado: 'cerrado',
    respuesta: 'Se cerró la sesión y se avisó al laboratorio', leccion: 'Cerrar sesión al terminar',
  }]
  await page.getByRole('button', { name: 'Actualizar estado' }).click()
  await expect(page.getByTestId('estado-incidente')).toHaveText('cerrado')
  await expect(page.getByTestId('mis-incidentes')).toContainText('Se cerró la sesión y se avisó al laboratorio')
})

test('si un administrador leyó datos de la persona, ella ve cuándo y por qué (sin saber quién)', async ({ page }) => {
  await simularNube(page, { accesos: [{ sesion_id: 'bbbbbbbb-0000-4000-8000-000000000001', motivo: 'Soporte por solicitud del titular', creado_en: '2026-10-03T10:00:00Z' }] })
  await iniciarSesion(page)
  await page.getByTestId('nuevo-usuario').click() // /monitoreos exige un paciente activo
  await page.getByTestId('declara-mayor-edad').check()
  await page.getByRole('button', { name: 'Crear paciente' }).click()
  await expect(page.getByTestId('usuario-activo')).toBeVisible()
  await page.getByLabel('Principal').getByRole('link', { name: 'Monitoreos' }).click()
  await expect(page).toHaveURL(/\/monitoreos$/)
  const aviso = page.getByTestId('accesos-admin')
  await expect(aviso).toContainText('Soporte por solicitud del titular')
  await expect(aviso).not.toContainText('administrador@')
})
