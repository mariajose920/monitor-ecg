import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { newId, shortId } from '@/utils/ids.js'
import { getRuntime } from '@/services/acquisition/channelRegistry.js'
import { SessionRecorder } from '@/services/acquisition/sessionRecorder.js'
import { saveSession as saveSessionLocal, saveChunk } from '@/services/storage/sessionRepository.js'
import { audit } from '@/services/audit/auditService.js'
import { notify } from '@/services/notifications/notifier.js'
import { useSettingsStore } from './settings.js'

const clone = (o) => JSON.parse(JSON.stringify(o))

/**
 * Guarda SOLO en local (cifrado). Un monitoreo sin guardar es un borrador: ni sus metadatos ni su señal se suben a la nube
 * (C-03); si la nube está activada, se sube todo de una vez cuando la persona pulsa "Guardar monitoreo".
 */
async function saveSession(meta) {
  await saveSessionLocal(meta)
}

/**
 * Sesión de medición en curso (RF08, RF09, RF18, RF19).
 * Estados: 'inactiva' | 'activa'. La última sesión finalizada queda en `ultima`.
 */
export const useSessionStore = defineStore('session', () => {
  const estado = ref('inactiva')
  const actual = ref(null)
  const ultima = ref(null)
  /** Monitoreo ya detenido que espera "Guardar monitoreo" o "Descartar" (vista previa). */
  const pendiente = ref(null)
  const solicitudGuardar = ref(0)
  /** Pide abrir el diálogo "Guardar monitoreo" del borrador pendiente (desde el menú del canal). */
  function pedirGuardar() {
    solicitudGuardar.value++
  }
  const inicioMs = ref(0)
  const activa = computed(() => estado.value === 'activa')
  const stats = new Map() // canalId → acumuladores (no reactivo)

  function participante(channelId) {
    return actual.value?.participantes.find((p) => p.canalIndex === channelId && !p.estadoFinal) || null
  }

  function participa(channelId) {
    return !!participante(channelId)
  }

  /** RF08: inicia una sesión con todos los canales conectados que tengan usuario. */
  async function iniciar(canales) {
    if (activa.value) throw new Error('Ya hay una sesión activa')
    if (pendiente.value) throw new Error('Tienes un monitoreo sin guardar: guárdalo o descártalo antes de iniciar otro.')
    const elegibles = canales.filter((ch) => ch.usuarioId && getRuntime(ch.id) && ['streaming', 'leads-off', 'signal-lost'].includes(ch.estado))
    if (!elegibles.length) throw new Error('Conecta al menos un canal y asígnale un usuario antes de iniciar.')
    const settings = useSettingsStore()
    const id = newId()
    const meta = {
      id,
      estado: 'activa',
      inicio: new Date().toISOString(),
      fin: null,
      motivoFin: null,
      participantes: elegibles.map((ch) => {
        const rt = getRuntime(ch.id)
        return {
          canalIndex: ch.id,
          canalNombre: ch.nombre,
          usuarioId: ch.usuarioId,
          fuente: { tipo: ch.fuente, perfilId: rt.profile.id, info: rt.source.info ?? null },
          fs: rt.profile.fs,
          actividad: [{ tMs: 0, valor: ch.actividad }],
          eventos: [],
          resumen: null,
          estadoFinal: null,
          motivoFin: null,
        }
      }),
      parametrosAplicados: clone(settings.parametros),
      notas: '',
      // Nace como borrador: pasa a "guardado" solo con "Guardar monitoreo" (nombre, nota y actividad).
      guardado: false,
      nombre: null,
      actividadPrincipal: null,
    }
    actual.value = meta
    inicioMs.value = Date.now()
    estado.value = 'activa'
    for (const ch of elegibles) {
      const rt = getRuntime(ch.id)
      rt.recorder = new SessionRecorder({
        onChunk: async (chunk) => {
          await saveChunk(id, ch.id, chunk.seq, chunk)
        },
        onError: () => notify('Error al guardar datos de la sesión (¿almacenamiento lleno?).', { tipo: 'error' }),
      })
      stats.set(ch.id, { n: 0, sum: 0, min: Infinity, max: -Infinity, fuera: 0, evaluados: 0, inicio: Date.now() })
    }
    await saveSession(clone(meta))
    await audit('SESSION_STARTED', 'system', { sesion: shortId(id), participantes: meta.participantes.length })
  }

  function tRel() {
    return Date.now() - inicioMs.value
  }

  function addEvent(channelId, tipo, datos = {}) {
    if (!activa.value) return
    const targets = channelId === null ? actual.value.participantes.filter((p) => !p.estadoFinal) : [participante(channelId)].filter(Boolean)
    for (const p of targets) {
      if (p.eventos.length < 1000) p.eventos.push({ tMs: tRel(), tipo, datos })
    }
  }

  /** RF19: registra la actividad en la línea de tiempo del participante. */
  function registrarActividad(channelId, valor) {
    const p = participante(channelId)
    if (!p) return
    const last = p.actividad[p.actividad.length - 1]
    if (last?.valor !== valor) p.actividad.push({ tMs: tRel(), valor })
  }

  /** Acumula estadísticas para el resumen (llamado a ~4 Hz). */
  function acumular(channelId, bpm, rango) {
    const s = stats.get(channelId)
    if (!s || !participante(channelId)) return
    if (bpm !== null && Number.isFinite(bpm)) {
      s.n++
      s.sum += bpm
      s.min = Math.min(s.min, bpm)
      s.max = Math.max(s.max, bpm)
    }
    if (rango === 'bajo' || rango === 'sobre') s.fuera++
    if (rango !== 'sin-dato') s.evaluados++
  }

  async function cerrarParticipante(p, motivo) {
    const rt = getRuntime(p.canalIndex)
    if (rt?.recorder) {
      await rt.recorder.flush()
      p.resumen = { muestras: rt.recorder.total }
      rt.recorder = null
    }
    const s = stats.get(p.canalIndex)
    p.resumen = {
      ...(p.resumen || { muestras: 0 }),
      descartadas: rt?.source?.stats?.invalid ?? 0,
      bpmMedio: s && s.n ? Math.round(s.sum / s.n) : null,
      bpmMin: s && s.n ? Math.round(s.min) : null,
      bpmMax: s && s.n ? Math.round(s.max) : null,
      pctFueraRango: s && s.evaluados ? Math.round((100 * s.fuera) / s.evaluados) : null,
      duracionMs: tRel(),
    }
    p.estadoFinal = motivo === 'usuario' ? 'finalizado' : 'desconectado'
    p.motivoFin = motivo
    stats.delete(p.canalIndex)
  }

  /** RF09: un canal terminó (desconexión, señal perdida o fin de datos). */
  async function channelEnded(channelId, motivo) {
    const p = participante(channelId)
    if (!p) return
    addEvent(channelId, motivo === 'senal-perdida' ? 'senal-perdida' : 'fin-canal', { motivo })
    await cerrarParticipante(p, motivo)
    if (actual.value.participantes.every((x) => x.estadoFinal)) await finalizar(motivo)
    else await saveSession(clone(actual.value))
  }

  /** Detener manualmente. */
  async function detener() {
    if (!activa.value) return
    for (const p of actual.value.participantes.filter((x) => !x.estadoFinal)) await cerrarParticipante(p, 'usuario')
    await finalizar('usuario')
  }

  async function finalizar(motivo) {
    const meta = actual.value
    meta.estado = 'finalizada'
    meta.fin = new Date().toISOString()
    meta.motivoFin = motivo
    await saveSession(clone(meta))
    await audit('SESSION_ENDED', 'system', { sesion: shortId(meta.id), motivo })
    ultima.value = { id: meta.id, motivoFin: motivo }
    pendiente.value = { id: meta.id, motivoFin: motivo }
    actual.value = null
    estado.value = 'inactiva'
    if (motivo !== 'usuario') notify(`El monitoreo terminó automáticamente (${motivo === 'senal-perdida' ? 'señal perdida' : 'desconexión'}). Los datos quedaron como borrador: guárdalo o descártalo.`, { tipo: 'aviso', duracionMs: 8000 })
  }

  function limpiarPendiente() {
    pendiente.value = null
  }

  return { estado, actual, ultima, pendiente, solicitudGuardar, pedirGuardar, limpiarPendiente, inicioMs, activa, participa, iniciar, addEvent, registrarActividad, acumular, channelEnded, detener }
})
