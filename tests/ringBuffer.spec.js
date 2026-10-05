import { describe, it, expect } from 'vitest'
import { RingBuffer } from '@/utils/RingBuffer.js'

describe('RingBuffer', () => {
  it('rechaza capacidades inválidas', () => {
    expect(() => new RingBuffer(0)).toThrow()
    expect(() => new RingBuffer(2.5)).toThrow()
  })

  it('agrega y linealiza en orden antes de llenarse', () => {
    const rb = new RingBuffer(5)
    rb.push(0, 10)
    rb.push(4, 11, 1)
    const t = new Float64Array(5)
    const v = new Float32Array(5)
    const lo = new Uint8Array(5)
    expect(rb.toLinear(t, v, lo)).toBe(2)
    expect([...t.slice(0, 2)]).toEqual([0, 4])
    expect([...v.slice(0, 2)]).toEqual([10, 11])
    expect([...lo.slice(0, 2)]).toEqual([0, 1])
    expect(rb.lastTime()).toBe(4)
  })

  it('sobrescribe lo más antiguo al superar la capacidad (O(1), sin shift)', () => {
    const rb = new RingBuffer(3)
    for (let i = 0; i < 7; i++) rb.push(i, i * 10)
    expect(rb.size).toBe(3)
    const t = new Float64Array(3)
    const v = new Float32Array(3)
    rb.toLinear(t, v)
    expect([...t]).toEqual([4, 5, 6])
    expect([...v]).toEqual([40, 50, 60])
    expect(rb.get(0)).toEqual({ t: 4, v: 40, lo: 0 })
    expect(rb.get(3)).toBeNull()
    expect(rb.lastTime()).toBe(6)
  })

  it('pushBatch y clear vacían el buffer (SEC-33)', () => {
    const rb = new RingBuffer(4)
    rb.pushBatch({ t: [1, 2, 3], v: [5, 6, 7], leadsOff: [0, 0, 1], n: 3 })
    expect(rb.size).toBe(3)
    rb.clear()
    expect(rb.size).toBe(0)
    expect(rb.lastTime()).toBeNull()
    expect([...rb.v]).toEqual([0, 0, 0, 0])
  })

  it('mantiene la monotonía del tiempo tras varias vueltas', () => {
    const rb = new RingBuffer(100)
    for (let i = 0; i < 1234; i++) rb.push(i * 4, Math.sin(i))
    const t = new Float64Array(100)
    rb.toLinear(t)
    for (let i = 1; i < 100; i++) expect(t[i]).toBeGreaterThan(t[i - 1])
  })
})
