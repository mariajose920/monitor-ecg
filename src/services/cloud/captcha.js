/**
 * CAPTCHA OPCIONAL para el inicio de sesión anónimo de Supabase (SUG-04, A.9.2.1 / A.9.4.2).
 *
 * Se activa SOLO si existen las variables públicas:
 *   VITE_CAPTCHA_PROVIDER = turnstile | hcaptcha
 *   VITE_CAPTCHA_SITE_KEY = clave de sitio (pública)
 * y, además, en Supabase → Authentication → Attack Protection se habilita "CAPTCHA protection" con
 * el mismo proveedor y su clave SECRETA (la secreta nunca va al frontend).
 * Sin configuración: captchaEnabled = false y getCaptchaToken() devuelve null (no rompe nada).
 *
 * CSP: al activarlo hay que ampliar vercel.json (ver README, sección CAPTCHA):
 *   Turnstile → script-src y frame-src https://challenges.cloudflare.com
 *   hCaptcha  → script-src, frame-src, connect-src y style-src https://hcaptcha.com https://*.hcaptcha.com
 */
const env = import.meta.env
const proveedor = String(env.VITE_CAPTCHA_PROVIDER || '').toLowerCase()
const siteKey = String(env.VITE_CAPTCHA_SITE_KEY || '')

export const CAPTCHA_PROVIDERS = Object.freeze({
  turnstile: {
    script: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    global: 'turnstile',
  },
  hcaptcha: {
    script: 'https://js.hcaptcha.com/1/api.js?render=explicit',
    global: 'hcaptcha',
  },
})

/** Pura (probada en tests): decide si la configuración es válida. */
export function resolveCaptchaConfig(provider, key) {
  const p = String(provider || '').toLowerCase()
  if (!Object.hasOwn(CAPTCHA_PROVIDERS, p)) return null
  if (!/^[A-Za-z0-9_-]{10,100}$/.test(String(key || ''))) return null
  return { provider: p, siteKey: String(key), ...CAPTCHA_PROVIDERS[p] }
}

const config = resolveCaptchaConfig(proveedor, siteKey)
export const captchaEnabled = config !== null
export const captchaProvider = config?.provider ?? null

let cargando = null
function cargarScript() {
  if (cargando) return cargando
  cargando = new Promise((resolve, reject) => {
    if (window[config.global]) return resolve(window[config.global])
    const s = document.createElement('script')
    s.src = config.script
    s.async = true
    s.defer = true
    s.onload = () => (window[config.global] ? resolve(window[config.global]) : reject(new Error('CAPTCHA no disponible')))
    s.onerror = () => reject(new Error('No se pudo cargar el CAPTCHA (revisa la CSP)'))
    document.head.appendChild(s)
  })
  cargando.catch(() => {
    cargando = null
  })
  return cargando
}

/**
 * Obtiene un token de un solo uso. Muestra el widget en un contenedor flotante (sin innerHTML)
 * solo mientras dura el desafío. @returns {Promise<string|null>}
 */
export async function getCaptchaToken({ timeoutMs = 120_000 } = {}) {
  if (!captchaEnabled || typeof document === 'undefined') return null
  const api = await cargarScript()
  const caja = document.createElement('div')
  caja.className = 'captcha-host'
  caja.setAttribute('role', 'dialog')
  caja.setAttribute('aria-label', 'Verificación anti-bots para sincronizar con la nube')
  document.body.appendChild(caja)
  try {
    return await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Tiempo de verificación agotado')), timeoutMs)
      const ok = (token) => {
        clearTimeout(t)
        resolve(token)
      }
      const fail = () => {
        clearTimeout(t)
        reject(new Error('Verificación anti-bots fallida'))
      }
      const id = api.render(caja, { sitekey: config.siteKey, callback: ok, 'error-callback': fail, 'expired-callback': fail,
        ...(config.provider === 'hcaptcha' ? { size: 'invisible' } : {}),
      })
      if (config.provider === 'hcaptcha') api.execute(id)
    })
  } finally {
    caja.remove()
  }
}
