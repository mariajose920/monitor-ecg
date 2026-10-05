import { markRaw } from 'vue'
import { RingBuffer } from '@/utils/RingBuffer.js'
import { RPeakDetector } from '@/utils/dsp/rPeakDetector.js'
import { createRangeEvaluator } from '@/utils/rangeEvaluator.js'
import { markDirty } from './renderScheduler.js'

/**
 * Registro NO reactivo: canalId → runtime { source, ring, detector, evaluator, recorder, ... }.
 * Nada de esto entra en Pinia (sección 6.2-4): el store solo guarda escalares a ~4 Hz.
 */
const runtimes = new Map()

export function createRuntime(channelId, { source, profile, windowSec = 8, alertas }) {
  destroyRuntime(channelId)
  const fs = profile.fs
  const rt = markRaw({
    channelId,
    source,
    profile,
    windowSec,
    ring: new RingBuffer(Math.ceil(fs * 10) + fs), // 10 s + margen (SEC-60)
    detector: new RPeakDetector({ fs }),
    evaluator: createRangeEvaluator(alertas),
    recorder: null,
    lastSampleAt: 0, // performance.now() de la última muestra recibida
    lastT: 0,
    lastLeadsOff: false,
    lastBpmDevice: 0,
    sampleCount: 0,
    unsubs: [],
  })
  rt.unsubs.push(
    source.on('samples', (batch) => onSamples(rt, batch)),
  )
  runtimes.set(channelId, rt)
  return rt
}

function onSamples(rt, batch) {
  const n = batch.n
  rt.ring.pushBatch(batch)
  for (let k = 0; k < n; k++) {
    const lo = batch.leadsOff[k]
    if (lo) {
      // Muestra inválida para el cálculo (SEC-34): se reinicia el detector
      if (!rt.lastLeadsOff) rt.detector.reset()
    } else {
      rt.detector.push(batch.t[k], batch.v[k])
    }
    rt.lastLeadsOff = !!lo
  }
  rt.lastT = batch.t[n - 1]
  rt.lastBpmDevice = batch.bpmDevice ? batch.bpmDevice[n - 1] : 0
  rt.sampleCount += n
  rt.lastSampleAt = performance.now()
  if (rt.recorder) rt.recorder.append(batch)
  markDirty(rt.channelId)
}

export function getRuntime(channelId) {
  return runtimes.get(channelId) || null
}

export function allRuntimes() {
  return [...runtimes.values()]
}

/** Destruye el runtime y vacía los buffers en memoria (SEC-33). */
export function destroyRuntime(channelId) {
  const rt = runtimes.get(channelId)
  if (!rt) return
  rt.unsubs.forEach((u) => u())
  rt.ring.clear()
  rt.detector.reset()
  rt.recorder = null
  runtimes.delete(channelId)
}
