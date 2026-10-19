// Genera los iconos PWA (192, 512 y maskable) a partir de public/icon.svg usando Chromium de Playwright.
// Uso: npm run gen:iconos   (requiere `npm run test:e2e:install` una vez)
import { chromium } from '@playwright/test'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const raiz = new URL('../public/', import.meta.url)
const svg = readFileSync(new URL('icon.svg', raiz), 'utf8')
mkdirSync(fileURLToPath(new URL('icons/', raiz)), { recursive: true })

const navegador = await chromium.launch()
async function render(size, nombre, escala = 1) {
  const page = await navegador.newPage({ viewport: { width: size, height: size } })
  const lado = Math.round(size * escala)
  const pad = Math.round((size - lado) / 2)
  const url = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  await page.setContent(`<body style="margin:0;background:#0b1220"><img src="${url}" width="${lado}" height="${lado}" style="position:absolute;left:${pad}px;top:${pad}px"></body>`)
  await page.screenshot({ path: fileURLToPath(new URL(`icons/${nombre}`, raiz)), omitBackground: false })
  await page.close()
}
await render(192, 'icon-192.png')
await render(512, 'icon-512.png')
await render(512, 'icon-maskable-512.png', 0.8) // zona segura del 80 % para iconos maskable
await render(180, 'apple-touch-icon.png')
await navegador.close()
console.log('Iconos generados en public/icons/')
