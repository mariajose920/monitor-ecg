<script setup>
import { reactive, ref } from 'vue'
import { useAccountStore } from '@/stores/account.js'
import { AuthError } from '@/services/accounts/authService.js'
import { PASSWORD_MIN } from '@/services/accounts/validation.js'
import { captchaEnabled } from '@/services/cloud/captcha.js'

/** Crear cuenta: correo + contraseña (≥ 10) y aviso de confirmación por correo. */
const cuenta = useAccountStore()
const form = reactive({ correo: '', password: '', confirmar: '', acepta: false, mayorEdad: false })
const errores = ref({})
const mensaje = ref('')
const exito = ref('')
const ocupado = ref(false)

async function enviar() {
  mensaje.value = ''
  errores.value = {}
  exito.value = ''
  ocupado.value = true
  try {
    exito.value = await cuenta.registrar({ ...form })
    form.password = ''
    form.confirmar = ''
  } catch (e) {
    if (e instanceof AuthError) {
      errores.value = e.campos
      mensaje.value = e.message
    } else mensaje.value = 'No se pudo crear la cuenta. Inténtalo de nuevo.'
  } finally {
    ocupado.value = false
  }
}
</script>

<template>
  <section class="auth-card card" aria-labelledby="reg-titulo">
    <h1 id="reg-titulo">Crear cuenta</h1>
    <p class="muted">Con una cuenta cada persona administra <strong>sus</strong> pacientes. Tus datos no están expuestos al resto de las cuentas: tú decides, monitoreo por monitoreo, si alguno se publica.</p>

    <p v-if="exito" class="alert ok" role="status" data-testid="registro-ok">{{ exito }} <RouterLink to="/acceso">Ir a iniciar sesión</RouterLink></p>

    <form v-else novalidate data-testid="form-registro" @submit.prevent="enviar">
      <div class="field">
        <label for="reg-correo">Correo</label>
        <input id="reg-correo" v-model="form.correo" type="email" inputmode="email" autocomplete="email" maxlength="254" :aria-invalid="!!errores.correo" aria-describedby="reg-correo-err">
        <p id="reg-correo-err" class="error-text" role="alert">{{ errores.correo }}</p>
      </div>
      <div class="field">
        <label for="reg-pass">Contraseña</label>
        <input id="reg-pass" v-model="form.password" type="password" autocomplete="new-password" maxlength="72" :aria-invalid="!!errores.password" aria-describedby="reg-pass-ayuda reg-pass-err">
        <p id="reg-pass-ayuda" class="hint">Mínimo {{ PASSWORD_MIN }} caracteres, con letras y números. No uses tu correo ni una contraseña de otro sitio.</p>
        <p id="reg-pass-err" class="error-text" role="alert">{{ errores.password }}</p>
      </div>
      <div class="field">
        <label for="reg-conf">Repite la contraseña</label>
        <input id="reg-conf" v-model="form.confirmar" type="password" autocomplete="new-password" maxlength="72" :aria-invalid="!!errores.confirmar" aria-describedby="reg-conf-err">
        <p id="reg-conf-err" class="error-text" role="alert">{{ errores.confirmar }}</p>
      </div>
      <div class="field">
        <label class="check"><input v-model="form.acepta" type="checkbox" data-testid="acepta-privacidad" :aria-invalid="!!errores.acepta" aria-describedby="reg-acepta-err"> He leído el <RouterLink to="/privacidad" target="_blank">aviso de privacidad</RouterLink>: tus datos solo salen de tu dispositivo si activas la nube, y los datos de salud se tratan con consentimiento.</label>
        <p id="reg-acepta-err" class="error-text" role="alert">{{ errores.acepta }}</p>
      </div>
      <div class="field">
        <label class="check"><input v-model="form.mayorEdad" type="checkbox" data-testid="mayor-edad" :aria-invalid="!!errores.mayorEdad" aria-describedby="reg-edad-err"> Declaro que soy mayor de 18 años. La aplicación no está dirigida a menores de edad.</label>
        <p id="reg-edad-err" class="error-text" role="alert">{{ errores.mayorEdad }}</p>
      </div>
      <p v-if="captchaEnabled" class="hint">Se pedirá una verificación anti-bots al crear la cuenta.</p>
      <p v-if="mensaje && !Object.keys(errores).length" class="alert danger" role="alert" data-testid="error-registro">{{ mensaje }}</p>
      <button type="submit" class="btn primary block" :disabled="ocupado">Crear cuenta</button>
      <p class="hint">Te enviaremos un correo para confirmar la cuenta antes de poder iniciar sesión.</p>
    </form>

    <ul class="links">
      <li><RouterLink to="/acceso">Ya tengo cuenta: iniciar sesión</RouterLink></li>
      <li><RouterLink to="/pacientes" data-testid="usar-sin-cuenta">Usar sin cuenta (solo en este dispositivo)</RouterLink></li>
    </ul>
  </section>
</template>

<style scoped>
.auth-card { max-width: 460px; margin: 16px auto; }
.block { width: 100%; }
.check { display: flex; gap: 8px; align-items: flex-start; }
.check input { margin-top: 4px; flex: none; }
.links { list-style: none; padding: 0; margin: 16px 0 8px; display: grid; gap: 8px; }
.links a { display: inline-block; padding: 6px 0; }
</style>
