<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useChannelsStore } from '@/stores/channels.js'
import { getRuntime } from '@/services/acquisition/channelRegistry.js'
import { CALIDAD_PPG } from '@/utils/dsp/ppgCamera.js'

/**
 * Asistente paso a paso para medir con la cámara del celular (PPG).
 * 1 Permiso y consentimiento · 2 Colocar el dedo · 3 Medición con cuenta regresiva · 4 Resultado.
 * Los fotogramas nunca salen de CameraSource: aquí solo llegan números de calidad y BPM.
 */
const props = defineProps({ canal: { type: Object, required: true } })
const emit = defineEmits(['cerrar'])

const DURACION = 45 // segundos de medición guiada (30-60 s)
const channels = useChannelsStore()
const paso = ref(1)
const acepta = ref(false)
const restante = ref(DURACION)
const calidad = ref({ estado: 'sin-dedo', texto: 'Ajusta el dedo', consejo: CALIDAD_PPG['sin-dedo'].consejo, torch: false, torchSupported: false })
const buenos = ref(0)
const total = ref(0)
const bpms = ref([])
const resultado = ref(null)
const titulo = ref(null)
let timer = null

const flashActivo = computed(() => calidad.value.torch)
const pct = computed(() => Math.round(((DURACION - restante.value) / DURACION) * 100))
const clase = computed(() => ({ buena: 'ok', calibrando: 'info', debil: 'warn' })[calidad.value.estado] || 'warn')
const anuncio = computed(() => `${calidad.value.texto}. ${calidad.value.consejo}`)

const flashFallo = ref(false)
async function encenderFlash() {
  const rt = getRuntime(props.canal.id)
  flashFallo.value = !(rt && (await rt.source.encenderFlash?.()))
  if (rt) calidad.value = rt.source.quality
}

function enfocarTitulo() {
  nextTick(() => titulo.value?.focus())
}

async function iniciar() {
  if (!acepta.value) return
  await channels.connect(props.canal.id) // gesto del usuario: pide permiso de cámara
  if (props.canal.error || !getRuntime(props.canal.id)) return
  paso.value = 2
  enfocarTitulo()
  timer = setInterval(sondear, 250)
}

function sondear() {
  const rt = getRuntime(props.canal.id)
  if (!rt) {
    // Se cortó (pestaña oculta, cámara retirada...)
    clearInterval(timer)
    timer = null
    if (paso.value < 4) paso.value = 5
    return
  }
  calidad.value = rt.source.quality
  if (paso.value === 2 && calidad.value.fingerOn && calidad.value.estado !== 'calibrando') {
    // Dedo colocado: empieza la medición guiada
    paso.value = 3
    restante.value = DURACION
    buenos.value = total.value = 0
    bpms.value = []
    t0 = performance.now()
    enfocarTitulo()
  }
  if (paso.value === 3) {
    restante.value = Math.max(0, Math.ceil(DURACION - (performance.now() - t0) / 1000))
    total.value++
    if (calidad.value.buena) buenos.value++
    const b = props.canal.bpmCalculado
    if (b && calidad.value.buena) bpms.value.push(b)
    if (!calidad.value.fingerOn) {
      // Dedo retirado: vuelve a pedirlo sin perder el asistente
      paso.value = 2
    } else if (restante.value <= 0) terminar()
  }
}
let t0 = 0

function terminar() {
  clearInterval(timer)
  timer = null
  const s = [...bpms.value].sort((a, b) => a - b)
  const med = s.length ? s[s.length >> 1] : null
  const pctBuena = total.value ? Math.round((buenos.value / total.value) * 100) : 0
  resultado.value = { bpm: med, pctBuena, fiable: med !== null && pctBuena >= 50 }
  paso.value = 4
  enfocarTitulo()
}

async function cancelar() {
  clearInterval(timer)
  timer = null
  await channels.disconnect(props.canal.id)
  emit('cerrar')
}

function continuar() {
  clearInterval(timer)
  timer = null
  emit('cerrar') // la fuente sigue activa: la sesión se inicia con los controles normales
}

async function repetir() {
  paso.value = 2
  resultado.value = null
  if (!getRuntime(props.canal.id)) {
    await channels.connect(props.canal.id)
  }
  clearInterval(timer)
  timer = setInterval(sondear, 250)
  enfocarTitulo()
}

onMounted(enfocarTitulo)
onBeforeUnmount(() => timer && clearInterval(timer))
</script>

