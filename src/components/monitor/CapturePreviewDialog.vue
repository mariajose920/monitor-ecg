<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import {
  descargarBlob,
  copiarAlPortapapeles,
  generarCaptura,
  calcularBpmDeMuestras,
  descargarCapturaCsv,
} from '@/services/report/snapshotService.js'
import { notify } from '@/services/notifications/notifier.js'

const props = defineProps({
  captura: { type: Object, required: true },
})

const emit = defineEmits(['cerrar'])

const capturaActual = ref(props.captura)
const copiado = ref(false)
const procesandoRecorte = ref(false)
const modoEdicion = ref(true) // true: ajustando límites sobre la onda completa; false: viendo resultado recortado

// Duración total original de la captura (por defecto 8s)
const duracionTotal = computed(() => {
  const orig = props.captura.ventanaOriginalSeg || props.captura.ventanaSeg || 8
  return Number(orig.toFixed(2))
})

// Límites de selección en segundos
const limiteInicio = ref(0)
const limiteFin = ref(duracionTotal.value)

// Frecuencia cardíaca estimada del segmento seleccionado
const bpmEstimado = ref(props.captura.bpm)

// Muestras de la captura original para poder recortar múltiples veces
const muestrasFuente = computed(() => {
  return props.captura.samplesOriginales || props.captura.samples || []
})

const estaRecortado = computed(() => !!capturaActual.value?.recorte)

const limitesModificados = computed(() => {
  return Math.abs(limiteInicio.value - 0) > 0.05 || Math.abs(limiteFin.value - duracionTotal.value) > 0.05
})

const duracionSeleccionada = computed(() => {
  return Math.max(0, Number((limiteFin.value - limiteInicio.value).toFixed(2)))
})

// Mapeo proporcional a la zona de trazado dentro de la imagen generada (1200x560, x0=70, w=1100, y0=92, h=400)
const zonaRef = ref(null)
const arrastrando = ref(null) // 'inicio' | 'fin' | 'zona' | null
const dragStartX = ref(0)
const dragStartIni = ref(0)
const dragStartFin = ref(0)

const hoverSec = ref(null)
const mostrarHover = ref(false)

function secToPct(sec) {
  if (duracionTotal.value <= 0) return 0
  return Math.max(0, Math.min(100, (sec / duracionTotal.value) * 100))
}

const pctInicio = computed(() => secToPct(limiteInicio.value))
const pctFin = computed(() => secToPct(limiteFin.value))
const pctAncho = computed(() => Math.max(0, pctFin.value - pctInicio.value))
const pctHover = computed(() => (hoverSec.value != null ? secToPct(hoverSec.value) : 0))

function clientXToSec(clientX) {
  if (!zonaRef.value) return 0
  const rect = zonaRef.value.getBoundingClientRect()
  const relX = Math.max(0, Math.min(rect.width, clientX - rect.left))
  const frac = relX / rect.width
  const sec = frac * duracionTotal.value
  return Math.max(0, Math.min(duracionTotal.value, Number(sec.toFixed(2))))
}

function recalcularBpmEstimado() {
  const muestras = muestrasFuente.value
  if (!muestras.length) return
  const fs = props.captura.canal?.perfilId ? 250 : 250
  const ini = limiteInicio.value
  const fin = limiteFin.value
  const slice = muestras.filter((s) => s.tRel >= ini && s.tRel <= fin)
  const nuevoBpm = calcularBpmDeMuestras(slice, fs)
  if (nuevoBpm != null) {
    bpmEstimado.value = nuevoBpm
  } else {
    bpmEstimado.value = props.captura.bpm
  }
}

watch([limiteInicio, limiteFin], () => {
  if (limiteInicio.value > limiteFin.value - 0.2) {
    limiteInicio.value = Math.max(0, Number((limiteFin.value - 0.2).toFixed(2)))
  }
  recalcularBpmEstimado()
})

// === INTERACCIÓN DIRECTA ARRASTRANDO SOBRE LA CAPTURA ===

