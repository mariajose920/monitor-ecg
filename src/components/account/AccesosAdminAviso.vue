<script setup>
import { ref, onMounted } from 'vue'
import { fetchMisAccesosAdmin, cloudEnabled } from '@/services/cloud/cloudSync.js'
import { useAccountStore } from '@/stores/account.js'
import { formatFecha } from '@/utils/time.js'

/**
 * Transparencia (C-06): si un administrador leyó datos de una sesión tuya con acceso excepcional, aquí se ve cuándo y por qué.
 * No se muestra quién fue. Solo aparece si hubo accesos.
 */
const cuenta = useAccountStore()
const accesos = ref([])

onMounted(async () => {
  if (!cloudEnabled || !cuenta.iniciada) return
  try {
    accesos.value = await fetchMisAccesosAdmin()
  } catch {
    accesos.value = []
  }
})
</script>

<template>
  <section v-if="accesos.length" class="alert warn" role="status" aria-labelledby="accesos-adm-titulo" data-testid="accesos-admin">
    <h2 id="accesos-adm-titulo">Acceso excepcional a tus datos</h2>
    <p class="small">Un administrador leyó datos de alguna de tus sesiones de la nube. Solo ocurre con un motivo escrito y queda registrado. Si no lo esperabas, reporta un incidente en <RouterLink to="/seguridad">Seguridad</RouterLink>.</p>
    <ul class="small">
      <li v-for="(a, i) in accesos" :key="i">{{ formatFecha(a.creado_en) }}: «{{ a.motivo }}»</li>
    </ul>
  </section>
</template>
