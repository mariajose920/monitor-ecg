import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SE_ENVIA_A_LA_NUBE, NUNCA_SALE_DEL_DISPOSITIVO, NUBE_REGION } from '@/data/privacidad.js'

/** C-02: el texto legal no puede contradecir el comportamiento. Frases vigiladas en los textos que ve la persona. */
const leer = (ruta) => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8')
const textos = {
  ConsentDialog: leer('src/components/users/ConsentDialog.vue'),
  PrivacyView: leer('src/views/PrivacyView.vue'),
  datos: leer('src/data/privacidad.js'),
}

describe('textos de privacidad veraces', () => {
  it('no afirman que nada se envía a ningún servidor sin condicionarlo a la cuenta y al interruptor', () => {
    for (const [nombre, t] of Object.entries(textos)) {
      expect(t, nombre).not.toMatch(/No se env[ií]an a ning[uú]n servidor\./i)
      expect(t, nombre).not.toMatch(/solo en este equipo y navegador, cifrados \(AES-GCM\)\. No se env/i)
    }
    expect(textos.ConsentDialog).toMatch(/sin cuenta/i)
    expect(textos.ConsentDialog).toMatch(/Guardar mis datos en la nube/)
  })
  it('informan la transferencia internacional, la región, los plazos, los derechos, el responsable y la mayoría de edad', () => {
    expect(NUBE_REGION).toMatch(/us-east-1/)
    expect(textos.ConsentDialog).toMatch(/Transferencia internacional/)
    expect(textos.PrivacyView).toMatch(/Transferencia internacional/)
    expect(textos.PrivacyView).toMatch(/Responsable del tratamiento/)
    expect(textos.PrivacyView).toMatch(/Menores de edad/)
    expect(textos.PrivacyView).toMatch(/365|RETENCION_NUBE_DIAS/)
    expect(textos.ConsentDialog).toMatch(/mayor de 18/)
  })
  it('lo que nunca sale del dispositivo incluye borradores, alias, notas y nombre', () => {
    const t = NUNCA_SALE_DEL_DISPOSITIVO.join(' ')
    for (const k of [/borradores/i, /alias/i, /notas/i, /nombre/i]) expect(t).toMatch(k)
    expect(SE_ENVIA_A_LA_NUBE.join(' ')).toMatch(/al pulsar "Guardar monitoreo"/)
  })
  it('el cifrado local se describe sin exagerar', () => {
    expect(textos.PrivacyView).toMatch(/CIFRADO_LOCAL_ALCANCE/)
    expect(textos.datos).toMatch(/No protege frente a quien controle este equipo/)
  })
})
