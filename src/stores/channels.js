import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { createSource } from '@/services/sources/sourceFactory.js'
import { createRuntime, getRuntime, destroyRuntime, allRuntimes } from '@/services/acquisition/channelRegistry.js'
import { bpmMostrable } from '@/services/parsing/ecgCsvParser.js'
import { prefiereCamara } from '@/data/dispositivo.js'
import { SOURCE_KINDS } from '@/services/sources/sourceFactory.js'
import { MAX_CHANNELS } from '@/data/defaultSettings.js'
import { ACTIVIDAD_IDS } from '@/data/activities.js'
import { audit } from '@/services/audit/auditService.js'
import { notify } from '@/services/notifications/notifier.js'
import { useSettingsStore } from './settings.js'
import { useSessionStore } from './session.js'
import { useAlertsStore } from './alerts.js'
import { useUsersStore } from './users.js'

/** Datos de reproducción por canal (no reactivos: arrays grandes). */
const replayData = new Map()

export const ESTADOS_CANAL = Object.freeze({
  idle: { texto: 'Sin conectar', icono: '○', clase: 'neutral' },
  connecting: { texto: 'Conectando…', icono: '◌', clase: 'info' },
  streaming: { texto: 'Recibiendo señal', icono: '●', clase: 'ok' },
  'leads-off': { texto: 'Electrodos desconectados', icono: '⚠', clase: 'warn' },
  'signal-lost': { texto: 'Señal perdida', icono: '⚠', clase: 'warn' },
  finished: { texto: 'Finalizada', icono: '■', clase: 'muted' },
  error: { texto: 'Error', icono: '✕', clase: 'danger' },
})

/** Diagnóstico cuando el ADC del dispositivo supera el rango del perfil elegido (p. ej. ESP32 de 12 bits con perfil de 10 bits). */
export const MENSAJE_PERFIL = 'El perfil del dispositivo no coincide: elige ESP32'

const MOTIVOS = {
  usuario: 'detenida por el usuario',
  desconexion: 'sensor desconectado',
  'senal-perdida': 'pérdida de comunicación',
  'fin-datos': 'fin de los datos',
  'segundo-plano': 'la app pasó a segundo plano (cámara y flash apagados)',
}

/**
 * Canales de adquisición (RF07, RF10). Solo escalares reactivos actualizados a ~4 Hz;
 * buffers, fuentes y gráficos viven en channelRegistry (no reactivo).
 */
