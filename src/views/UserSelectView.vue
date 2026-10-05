<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseDialog from '@/components/common/BaseDialog.vue'
import ConsentDialog from '@/components/users/ConsentDialog.vue'
import OptionalDataForm from '@/components/users/OptionalDataForm.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useUsersStore, consentimientoVigente, ALIAS_RE } from '@/stores/users.js'
import { useChannelsStore } from '@/stores/channels.js'
import { useSessionStore } from '@/stores/session.js'
import { safeRedirect, USER_REDIRECT_WHITELIST } from '@/router/guards.js'
import { notify } from '@/services/notifications/notifier.js'
import { formatFecha } from '@/utils/time.js'

/** RF01–RF03: elegir/crear identificador sin contraseña y datos opcionales con consentimiento. */
const users = useUsersStore()
const channels = useChannelsStore()
const session = useSessionStore()
const route = useRoute()
const router = useRouter()

const alias = ref('')
const errorAlias = ref('')
const verConsentimiento = ref(false)
const confirmarBorrado = ref(false)
const confirmarRetiro = ref(false)
const ocupado = ref(false)

const activo = computed(() => users.activeUser)
const consiente = computed(() => consentimientoVigente(activo.value))

async function crear() {
  errorAlias.value = ''
  const a = alias.value.trim()
  if (a && !ALIAS_RE.test(a)) {
    errorAlias.value = 'Solo letras sin tilde, números, espacio, _ y - (máx. 20).'
    return
  }
  try {
    const u = await users.createUser(a)
    users.selectUser(u.id)
    alias.value = ''
    notify(`Creado ${u.etiqueta}.`, { tipo: 'ok' })
  } catch (e) {
    errorAlias.value = e.message
  }
}

function elegir(id) {
  users.selectUser(id)
  const destino = safeRedirect(route.query.redirect, USER_REDIRECT_WHITELIST, null)
  if (destino) router.push({ name: destino })
}

async function aceptarConsentimiento() {
  verConsentimiento.value = false
  await users.giveConsent(activo.value.id)
  notify('Consentimiento registrado.', { tipo: 'ok' })
}

function rechazarConsentimiento() {
  verConsentimiento.value = false
  notify('Sin consentimiento: puedes medir igualmente, sin datos opcionales.', { tipo: 'info' })
}

async function retirar() {
  confirmarRetiro.value = false
  await users.withdrawConsent(activo.value.id)
  notify('Consentimiento retirado: tus datos opcionales se borraron.', { tipo: 'ok' })
}

const enUso = computed(() => !!activo.value && (channels.channels.some((c) => c.usuarioId === activo.value.id && c.estado !== 'idle' && c.estado !== 'finished') || session.actual?.participantes.some((p) => p.usuarioId === activo.value.id)))

/** SEC-30: "Eliminar mis datos". */
async function eliminarMisDatos() {
  ocupado.value = true
  try {
    const id = activo.value.id
    for (const c of channels.channels.filter((x) => x.usuarioId === id)) channels.setUsuario(c.id, null)
    await users.deleteUserData(id)
    confirmarBorrado.value = false
    notify('Tus datos (perfil, opcionales, mediciones y consentimiento) se eliminaron.', { tipo: 'ok' })
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  } finally {
    ocupado.value = false
  }
}
</script>

