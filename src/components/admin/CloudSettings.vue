<script setup>
import { ref, onMounted } from 'vue'
import { cloudEnabled, cloudEstado, cloudAdmin, ensureCloudSession } from '@/services/cloud/cloudSync.js'
import { useSettingsStore } from '@/stores/settings.js'
import { useAccountStore } from '@/stores/account.js'
import { notify } from '@/services/notifications/notifier.js'

/**
 * Estado de la nube. No hay inicio de sesión aparte: el administrador es la cuenta con la que se
 * entró en /acceso + segundo factor TOTP (A.9.4.2); los privilegios los impone el servidor (es_admin()).
 */
const settings = useSettingsStore()
const cuenta = useAccountStore()
const ocupado = ref(false)
// Vuelve a consultar al servidor el nivel aal2 (puede haber cambiado tras verificar el TOTP).
onMounted(() => { ensureCloudSession() })

async function publicar() {
  ocupado.value = true
  try {
    const ok = await settings.publicarEnNube()
    notify(ok ? 'Configuración publicada para todos los equipos.' : 'No se pudo publicar la configuración.', { tipo: ok ? 'ok' : 'error' })
  } finally {
    ocupado.value = false
  }
}
</script>

<template>
  <div class="card">
    <h2>Base de datos en la nube (Supabase)</h2>
    <p v-if="!cloudEnabled" class="muted">
      La nube no está configurada: define <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>.
      La app funciona solo con almacenamiento local cifrado y el administrador local con PIN.
    </p>
    <template v-else>
      <p class="muted small">
        Estado: <strong>{{ cloudEstado }}</strong> · Cuenta: <strong>{{ cuenta.cuenta?.email || '—' }}</strong> ·
        Privilegios en el servidor: <strong>{{ cloudAdmin ? 'administrador (aal2)' : 'sin privilegios' }}</strong>
      </p>
      <p class="muted small">
        Las sesiones de medición se copian a la nube con identificadores seudonimizados. Para publicar los parámetros
        a todos los equipos hacen falta privilegios de administrador (rol asignado + segundo factor).
      </p>
      <button class="btn" :disabled="ocupado || !cloudAdmin" @click="publicar">Publicar configuración ahora</button>
    </template>
  </div>
</template>
