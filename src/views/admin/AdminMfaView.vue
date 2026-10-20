<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { audit } from '@/services/audit/auditService.js'
import { safeRedirect, ADMIN_REDIRECT_WHITELIST } from '@/router/guards.js'
import {
  factorTotpVerificado, iniciarInscripcion, verificarCodigo, validarCodigo, normalizarCodigo,
  MSG_MFA_GENERICO, MSG_MFA_LIMITE, MSG_MFA_NO_DISPONIBLE,
} from '@/services/security/adminMfa.js'

/**
 * Segundo factor del administrador (A.9.4.2): inscripción del TOTP la primera vez y, después, código de
 * 6 dígitos para subir la sesión a aal2. El servidor (es_admin()) exige aal2; esta pantalla solo lo obtiene.
 * El QR llega como SVG data-URI de Supabase y se muestra en <img> (sin HTML crudo).
 */
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const cargando = ref(true)
const modo = ref('verificar') // 'inscribir' | 'verificar'
const factorId = ref('')
const qr = ref(null)
const secreto = ref('')
const codigo = ref('')
const error = ref('')
const ocupado = ref(false)

const titulo = computed(() => (modo.value === 'inscribir' ? 'Configurar el segundo factor' : 'Verificación en dos pasos'))

function destino() {
  return { name: safeRedirect(route.query.redirect, ADMIN_REDIRECT_WHITELIST, 'admin') }
}

async function preparar() {
  cargando.value = true
  error.value = ''
  try {
    const f = await factorTotpVerificado()
    if (f) {
      modo.value = 'verificar'
      factorId.value = f.id
    } else {
      modo.value = 'inscribir'
      const ins = await iniciarInscripcion()
      factorId.value = ins.factorId
      qr.value = ins.qr
      secreto.value = ins.secreto
    }
  } catch {
    error.value = MSG_MFA_NO_DISPONIBLE
  } finally {
    cargando.value = false
  }
}
onMounted(preparar)

async function enviar() {
  error.value = ''
  const e = validarCodigo(codigo.value)
  if (e) return (error.value = e)
  ocupado.value = true
  try {
    const r = await verificarCodigo(factorId.value, normalizarCodigo(codigo.value))
    codigo.value = ''
    if (!r.ok) {
      error.value = r.limitado ? MSG_MFA_LIMITE : MSG_MFA_GENERICO
      await audit('ADMIN_MFA_FAILED', 'system', { contexto: modo.value, limitado: !!r.limitado })
      return
    }
    if (modo.value === 'inscribir') await audit('ADMIN_MFA_ENROLLED', 'admin', {})
    secreto.value = ''
    qr.value = null
    await auth.completarMfa(modo.value)
    router.replace(destino())
  } catch {
    error.value = MSG_MFA_NO_DISPONIBLE
  } finally {
    ocupado.value = false
  }
}
</script>

<template>
  <section class="card acceso" aria-labelledby="mfa-titulo">
    <h1 id="mfa-titulo">{{ titulo }}</h1>
    <p v-if="cargando" class="muted" role="status">Preparando…</p>

    <template v-else>
      <template v-if="modo === 'inscribir'">
        <p>
          Las cuentas con rol de administrador necesitan un segundo factor. Escanea el código con una aplicación
          de autenticación (por ejemplo, la de tu teléfono) y escribe el código de 6 dígitos que muestre.
        </p>
        <img v-if="qr" :src="qr" alt="Código QR para la aplicación de autenticación" class="qr" width="200" height="200">
        <p v-if="secreto" class="small">Si no puedes escanear, escribe esta clave a mano: <code class="mono" data-testid="mfa-secreto">{{ secreto }}</code></p>
        <p class="hint">La clave se muestra solo ahora. No la compartas ni la guardes en el equipo.</p>
      </template>
      <p v-else>Escribe el código de 6 dígitos de tu aplicación de autenticación para activar el modo administrador.</p>

      <form novalidate @submit.prevent="enviar">
        <div class="field">
          <label for="mfa-codigo">Código de 6 dígitos</label>
          <input
            id="mfa-codigo" v-model="codigo" type="text" inputmode="numeric" pattern="[0-9]*"
            autocomplete="one-time-code" maxlength="7" :aria-invalid="!!error" aria-describedby="mfa-err"
          >
          <p id="mfa-err" class="error-text" role="alert">{{ error }}</p>
        </div>
        <button class="btn primary" type="submit" :disabled="ocupado || !factorId">{{ ocupado ? 'Verificando…' : modo === 'inscribir' ? 'Activar y entrar' : 'Verificar' }}</button>
      </form>
    </template>

    <p class="muted small nota">
      La sesión de administrador caduca a los 15 minutos de inactividad. Si perdiste el acceso a tu aplicación de
      autenticación, sigue el procedimiento formal de recuperación (no hay autoservicio): contacta al responsable del proyecto.
    </p>
    <p class="small"><RouterLink to="/pacientes">Volver a la aplicación</RouterLink></p>
  </section>
</template>

<style scoped>
.acceso {
  max-width: 480px;
  margin: 0 auto;
}

.qr {
  display: block;
  margin: 12px 0;
  background: #fff;
  padding: 8px;
  border-radius: var(--radius-sm);
}

.nota {
  margin-top: 16px;
}
</style>
