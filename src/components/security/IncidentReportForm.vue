<script setup>
import { ref, computed } from 'vue'
import { useIsmsStore } from '@/stores/isms.js'
import { INCIDENT_TYPES, SEVERITIES, DESC_MAX, validateIncident } from '@/services/security/incidents.js'
import { notify } from '@/services/notifications/notifier.js'

/** A.16.1.2 / A.16.1.3: notificación de eventos y puntos débiles de seguridad (sin datos de salud). */
const isms = useIsmsStore()
const tipo = ref('debilidad')
const severidad = ref('media')
const descripcion = ref('')
const error = ref('')
const ocupado = ref(false)
const restantes = computed(() => DESC_MAX - descripcion.value.length)

async function enviar() {
  error.value = ''
  const draft = { tipo: tipo.value, severidad: severidad.value, descripcion: descripcion.value }
  const e = validateIncident(draft)
  if (e) return (error.value = e)
  ocupado.value = true
  try {
    await isms.report(draft)
    descripcion.value = ''
    notify('Notificación registrada. El administrador la evaluará.', { tipo: 'ok' })
  } catch (err) {
    error.value = err.message
  } finally {
    ocupado.value = false
  }
}
</script>

<template>
  <form class="card" aria-labelledby="inc-titulo" @submit.prevent="enviar">
    <h2 id="inc-titulo">Reportar un incidente o punto débil</h2>
    <p class="muted small">Se registra en la auditoría y, si hay nube, en la base de datos protegida. <strong>No incluyas datos de salud, nombres, RUT ni correos.</strong></p>
    <div class="grid cols-2">
      <div class="field">
        <label for="inc-tipo">Tipo</label>
        <select id="inc-tipo" v-model="tipo">
          <option v-for="(texto, id) in INCIDENT_TYPES" :key="id" :value="id">{{ texto }}</option>
        </select>
      </div>
      <div class="field">
        <label for="inc-sev">Severidad estimada</label>
        <select id="inc-sev" v-model="severidad">
          <option v-for="s in SEVERITIES" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label for="inc-desc">Qué observaste</label>
      <textarea id="inc-desc" v-model="descripcion" rows="4" :maxlength="DESC_MAX" required />
      <span class="muted small">{{ restantes }} caracteres disponibles</span>
    </div>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <button class="btn primary" type="submit" :disabled="ocupado">Enviar notificación</button>
  </form>
</template>

<style scoped>
textarea {
  width: 100%;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px;
  font: inherit;
}
</style>