function iniciarArrastre(tipo, e) {
  e.preventDefault()
  e.stopPropagation()
  arrastrando.value = tipo
  dragStartX.value = e.clientX
  dragStartIni.value = limiteInicio.value
  dragStartFin.value = limiteFin.value
  mostrarHover.value = false

  window.addEventListener('pointermove', alArrastrar)
  window.addEventListener('pointerup', alFinalizarArrastre)
  window.addEventListener('pointercancel', alFinalizarArrastre)
}

function clickEnFondo(e) {
  if (arrastrando.value) return
  const clickSec = clientXToSec(e.clientX)
  const distIni = Math.abs(clickSec - limiteInicio.value)
  const distFin = Math.abs(clickSec - limiteFin.value)

  if (clickSec < limiteInicio.value) {
    limiteInicio.value = clickSec
    iniciarArrastre('inicio', e)
  } else if (clickSec > limiteFin.value) {
    limiteFin.value = clickSec
    iniciarArrastre('fin', e)
  } else {
    if (distIni < distFin) {
      limiteInicio.value = clickSec
      iniciarArrastre('inicio', e)
    } else {
      limiteFin.value = clickSec
      iniciarArrastre('fin', e)
    }
  }
}

function alArrastrar(e) {
  if (!arrastrando.value || !zonaRef.value) return
  const rect = zonaRef.value.getBoundingClientRect()
  const deltaSec = ((e.clientX - dragStartX.value) / rect.width) * duracionTotal.value

  if (arrastrando.value === 'inicio') {
    let nuevoIni = dragStartIni.value + deltaSec
    nuevoIni = Math.max(0, Math.min(nuevoIni, limiteFin.value - 0.15))
    limiteInicio.value = Number(nuevoIni.toFixed(2))
  } else if (arrastrando.value === 'fin') {
    let nuevoFin = dragStartFin.value + deltaSec
    nuevoFin = Math.max(limiteInicio.value + 0.15, Math.min(duracionTotal.value, nuevoFin))
    limiteFin.value = Number(nuevoFin.toFixed(2))
  } else if (arrastrando.value === 'zona') {
    const span = dragStartFin.value - dragStartIni.value
    let nuevoIni = dragStartIni.value + deltaSec
    let nuevoFin = dragStartFin.value + deltaSec
    if (nuevoIni < 0) {
      nuevoIni = 0
      nuevoFin = span
    }
    if (nuevoFin > duracionTotal.value) {
      nuevoFin = duracionTotal.value
      nuevoIni = duracionTotal.value - span
    }
    limiteInicio.value = Number(nuevoIni.toFixed(2))
    limiteFin.value = Number(nuevoFin.toFixed(2))
  }
}

function alFinalizarArrastre() {
  arrastrando.value = null
  window.removeEventListener('pointermove', alArrastrar)
  window.removeEventListener('pointerup', alFinalizarArrastre)
  window.removeEventListener('pointercancel', alFinalizarArrastre)
  recalcularBpmEstimado()
}

function alMoverHover(e) {
  if (arrastrando.value) {
    mostrarHover.value = false
    return
  }
  hoverSec.value = clientXToSec(e.clientX)
  mostrarHover.value = true
}

function alSalirHover() {
  mostrarHover.value = false
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', alArrastrar)
  window.removeEventListener('pointerup', alFinalizarArrastre)
  window.removeEventListener('pointercancel', alFinalizarArrastre)
})

// === PRESETS Y PASOS FINOS ===

function ajustarInicio(delta) {
  const v = Math.max(0, Math.min(duracionTotal.value, Number((limiteInicio.value + delta).toFixed(2))))
  if (v < limiteFin.value - 0.1) {
    limiteInicio.value = v
  }
}

function ajustarFin(delta) {
  const v = Math.max(0, Math.min(duracionTotal.value, Number((limiteFin.value + delta).toFixed(2))))
  if (v > limiteInicio.value + 0.1) {
    limiteFin.value = v
  }
}

