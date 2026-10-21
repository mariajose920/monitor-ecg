import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generarCaptura, descargarBlob, copiarAlPortapapeles } from '@/services/report/snapshotService.js'
import { createRuntime, destroyRuntime } from '@/services/acquisition/channelRegistry.js'

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
