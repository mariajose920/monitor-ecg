<script setup>
import { ref } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { renovacion, enviarCodigoRenovacion, cancelarRenovacion } from '@/services/security/adminRenovacion.js'

/**
 * Pide un código TOTP nuevo cuando el servidor deja de reconocer los privilegios de administrador (el segundo factor
 * tiene más de 15 min, C-05). Se monta una vez en cada vista de administración; se muestra solo cuando hace falta.
 */
const codigo = ref('')

async function enviar() {
  const v = codigo.value
  codigo.value = ''
  await enviarCodigoRenovacion(v)
}
</script>

<template>
  <BaseDialog v-if="renovacion.abierta" titulo="Renueva tu segundo factor" @cerrar="cancelarRenovacion">
    <p>Por seguridad, los privilegios de administrador caducan en el servidor a los 15 minutos de la última verificación. Escribe un código nuevo de tu aplicación de autenticación para continuar.</p>
    <form data-testid="form-renovar-totp" @submit.prevent="enviar">
      <div class="field">
        <label for="renovar-totp">Código de 6 dígitos</label>
        <input id="renovar-totp" v-model="codigo" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required>
      </div>
      <p v-if="renovacion.error" class="error-text" role="alert">{{ renovacion.error }}</p>
      <div class="row">
        <button type="button" class="btn" @click="cancelarRenovacion">Cancelar</button>
        <button type="submit" class="btn primary" :disabled="renovacion.ocupado || !codigo">Verificar y continuar</button>
      </div>
    </form>
  </BaseDialog>
</template>
