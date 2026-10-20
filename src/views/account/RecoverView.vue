<script setup>
import { ref } from 'vue'
import { useAccountStore } from '@/stores/account.js'
import { AuthError } from '@/services/accounts/authService.js'

/** Recuperar contraseña: respuesta siempre genérica (no revela si el correo existe). */
const cuenta = useAccountStore()
const correo = ref('')
const error = ref('')
const exito = ref('')
const ocupado = ref(false)

async function enviar() {
  error.value = ''
  ocupado.value = true
  try {
    exito.value = await cuenta.recuperar(correo.value)
  } catch (e) {
    error.value = e instanceof AuthError ? e.message : 'No se pudo enviar el mensaje. Inténtalo de nuevo.'
  } finally {
    ocupado.value = false
  }
}
</script>

<template>
  <section class="auth-card card" aria-labelledby="rec-titulo">
    <h1 id="rec-titulo">Recuperar contraseña</h1>
    <p v-if="exito" class="alert ok" role="status" data-testid="recuperar-ok">{{ exito }}</p>
    <form v-else novalidate data-testid="form-recuperar" @submit.prevent="enviar">
      <div class="field">
        <label for="rec-correo">Correo de tu cuenta</label>
        <input id="rec-correo" v-model="correo" type="email" inputmode="email" autocomplete="email" maxlength="254" :aria-invalid="!!error" aria-describedby="rec-err">
        <p id="rec-err" class="error-text" role="alert">{{ error }}</p>
      </div>
      <button type="submit" class="btn primary block" :disabled="ocupado">Enviar enlace</button>
    </form>
    <p class="links"><RouterLink to="/acceso">Volver a iniciar sesión</RouterLink></p>
  </section>
</template>

<style scoped>
.auth-card { max-width: 460px; margin: 16px auto; }
.block { width: 100%; }
.links { margin-top: 16px; }
</style>
