<script setup>
import { ref, computed, onMounted } from 'vue'
import PinPrompt from './PinPrompt.vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { useAdminStore } from '@/stores/admin.js'
import { useIsmsStore } from '@/stores/isms.js'
import { useUsersStore } from '@/stores/users.js'
import { cloudCuenta } from '@/services/cloud/cloudSync.js'
import {
  listarAdministradores, validarCorreoAdmin, puedeConcederRol, puedeRetirarRol, MAX_ADMINISTRADORES, MSG_ROL_LIMITE,
} from '@/services/security/adminMfa.js'
import { formatFecha } from '@/utils/time.js'
import { notify } from '@/services/notifications/notifier.js'

/**
 * Gestión de administradores desde la app (ISO/IEC 27001:2013 A.9.2.3 concesión, A.9.2.5 revisión,
 * A.9.2.6 retirada). Concesión y retiro exigen un código TOTP nuevo (A.9.4.2) y los impone el servidor
 * (admin_conceder_rol / admin_retirar_rol, solo con aal2). Los errores son genéricos: no revelan si un correo existe.
 */
const admin = useAdminStore()
const isms = useIsmsStore()
const users = useUsersStore()

const lista = ref([])
const cargando = ref(false)
const errorLista = ref('')
const correo = ref('')
const errorForm = ref('')
const ocupado = ref(false)
const errorCodigo = ref('')

const yoId = computed(() => cloudCuenta.value?.id ?? '')
const total = computed(() => lista.value.length)
const lleno = computed(() => !puedeConcederRol(total.value))

async function cargar() {
  cargando.value = true
  errorLista.value = ''
  try {
    lista.value = await listarAdministradores()
  } catch (e) {
    lista.value = []
    errorLista.value = e.message
  } finally {
    cargando.value = false
  }
}
onMounted(cargar)

// ---------- Conceder ----------
const pedirConceder = ref(false)
function iniciarConcesion() {
  errorForm.value = ''
  errorCodigo.value = ''
  const e = validarCorreoAdmin(correo.value)
  if (e) return (errorForm.value = e)
  if (lleno.value) return (errorForm.value = MSG_ROL_LIMITE)
  pedirConceder.value = true
}

async function confirmarConcesion(codigo) {
  ocupado.value = true
  errorCodigo.value = ''
  try {
    await admin.concederRol(correo.value, codigo)
    pedirConceder.value = false
    correo.value = ''
    notify('Rol de administrador concedido y registrado en la auditoría.', { tipo: 'ok' })
    await cargar()
  } catch (e) {
    if (e.reauth) errorCodigo.value = e.message
    else {
      pedirConceder.value = false
      errorForm.value = e.message
    }
  } finally {
    ocupado.value = false
  }
}

// ---------- Retirar (confirmación explícita + código nuevo) ----------
const objetivo = ref(null) // administrador a retirar
const confirmado = ref(false) // paso 1 superado
function iniciarRetiro(a) {
  errorCodigo.value = ''
  errorLista.value = ''
  const regla = puedeRetirarRol({ total: total.value, objetivoId: a.user_id, yoId: yoId.value })
  if (!regla.ok) return (errorLista.value = regla.motivo)
  objetivo.value = a
  confirmado.value = false
}
function cancelarRetiro() {
  objetivo.value = null
  confirmado.value = false
}

async function confirmarRetiro(codigo) {
  ocupado.value = true
  errorCodigo.value = ''
  try {
    const ok = await admin.retirarRol(objetivo.value.user_id, codigo, total.value)
    cancelarRetiro()
    notify(ok ? 'Rol de administrador retirado y registrado en la auditoría.' : 'Esa cuenta ya no tenía el rol.', { tipo: ok ? 'ok' : 'warn' })
    await cargar()
  } catch (e) {
    if (e.reauth) errorCodigo.value = e.message
    else {
      cancelarRetiro()
      errorLista.value = e.message
    }
  } finally {
    ocupado.value = false
  }
}

// ---------- Revisión de derechos (A.9.2.5) ----------
const confirmaRevision = ref(false)
async function registrarRevision() {
  try {
    await users.ensureLoaded()
    await isms.recordAccessReview({
      participantes: users.users.length,
      adminLocal: false,
      administradoresNube: lista.value.length,
      resultado: 'sin-cambios',
    })
    confirmaRevision.value = false
    notify('Revisión de accesos registrada en la auditoría.', { tipo: 'ok' })
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  }
}
</script>

