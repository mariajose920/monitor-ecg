<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAccountStore } from '@/stores/account.js'
import { AuthError } from '@/services/accounts/authService.js'
import { notify } from '@/services/notifications/notifier.js'
import { safeRedirect, ACCESO_REDIRECT_WHITELIST } from '@/router/guards.js'

/** Inicio de sesión (Supabase Auth). Errores genéricos: no revela si el correo existe (A.9.4.2). */
const cuenta = useAccountStore()
const router = useRouter()
const route = useRoute()
const form = reactive({ correo: '', password: '' })
const errores = ref({})
const mensaje = ref('')
const ocupado = ref(false)

async function enviar() {
  mensaje.value = ''
  errores.value = {}
  ocupado.value = true
  try {
    await cuenta.iniciarSesion({ ...form })
    notify('Sesión iniciada.', { tipo: 'ok' })
    // Lista blanca: sin open redirect. Si el destino es el panel admin, el guard exige el segundo factor.
    router.push({ name: safeRedirect(route.query.redirect, ACCESO_REDIRECT_WHITELIST, 'pacientes') })
  } catch (e) {
    if (e instanceof AuthError) {
      errores.value = e.campos
      mensaje.value = e.message
    } else mensaje.value = 'No se pudo iniciar sesión. Inténtalo de nuevo.'
  } finally {
    form.password = ''
    ocupado.value = false
  }
}
</script>

<template>
  <section class="auth-card card" aria-labelledby="acceso-titulo">
    <h1 id="acceso-titulo">Iniciar sesión</h1>
    <p class="muted">Con tu cuenta administras tus propios pacientes y tus monitoreos, que quedan guardados en la nube y solo tú puedes ver (salvo los que decidas publicar).</p>

    <p v-if="cuenta.iniciada" class="alert info" role="status">
      Ya tienes la sesión iniciada como <strong>{{ cuenta.cuenta.email }}</strong>. <RouterLink to="/pacientes">Ir a mis pacientes</RouterLink>
    </p>

    <form v-else novalidate data-testid="form-acceso" @submit.prevent="enviar">
      <div class="field">
        <label for="acc-correo">Correo</label>
        <input id="acc-correo" v-model="form.correo" type="email" inputmode="email" autocomplete="username" maxlength="254" :aria-invalid="!!errores.correo" aria-describedby="acc-correo-err">
        <p id="acc-correo-err" class="error-text" role="alert">{{ errores.correo }}</p>
      </div>
      <div class="field">
        <label for="acc-pass">Contraseña</label>
        <input id="acc-pass" v-model="form.password" type="password" autocomplete="current-password" maxlength="128" :aria-invalid="!!errores.password" aria-describedby="acc-pass-err">
        <p id="acc-pass-err" class="error-text" role="alert">{{ errores.password }}</p>
      </div>
      <p v-if="mensaje && !Object.keys(errores).length" class="alert danger" role="alert" data-testid="error-acceso">{{ mensaje }}</p>
      <button type="submit" class="btn primary block" :disabled="ocupado">Iniciar sesión</button>
    </form>

    <ul class="links">
      <li><RouterLink to="/recuperar">¿Olvidaste tu contraseña?</RouterLink></li>
      <li><RouterLink to="/registro">Crear una cuenta</RouterLink></li>
      <li><RouterLink to="/pacientes" data-testid="usar-sin-cuenta">Usar sin cuenta (solo en este dispositivo)</RouterLink></li>
    </ul>
    <p class="hint">Sin cuenta todo queda cifrado en este navegador y no se sube nada a la nube. <RouterLink to="/privacidad">Aviso de privacidad</RouterLink>.</p>
  </section>
</template>

<style scoped>
.auth-card { max-width: 460px; margin: 16px auto; }
.block { width: 100%; }
.links { list-style: none; padding: 0; margin: 16px 0 8px; display: grid; gap: 8px; }
.links a { display: inline-block; padding: 6px 0; }
</style>
