<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { useAuthStore } from '@/stores/auth.js'
import { safeRedirect, ADMIN_REDIRECT_WHITELIST } from '@/router/guards.js'
import { validateNewPin, PIN_MIN_LEN } from '@/services/security/pinHash.js'
import { wipeAllData } from '@/services/storage/wipe.js'

/** RF25 / SEC-06..SEC-12: creación del PIN en el primer uso y acceso con bloqueo progresivo. */
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const pin = ref('')
const pin2 = ref('')
const error = ref('')
const ocupado = ref(false)
const ahora = ref(Date.now())
const olvido = ref(false)
const confirmTexto = ref('')
const timer = setInterval(() => (ahora.value = Date.now()), 1000)
onBeforeUnmount(() => clearInterval(timer))

onMounted(() => auth.refreshLock())

const modoSetup = computed(() => !auth.hasCredential)
const bloqueoRestante = computed(() => Math.max(0, auth.lockedUntil - ahora.value))
const bloqueado = computed(() => bloqueoRestante.value > 0)
const restanteTexto = computed(() => {
  const s = Math.ceil(bloqueoRestante.value / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})

function destino() {
  return { name: safeRedirect(route.query.redirect, ADMIN_REDIRECT_WHITELIST, 'admin') }
}

async function crear() {
  error.value = ''
  const e = validateNewPin(pin.value)
  if (e) return (error.value = e)
  if (pin.value !== pin2.value) return (error.value = 'Los PIN no coinciden')
  ocupado.value = true
  try {
    await auth.setup(pin.value)
    pin.value = pin2.value = ''
    router.replace(destino())
  } catch (err) {
    error.value = err.message
  } finally {
    ocupado.value = false
  }
}

async function entrar() {
  error.value = ''
  ocupado.value = true
  try {
    const r = await auth.login(pin.value)
    pin.value = ''
    if (r.ok) return router.replace(destino())
    if (r.locked) error.value = r.justLocked ? 'Demasiados intentos: acceso bloqueado temporalmente.' : 'Acceso bloqueado temporalmente.'
    else error.value = `PIN incorrecto. Intentos restantes antes del bloqueo: ${r.remaining}.`
  } finally {
    ocupado.value = false
  }
}

/** SEC-12: "Olvidé el PIN" solo permite restablecer la app borrando todos los datos. */
async function restablecer() {
  if (confirmTexto.value !== 'BORRAR') return
  ocupado.value = true
  await wipeAllData({ conservarCredencial: false, actor: 'system', motivo: 'restablecimiento-pin-olvidado' })
  window.location.assign('/')
}
</script>

<template>
  <section class="card acceso">
    <template v-if="modoSetup">
      <h1>Configurar administrador</h1>
      <p>Primer uso: crea el PIN o contraseña del administrador. <strong>No existe un PIN por defecto.</strong></p>
      <form @submit.prevent="crear">
        <div class="field">
          <label for="pin-nuevo">Nuevo PIN o contraseña</label>
          <input id="pin-nuevo" v-model="pin" type="password" autocomplete="new-password" :minlength="PIN_MIN_LEN" required>
          <p class="hint">Mínimo {{ PIN_MIN_LEN }} caracteres. No se aceptan valores triviales (12345678, 00000000, password…).</p>
        </div>
        <div class="field">
          <label for="pin-rep">Repite el PIN</label>
          <input id="pin-rep" v-model="pin2" type="password" autocomplete="new-password" required>
        </div>
        <p v-if="error" class="error-text" role="alert">{{ error }}</p>
        <button class="btn primary" type="submit" :disabled="ocupado">{{ ocupado ? 'Protegiendo (PBKDF2)…' : 'Crear PIN' }}</button>
      </form>
    </template>

    <template v-else>
      <h1>Acceso de administrador</h1>
      <p class="muted">Configura rangos, sincronización, retención y consulta la auditoría.</p>
      <p v-if="bloqueado" class="alert danger" role="alert">Acceso bloqueado por intentos fallidos. Tiempo restante: <strong class="mono">{{ restanteTexto }}</strong></p>
      <form @submit.prevent="entrar">
        <div class="field">
          <label for="pin">PIN</label>
          <input id="pin" v-model="pin" type="password" autocomplete="current-password" :disabled="bloqueado" required>
        </div>
        <p v-if="error" class="error-text" role="alert">{{ error }}</p>
        <button class="btn primary" type="submit" :disabled="ocupado || bloqueado || !pin">{{ ocupado ? 'Verificando…' : 'Entrar' }}</button>
      </form>
      <button class="btn ghost small olvido" @click="olvido = true">Olvidé el PIN</button>
    </template>

    <p class="muted small nota">La sesión de administrador expira tras 10 minutos de inactividad (máximo 60 minutos) y al cerrar la pestaña.</p>

    <BaseDialog v-if="olvido" titulo="Restablecer la aplicación" @cerrar="olvido = false">
      <p class="alert danger">No existe recuperación del PIN. La única opción es <strong>borrar todos los datos</strong> de este navegador (participantes, sesiones, configuración, auditoría y credencial) y empezar de cero.</p>
      <div class="field">
        <label for="confirm-borrar">Escribe BORRAR para confirmar</label>
        <input id="confirm-borrar" v-model="confirmTexto" type="text" autocomplete="off">
      </div>
      <template #acciones>
        <button class="btn" @click="olvido = false">Cancelar</button>
        <button class="btn danger" :disabled="confirmTexto !== 'BORRAR' || ocupado" @click="restablecer">Borrar todo y restablecer</button>
      </template>
    </BaseDialog>
  </section>
</template>

<style scoped>
.acceso {
  max-width: 480px;
  margin: 0 auto;
}

.olvido {
  margin-top: 12px;
}

.nota {
  margin-top: 16px;
}
</style>