<template>
  <Teleport to="body">
    <div class="wz-overlay">
      <section class="wz card" role="dialog" aria-modal="true" aria-labelledby="wz-titulo">
        <p class="wz-pasos muted small">Paso {{ Math.min(paso, 4) }} de 4</p>
        <h2 id="wz-titulo" ref="titulo" tabindex="-1">
          <template v-if="paso === 1">1. Permiso de cámara</template>
          <template v-else-if="paso === 2">2. Coloca el dedo</template>
          <template v-else-if="paso === 3">3. Quédate quieto</template>
          <template v-else-if="paso === 4">4. Resultado</template>
          <template v-else>Medición interrumpida</template>
        </h2>

        <p class="alert warn small"><strong>No es un dispositivo médico.</strong> Es una demostración educativa de fotopletismografía (PPG): no sirve para diagnosticar ni reemplaza un ECG.</p>

        <div v-if="paso === 1">
          <p>Para medir tu pulso se usa la cámara trasera y el flash. El navegador te pedirá permiso.</p>
          <ul class="small">
            <li>Solo se calcula el promedio de color de una zona pequeña; <strong>las imágenes nunca se guardan ni se envían</strong>.</li>
            <li>La cámara y el flash se apagan al terminar, al cambiar de pestaña o al bloquear la pantalla.</li>
            <li>Si tu dispositivo no permite encender el flash (p. ej. iPhone con Safari), usa una luz ambiental fuerte.</li>
          </ul>
          <label class="check">
            <input v-model="acepta" type="checkbox" data-testid="camara-consentimiento">
            <span>Entiendo y autorizo el uso de la cámara solo para medir mi pulso.</span>
          </label>
          <p v-if="canal.error" class="alert danger" role="alert">{{ canal.error }}</p>
        </div>

        <div v-else-if="paso === 2 || paso === 3">
          <ol class="small pasos">
            <li :class="{ hecho: paso >= 3 }">Cubre <strong>a la vez la cámara y el flash</strong> con la yema del dedo índice.</li>
            <li>Presiona con suavidad (sin apretar): el dedo no debe verse blanco.</li>
            <li>Quédate quieto {{ DURACION }} s, con el brazo apoyado y sin hablar.</li>
          </ol>
          <p class="paso-dedo"><strong>Coloca la yema del dedo cubriendo la cámara y el flash.</strong></p>
          <p class="muted small">Flash: <strong>{{ flashActivo ? 'encendido' : 'apagado' }}</strong></p>
          <div v-if="!flashActivo" class="alert warn small" role="status" data-testid="camara-flash-aviso">
            <p>No se pudo encender el flash automáticamente. Toca el botón; si tampoco funciona, enciende la linterna de tu celular manualmente o usa una luz ambiental fuerte.</p>
            <button class="btn small" type="button" data-testid="camara-encender-flash" @click="encenderFlash">Encender flash</button>
            <p v-if="flashFallo" class="error-text">Este navegador no permite controlar el flash.</p>
          </div>
          <div :class="['calidad', 'chip', clase]" data-testid="camara-calidad">{{ calidad.texto }}</div>
          <p class="small" aria-live="polite" role="status">{{ anuncio }}</p>
          <template v-if="paso === 3">
            <p class="cuenta" data-testid="camara-cuenta">{{ restante }} s</p>
            <progress max="100" :value="pct" aria-label="Progreso de la medición" />
          </template>
          <p class="muted small">Consejos: manos tibias (los dedos fríos dan señal débil), luz tenue alrededor, sin moverte.</p>
        </div>

        <div v-else-if="paso === 4 && resultado">
          <p class="cuenta" data-testid="camara-resultado">{{ resultado.bpm ?? '--' }} <span class="small">BPM (aprox.)</span></p>
          <p :class="resultado.fiable ? 'ok-text' : 'error-text'">{{ resultado.fiable ? 'Medición con buena calidad.' : 'Calidad insuficiente: repite la medición con el dedo más quieto.' }}</p>
          <p class="muted small">Señal buena durante el {{ resultado.pctBuena }} % del tiempo. Valor educativo, no médico.</p>
        </div>

        <div v-else>
          <p class="alert warn" role="alert">La cámara se detuvo (la app pasó a segundo plano o se retiró el permiso). Puedes volver a intentarlo.</p>
        </div>

        <div class="wz-acciones">
          <button v-if="paso === 1" class="btn primary" :disabled="!acepta" data-testid="camara-iniciar" @click="iniciar">Activar cámara y flash</button>
          <button v-if="paso === 4" class="btn primary" @click="continuar">Continuar con la sesión</button>
          <button v-if="paso === 4 || paso === 5" class="btn" @click="repetir">Repetir</button>
          <button class="btn ghost" @click="cancelar">{{ paso === 4 ? 'Terminar y apagar cámara' : 'Cancelar' }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.wz-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: rgb(0 0 0 / 0.7);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0;
}

.wz {
  width: 100%;
  max-width: 520px;
  max-height: 100dvh;
  overflow-y: auto;
  border-radius: var(--radius) var(--radius) 0 0;
}

@media (min-width: 600px) {
  .wz-overlay {
    align-items: center;
    padding: 16px;
  }

  .wz {
    border-radius: var(--radius);
  }
}

.wz-pasos {
  margin: 0;
}

.wz h2:focus {
  outline: none;
}

.pasos {
  padding-left: 20px;
}

.calidad {
  font-size: 1.1rem;
  padding: 6px 14px;
  margin-bottom: 8px;
}

.cuenta {
  font-size: 2.2rem;
  font-weight: 800;
  margin: 8px 0;
}

progress {
  width: 100%;
  height: 12px;
}

.wz-acciones {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
