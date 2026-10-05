<script setup>
import { ref, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings.js'
import { SYNC_METODOS, SYNC_NOMBRES, validarSincronizacion } from '@/data/defaultSettings.js'
import { notify } from '@/services/notifications/notifier.js'

/** RF27: método de sincronización por defecto (enum cerrado, SEC-36). Auditado. */
const settings = useSettingsStore()
const form = ref(null)
const error = ref('')

function cargar() {
  form.value = JSON.parse(JSON.stringify(settings.sincronizacion))
}
watch(() => settings.sincronizacion, cargar, { immediate: true })

async function guardar() {
  error.value = ''
  form.value.xcorr.maxLagMs = Number.parseInt(String(form.value.xcorr.maxLagMs), 10)
  const e = validarSincronizacion(form.value)
  if (e) return (error.value = e)
  try {
    await settings.setSincronizacion(form.value)
    notify('Configuración de sincronización guardada y auditada.', { tipo: 'ok' })
  } catch (err) {
    error.value = err.message
  }
}
</script>

<template>
  <form v-if="form" class="card" @submit.prevent="guardar">
    <h2>Sincronización de señales (RF27)</h2>
    <div class="field">
      <label for="sync-def">Método por defecto</label>
      <select id="sync-def" v-model="form.metodoPorDefecto">
        <option v-for="m in SYNC_METODOS" :key="m" :value="m">{{ SYNC_NOMBRES[m] }}</option>
      </select>
    </div>
    <label class="check"><input v-model="form.permitirCambioUsuario" type="checkbox"> Permitir que el participante cambie el método en la vista Comparar</label>
    <div class="field">
      <label for="maxlag">Retardo máximo de búsqueda (ms)</label>
      <input id="maxlag" v-model="form.xcorr.maxLagMs" type="number" min="50" max="3000" step="50">
    </div>
    <div class="field">
      <label for="norm">Normalización</label>
      <select id="norm" v-model="form.normalizacion">
        <option value="zscore">z-score (media 0, desviación 1)</option>
        <option value="minmax">min-max (0 a 1)</option>
      </select>
    </div>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <button class="btn primary" type="submit">Guardar sincronización</button>
  </form>
</template>