export const useChannelsStore = defineStore('channels', () => {
  const channels = ref([])
  let seq = 0
  let tickTimer = null

  const puedeAgregar = computed(() => channels.value.length < MAX_CHANNELS)
  const conectados = computed(() => channels.value.filter((c) => ['connecting', 'streaming', 'leads-off', 'signal-lost'].includes(c.estado)).length)

  function byId(id) {
    return channels.value.find((c) => c.id === id) || null
  }

  function addChannel() {
    // SEC-60: máximo forzado en el store
    if (channels.value.length >= MAX_CHANNELS) throw new Error(`Máximo ${MAX_CHANNELS} canales`)
    seq++
    // En el celular (o sin Web Serial) la fuente por defecto es la cámara del teléfono.
    const camara = prefiereCamara() && SOURCE_KINDS.find((k) => k.id === 'camera')?.soportado()
    channels.value.push({
      id: seq,
      nombre: `Canal ${seq}`,
      fuente: camara ? 'camera' : 'simulator',
      perfilId: camara ? 'camara-movil' : 'arduino-uno-ad8232',
      usuarioId: null,
      actividad: 'reposo',
      estado: 'idle',
      bpmDispositivo: null,
      bpmCalculado: null,
      leadsOff: false,
      rango: 'sin-dato',
      enAlerta: false,
      muestrasSeg: 0,
      descartadas: 0,
      avisoDatos: false,
      avisoPerfil: false,
      motivoFin: null,
      error: null,
      sim: { bpm: 72, ruido: 0.02, leadsOff: false, pausado: false },
      replayNombre: null,
    })
    return seq
  }

  async function removeChannel(id) {
    if (getRuntime(id)) await disconnect(id)
    replayData.delete(id)
    channels.value = channels.value.filter((c) => c.id !== id)
  }

  /** Un usuario no puede estar en dos canales a la vez (RF07). */
  function setUsuario(id, usuarioId) {
    const ch = byId(id)
    if (!ch) return
    if (usuarioId && channels.value.some((c) => c.id !== id && c.usuarioId === usuarioId)) {
      throw new Error('Ese usuario ya está asignado a otro canal')
    }
    if (useSessionStore().participa(id)) throw new Error('No se puede cambiar el usuario durante la sesión')
    if (ch.usuarioId !== usuarioId) {
      // SEC-33: al cambiar de usuario se vacían los buffers en memoria
      const rt = getRuntime(id)
      if (rt) {
        rt.ring.clear()
        rt.detector.reset()
        rt.evaluator.reset()
      }
    }
    ch.usuarioId = usuarioId || null
  }

  function setActividad(id, valor) {
    if (!ACTIVIDAD_IDS.includes(valor)) return
    const ch = byId(id)
    if (!ch) return
    ch.actividad = valor
    useSessionStore().registrarActividad(id, valor)
  }

  /** Configura fuente o perfil de un canal desconectado (valores validados contra listas cerradas). */
  function configurar(id, campo, valor) {
    const ch = byId(id)
    if (!ch || getRuntime(id)) return
    if (campo === 'fuente' && ['simulator', 'serial', 'replay', 'camera'].includes(valor)) {
      ch.fuente = valor
      if (valor === 'camera') ch.perfilId = 'camara-movil'
      else if (ch.perfilId === 'camara-movil') ch.perfilId = 'arduino-uno-ad8232'
    }
    if (campo === 'perfilId' && ['arduino-uno-ad8232', 'esp32-ad8232'].includes(valor) && ch.fuente !== 'camera') ch.perfilId = valor
    ch.error = null
  }

  function setReplayData(id, data, nombre) {
    replayData.set(id, data)
    const ch = byId(id)
    if (ch) ch.replayNombre = nombre
  }

  async function connect(id) {
    const ch = byId(id)
    if (!ch || getRuntime(id)) return
    const settings = useSettingsStore()
    ch.error = null
    ch.motivoFin = null
    ch.avisoDatos = false
    ch.avisoPerfil = false
    let source
    try {
      if (ch.fuente === 'replay' && !replayData.get(id)) throw new Error('Carga primero un CSV para reproducir.')
      source = createSource(ch.fuente, { id, perfilId: ch.perfilId, sim: ch.sim, replayData: replayData.get(id) })
    } catch (e) {
      ch.error = e.message
      return
    }
    const rt = createRuntime(id, {
      source,
      profile: source.profile,
      windowSec: settings.parametros.adquisicion.ventanaVisualSeg,
      alertas: settings.parametros.alertas,
    })
    rt.ended = false
    source.on('status', (s, info) => onSourceStatus(id, s, info))
    source.on('event', (ev) => onSourceEvent(id, ev))
    source.on('error', () => {})
    ch.estado = 'connecting'
    try {
      await source.connect()
      await source.start()
      if (ch.fuente === 'simulator') {
        source.setLeadsOff(ch.sim.leadsOff)
        source.pausarDatos(ch.sim.pausado)
      }
    } catch (e) {
      ch.error = e.message
      if (ch.fuente === 'camera') await source.disconnect('error').catch(() => {})
      rt.ended = true
      destroyRuntime(id)
      ch.estado = 'idle'
      return
    }
    rt.lastSampleAt = performance.now() // margen inicial para el watchdog
    rt._prevCount = 0
    rt._prevAt = performance.now()
    if (ch.fuente === 'serial') {
      audit('SERIAL_CONNECTED', 'system', { canal: ch.nombre, perfil: ch.perfilId, usbVendorId: source.info?.usbVendorId ?? null })
    }
    if (ch.fuente === 'camera') {
      audit('CAMERA_STARTED', 'system', { canal: ch.nombre, flash: !!source.torchOn })
    }
    ensureTick()
  }

  function onSourceStatus(id, status, info) {
    const ch = byId(id)
    if (!ch) return
    if (status === 'streaming' && ch.estado === 'connecting') ch.estado = 'streaming'
    if (status === 'disconnected') handleEnded(id, info?.reason || 'desconexion')
  }

  function onSourceEvent(id, ev) {
    const ch = byId(id)
    if (!ch) return
    if (ev.type === 'torch-unavailable') {
      audit('TORCH_UNAVAILABLE', 'system', { canal: ch.nombre })
      notify('Este dispositivo no permite encender el flash desde el navegador. Usa luz ambiental fuerte (ver la guía).', { tipo: 'aviso', duracionMs: 9000 })
    } else if (ev.type === 'camera-denied') {
      audit('CAMERA_DENIED', 'system', { canal: ch.nombre, motivo: ev.motivo })
    } else if (ev.type === 'device-reset') {
      useSessionStore().addEvent(id, 'reinicio-dispositivo')
      audit('DEVICE_RESET', 'system', { canal: ch.nombre })
    } else if (ev.type === 'profile-mismatch') {
      ch.avisoPerfil = true
      if (ev.primeraVez) {
        notify(MENSAJE_PERFIL, { tipo: 'error', duracionMs: 9000 })
        useSessionStore().addEvent(id, 'perfil-incorrecto')
        audit('SERIAL_INVALID_DATA', 'system', { canal: ch.nombre, motivo: 'perfil', porcentaje: Math.round(ev.ratio * 100) })
      }
    } else if (ev.type === 'invalid-data') {
      ch.avisoDatos = true
      notify(`${ch.nombre}: datos del sensor no válidos. ¿Puerto o baudios correctos?`, { tipo: 'aviso' })
      if (ev.primeraVez) audit('SERIAL_INVALID_DATA', 'system', { canal: ch.nombre, porcentaje: Math.round(ev.ratio * 100) })
    }
  }

  /** Fin de un canal (RF09): guarda lo grabado, cierra y vacía buffers. */
  async function handleEnded(id, reason) {
    const rt = getRuntime(id)
    const ch = byId(id)
    if (!rt || rt.ended) return
    rt.ended = true
    const motivo = ['usuario', 'fin-datos', 'senal-perdida', 'segundo-plano'].includes(reason) ? reason : 'desconexion'
    try {
      await useSessionStore().channelEnded(id, motivo)
    } catch {
      notify('No se pudo guardar el final de la sesión del canal.', { tipo: 'error' })
    }
    if (rt.source.kind === 'serial') {
      audit(motivo === 'usuario' ? 'SERIAL_DISCONNECTED' : 'SERIAL_LOST', 'system', { canal: ch?.nombre, motivo })
    }
    if (rt.source.kind === 'camera') audit('CAMERA_STOPPED', 'system', { canal: ch?.nombre, motivo })
    rt.source.removeAllListeners()
    destroyRuntime(id)
    if (ch) {
      ch.estado = motivo === 'usuario' ? 'idle' : 'finished'
      ch.motivoFin = motivo === 'usuario' ? null : ch.avisoPerfil ? MENSAJE_PERFIL : MOTIVOS[motivo]
      ch.bpmCalculado = null
      ch.bpmDispositivo = null
      ch.leadsOff = false
      ch.rango = 'sin-dato'
      ch.enAlerta = false
      ch.muestrasSeg = 0
      if (motivo !== 'usuario') notify(`${ch.nombre}: medición finalizada (${MOTIVOS[motivo]}).`, { tipo: 'aviso', duracionMs: 8000 })
    }
    if (!allRuntimes().length) stopTick()
  }

  async function disconnect(id) {
    const rt = getRuntime(id)
    if (!rt) return
    await rt.source.disconnect('usuario')
    if (getRuntime(id)) await handleEnded(id, 'usuario')
  }

  async function disconnectAll() {
    for (const ch of channels.value) await disconnect(ch.id)
  }

  /** Controles del simulador (demostración de leads-off y RF09). */
  function simControl(id, accion, valor) {
    const ch = byId(id)
    const rt = getRuntime(id)
    if (!ch) return
    if (accion === 'bpm') {
      ch.sim.bpm = Number(valor)
      rt?.source.setBpm?.(ch.sim.bpm)
    } else if (accion === 'ruido') {
      ch.sim.ruido = Number(valor)
      rt?.source.setRuido?.(ch.sim.ruido)
    } else if (accion === 'leadsOff') {
      ch.sim.leadsOff = !!valor
      rt?.source.setLeadsOff?.(ch.sim.leadsOff)
    } else if (accion === 'pausar') {
      ch.sim.pausado = !!valor
      rt?.source.pausarDatos?.(ch.sim.pausado)
    } else if (accion === 'desconectar') {
      rt?.source.simularDesconexion?.()
    }
  }

  function ensureTick() {
    if (!tickTimer) tickTimer = setInterval(tick, 250)
  }

  function stopTick() {
    if (tickTimer) clearInterval(tickTimer)
    tickTimer = null
  }

  /** Actualización a ~4 Hz de escalares + watchdog (RF09/RF10) + evaluación de rango (RF16/RF20). */
  function tick() {
    const settings = useSettingsStore()
    const session = useSessionStore()
    const p = settings.parametros
    const now = performance.now()
    for (const ch of channels.value) {
      const rt = getRuntime(ch.id)
      if (!rt || rt.ended || ch.estado === 'connecting') continue
      const idle = now - rt.lastSampleAt
      if (idle > p.adquisicion.finTrasPerdidaMs) {
        rt.source.disconnect('senal-perdida')
        continue
      }
      let estado
      if (idle > p.adquisicion.watchdogMs) estado = 'signal-lost'
      else estado = rt.lastLeadsOff ? 'leads-off' : 'streaming'
      if (estado !== ch.estado) {
        if (estado === 'leads-off') session.addEvent(ch.id, 'leads-off')
        else if (ch.estado === 'leads-off' && estado === 'streaming') session.addEvent(ch.id, 'leads-on')
        if (estado === 'signal-lost') session.addEvent(ch.id, 'senal-perdida')
        ch.estado = estado
      }
      const valido = estado === 'streaming'
      const calc = valido ? rt.detector.getBpm(rt.lastT) : null
      const dev = valido ? bpmMostrable(rt.lastBpmDevice) : null
      ch.bpmCalculado = calc !== null ? Math.round(calc) : null
      ch.bpmDispositivo = dev !== null ? Math.round(dev) : null
      ch.leadsOff = estado === 'leads-off'
      const dt = (now - rt._prevAt) / 1000
      if (dt >= 1) {
        ch.muestrasSeg = Math.round((rt.sampleCount - rt._prevCount) / dt)
        rt._prevCount = rt.sampleCount
        rt._prevAt = now
      }
      ch.descartadas = rt.source.stats?.invalid ?? 0
      const bpmEval = p.bpm.fuenteBpm === 'dispositivo' ? ch.bpmDispositivo : ch.bpmCalculado
      const r = rt.evaluator.evaluate(bpmEval, settings.rangoPara(ch.actividad), now)
      ch.rango = r.estado
      ch.enAlerta = r.enAlerta
      if (r.alerta) {
        useAlertsStore().trigger({
          channelId: ch.id,
          canal: ch.nombre,
          etiqueta: ch.usuarioId ? useUsersStore().byId(ch.usuarioId)?.etiqueta ?? 'sin usuario' : 'sin usuario',
          tipo: r.alerta,
        })
      }
      session.acumular(ch.id, bpmEval, r.estado)
    }
  }

  function reset() {
    channels.value = []
    replayData.clear()
    seq = 0
  }

  return {
    channels, puedeAgregar, conectados, byId, addChannel, removeChannel, setUsuario, setActividad, setReplayData, configurar,
    connect, disconnect, disconnectAll, simControl, reset,
  }
})
