import { describe, it, expect } from 'vitest'
import { numeroDeEtiqueta, normalizarEtiquetaLegada, etiquetaDe, siguienteNumero } from '@/services/users/etiquetas.js'

/** C-21 / H-23: la expresión regular sin `\d` devolvía siempre 0 y duplicaba "Paciente N". */
describe('etiquetas de paciente', () => {
  it('extrae el número final ("Paciente 7" -> 7)', () => {
    expect(numeroDeEtiqueta('Paciente 7')).toBe(7)
    expect(numeroDeEtiqueta('Paciente 120')).toBe(120)
    expect(numeroDeEtiqueta('Usuario 3')).toBe(3)
  })

  it('devuelve 0 si no hay número', () => {
    expect(numeroDeEtiqueta('Paciente')).toBe(0)
    expect(numeroDeEtiqueta('')).toBe(0)
    expect(numeroDeEtiqueta(null)).toBe(0)
    expect(numeroDeEtiqueta(undefined)).toBe(0)
  })

  it('"Usuario N" antiguo se muestra como "Paciente N"; lo demás no cambia', () => {
    expect(normalizarEtiquetaLegada({ etiqueta: 'Usuario 12', id: 'a' })).toEqual({ etiqueta: 'Paciente 12', id: 'a' })
    const igual = { etiqueta: 'Paciente 4' }
    expect(normalizarEtiquetaLegada(igual)).toBe(igual)
    expect(normalizarEtiquetaLegada({ etiqueta: 'Usuario x' }).etiqueta).toBe('Usuario x')
  })

  it('descargar de la nube "Paciente 7" y crear otro da "Paciente 8", no "Paciente 1"', () => {
    // pacientes tal como los entrega fetchPacientes(): numero derivado de la etiqueta
    const nube = [{ etiqueta: 'Paciente 7' }, { etiqueta: 'Paciente 3' }].map((f) => ({ ...f, numero: numeroDeEtiqueta(f.etiqueta) }))
    const n = siguienteNumero(0, nube) // navegador nuevo: contador local en 0
    expect(n).toBe(8)
    expect(etiquetaDe(n)).toBe('Paciente 8')
  })

  it('aunque algún registro traiga numero 0, se usa el número de la etiqueta', () => {
    expect(siguienteNumero(0, [{ etiqueta: 'Paciente 9', numero: 0 }])).toBe(10)
  })

  it('respeta el contador persistido cuando es mayor', () => {
    expect(siguienteNumero(15, [{ etiqueta: 'Paciente 2', numero: 2 }])).toBe(16)
    expect(siguienteNumero(undefined, [])).toBe(1)
  })
})
