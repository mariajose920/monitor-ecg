<script setup>
import { ref } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { descargarBlob, copiarAlPortapapeles } from '@/services/report/snapshotService.js'
import { notify } from '@/services/notifications/notifier.js'

const props = defineProps({
  captura: { type: Object, required: true },
})

const emit = defineEmits(['cerrar'])

const copiado = ref(false)

function descargar() {
  try {
    descargarBlob(props.captura.blob, props.captura.filename)
    notify(`Captura descargada: ${props.captura.filename}`, { tipo: 'ok' })
  } catch (err) {
    notify(err.message || 'No se pudo descargar la captura.', { tipo: 'error' })
  }
}

async function copiar() {
  try {
    await copiarAlPortapapeles(props.captura.blob)
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
  <BaseDialog titulo="Captura de frecuencia cardíaca" ancho="880px" @cerrar="emit('cerrar')">
    <div class="cuerpo-captura">
      <div class="vista-previa-marco">
        <img :src="captura.dataUrl" :alt="`Captura de señal ${captura.usuario} - ${captura.bpm ?? '--'} BPM`" class="img-captura">
      </div>

      <div class="resumen-chips">
        <span class="chip info">
          <AppIcon name="user" :size="14" />
          <strong>{{ captura.usuario || 'Participante' }}</strong>
        </span>
        <span class="chip cardio">
          <AppIcon name="heart" :size="14" filled />
          <strong>{{ captura.bpm != null ? `${captura.bpm} BPM` : '-- BPM' }}</strong>
        </span>
        <span class="chip neutral">
          <AppIcon name="activity" :size="14" />
          <span>{{ captura.actividad }}</span>
        </span>
        <span class="chip neutral">
          <AppIcon name="clock" :size="14" />
          <span>{{ captura.fecha }}</span>
        </span>
      </div>
      <p class="hint small">
        Esta captura incluye la traza exacta de los últimos {{ captura.ventanaSeg || 8 }} segundos de bioseñal con cuadrícula médica y parámetros en alta resolución.
      </p>
    </div>

    <template #acciones>
      <button class="btn secondary" type="button" @click="copiar">
        <AppIcon :name="copiado ? 'check' : 'clipboard'" :size="16" />
        {{ copiado ? '¡Copiado!' : 'Copiar al portapapeles' }}
      </button>
      <button class="btn cardio" type="button" @click="descargar">
        <AppIcon name="download" :size="16" />
        Descargar imagen (PNG)
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
}
</style>