<template>
  <section>
    <div class="page-header">
      <h1>Participantes</h1>
    </div>
    <p class="muted">
      Identificación sin contraseña: el sistema asigna un seudónimo <strong>"Usuario N"</strong>.
      La correspondencia seudónimo ↔ persona, si se necesita, se gestiona <strong>fuera de la app</strong> (custodia del docente).
    </p>

    <div class="grid cols-2">
      <section class="card">
        <h2>Nuevo participante</h2>
        <form @submit.prevent="crear">
          <div class="field">
            <label for="alias">Alias opcional</label>
            <input id="alias" v-model="alias" type="text" maxlength="20" autocomplete="off" placeholder="p. ej. Grupo A-2">
            <p class="hint"><strong>No uses tu nombre real, RUT, correo ni otros datos identificables.</strong></p>
            <p v-if="errorAlias" class="error-text" role="alert">{{ errorAlias }}</p>
          </div>
          <button class="btn primary" type="submit">Crear identificador</button>
        </form>
      </section>

      <section class="card">
        <h2>Elegir participante</h2>
        <EmptyState v-if="!users.users.length" titulo="Aún no hay participantes" texto="Crea el primero con el formulario." />
        <ul v-else class="lista-usuarios">
          <li v-for="u in users.users" :key="u.id">
            <button :class="['btn', u.id === users.activeUserId ? 'primary' : '']" :aria-pressed="u.id === users.activeUserId" @click="elegir(u.id)">
              {{ u.etiqueta }}<span v-if="u.alias" class="muted"> · {{ u.alias }}</span>
            </button>
          </li>
        </ul>
        <button v-if="users.activeUserId" class="btn ghost small" @click="users.clearActive()">Cerrar sesión de participante</button>
      </section>
    </div>

    <section v-if="activo" class="card activo">
      <h2>{{ activo.etiqueta }} <span class="muted small">creado {{ formatFecha(activo.creadoEn) }}</span></h2>
      <div class="row">
        <RouterLink to="/monitor" class="btn primary">Ir al monitor</RouterLink>
        <RouterLink to="/sesiones" class="btn">Mis sesiones</RouterLink>
      </div>

      <h3 class="sub">Datos opcionales (RF03)</h3>
      <template v-if="!consiente">
        <p>Para registrar edad, peso o actividad física necesitas aceptar el consentimiento informado.</p>
        <button class="btn" @click="verConsentimiento = true">Agregar datos opcionales…</button>
      </template>
      <template v-else>
        <p class="ok-text small">✓ Consentimiento v{{ activo.consentimiento.consentVersion }} otorgado el {{ formatFecha(activo.consentimiento.acceptedAt) }}</p>
        <OptionalDataForm :usuario="activo" />
        <button class="btn ghost" @click="confirmarRetiro = true">Retirar consentimiento</button>
      </template>

      <h3 class="sub">Tus derechos</h3>
      <p class="muted small">Puedes eliminar en cualquier momento tu perfil, datos opcionales, mediciones y consentimiento.</p>
      <button class="btn danger" :disabled="enUso" @click="confirmarBorrado = true">Eliminar mis datos</button>
      <p v-if="enUso" class="muted small">Desconecta el canal o detén la sesión donde participas antes de borrar.</p>
    </section>

    <ConsentDialog v-if="verConsentimiento && activo" :etiqueta="activo.etiqueta" @acepto="aceptarConsentimiento" @no-acepto="rechazarConsentimiento" />

    <BaseDialog v-if="confirmarRetiro" titulo="Retirar consentimiento" @cerrar="confirmarRetiro = false">
      <p>Se borrarán de inmediato tus datos opcionales (edad, peso, actividad física). Tus mediciones se conservan.</p>
      <template #acciones>
        <button class="btn" @click="confirmarRetiro = false">Cancelar</button>
        <button class="btn danger" @click="retirar">Retirar y borrar</button>
      </template>
    </BaseDialog>

    <BaseDialog v-if="confirmarBorrado && activo" titulo="Eliminar mis datos" @cerrar="confirmarBorrado = false">
      <p>Se eliminarán <strong>definitivamente</strong> el identificador {{ activo.etiqueta }}, sus datos opcionales, su consentimiento y todas sus mediciones.</p>
      <template #acciones>
        <button class="btn" @click="confirmarBorrado = false">Cancelar</button>
        <button class="btn danger" :disabled="ocupado" @click="eliminarMisDatos">Eliminar definitivamente</button>
      </template>
    </BaseDialog>
  </section>
</template>

<style scoped>
.lista-usuarios {
  list-style: none;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.activo {
  margin-top: var(--gap);
}

.sub {
  margin-top: 20px;
}
</style>
