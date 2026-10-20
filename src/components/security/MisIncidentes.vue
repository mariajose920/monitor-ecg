<script setup>
import { computed, onMounted, ref } from 'vue'
import { useIsmsStore } from '@/stores/isms.js'
import { INCIDENT_TYPES } from '@/services/security/incidents.js'
import { formatFecha } from '@/utils/time.js'
import { notify } from '@/services/notifications/notifier.js'

/** C-09: la persona que reportó ve el estado y la respuesta del administrador (sincronizados desde la nube). */
const isms = useIsmsStore()
const actualizando = ref(false)
const lista = computed(() => [...isms.incidentes].reverse())

onMounted(() => isms.ensureLoaded())

async function actualizar() {
  actualizando.value = true
  try {
    const ok = await isms.sincronizarNube()
    if (!ok) notify('Sin conexión con la nube: se muestra lo guardado en este equipo.', { tipo: 'aviso' })
  } catch {
    notify('No se pudo actualizar el estado.', { tipo: 'error' })
  } finally {
    actualizando.value = false
  }
}
</script>

<template>
  <section v-if="lista.length" class="card" aria-labelledby="mis-inc-titulo" data-testid="mis-incidentes">
    <div class="row titulo">
      <h2 id="mis-inc-titulo">Mis notificaciones</h2>
      <button class="btn small" :disabled="actualizando" @click="actualizar">Actualizar estado</button>
    </div>
    <article v-for="inc in lista" :key="inc.id" class="incidente">
      <div class="row">
        <strong>{{ INCIDENT_TYPES[inc.tipo] }}</strong>
        <span class="chip neutral" data-testid="estado-incidente">{{ inc.estado.replace('_', ' ') }}</span>
        <span class="muted small">{{ formatFecha(inc.creadoUtc) }}</span>
      </div>
      <p v-if="inc.respuesta" class="small"><strong>Respuesta del administrador:</strong> {{ inc.respuesta }}</p>
    </article>
  </section>
</template>

<style scoped>
.titulo {
  justify-content: space-between;
}

.incidente {
  border-top: 1px solid var(--border);
  padding: 8px 0;
}
</style>