function aplicarPreset(tipo) {
  const tot = duracionTotal.value
  if (tipo === 'todo') {
    limiteInicio.value = 0
    limiteFin.value = tot
  } else if (tipo === 'primeros') {
    limiteInicio.value = 0
    limiteFin.value = Math.min(3, tot)
  } else if (tipo === 'centro') {
    const centro = tot / 2
    limiteInicio.value = Math.max(0, Number((centro - 1.5).toFixed(2)))
    limiteFin.value = Math.min(tot, Number((centro + 1.5).toFixed(2)))
  } else if (tipo === 'ultimos') {
    limiteInicio.value = Math.max(0, Number((tot - 3).toFixed(2)))
    limiteFin.value = tot
  }
  modoEdicion.value = true
}

async function aplicarRecorte() {
  if (duracionSeleccionada.value < 0.25) {
    notify('El tramo seleccionado debe ser de al menos 0.25 segundos.', { tipo: 'aviso' })
    return
  }
  procesandoRecorte.value = true
  try {
    const res = await generarCaptura({
      canal: props.captura.canal,
      usuarioEtiqueta: props.captura.usuario,
      ventanaSeg: duracionTotal.value,
      muestrasDirectas: muestrasFuente.value,
      recorte: {
        inicioSeg: Number(limiteInicio.value),
        finSeg: Number(limiteFin.value),
        ventanaOriginalSeg: duracionTotal.value,
      },
      fechaStrPersonalizada: props.captura.fecha,
    })
    capturaActual.value = res
    modoEdicion.value = false
    notify(`¡Captura recortada con éxito! Tramo de ${res.ventanaSeg}s guardado (${res.bpm != null ? res.bpm + ' BPM' : 'BPM estimado'}).`, { tipo: 'ok' })
  } catch (err) {
    notify(err.message || 'No se pudo recortar la captura.', { tipo: 'error' })
  } finally {
    procesandoRecorte.value = false
  }
}

function restablecerOriginal() {
  limiteInicio.value = 0
  limiteFin.value = duracionTotal.value
  capturaActual.value = props.captura
  bpmEstimado.value = props.captura.bpm
  modoEdicion.value = true
  notify('Captura restablecida a su duración original.', { tipo: 'info' })
}

function descargar() {
  try {
    descargarBlob(capturaActual.value.blob, capturaActual.value.filename)
    notify(`Captura descargada: ${capturaActual.value.filename}`, { tipo: 'ok' })
  } catch (err) {
    notify(err.message || 'No se pudo descargar la captura.', { tipo: 'error' })
  }
}

function descargarCsv() {
  try {
    descargarCapturaCsv(capturaActual.value)
    notify('Datos del segmento descargados en CSV.', { tipo: 'ok' })
  } catch (err) {
    notify(err.message || 'No se pudo descargar el CSV.', { tipo: 'error' })
  }
}

async function copiar() {
  try {
    await copiarAlPortapapeles(capturaActual.value.blob)
    copiado.value = true
    notify('¡Imagen copiada al portapapeles! Puedes pegarla directamente con Ctrl+V.', { tipo: 'ok' })
    setTimeout(() => {
      copiado.value = false
    }, 3000)
  } catch (err) {
    notify(err.message || 'No se pudo copiar al portapapeles. Usa la opción Descargar.', { tipo: 'error' })
  }
}
</script>

