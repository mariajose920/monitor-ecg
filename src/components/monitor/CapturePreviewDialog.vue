<script setup>
import { ref, computed, watch } from 'vue'
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

// Porcentajes para la barra de línea de tiempo visual
const pctInicio = computed(() => {
  if (duracionTotal.value <= 0) return 0
  return Math.max(0, Math.min(100, (limiteInicio.value / duracionTotal.value) * 100))
})

const pctAncho = computed(() => {
  if (duracionTotal.value <= 0) return 100
  return Math.max(0, Math.min(100 - pctInicio.value, (duracionSeleccionada.value / duracionTotal.value) * 100))
})

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
    limiteInicio.value = Math.max(0, Number((limiteFin.value - 0.2).toFixed(1)))
  }
  recalcularBpmEstimado()
})

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
    limiteInicio.value = Math.max(0, Number((centro - 1.5).toFixed(1)))
    limiteFin.value = Math.min(tot, Number((centro + 1.5).toFixed(1)))
  } else if (tipo === 'ultimos') {
    limiteInicio.value = Math.max(0, Number((tot - 3).toFixed(1)))
    limiteFin.value = tot
  }
}

async function aplicarRecorte() {
  if (duracionSeleccionada.value < 0.3) {
    notify('El tramo a recortar debe ser de al menos 0.3 segundos.', { tipo: 'aviso' })
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
    notify(`¡Captura recortada! Segmento de ${res.ventanaSeg}s guardado (${res.bpm != null ? res.bpm + ' BPM' : 'BPM estimado'}).`, { tipo: 'ok' })
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
  <BaseDialog titulo="Captura de frecuencia cardíaca" ancho="920px" @cerrar="emit('cerrar')">
    <div class="cuerpo-captura">
      <div class="vista-previa-marco">
        <img
          :src="capturaActual.dataUrl"
          :alt="`Captura de señal ${capturaActual.usuario} - ${capturaActual.bpm ?? '--'} BPM`"
          class="img-captura"
        >
      </div>

      <div class="resumen-chips">
        <span class="chip info">
          <AppIcon name="user" :size="14" />
          <strong>{{ capturaActual.usuario || 'Participante' }}</strong>
        </span>
        <span class="chip cardio">
          <AppIcon name="heart" :size="14" filled />
          <strong>{{ capturaActual.bpm != null ? `${capturaActual.bpm} BPM` : '-- BPM' }}</strong>
          <span v-if="estaRecortado" class="tag-recortado">(tramo)</span>
        </span>
        <span class="chip neutral">
          <AppIcon name="activity" :size="14" />
          <span>{{ capturaActual.actividad }}</span>
        </span>
        <span class="chip neutral">
          <AppIcon name="clock" :size="14" />
          <span>{{ capturaActual.fecha }}</span>
        </span>
        <span v-if="estaRecortado" class="chip warn" title="La captura ha sido recortada al tramo seleccionado">
          <AppIcon name="scissors" :size="14" />
          <strong>Recorte: {{ capturaActual.recorte.inicioSeg }}s a {{ capturaActual.recorte.finSeg }}s ({{ capturaActual.recorte.duracionSeg }}s)</strong>
        </span>
      </div>

      <!-- Herramienta interactiva de selección de límites y recorte -->
      <section class="panel-recorte" aria-labelledby="titulo-herramienta-recorte">
        <div class="cabecera-recorte">
          <div class="titulo-con-icono">
            <AppIcon name="scissors" :size="16" />
            <h3 id="titulo-herramienta-recorte" class="subtitulo-recorte">
              Seleccionar límites para recortar la captura
            </h3>
          </div>
          <span class="badge-duracion">
            Total original: {{ duracionTotal }} s
          </span>
        </div>

        <p class="instruccion-recorte">
          Ajusta los límites inicial y final para aislar la frecuencia cardíaca del tramo que desees. La captura y el BPM se recalcularán automáticamente con el segmento seleccionado.
        </p>

        <!-- Barra visual interactiva de línea de tiempo -->
        <div class="timeline-visual" aria-hidden="true">
          <div class="timeline-pista">
            <div
              class="timeline-seleccion"
              :style="{ left: `${pctInicio}%`, width: `${pctAncho}%` }"
            >
              <span class="timeline-etiqueta inicio">{{ limiteInicio }}s</span>
              <span class="timeline-etiqueta fin">{{ limiteFin }}s</span>
            </div>
          </div>
          <div class="timeline-marcas">
            <span>0s</span>
            <span>{{ (duracionTotal * 0.25).toFixed(1) }}s</span>
            <span>{{ (duracionTotal * 0.5).toFixed(1) }}s</span>
            <span>{{ (duracionTotal * 0.75).toFixed(1) }}s</span>
            <span>{{ duracionTotal }}s</span>
          </div>
        </div>

        <!-- Controles deslizantes de los dos límites -->
        <div class="grid-limites">
          <div class="control-limite">
            <div class="etiqueta-fila">
              <label for="limite-inicio">
                <strong>Límite inicial (Desde):</strong>
              </label>
              <span class="valor-limite">{{ limiteInicio }} s</span>
            </div>
            <div class="slider-con-input">
              <input
                id="limite-inicio"
                v-model.number="limiteInicio"
                type="range"
                min="0"
                :max="duracionTotal"
                step="0.1"
                class="slider-rango"
              >
              <input
                v-model.number="limiteInicio"
                type="number"
                min="0"
                :max="duracionTotal"
                step="0.1"
                class="input-numero"
                aria-label="Límite inicial en segundos"
              >
            </div>
          </div>

          <div class="control-limite">
            <div class="etiqueta-fila">
              <label for="limite-fin">
                <strong>Límite final (Hasta):</strong>
              </label>
              <span class="valor-limite">{{ limiteFin }} s</span>
            </div>
            <div class="slider-con-input">
              <input
                id="limite-fin"
                v-model.number="limiteFin"
                type="range"
                min="0"
                :max="duracionTotal"
                step="0.1"
                class="slider-rango"
              >
              <input
                v-model.number="limiteFin"
                type="number"
                min="0"
                :max="duracionTotal"
                step="0.1"
                class="input-numero"
                aria-label="Límite final en segundos"
              >
            </div>
          </div>
        </div>

        <!-- Botones de selección rápida y datos del tramo -->
        <div class="fila-meta-recorte">
          <div class="presets-recorte">
            <span class="label-presets">Atajos:</span>
            <button class="btn small ghost" type="button" @click="aplicarPreset('todo')">Todo ({{ duracionTotal }}s)</button>
            <button class="btn small ghost" type="button" @click="aplicarPreset('primeros')">Primeros 3s</button>
            <button class="btn small ghost" type="button" @click="aplicarPreset('centro')">Centro 3s</button>
            <button class="btn small ghost" type="button" @click="aplicarPreset('ultimos')">Últimos 3s</button>
          </div>

          <div class="resumen-seleccion">
            <span class="duracion-recorte">
              Duración tramo: <strong>{{ duracionSeleccionada }} s</strong>
            </span>
            <span class="bpm-recorte">
              BPM estimado: <strong>{{ bpmEstimado != null ? `${bpmEstimado} BPM` : '-- BPM' }}</strong>
            </span>
          </div>
        </div>

        <div class="acciones-recorte">
          <button
            class="btn cardio"
            type="button"
            :disabled="procesandoRecorte"
            @click="aplicarRecorte"
          >
            <AppIcon name="scissors" :size="16" />
            <span>{{ estaRecortado ? 'Actualizar recorte' : 'Recortar y aplicar a la captura' }}</span>
          </button>

          <button
            v-if="estaRecortado || limitesModificados"
            class="btn ghost"
            type="button"
            @click="restablecerOriginal"
          >
            <AppIcon name="rotate-ccw" :size="16" />
            <span>Restablecer captura completa</span>
          </button>
        </div>
      </section>

      <p class="hint small">
        Esta captura {{ estaRecortado ? 'muestra el tramo recortado' : 'incluye los últimos ' + (capturaActual.ventanaSeg || 8) + ' segundos' }} de bioseñal con cuadrícula médica y cálculo de frecuencia cardíaca de alta resolución.
      </p>
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
        {{ estaRecortado ? 'Descargar imagen recortada (PNG)' : 'Descargar imagen (PNG)' }}
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

.vista-previa-marco {
  width: 100%;
  border-radius: var(--radius);
  overflow: hidden;
  border: 1px solid var(--border);
  background: #ffffff;
  box-shadow: var(--shadow);
}

.img-captura {
  display: block;
  width: 100%;
  height: auto;
}

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

/* Panel de recorte */
.panel-recorte {
  background: var(--bg-elev, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: var(--radius, 10px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cabecera-recorte {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.titulo-con-icono {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text, #0f172a);
}

.subtitulo-recorte {
  font-size: 0.96rem;
  font-weight: 700;
  margin: 0;
}

.badge-duracion {
  font-size: 0.78rem;
  color: var(--text-muted, #64748b);
  background: var(--bg-elev-2, rgba(0, 0, 0, 0.05));
  padding: 2px 8px;
  border-radius: 12px;
}

.instruccion-recorte {
  font-size: 0.85rem;
  color: var(--text-muted, #64748b);
  margin: 0;
  line-height: 1.4;
}

/* Barra interactiva de línea de tiempo */
.timeline-visual {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 0;
}

.timeline-pista {
  position: relative;
  width: 100%;
  height: 24px;
  background: var(--bg-elev-2, #e2e8f0);
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border, #cbd5e1);
}

.timeline-seleccion {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(225, 29, 72, 0.22);
  border-left: 3px solid var(--cardio, #e11d48);
  border-right: 3px solid var(--cardio, #e11d48);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
  box-sizing: border-box;
  transition: left 0.08s ease, width 0.08s ease;
}

.timeline-etiqueta {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--cardio, #e11d48);
  background: rgba(255, 255, 255, 0.9);
  padding: 1px 4px;
  border-radius: 3px;
  white-space: nowrap;
}

.timeline-marcas {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: var(--text-muted, #94a3b8);
  padding: 0 2px;
}

/* Grid con los dos controles de límites */
.grid-limites {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 640px) {
  .grid-limites {
    grid-template-columns: 1fr;
  }
}

.control-limite {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.etiqueta-fila {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
}

.valor-limite {
  font-weight: 700;
  color: var(--cardio, #e11d48);
}

.slider-con-input {
  display: flex;
  align-items: center;
  gap: 10px;
}

.slider-rango {
  flex: 1;
  cursor: pointer;
  accent-color: var(--cardio, #e11d48);
}

.input-numero {
  width: 68px;
  padding: 4px 6px;
  font-size: 0.85rem;
  border: 1px solid var(--border, #cbd5e1);
  border-radius: var(--radius-sm, 6px);
  background: var(--bg-surface, #ffffff);
  color: var(--text, #0f172a);
  text-align: right;
}

/* Meta y presets */
.fila-meta-recorte {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 4px 0;
}

.presets-recorte {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.label-presets {
  font-size: 0.78rem;
  color: var(--text-muted, #64748b);
  margin-right: 2px;
}

.resumen-seleccion {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.85rem;
}

.duracion-recorte strong,
.bpm-recorte strong {
  color: var(--cardio, #e11d48);
}

.acciones-recorte {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 4px;
}
</style>
