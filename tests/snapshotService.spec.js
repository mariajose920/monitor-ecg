import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  generarCaptura,
  descargarBlob,
  copiarAlPortapapeles,
  calcularBpmDeMuestras,
  descargarCapturaCsv,
} from '@/services/report/snapshotService.js'
import { createRuntime, destroyRuntime } from '@/services/acquisition/channelRegistry.js'
import { generateReferenceEcg } from '@/data/referenceEcg.js'

describe('snapshotService', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('falla con mensaje claro si no hay document', async () => {
    vi.stubGlobal('document', undefined)
    await expect(generarCaptura({ canal: { id: 1 } })).rejects.toThrow('generarCaptura requiere un entorno con DOM')
  })

  it('genera una captura completa con canvas, dataUrl, filename y metadatos', async () => {
    const mockContext = {
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 50 })),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      clip: vi.fn(),
      rect: vi.fn(),
    }

    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: () => mockContext,
      toDataURL: () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      toBlob: (cb) => cb(new Blob(['fake-png'], { type: 'image/png' })),
    }

    const mockDoc = {
      createElement: vi.fn((tag) => {
        if (tag === 'canvas') return mockCanvas
        return {}
      }),
    }
    vi.stubGlobal('document', mockDoc)

    const canal = {
      id: 99,
      nombre: 'Canal Test',
      perfilId: 'esp32-ad8232',
      bpmCalculado: 72,
      bpmDispositivo: 70,
      actividad: 'reposo',
    }

    const rt = createRuntime(99, {
      source: { on: () => () => {}, profile: { fs: 250, nombre: 'ESP32 Test', yRange: [0, 4095] } },
      profile: { fs: 250, nombre: 'ESP32 Test', yRange: [0, 4095] },
    })

    rt.ring.pushBatch({
      t: [1000, 1004, 1008],
      v: [2048, 2200, 2100],
      leadsOff: [0, 0, 0],
      n: 3,
    })

    const res = await generarCaptura({
      canal,
      usuarioEtiqueta: 'Paciente Demo',
      ventanaSeg: 8,
    })

    expect(res).toBeDefined()
    expect(res.dataUrl).toContain('data:image/png;base64')
    expect(res.blob).toBeInstanceOf(Blob)
    expect(res.filename).toMatch(/^captura_Paciente_Demo_\d{4}-\d{2}-\d{2}/)
    expect(res.bpm).toBe(72)
    expect(res.usuario).toBe('Paciente Demo')
    expect(res.actividad).toBe('Reposo')
    expect(mockContext.fillRect).toHaveBeenCalled()
    expect(mockContext.stroke).toHaveBeenCalled()

    destroyRuntime(99)
  })

  it('permite recortar una captura seleccionando límites de tiempo y recalculando el tramo', async () => {
    const mockContext = {
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 50 })),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      clip: vi.fn(),
      rect: vi.fn(),
    }

    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: () => mockContext,
      toDataURL: () => 'data:image/png;base64,recorte-simulado',
      toBlob: (cb) => cb(new Blob(['fake-png-recortado'], { type: 'image/png' })),
    }

    vi.stubGlobal('document', {
      createElement: vi.fn((tag) => (tag === 'canvas' ? mockCanvas : {})),
    })

    // Creamos muestras sintéticas de 8 segundos a 250 Hz
    const muestras = []
    for (let i = 0; i < 2000; i++) {
      muestras.push({
        tRel: i / 250,
        v: 2048 + Math.sin(i / 10) * 400,
        lo: false,
      })
    }

    const canal = {
      id: 88,
      nombre: 'Canal Recorte',
      perfilId: 'esp32-ad8232',
      bpmCalculado: 80,
      actividad: 'reposo',
    }

    const res = await generarCaptura({
      canal,
      usuarioEtiqueta: 'Juan',
      ventanaSeg: 8,
      muestrasDirectas: muestras,
      recorte: {
        inicioSeg: 2.0,
        finSeg: 5.5,
        ventanaOriginalSeg: 8,
      },
    })

    expect(res.recorte).toBeDefined()
    expect(res.recorte.inicioSeg).toBe(2)
    expect(res.recorte.finSeg).toBe(5.5)
    expect(res.recorte.duracionSeg).toBe(3.5)
    expect(res.ventanaSeg).toBe(3.5)
    expect(res.filename).toContain('_recorte_2s-5.5s')
    // Las muestras resultantes deben estar dentro del tramo y remapeadas
    expect(res.samples.length).toBeGreaterThan(0)
    expect(res.samples[0].tRel).toBeGreaterThanOrEqual(0)
    expect(res.samples[res.samples.length - 1].tRel).toBeLessThanOrEqual(3.5)
    // Se conservan las originales
    expect(res.samplesOriginales.length).toBe(2000)
  })

  it('calcularBpmDeMuestras estima la frecuencia cardíaca de muestras o devuelve null si no alcanza', () => {
    // 1) Señal vacía o insuficiente
    expect(calcularBpmDeMuestras([])).toBeNull()
    expect(calcularBpmDeMuestras(null)).toBeNull()

    // 2) Señal de ECG de 5 segundos con 60 BPM (1 latido por segundo)
    const { valores, fs } = generateReferenceEcg({ durationS: 5, bpm: 60 })
    const muestras = Array.from(valores).map((v, i) => ({
      tRel: i / fs,
      v,
      lo: false,
    }))

    const bpm = calcularBpmDeMuestras(muestras, fs)
    expect(bpm).not.toBeNull()
    expect(Math.abs(bpm - 60)).toBeLessThanOrEqual(3)
  })

  it('descargarCapturaCsv genera y descarga un archivo CSV con las muestras', () => {
    const aMock = { href: '', download: '', click: vi.fn() }
    const mockDoc = {
      createElement: vi.fn().mockReturnValue(aMock),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    }
    vi.stubGlobal('document', mockDoc)
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:test-csv'),
      revokeObjectURL: vi.fn(),
    })

    const captura = {
      filename: 'captura_test.png',
      samples: [
        { tRel: 0.0, v: 2048, lo: false },
        { tRel: 0.004, v: 2100, lo: false },
      ],
    }

    descargarCapturaCsv(captura)
    expect(aMock.download).toBe('captura_test.csv')
    expect(aMock.click).toHaveBeenCalled()
  })

  it('descargarBlob crea y limpia el enlace temporal', () => {
    const aMock = { href: '', download: '', click: vi.fn() }
    const mockDoc = {
      createElement: vi.fn().mockReturnValue(aMock),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    }
    vi.stubGlobal('document', mockDoc)
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:test'),
      revokeObjectURL: vi.fn(),
    })

    const blob = new Blob(['test'])
    descargarBlob(blob, 'prueba.png')

    expect(aMock.download).toBe('prueba.png')
    expect(aMock.click).toHaveBeenCalled()
    expect(mockDoc.body.appendChild).toHaveBeenCalledWith(aMock)
    expect(mockDoc.body.removeChild).toHaveBeenCalledWith(aMock)
  })

  it('copiarAlPortapapeles valida compatibilidad de ClipboardItem', async () => {
    const mockNav = { clipboard: undefined }
    vi.stubGlobal('navigator', mockNav)
    await expect(copiarAlPortapapeles(new Blob(['test']))).rejects.toThrow('Tu navegador no permite copiar imágenes')

    const writeMock = vi.fn().mockResolvedValue(undefined)
    mockNav.clipboard = { write: writeMock }
    globalThis.ClipboardItem = class {
      constructor(data) {
        this.data = data
      }
    }

    await copiarAlPortapapeles(new Blob(['test']))
    expect(writeMock).toHaveBeenCalled()

    delete globalThis.ClipboardItem
  })
})