<template>
  <BaseDialog titulo="Captura de frecuencia cardíaca" ancho="940px" @cerrar="emit('cerrar')">
    <div class="cuerpo-captura">
      <!-- Marco principal con la captura y la capa interactiva ENCIMA de la señal -->
      <div class="vista-previa-marco">
        <!-- Imagen de fondo: si está en modo edición de límites se muestra la original completa con la onda; si se aplicó el corte, se muestra el resultado final limpio -->
        <img
          :src="modoEdicion ? props.captura.dataUrl : capturaActual.dataUrl"
          :alt="`Captura de señal ${capturaActual.usuario} - ${capturaActual.bpm ?? '--'} BPM`"
          class="img-captura"
        >

        <!-- CAPA INTERACTIVA EXACTA SOBRE LA ONDA (ajustada a la cuadrícula del canvas: left 5.83%, width 91.67%, top 16.43%, height 71.43%) -->
        <div
          v-if="modoEdicion"
          ref="zonaRef"
          class="overlay-recorte"
          @pointerdown="clickEnFondo"
          @pointermove="alMoverHover"
          @pointerleave="alSalirHover"
        >
          <!-- Máscara exterior izquierda (atenúa la señal descartada antes del límite inicial) -->
          <div
            class="mascara-descarte izquierda"
            :style="{ width: `${pctInicio}%` }"
          />

          <!-- Zona activa seleccionada (brillante / iluminada, con insignia flotante) -->
          <div
            class="zona-seleccionada"
            :style="{ left: `${pctInicio}%`, width: `${pctAncho}%` }"
            title="Arrastra para mover todo el tramo seleccionado"
            @pointerdown.stop="iniciarArrastre('zona', $event)"
          >
            <!-- Badge flotante central de tiempo y BPM instantáneo del tramo -->
            <div class="badge-flotante-tramo">
              <AppIcon name="scissors" :size="13" />
              <span><strong>{{ duracionSeleccionada }}s</strong> ({{ bpmEstimado != null ? `${bpmEstimado} BPM` : '-- BPM' }})</span>
            </div>
          </div>

          <!-- Máscara exterior derecha (atenúa la señal descartada después del límite final) -->
          <div
            class="mascara-descarte derecha"
            :style="{ left: `${pctFin}%` }"
          />

          <!-- LÍNEA Y MANIPULADOR: LÍMITE INICIAL (arrastre directo sobre la onda) -->
          <div
            class="linea-limite inicio"
            :style="{ left: `${pctInicio}%` }"
            @pointerdown.stop="iniciarArrastre('inicio', $event)"
          >
            <div class="manilla-handle superior" title="Arrastra para fijar el punto de inicio exacto">
              <span class="flecha">◀</span>
              <span class="texto">Inicio: {{ limiteInicio }}s</span>
            </div>
            <div class="linea-resaltada" />
            <div class="manilla-handle inferior">
              <span>▲</span>
            </div>
          </div>

          <!-- LÍNEA Y MANIPULADOR: LÍMITE FINAL (arrastre directo sobre la onda) -->
          <div
            class="linea-limite fin"
            :style="{ left: `${pctFin}%` }"
            @pointerdown.stop="iniciarArrastre('fin', $event)"
          >
            <div class="manilla-handle superior" title="Arrastra para fijar el punto de fin exacto">
              <span class="texto">Fin: {{ limiteFin }}s</span>
              <span class="flecha">▶</span>
            </div>
            <div class="linea-resaltada" />
            <div class="manilla-handle inferior">
              <span>▲</span>
            </div>
          </div>

          <!-- Línea guía dinámica al mover el cursor (hover) para máxima precisión -->
          <div
            v-if="mostrarHover && !arrastrando"
            class="guia-cursor"
            :style="{ left: `${pctHover}%` }"
          >
            <span class="tooltip-cursor">{{ hoverSec }}s</span>
          </div>
        </div>

        <!-- Cartel si se está viendo el recorte ya aplicado -->
        <div v-if="!modoEdicion && estaRecortado" class="banner-vista-recortada">
          <span>Vista de la captura recortada ({{ capturaActual.recorte.duracionSeg }} s)</span>
          <button class="btn small cardio" type="button" @click="modoEdicion = true">
            <AppIcon name="scissors" :size="14" />
            <span>Volver a mover límites</span>
          </button>
        </div>
      </div>

      <!-- Resumen en chips de datos -->
      <div class="resumen-chips">
        <span class="chip info">
          <AppIcon name="user" :size="14" />
          <strong>{{ capturaActual.usuario || 'Participante' }}</strong>
        </span>
        <span class="chip cardio">
          <AppIcon name="heart" :size="14" filled />
          <strong>{{ (modoEdicion ? bpmEstimado : capturaActual.bpm) != null ? `${(modoEdicion ? bpmEstimado : capturaActual.bpm)} BPM` : '-- BPM' }}</strong>
          <span v-if="estaRecortado && !modoEdicion" class="tag-recortado">(recortado)</span>
          <span v-else-if="limitesModificados" class="tag-recortado">(estimado en tramo)</span>
        </span>
        <span class="chip neutral">
          <AppIcon name="activity" :size="14" />
          <span>{{ capturaActual.actividad }}</span>
        </span>
        <span class="chip neutral">
          <AppIcon name="clock" :size="14" />
          <span>{{ capturaActual.fecha }}</span>
        </span>
        <span v-if="estaRecortado && !modoEdicion" class="chip warn">
          <AppIcon name="scissors" :size="14" />
          <strong>Recorte: {{ capturaActual.recorte.inicioSeg }}s a {{ capturaActual.recorte.finSeg }}s ({{ capturaActual.recorte.duracionSeg }}s)</strong>
        </span>
      </div>

      <!-- Panel de herramientas y controles finos -->
      <section class="panel-controles-recorte" aria-label="Controles de precisión del recorte">
        <div class="fila-instruccion-directa">
          <div class="instruccion-con-icono">
            <AppIcon name="scissors" :size="16" />
            <p class="texto-ayuda">
              <strong>Recorte interactivo sobre la imagen:</strong>
              Arrastra las líneas rojas (Inicio y Fin) directamente sobre los picos o haz clic sobre la señal.
            </p>
          </div>

          <div class="presets-rapidos">
            <span class="label-presets">Atajos:</span>
            <button class="btn small ghost" type="button" @click="aplicarPreset('todo')">Todo ({{ duracionTotal }}s)</button>
            <button class="btn small ghost" type="button" @click="aplicarPreset('primeros')">Primeros 3s</button>
            <button class="btn small ghost" type="button" @click="aplicarPreset('centro')">Centro 3s</button>
            <button class="btn small ghost" type="button" @click="aplicarPreset('ultimos')">Últimos 3s</button>
          </div>
        </div>

        <!-- Ajuste fino y milimétrico de los dos puntos -->
        <div class="grid-ajuste-fino">
          <!-- Control punto de inicio -->
          <div class="card-punto">
            <div class="cab-punto">
              <span class="nombre-punto">Punto inicial:</span>
              <span class="valor-punto">{{ limiteInicio }} s</span>
            </div>
            <div class="acciones-paso">
              <button class="btn small ghost" type="button" title="Retroceder 0.1 s" @click="ajustarInicio(-0.1)">-0.1s</button>
              <input
                v-model.number="limiteInicio"
                type="number"
                min="0"
                :max="duracionTotal"
                step="0.05"
                class="input-fino"
                aria-label="Segundos de inicio"
                @focus="modoEdicion = true"
              >
              <button class="btn small ghost" type="button" title="Avanzar 0.1 s" @click="ajustarInicio(0.1)">+0.1s</button>
            </div>
          </div>

          <!-- Resumen central -->
          <div class="card-punto centro">
            <div class="cab-punto">
              <span class="nombre-punto">Duración seleccionada:</span>
            </div>
            <div class="metricas-tramo">
              <span class="duracion-grande">{{ duracionSeleccionada }} s</span>
              <span class="bpm-tramo-destacado">{{ bpmEstimado != null ? `${bpmEstimado} BPM` : '-- BPM' }}</span>
            </div>
          </div>

          <!-- Control punto de fin -->
          <div class="card-punto">
            <div class="cab-punto">
              <span class="nombre-punto">Punto final:</span>
              <span class="valor-punto">{{ limiteFin }} s</span>
            </div>
            <div class="acciones-paso">
              <button class="btn small ghost" type="button" title="Retroceder 0.1 s" @click="ajustarFin(-0.1)">-0.1s</button>
              <input
                v-model.number="limiteFin"
                type="number"
                min="0"
                :max="duracionTotal"
                step="0.05"
                class="input-fino"
                aria-label="Segundos de fin"
                @focus="modoEdicion = true"
              >
              <button class="btn small ghost" type="button" title="Avanzar 0.1 s" @click="ajustarFin(0.1)">+0.1s</button>
            </div>
          </div>
        </div>

        <!-- Botones de acción del corte -->
        <div class="fila-botones-corte">
          <button
            class="btn cardio"
            type="button"
            :disabled="procesandoRecorte"
            @click="aplicarRecorte"
          >
            <AppIcon name="scissors" :size="16" />
            <span>{{ estaRecortado ? 'Actualizar corte' : 'Cortar y aplicar a la captura' }}</span>
          </button>

          <button
            v-if="!modoEdicion && estaRecortado"
            class="btn secondary"
            type="button"
            @click="modoEdicion = true"
          >
            <AppIcon name="scissors" :size="15" />
            <span>Ajustar límites de nuevo</span>
          </button>

          <button
            v-if="estaRecortado || limitesModificados"
            class="btn ghost"
            type="button"
            @click="restablecerOriginal"
          >
            <AppIcon name="rotate-ccw" :size="15" />
            <span>Restablecer captura original</span>
          </button>
        </div>
      </section>
    </div>

    <template #acciones>
      <button class="btn secondary" type="button" @click="copiar">
        <AppIcon :name="copiado ? 'check' : 'clipboard'" :size="16" />
        {{ copiado ? '¡Copiado!' : 'Copiar al portapapeles' }}
      </button>
      <button class="btn secondary" type="button" title="Descargar datos en CSV del segmento actual" @click="descargarCsv">
        <AppIcon name="download" :size="16" />
        Descargar CSV
      </button>
      <button class="btn cardio" type="button" @click="descargar">
        <AppIcon name="download" :size="16" />
        {{ estaRecortado && !modoEdicion ? 'Descargar imagen recortada (PNG)' : 'Descargar imagen (PNG)' }}
      </button>
      <button class="btn ghost" type="button" @click="emit('cerrar')">
        Cerrar
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.cuerpo-captura {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Marco contenedor con posicionamiento relativo para la capa superpuesta */
.vista-previa-marco {
  position: relative;
  width: 100%;
  border-radius: var(--radius, 10px);
  overflow: hidden;
  border: 1px solid var(--border, #e2e8f0);
  background: #ffffff;
  box-shadow: var(--shadow, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
  user-select: none;
}

.img-captura {
  display: block;
  width: 100%;
  height: auto;
  pointer-events: none;
}

/* CAPA INTERACTIVA ENCIMA DE LA SEÑAL (Cubre exactamente el área del gráfico en el canvas) */
.overlay-recorte {
  position: absolute;
  left: 5.833%;
  width: 91.667%;
  top: 16.429%;
  height: 71.429%;
  cursor: crosshair;
  touch-action: none;
  overflow: visible;
}

/* Máscaras oscuras que atenúan las partes fuera de los límites */
.mascara-descarte {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.42);
  pointer-events: none;
  transition: width 0.05s linear, left 0.05s linear;
}

.mascara-descarte.izquierda {
  left: 0;
}

.mascara-descarte.derecha {
  right: 0;
}

/* Zona central activa (iluminada / seleccionada) */
.zona-seleccionada {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(225, 29, 72, 0.08);
  border-top: 2px dashed rgba(225, 29, 72, 0.6);
  border-bottom: 2px dashed rgba(225, 29, 72, 0.6);
  cursor: grab;
  box-sizing: border-box;
}

.zona-seleccionada:active {
  cursor: grabbing;
  background: rgba(225, 29, 72, 0.14);
}

.badge-flotante-tramo {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.95);
  color: var(--cardio, #e11d48);
  border: 1px solid var(--cardio, #e11d48);
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.76rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 5px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  white-space: nowrap;
  pointer-events: none;
}

/* LÍNEAS VERTICALES DE LÍMITE (INICIO Y FIN) */
.linea-limite {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 32px;
  margin-left: -16px; /* Centra el área táctil de 32px sobre el píxel exacto */
  cursor: ew-resize;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
}

.linea-resaltada {
  width: 3px;
  height: 100%;
  background: var(--cardio, #e11d48);
  box-shadow: 0 0 8px rgba(225, 29, 72, 0.7);
  pointer-events: none;
}

.linea-limite:hover .linea-resaltada,
.linea-limite:active .linea-resaltada {
  width: 4px;
  background: #be123c;
  box-shadow: 0 0 12px rgba(225, 29, 72, 0.9);
}

/* Manillas tipo pestaña flotante */
.manilla-handle {
  background: var(--cardio, #e11d48);
  color: #ffffff;
  font-size: 0.74rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 3px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  pointer-events: none;
  white-space: nowrap;
}

.manilla-handle.superior {
  position: absolute;
  top: -24px;
}

.manilla-handle.inferior {
  position: absolute;
  bottom: -20px;
  padding: 1px 4px;
  font-size: 0.65rem;
}

/* Línea guía que sigue el cursor */
.guia-cursor {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  border-left: 1px dashed rgba(15, 23, 42, 0.6);
  pointer-events: none;
  z-index: 5;
}

.tooltip-cursor {
  position: absolute;
  top: 4px;
  left: 4px;
  background: rgba(15, 23, 42, 0.85);
  color: #ffffff;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.7rem;
  font-weight: 600;
  white-space: nowrap;
}

/* Banner cuando se visualiza el recorte ya aplicado */
.banner-vista-recortada {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(15, 23, 42, 0.88);
  color: #ffffff;
  padding: 6px 16px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.84rem;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
  z-index: 20;
}

/* Resumen chips */
.resumen-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.tag-recortado {
  font-size: 0.72rem;
  opacity: 0.85;
  font-weight: normal;
  margin-left: 4px;
}

/* Panel de controles finos */
.panel-controles-recorte {
  background: var(--bg-elev, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: var(--radius, 10px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.fila-instruccion-directa {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.instruccion-con-icono {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text, #0f172a);
}

.texto-ayuda {
  font-size: 0.85rem;
  margin: 0;
  color: var(--text, #0f172a);
}

.presets-rapidos {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.label-presets {
  font-size: 0.78rem;
  color: var(--text-muted, #64748b);
}

/* Grid de ajuste fino */
.grid-ajuste-fino {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}

@media (max-width: 720px) {
  .grid-ajuste-fino {
    grid-template-columns: 1fr;
  }
}

.card-punto {
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border, #cbd5e1);
  border-radius: var(--radius-sm, 6px);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-punto.centro {
  align-items: center;
  justify-content: center;
  text-align: center;
  background: var(--bg-elev-2, rgba(225, 29, 72, 0.04));
  border-color: rgba(225, 29, 72, 0.25);
}

.cab-punto {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
}

.nombre-punto {
  color: var(--text-muted, #64748b);
}

.valor-punto {
  font-weight: 700;
  color: var(--cardio, #e11d48);
}

.acciones-paso {
  display: flex;
  align-items: center;
  gap: 6px;
}

.input-fino {
  flex: 1;
  width: 60px;
  padding: 4px 6px;
  font-size: 0.85rem;
  font-weight: 600;
  border: 1px solid var(--border, #cbd5e1);
  border-radius: 4px;
  text-align: center;
  background: var(--bg-surface, #ffffff);
  color: var(--text, #0f172a);
}

.metricas-tramo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.duracion-grande {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text, #0f172a);
}

.bpm-tramo-destacado {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--cardio, #e11d48);
}

.fila-botones-corte {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  padding-top: 4px;
}
</style>

