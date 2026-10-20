<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAccountStore } from '@/stores/account.js'
import { AuthError } from '@/services/accounts/authService.js'
import { PASSWORD_MIN } from '@/services/accounts/validation.js'
import { notify } from '@/services/notifications/notifier.js'

/** Fija una nueva contraseña tras abrir el enlace del correo (evento PASSWORD_RECOVERY de supabase-js). */
const cuenta = useAccountStore()
const router = useRouter()
const form = reactive({ password: '', confirmar: '' })
const errores = ref({})
const mensaje = ref('')
const ocupado = ref(false)

async function enviar() {
  mensaje.value = ''
  errores.value = {}
  ocupado.value = true
  try {
    await cuenta.fijarPassword(form.password, form.confirmar)
    notify('Contraseña actualizada.', { tipo: 'ok' })
    router.push('/pacientes')
  } catch (e) {
    if (e instanceof AuthError) {
      errores.value = e.campos
      mensaje.value = e.message
    } else mensaje.value = 'No se pudo cambiar la contraseña.'
  } finally {
    form.password = ''
    form.confirmar = ''
    ocupado.value = false
  }
}
</script>

<template>
  <section class="auth-card card" aria-labelledby="rst-titulo">
    <h1 id="rst-titulo">Nueva contraseña</h1>
    <p v-if="!cuenta.iniciada" class="alert warn" role="status" data-testid="restablecer-sin-enlace">
      Para fijar una nueva contraseña abre el enlace que te enviamos por correo. <RouterLink to="/recuperar">Solicitar un enlace nuevo</RouterLink>
    </p>
    <form v-else novalidate data-testid="form-restablecer" @submit.prevent="enviar">
      <div class="field">
        <label for="rst-pass">Nueva contraseña</label>
        <input id="rst-pass" v-model="form.password" type="password" autocomplete="new-password" maxlength="72" :aria-invalid="!!errores.password" aria-describedby="rst-ayuda rst-err">
        <p id="rst-ayuda" class="hint">Mínimo {{ PASSWORD_MIN }} caracteres, con letras y números.</p>
        <p id="rst-err" class="error-text" role="alert">{{ errores.password }}</p>
      </div>
      <div class="field">
        <label for="rst-conf">Repite la contraseña</label>
        <input id="rst-conf" v-model="form.confirmar" type="password" autocomplete="new-password" maxlength="72" :aria-invalid="!!errores.confirmar" aria-describedby="rst-conf-err">
        <p id="rst-conf-err" class="error-text" role="alert">{{ errores.confirmar }}</p>
      </div>
      <p v-if="mensaje && !Object.keys(errores).length" class="alert danger" role="alert">{{ mensaje }}</p>
      <button type="submit" class="btn primary block" :disabled="ocupado">Guardar contraseña</button>
    </form>
  </section>
</template>

<style scoped>
.auth-card { max-width: 460px; margin: 16px auto; }
.block { width: 100%; }
</style>
