import { test, expect } from '@playwright/test'

/**
 * Comunidad (monitoreos públicos) con la copia construida CON nube y TODA la red a Supabase simulada con page.route
 * (nunca se contacta la base real). Verifica C-04:
 *  - la señal pública se lee SOLO por la RPC senal_publica; jamás hay una petición a /rest/v1/bloques_muestras;
 *  - el detalle público ofrece "Reportar este monitoreo" y el reporte llega a la RPC reportar_monitoreo;
 *  - la fecha pública es solo el día.
 */
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const USER = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'persona@ejemplo.cl', app_metadata: {}, user_metadata: {}, factors: [], created_at: '2026-01-01T00:00:00Z' }
const jwt = (aal) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, aal, role: 'authenticated', exp: 4102444800, amr: [] })}.firm`
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

const SESION = 'bbbbbbbb-0000-4000-8000-000000000001'
const FILA = {
  id: SESION,
  inicio: '2026-10-01T00:00:00+00:00', // truncado al día
  duracion_s: 40,
  actividad: 'reposo',
  paciente: 'Paciente anónimo',
  participantes: [{ canalIndex: 0, fs: 250, actividad: [], resumen: { bpmMedio: 72, duracionMs: 40000 } }],
  perfil: null,
}
const bloque = (seq) => ({
  seq,
  t: Array.from({ length: 500 }, (_, i) => (seq * 500 + i) * 4),
  ecg_raw: Array.from({ length: 500 }, (_, i) => 512 + Math.round(200 * Math.sin(((seq * 500 + i) / 250) * 2 * Math.PI * 1.2))),
  leads_off: Array.from({ length: 500 }, () => 0),
  bpm: Array.from({ length: 500 }, () => 72),
})

async function simularNube(page) {
  const estado = { bloquesDirectos: [], senal: [], reportes: [], listados: 0 }
  await page.route('**/*.supabase.co/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/rest/v1/rpc/es_admin_registrado', (route) => json(route, false))
  await page.route('**/rest/v1/rpc/es_admin', (route) => json(route, false))
  await page.route('**/auth/v1/token?grant_type=password', (route) =>
    json(route, { access_token: jwt('aal1'), token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: USER }))
  await page.route('**/auth/v1/user', (route) => json(route, USER))
  // Cualquier lectura directa de bloques es un fallo del diseño (C-04): se registra y se rechaza como haría el servidor.
  await page.route('**/rest/v1/bloques_muestras**', (route) => {
    estado.bloquesDirectos.push(route.request().url())
    return json(route, [])
  })
  await page.route('**/rest/v1/rpc/listar_monitoreos_publicos', (route) => {
    estado.listados++
    return json(route, [FILA])
  })
  await page.route('**/rest/v1/rpc/senal_publica', (route) => {
    const cuerpo = route.request().postDataJSON()
    estado.senal.push(cuerpo)
    const desde = cuerpo.p_desde ?? 0
    const total = 14
    const filas = Array.from({ length: Math.max(0, Math.min(cuerpo.p_limite, total - desde)) }, (_, i) => bloque(desde + i))
    return json(route, filas)
  })
  await page.route('**/rest/v1/rpc/reportar_monitoreo', (route) => {
    estado.reportes.push(route.request().postDataJSON())
    return route.fulfill({ status: 204, body: '' })
  })
  return estado
}

async function iniciarSesion(page) {
  await page.goto('/acceso')
  await page.getByLabel('Correo').fill('persona@ejemplo.cl')
  await page.getByLabel('Contraseña').fill('claveSegura2026')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/pacientes/)
}

async function abrirComunidad(page) {
  await page.goto('/comparar')
  await page.getByRole('radio', { name: /Comunidad \(públicos\)/ }).first().check()
  await expect(page.getByTestId('selector-comunidad')).toBeVisible()
  await expect(page.getByTestId(`medicion-${SESION}`)).toBeVisible()
}

test('lo público se lee solo por la RPC senal_publica (nunca la tabla de bloques) y la fecha es solo el día', async ({ page }) => {
  const estado = await simularNube(page)
  await iniciarSesion(page)
  await abrirComunidad(page)
  const item = page.getByTestId(`medicion-${SESION}`)
  await expect(item).toContainText('Monitoreo público 2026-10-01 UTC')
  await item.click()

  await page.getByRole('button', { name: 'Comparar' }).click()
  await expect.poll(() => estado.senal.length).toBeGreaterThan(0)
  // El resultado de la comparación puede tardar o fallar por la señal sintética; lo que se verifica es el canal de acceso.
  expect(estado.senal[0]).toMatchObject({ p_sesion: SESION, p_canal: 0, p_desde: 0, p_limite: 60 })
  expect(estado.bloquesDirectos).toEqual([])
})

test('el detalle público ofrece "Reportar este monitoreo" y el reporte llega a la RPC con el motivo', async ({ page }) => {
  const estado = await simularNube(page)
  await iniciarSesion(page)
  await abrirComunidad(page)
  await expect(page.getByTestId('reportar-monitoreo')).toHaveCount(0) // sin monitoreo elegido no hay nada que reportar
  await page.getByTestId(`medicion-${SESION}`).click()

  await page.getByTestId('reportar-monitoreo').click()
  const dlg = page.getByRole('dialog', { name: 'Reportar este monitoreo público' })
  await expect(dlg).toBeVisible()
  await dlg.getByLabel('Motivo').fill('ab') // demasiado corto: no llega al servidor
  await dlg.getByRole('button', { name: 'Enviar reporte' }).click()
  await expect(dlg.getByRole('alert')).toContainText('mínimo 3')
  expect(estado.reportes).toHaveLength(0)

  await dlg.getByLabel('Motivo').fill('  Contiene texto que identifica a alguien  ')
  await dlg.getByRole('button', { name: 'Enviar reporte' }).click()
  await expect(page.getByText('el reporte llegó al administrador')).toBeVisible()
  expect(estado.reportes).toEqual([{ p_id: SESION, p_motivo: 'Contiene texto que identifica a alguien' }])
  expect(estado.bloquesDirectos).toEqual([])
})

test('si el servidor rechaza el reporte (cuota) se muestra un mensaje claro y genérico', async ({ page }) => {
  const estado = await simularNube(page)
  await page.route('**/rest/v1/rpc/reportar_monitoreo', (route) => {
    estado.reportes.push(route.request().postDataJSON())
    return json(route, { code: 'P0001', message: 'Cuota de reportes superada', details: null, hint: null }, 400)
  })
  await iniciarSesion(page)
  await abrirComunidad(page)
  await page.getByTestId(`medicion-${SESION}`).click()
  await page.getByTestId('reportar-monitoreo').click()
  const dlg = page.getByRole('dialog', { name: 'Reportar este monitoreo público' })
  await dlg.getByLabel('Motivo').fill('Contenido inapropiado')
  await dlg.getByRole('button', { name: 'Enviar reporte' }).click()
  await expect(dlg.getByRole('alert')).toContainText('Demasiadas solicitudes')
  await expect(dlg.getByRole('alert')).not.toContainText('Cuota de reportes superada')
})
