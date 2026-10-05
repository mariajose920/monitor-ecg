/**
 * Buffer circular tipado de capacidad fija (corrige el bug 1 del diagnóstico:
 * push()+shift() O(n) por muestra). Escribir es O(1) y nunca se reasigna memoria.
 *
 * Guarda tiempo (Float64Array, ms), valor (Float32Array) y marca leads-off (Uint8Array).
 */
export class RingBuffer {
  /** @param {number} capacity número máximo de muestras */
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError('La capacidad del RingBuffer debe ser un entero positivo')
    }
    this.capacity = capacity
    this.t = new Float64Array(capacity)
    this.v = new Float32Array(capacity)
    this.lo = new Uint8Array(capacity)
    this.head = 0 // índice de la próxima escritura
    this.size = 0
  }

  /** Agrega una muestra. */
  push(t, v, lo = 0) {
    const i = this.head
    this.t[i] = t
    this.v[i] = v
    this.lo[i] = lo ? 1 : 0
    this.head = i + 1 === this.capacity ? 0 : i + 1
    if (this.size < this.capacity) this.size++
  }

  /** Agrega un lote { t, v, leadsOff, n }. */
  pushBatch(batch) {
    const n = batch.n ?? batch.v.length
    const lo = batch.leadsOff
    for (let k = 0; k < n; k++) this.push(batch.t[k], batch.v[k], lo ? lo[k] : 0)
  }

  /** Índice físico de la muestra lógica i (0 = la más antigua). */
  _index(i) {
    const start = this.size < this.capacity ? 0 : this.head
    const j = start + i
    return j >= this.capacity ? j - this.capacity : j
  }

  /** Devuelve la muestra lógica i (0 = la más antigua) o null si no existe. */
  get(i) {
    if (i < 0 || i >= this.size) return null
    const j = this._index(i)
    return { t: this.t[j], v: this.v[j], lo: this.lo[j] }
  }

  /** Tiempo de la última muestra escrita, o null si está vacío. */
  lastTime() {
    if (this.size === 0) return null
    const j = this.head === 0 ? this.capacity - 1 : this.head - 1
    return this.t[j]
  }

  /**
   * Copia el contenido en orden cronológico a arrays de salida preasignados
   * (sin asignaciones). Devuelve la cantidad de muestras copiadas.
   */
  toLinear(outT, outV, outLo) {
    const n = this.size
    const start = this.size < this.capacity ? 0 : this.head
    const first = Math.min(n, this.capacity - start)
    for (let k = 0; k < first; k++) {
      const j = start + k
      if (outT) outT[k] = this.t[j]
      if (outV) outV[k] = this.v[j]
      if (outLo) outLo[k] = this.lo[j]
    }
    for (let k = first; k < n; k++) {
      const j = k - first
      if (outT) outT[k] = this.t[j]
      if (outV) outV[k] = this.v[j]
      if (outLo) outLo[k] = this.lo[j]
    }
    return n
  }

  /** Vacía el buffer y sobrescribe los datos (SEC-33). */
  clear() {
    this.t.fill(0)
    this.v.fill(0)
    this.lo.fill(0)
    this.head = 0
    this.size = 0
  }
}
