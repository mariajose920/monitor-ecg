import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PATOLOGIAS_PHYSIONET } from '../src/data/physionetDatabases.js'
import { generarSenalPatologia } from '../src/data/physionetSignals.js'
import { mvToAdc } from '../src/data/referenceEcg.js'

const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
const dir = join(raiz, 'public', 'referencias')
mkdirSync(dir, { recursive: true })

const FS = 250
const DUR_S = 15

for (const p of PATOLOGIAS_PHYSIONET) {
  const senal = generarSenalPatologia(p.id, DUR_S, FS)
  const lineas = [
    `# origen: PhysioNet - ${p.baseDatos}`,
    `# patologia: ${p.nombre} (${p.sigla}) - Categoria: ${p.categoria}`,
    `# bpm_nominal: ${p.bpmNominal}; fs: ${FS} Hz`,
    `# registro_referencia: ${p.registroEjemplo}`,
    `# cita_doi: ${p.enlacePhysioNet}`,
    't_ms,ecg_raw,leads_off,bpm',
  ]

  for (let i = 0; i < senal.values.length; i++) {
    const tMs = Math.round((i / FS) * 1000)
    const adc = mvToAdc(senal.values[i])
    lineas.push(`${tMs},${adc},0,${p.bpmNominal.toFixed(1)}`)
  }

  const filename = `physionet_${p.id}.csv`
  writeFileSync(join(dir, filename), lineas.join('\n') + '\n', 'utf8')
  console.log(`Generado ${filename} con ${senal.values.length} muestras.`)
}
