<script setup>
import { ref } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { useAuthStore } from '@/stores/auth.js'

/**
 * Reautenticación (SEC-11, A.9.4.2). Con nube pide un NUEVO código TOTP de 6 dígitos; sin nube, el PIN local.
 * El secreto nunca se guarda: se pasa al callback y se descarta.
 */
defineProps({
  titulo: { type: String, default: 'Confirma tu identidad' },
  mensaje: { type: String, default: '' },
  accion: { type: String, default: 'Confirmar' },
  peligro: { type: Boolean, default: false },
  ocupado: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['confirmar', 'cancelar'])
const totp = useAuthStore().metodoReauth === 'totp'
const pin = ref('')

function enviar() {
  const v = pin.value
  pin.value = ''
  emit('confirmar', v)
}
</script>

<template>
  <BaseDialog :titulo="titulo" @cerrar="emit('cancelar')">
    <p v-if="mensaje">{{ mensaje }}</p>
    <slot />
    <form @submit.prevent="enviar">
      <div class="field">
        <label for="reauth-pin">{{ totp ? 'Código de 6 dígitos de tu aplicación de autenticación' : 'PIN de administrador' }}</label>
        <input v-if="totp" id="reauth-pin" v-model="pin" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required>
        <input v-else id="reauth-pin" v-model="pin" type="password" autocomplete="current-password" required>
      </div>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <div class="row">
        <button type="button" class="btn" @click="emit('cancelar')">Cancelar</button>
        <button type="submit" :class="['btn', peligro ? 'danger' : 'primary']" :disabled="ocupado || !pin">{{ accion }}</button>
      </div>
    </form>
  </BaseDialog>
</template>
