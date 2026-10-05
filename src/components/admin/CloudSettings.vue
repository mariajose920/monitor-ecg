<script setup>
import { ref } from 'vue'
import { cloudEnabled, cloudEstado, cloudAdmin, cloudAdminLogin, cloudAdminLogout } from '@/services/cloud/cloudSync.js'
import { useSettingsStore } from '@/stores/settings.js'
import { audit } from '@/services/audit/auditService.js'
import { notify } from '@/services/notifications/notifier.js'

/**
 * Cuenta de administrador en Supabase (8.5: autenticación real en el servidor).
 * Con esta sesión iniciada, los cambios de parámetros se publican para todos los equipos.
 */
const settings = useSettingsStore()
const email = ref('')
const password = ref('')
const error = ref('')
const ocupado = ref(false)

async function entrar() {
  error.value = ''
  ocupado.value = true
  try {
    await cloudAdminLogin(email.value.trim(), password.value)
    await audit('CLOUD_ADMIN_LOGIN', 'admin', {})
    const ok = await settings.publicarEnNube()
    notify(ok ? 'Sesión de nube iniciada. Configuración publicada.' : 'Sesión de nube iniciada.', { tipo: 'ok' })
  } catch (e) {
    error.value = e.message
  } finally {
    password.value = ''
    ocupado.value = false
  }
}

async function salir() {
  await cloudAdminLogout()
  await audit('CLOUD_ADMIN_LOGOUT', 'admin', {})
}
</script>

<template>
  <div class="card">
    <h2>Base de datos en la nube (Supabase)</h2>
    <p v-if="!cloudEnabled" class="muted">
      La nube no está configurada: define <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>.
      La app funciona solo con almacenamiento local cifrado.
    </p>
    <template v-else>
      <p class="muted small">Estado: <strong>{{ cloudEstado }}</strong> · Rol en la nube: <strong>{{ cloudAdmin ? 'administrador' : 'participante (anónimo)' }}</strong></p>
      <p class="muted small">
        Las sesiones de medición se copian automáticamente a la nube con identificadores seudonimizados.
        Para publicar los parámetros a todos los equipos, inicia sesión con la cuenta de administrador de Supabase.
      </p>
      <form v-if="!cloudAdmin" class="stack" autocomplete="on" @submit.prevent="entrar">
        <label>Correo <input v-model="email" type="email" required maxlength="120" autocomplete="username" /></label>
        <label>Contraseña <input v-model="password" type="password" required minlength="8" maxlength="128" autocomplete="current-password" /></label>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <button class="btn primary" :disabled="ocupado">Iniciar sesión en la nube</button>
      </form>
      <button v-else class="btn" @click="salir">Cerrar sesión de nube</button>
    </template>
  </div>
</template>
