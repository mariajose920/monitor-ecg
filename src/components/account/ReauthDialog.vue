<script setup>
import { ref } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { useAccountStore } from '@/stores/account.js'

/** C-13: pide la contraseña ACTUAL antes de una acción sensible. La contraseña no se guarda; la ventana de 5 min vive en memoria. */
defineProps({ titulo: { type: String, default: 'Confirma tu contraseña' }, texto: { type: String, default: 'Por seguridad, escribe tu contraseña actual para continuar.' } })
const emit = defineEmits(['ok', 'cerrar'])
const cuenta = useAccountStore()
const password = ref('')
const error = ref('')
const ocupado = ref(false)

async function confirmar() {
  error.value = ''
  ocupado.value = true
  try {
    await cuenta.reautenticar(password.value)
    password.value = ''
    emit('ok')
  } catch (e) {
    error.value = e.message || 'No se pudo verificar la contraseña.'
  } finally {
    ocupado.value = false
    password.value = ''
  }
}
</script>

<template>
  <BaseDialog :titulo="titulo" ancho="460px" @cerrar="emit('cerrar')">
    <form id="form-reauth" novalidate @submit.prevent="confirmar">
      <p>{{ texto }}</p>
      <div class="field">
        <label for="reauth-pass">Contraseña actual</label>
        <input id="reauth-pass" v-model="password" type="password" autocomplete="current-password" maxlength="128" data-testid="reauth-password">
        <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      </div>
    </form>
    <template #acciones>
      <button class="btn" type="button" @click="emit('cerrar')">Cancelar</button>
      <button class="btn primary" type="submit" form="form-reauth" :disabled="ocupado" data-testid="reauth-confirmar">Confirmar</button>
    </template>
  </BaseDialog>
</template>