<template>
  <div>
    <section class="card" aria-labelledby="adm-titulo">
      <div class="row titulo">
        <h2 id="adm-titulo">Administradores ({{ total }} de {{ MAX_ADMINISTRADORES }})</h2>
        <button class="btn small" :disabled="cargando" @click="cargar">Actualizar</button>
      </div>
      <p class="muted small">Cada administrador necesita su propia cuenta y su segundo factor. Mantén al menos dos para evitar bloqueos; el máximo es {{ MAX_ADMINISTRADORES }}.</p>
      <p v-if="errorLista" class="error-text small" role="alert" data-testid="error-lista">{{ errorLista }}</p>
      <div class="table-wrap">
        <table data-testid="tabla-admins">
          <thead><tr><th>Correo</th><th>Alta</th><th><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody>
            <tr v-for="a in lista" :key="a.user_id">
              <td>
                {{ a.email || `Cuenta ${a.user_id.slice(0, 8)}…` }}
                <span v-if="a.user_id === yoId" class="chip info">tú</span>
              </td>
              <td class="small">{{ formatFecha(a.creado_en) }}</td>
              <td>
                <button v-if="a.user_id !== yoId" class="btn small danger" @click="iniciarRetiro(a)">
                  Retirar rol<span class="sr-only"> a {{ a.email || a.user_id }}</span>
                </button>
              </td>
            </tr>
            <tr v-if="!lista.length && !cargando"><td colspan="3" class="muted">Sin datos.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card" aria-labelledby="dar-titulo">
      <h2 id="dar-titulo">Dar rol de administrador</h2>
      <p class="alert warn small" role="note">
        La persona verá el botón Admin al iniciar sesión y deberá inscribir su segundo factor (aplicación de autenticación)
        antes de usar privilegios. Solo se admite una cuenta ya registrada y con el correo confirmado.
      </p>
      <form novalidate @submit.prevent="iniciarConcesion">
        <div class="field">
          <label for="adm-correo">Dar rol de administrador a (correo de una cuenta ya registrada y confirmada)</label>
          <input id="adm-correo" v-model="correo" type="email" autocomplete="off" maxlength="254" :aria-invalid="!!errorForm" aria-describedby="adm-err" :disabled="lleno">
          <p id="adm-err" class="error-text" role="alert">{{ errorForm }}</p>
        </div>
        <p v-if="lleno" class="muted small">Límite alcanzado ({{ MAX_ADMINISTRADORES }}). Retira un rol antes de añadir otro.</p>
        <button class="btn primary" type="submit" :disabled="lleno || ocupado">Dar rol de administrador</button>
      </form>
    </section>

    <section class="card">
      <h2>Revisión de derechos (A.9.2.5)</h2>
      <p class="muted small">Última revisión: {{ isms.ultimaRevisionUtc ? formatFecha(isms.ultimaRevisionUtc) : 'nunca registrada' }}.</p>
      <label class="check"><input v-model="confirmaRevision" type="checkbox"> Revisé la lista de administradores y los roles son los adecuados</label>
      <button class="btn" :disabled="!confirmaRevision" @click="registrarRevision">Registrar revisión</button>
    </section>

    <PinPrompt
      v-if="pedirConceder"
      titulo="Confirmar concesión del rol"
      mensaje="Escribe un código nuevo de tu aplicación de autenticación para dar el rol de administrador."
      accion="Dar rol"
      :ocupado="ocupado"
      :error="errorCodigo"
      @confirmar="confirmarConcesion"
      @cancelar="pedirConceder = false"
    />

    <BaseDialog v-if="objetivo && !confirmado" titulo="Retirar rol de administrador" @cerrar="cancelarRetiro">
      <p>¿Retirar el rol de administrador a <strong>{{ objetivo.email || objetivo.user_id }}</strong>? Perderá el acceso al panel de inmediato.</p>
      <div class="row">
        <button type="button" class="btn" @click="cancelarRetiro">Cancelar</button>
        <button type="button" class="btn danger" @click="confirmado = true">Sí, retirar</button>
      </div>
    </BaseDialog>
    <PinPrompt
      v-if="objetivo && confirmado"
      titulo="Confirmar retiro del rol"
      mensaje="Escribe un código nuevo de tu aplicación de autenticación para retirar el rol."
      accion="Retirar rol"
      peligro
      :ocupado="ocupado"
      :error="errorCodigo"
      @confirmar="confirmarRetiro"
      @cancelar="cancelarRetiro"
    />
  </div>
</template>

<style scoped>
.titulo {
  justify-content: space-between;
}
</style>
