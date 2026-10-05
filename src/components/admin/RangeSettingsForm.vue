<script setup>
import { ref, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings.js'
import { ACTIVIDADES } from '@/data/activities.js'
import { validarParametros, BPM_LIMITE_MIN, BPM_LIMITE_MAX } from '@/data/defaultSettings.js'
import { notify } from '@/services/notifications/notifier.js'

/** RF15/RF26: mín./máx. global y por actividad + parámetros de alertas y adquisición. Auditado. */
const settings = useSettingsStore()
const form = ref(null)
const error = ref('')

function cargar() {
  form.value = JSON.parse(JSON.stringify(settings.parametros))
}
watch(() => settings.parametros, cargar, { immediate: true })

function aEntero(obj, k) {
  obj[k] = Number.parseInt(String(obj[k]), 10)
}

async function guardar() {
  error.value = ''
  const p = form.value
  aEntero(p.bpm.global, 'min')
  aEntero(p.bpm.global, 'max')
  for (const a of ACTIVIDADES) {
    aEntero(p.bpm.porActividad[a.id], 'min')
    aEntero(p.bpm.porActividad[a.id], 'max')
  }
  p.alertas.duracionMinMs = Math.round(Number(p.alertas.duracionMinMs))
  aEntero(p.alertas, 'histeresisBpm')
  const e = validarParametros(p)
  if (e) {
    error.value = e
    return
  }
  try {
    await settings.setParametros(p)
    notify('Parámetros guardados y auditados.', { tipo: 'ok' })
  } catch (err) {
    error.value = err.message
  }
}
</script>

<template>
  <form v-if="form" class="card" novalidate @submit.prevent="guardar">
    <h2>Rangos de evaluación (RF15/RF26)</h2>
    <p class="muted small">Enteros con {{ BPM_LIMITE_MIN }} ≤ mín. &lt; máx. ≤ {{ BPM_LIMITE_MAX }} BPM.</p>

    <fieldset class="grupo">
      <legend>Global</legend>
      <div class="grid cols-2">
        <div class="field"><label for="g-min">Mínimo</label><input id="g-min" v-model="form.bpm.global.min" type="number" :min="BPM_LIMITE_MIN" :max="BPM_LIMITE_MAX" step="1"></div>
        <div class="field"><label for="g-max">Máximo</label><input id="g-max" v-model="form.bpm.global.max" type="number" :min="BPM_LIMITE_MIN" :max="BPM_LIMITE_MAX" step="1"></div>
      </div>
    </fieldset>

    <label class="check"><input v-model="form.bpm.usarPorActividad" type="checkbox"> Usar rangos por actividad (si no, se usa el global)</label>

    <fieldset v-if="form.bpm.usarPorActividad" class="grupo">
      <legend>Por actividad</legend>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Actividad</th><th>Mín.</th><th>Máx.</th></tr></thead>
          <tbody>
            <tr v-for="a in ACTIVIDADES" :key="a.id">
              <td>{{ a.nombre }}</td>
              <td><input v-model="form.bpm.porActividad[a.id].min" type="number" :aria-label="`Mínimo ${a.nombre}`" step="1"></td>
              <td><input v-model="form.bpm.porActividad[a.id].max" type="number" :aria-label="`Máximo ${a.nombre}`" step="1"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </fieldset>

    <fieldset class="grupo">
      <legend>Evaluación y alertas (RF16/RF20)</legend>
      <div class="grid cols-2">
        <div class="field">
          <label for="fuente-bpm">BPM evaluado</label>
          <select id="fuente-bpm" v-model="form.bpm.fuenteBpm">
            <option value="calculado">Calculado en la app</option>
            <option value="dispositivo">Enviado por el dispositivo</option>
          </select>
        </div>
        <div class="field">
          <label for="dur">Duración mínima fuera de rango (ms)</label>
          <input id="dur" v-model.number="form.alertas.duracionMinMs" type="number" min="0" max="60000" step="500">
        </div>
        <div class="field">
          <label for="hist">Histéresis (BPM)</label>
          <input id="hist" v-model="form.alertas.histeresisBpm" type="number" min="0" max="20" step="1">
        </div>
        <label class="check"><input v-model="form.alertas.sonido" type="checkbox"> Sonido en las alertas</label>
      </div>
    </fieldset>

    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <div class="row">
      <button class="btn primary" type="submit">Guardar parámetros</button>
      <button class="btn ghost" type="button" @click="cargar">Descartar cambios</button>
    </div>
  </form>
</template>

<style scoped>
.grupo {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin: 12px 0;
}

legend {
  font-weight: 700;
  padding: 0 6px;
}

td input {
  max-width: 110px;
}
</style>
