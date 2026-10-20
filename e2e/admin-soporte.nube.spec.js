import { test, expect } from '@playwright/test'

/**
 * Administrador con la copia CON nube y TODA la red simulada (nunca la base real). Cubre la TANDA 1:
 *  C-04/C-06  moderación: reportes, retiro con motivo, acceso excepcional con motivo (el contenido nunca sin motivo)
 *  C-05       el servidor deja de reconocer los privilegios (TOTP > 15 min): se pide un código nuevo y se reintenta
 *  C-08       auditoría de la nube: lectura, verificación de la cadena de hashes y filtros
 *  C-09       incidentes de otro navegador visibles para el administrador y ciclo de estados con contador
 */
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const USER = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'persona@ejemplo.cl', app_metadata: {}, user_metadata: {}, factors: [], created_at: '2026-01-01T00:00:00Z' }
const FACTOR = { id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'admin', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const USER_MFA = { ...USER, factors: [FACTOR] }
const jwt = (aal) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, aal, role: 'authenticated', exp: 4102444800, amr: [] })}.firm`
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
const SESION = 'bbbbbbbb-0000-4000-8000-000000000001'
const REPORTE = 'cccccccc-0000-4000-8000-000000000001'
const INC = 'dddddddd-0000-4000-8000-000000000001'

async function simularAdmin(page) {
  const estado = {
    reportes: [{ id: REPORTE, sesion_id: SESION, motivo: 'Contiene texto que identifica a alguien', estado: 'abierto', creado_en: '2026-10-02T10:00:00Z', es_publico: true }],
    resueltos: [], retiros: [], lecturas: [], privilegiosCaducados: 0, verificaciones: 0, auditoria: [], cadena: { ok: true, filas: 3, roto_en: null },
    incidentes: [{ id: INC, creado_en: '2026-10-01T10:00:00Z', actualizado_en: '2026-10-01T10:00:00Z', tipo: 'acceso', severidad: 'alta', descripcion: 'Acceso sospechoso reportado desde otro equipo', reportado_por: 'participant', estado: 'abierto', respuesta: null, leccion: null }],
    cambiosIncidente: [],
  }
  await page.route('**/*.supabase.co/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/rest/v1/rpc/es_admin_registrado', (route) => json(route, true))
  await page.route('**/rest/v1/rpc/es_admin', (route) => json(route, true))
  await page.route('**/auth/v1/token?grant_type=password', (route) =>
    json(route, { access_token: jwt('aal1'), token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: USER_MFA }))
  await page.route('**/auth/v1/user', (route) => json(route, USER_MFA))
  await page.route('**/auth/v1/factors', (route) => json(route, { ...USER_MFA, factors: [FACTOR], totp: [FACTOR], all: [FACTOR] }))
  await page.route('**/auth/v1/factors/f1/challenge', (route) => json(route, { id: 'c1', type: 'totp', expires_at: 4102444800 }))
  await page.route('**/auth/v1/factors/f1/verify', (route) => {
    estado.verificaciones++
    estado.privilegiosCaducados = 0 // un código nuevo renueva los privilegios en el servidor
    return json(route, { access_token: jwt('aal2'), token_type: 'bearer', expires_in: 3600, refresh_token: 'r2', user: USER_MFA })
  })
  const caducado = (route) => json(route, { code: '42501', message: 'Privilegios insuficientes', details: null, hint: null }, 403)
  await page.route('**/rest/v1/rpc/admin_listar_reportes', (route) => (estado.privilegiosCaducados > 0 ? caducado(route) : json(route, estado.reportes)))
  await page.route('**/rest/v1/rpc/admin_resolver_reporte', (route) => {
    const c = route.request().postDataJSON()
    estado.resueltos.push(c)
    estado.reportes = estado.reportes.filter((r) => r.id !== c.p_id)
    return json(route, true)
  })
  await page.route('**/rest/v1/rpc/admin_retirar_publicacion', (route) => {
    const c = route.request().postDataJSON()
    estado.retiros.push(c)
    estado.reportes = []
    return json(route, true)
  })
  await page.route('**/rest/v1/rpc/admin_leer_sesion', (route) => {
    const c = route.request().postDataJSON()
    estado.lecturas.push(c)
    return json(route, [{ id: c.p_id, estado: 'finalizada', visibilidad: 'privado', inicio: '2026-10-01T10:00:00Z', fin: '2026-10-01T10:10:00Z', datos: { nombre: 'Prueba de soporte', actividadPrincipal: 'reposo' } }])
  })
  await page.route('**/rest/v1/rpc/admin_leer_auditoria', (route) => json(route, estado.auditoria))
  await page.route('**/rest/v1/rpc/verificar_cadena_auditoria', (route) => json(route, [estado.cadena]))
  await page.route('**/rest/v1/rpc/admin_listar_administradores', (route) => json(route, [{ user_id: USER.id, email: 'persona@ejemplo.cl', creado_en: '2026-01-01T10:00:00Z' }]))
  await page.route('**/rest/v1/incidentes**', (route) => {
    if (route.request().method() === 'GET') return json(route, estado.incidentes)
    return route.fulfill({ status: 201, contentType: 'application/json', body: '' })
  })
  await page.route('**/rest/v1/rpc/admin_actualizar_incidente', (route) => {
    const c = route.request().postDataJSON()
    estado.cambiosIncidente.push(c)
    const inc = estado.incidentes.find((i) => i.id === c.p_id)
    Object.assign(inc, { estado: c.p_estado, respuesta: c.p_respuesta ?? inc.respuesta, leccion: c.p_leccion ?? inc.leccion, actualizado_en: '2026-10-03T10:00:00Z' })
    return json(route, [{ id: inc.id, estado: inc.estado, respuesta: inc.respuesta, leccion: inc.leccion, actualizado_en: inc.actualizado_en }])
  })
  return estado
}

async function entrarComoAdmin(page) {
  await page.goto('/acceso')
  await page.getByLabel('Correo').fill('persona@ejemplo.cl')
  await page.getByLabel('Contraseña').fill('claveSegura2026')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/pacientes/)
  await page.getByTestId('enlace-admin').click()
  await expect(page).toHaveURL(/\/admin\/mfa/)
  await page.getByLabel('Código de 6 dígitos').fill('123456')
  await page.getByRole('button', { name: 'Verificar' }).click()
  await expect(page).toHaveURL(/\/admin$/)
}

test('moderación: lista de reportes, descartar y retirar publicación con motivo escrito', async ({ page }) => {
  const estado = await simularAdmin(page)
  await entrarComoAdmin(page)
  await page.getByRole('tab', { name: 'Soporte y moderación' }).click()
  const rep = page.getByTestId('reporte')
  await expect(rep).toContainText('Contiene texto que identifica a alguien')
  await expect(rep).toContainText(SESION)

  // retirar exige un motivo de 10 a 300 caracteres: uno corto no llega al servidor
  await rep.getByRole('button', { name: /Retirar publicación/ }).click()
  await rep.getByLabel(/Motivo del retiro/).fill('corto')
  await rep.getByRole('button', { name: 'Confirmar retiro' }).click()
  await expect(page.getByText(/al menos 10 caracteres/)).toBeVisible()
  expect(estado.retiros).toHaveLength(0)

  await rep.getByLabel(/Motivo del retiro/).fill('Revisado: identifica a una persona')
  await rep.getByRole('button', { name: 'Confirmar retiro' }).click()
  await expect(page.getByText('Publicación retirada')).toBeVisible()
  expect(estado.retiros).toEqual([{ p_id: SESION, p_motivo: 'Revisado: identifica a una persona' }])
  await expect(page.getByTestId('sin-reportes')).toBeVisible()
})

test('acceso excepcional: sin motivo no se llama al servidor; con motivo se registra y se muestran solo los datos', async ({ page }) => {
  const estado = await simularAdmin(page)
  await entrarComoAdmin(page)
  await page.getByRole('tab', { name: 'Soporte y moderación' }).click()

  await page.getByLabel('Identificador de la sesión').fill('no-es-un-uuid')
  await page.getByLabel(/Motivo escrito/).fill('Soporte por solicitud del titular')
  await page.getByRole('button', { name: 'Registrar el motivo y leer' }).click()
  await expect(page.getByText('Escribe un identificador de sesión válido.')).toBeVisible()

  await page.getByLabel('Identificador de la sesión').fill(SESION)
  await page.getByLabel(/Motivo escrito/).fill('corto')
  await page.getByRole('button', { name: 'Registrar el motivo y leer' }).click()
  await expect(page.getByText(/al menos 10 caracteres/)).toBeVisible()
  expect(estado.lecturas).toHaveLength(0)

  await page.getByLabel(/Motivo escrito/).fill('Soporte por solicitud del titular')
  await page.getByRole('button', { name: 'Registrar el motivo y leer' }).click()
  await expect(page.getByTestId('resultado-acceso')).toContainText('Prueba de soporte')
  expect(estado.lecturas).toEqual([{ p_id: SESION, p_motivo: 'Soporte por solicitud del titular' }])
})

test('caducidad real del TOTP: el servidor rechaza, se pide un código nuevo y la operación se reintenta', async ({ page }) => {
  const estado = await simularAdmin(page)
  await entrarComoAdmin(page)
  const verificacionesAntes = estado.verificaciones
  estado.privilegiosCaducados = 1 // pasaron 15 min: es_admin() ya no reconoce el TOTP
  await page.getByRole('tab', { name: 'Soporte y moderación' }).click()

  const dlg = page.getByRole('dialog', { name: 'Renueva tu segundo factor' })
  await expect(dlg).toBeVisible()
  await dlg.getByLabel('Código de 6 dígitos').fill('12')
  await dlg.getByRole('button', { name: 'Verificar y continuar' }).click()
  await expect(dlg.getByRole('alert')).toContainText('6 dígitos')
  await dlg.getByLabel('Código de 6 dígitos').fill('654321')
  await dlg.getByRole('button', { name: 'Verificar y continuar' }).click()
  await expect(dlg).toBeHidden()
  await expect(page.getByTestId('reporte')).toBeVisible() // la lista se cargó en el reintento
  expect(estado.verificaciones).toBe(verificacionesAntes + 1)
})

test('cancelar la renovación del TOTP deja la operación sin hacer, con un mensaje claro', async ({ page }) => {
  const estado = await simularAdmin(page)
  await entrarComoAdmin(page)
  estado.privilegiosCaducados = 1
  await page.getByRole('tab', { name: 'Soporte y moderación' }).click()
  const dlg = page.getByRole('dialog', { name: 'Renueva tu segundo factor' })
  await dlg.getByRole('button', { name: 'Cancelar' }).click()
  await expect(dlg).toBeHidden()
  await expect(page.getByText('Verificación cancelada.')).toBeVisible()
})

test('auditoría de la nube: pestaña Nube con eventos de otras cuentas y verificación de la cadena', async ({ page }) => {
  const estado = await simularAdmin(page)
  estado.auditoria = [
    { id: 12, n: 12, ts: '2026-10-03T10:00:00Z', usuario: '22222222-2222-4222-8222-222222222222', tipo: 'SESSION_SAVED', actor: 'participant', detalle: { id: 'x' }, hash: 'a'.repeat(64) },
    { id: 11, n: 11, ts: '2026-10-03T09:00:00Z', usuario: USER.id, tipo: 'ADMIN_DATA_ACCESS', actor: 'admin', detalle: { sesion: SESION, motivo: 'Soporte por solicitud del titular' }, hash: 'b'.repeat(64) },
  ]
  await entrarComoAdmin(page)
  await page.goto('/admin/auditoria')
  await page.getByRole('tab', { name: 'Nube' }).click()
  const tabla = page.getByTestId('tabla-auditoria-nube')
  await expect(tabla.getByRole('row')).toHaveCount(3)
  await expect(tabla).toContainText('ADMIN_DATA_ACCESS')
  await expect(tabla).toContainText('participant')

  await page.getByRole('button', { name: 'Verificar cadena' }).click()
  await expect(page.getByTestId('cadena-nube')).toContainText('OK')

  estado.cadena = { ok: false, filas: 7, roto_en: 5 }
  await page.getByRole('button', { name: 'Verificar cadena' }).click()
  await expect(page.getByTestId('cadena-nube')).toContainText('ROTA en #5')

  // filtro por evento
  await page.getByLabel('Evento').selectOption('SESSION_SAVED')
  await expect(tabla.getByRole('row')).toHaveCount(2)
})

test('incidentes de otro navegador: el administrador los ve, aparece el contador y el ciclo llega al servidor', async ({ page }) => {
  const estado = await simularAdmin(page)
  await entrarComoAdmin(page)
  await expect(page.getByTestId('incidentes-abiertos')).toHaveText('1')
  await page.getByRole('tab', { name: /SGSI/ }).click()
  const art = page.locator('article.incidente', { hasText: 'Acceso sospechoso reportado desde otro equipo' })
  await expect(art).toBeVisible()

  await art.getByRole('button', { name: 'Pasar a en analisis' }).click()
  await expect.poll(() => estado.cambiosIncidente.length).toBe(1)
  expect(estado.cambiosIncidente[0]).toMatchObject({ p_id: INC, p_estado: 'en_analisis' })

  await art.getByLabel(/Respuesta aplicada/).fill('Se cambió la clave y se revisó el acceso')
  await art.getByLabel(/Lección aprendida/).fill('Rotar claves cada trimestre')
  await art.getByRole('button', { name: 'Pasar a cerrado' }).click()
  await expect.poll(() => estado.cambiosIncidente.length).toBe(2)
  expect(estado.cambiosIncidente[1]).toMatchObject({ p_estado: 'cerrado', p_respuesta: 'Se cambió la clave y se revisó el acceso', p_leccion: 'Rotar claves cada trimestre' })
  await expect(page.getByTestId('incidentes-abiertos')).toHaveCount(0)
})
