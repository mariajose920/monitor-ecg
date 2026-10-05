// Genera public/referencias/ejemplo_referencia.csv con el modelo PQRST sintético (SEC-56: sin datos reales).
// Uso: npm run gen:referencia
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PqrstGenerator, mvToAdc } from '../src/data/referenceEcg.js'

const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
const FS = 250
const DUR_S = 12
const BPM = 72
const gen = new PqrstGenerator({ fs: FS, bpm: BPM, variabilidad: 0.02, ruido: 0.01, deriva: 0.03, seed: 2026 })
const lineas = [
  '# origen: senal sintetica PQRST generada por scripts/generarReferencia.mjs (modelo de suma de gaussianas)',
  '# uso: ejemplo didactico de formato de referencia; NO es un registro clinico validado',
  `# fs: ${FS} Hz; bpm nominal: ${BPM}; perfil: arduino-uno-ad8232 (10 bits, AREF 5 V)`,
  't_ms,ecg_raw,leads_off,bpm',
]
for (let i = 0; i < DUR_S * FS; i++) {
  const v = mvToAdc(gen.next())
  lineas.push(`${i * 4},${v},0,${BPM.toFixed(1)}`)
}
const dir = join(raiz, 'public', 'referencias')
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'ejemplo_referencia.csv'), lineas.join('\n') + '\n', 'utf8')
console.log(`Generadas ${DUR_S * FS} muestras en public/referencias/ejemplo_referencia.csv`)
