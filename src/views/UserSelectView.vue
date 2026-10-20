<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseDialog from '@/components/common/BaseDialog.vue'
import ConsentDialog from '@/components/users/ConsentDialog.vue'
import OptionalDataForm from '@/components/users/OptionalDataForm.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import HistorialDialog from '@/components/monitoreos/HistorialDialog.vue'
import DataClassBadge from '@/components/common/DataClassBadge.vue'
import LinkLocalBanner from '@/components/account/LinkLocalBanner.vue'
import CloudOptInBanner from '@/components/account/CloudOptInBanner.vue'
import { useAccountStore } from '@/stores/account.js'
import { useUsersStore, consentimientoVigente, declaracionVigente } from '@/stores/users.js'
import { validarAlias } from '@/services/privacidad/alias.js'
import { requiereReconsentimiento, TEXTO_DECLARACION_MAYOR_EDAD } from '@/services/privacidad/consentimiento.js'
import { useChannelsStore } from '@/stores/channels.js'
import { useSessionStore } from '@/stores/session.js'
import { useAuthStore } from '@/stores/auth.js'
import { useMonitoreosStore } from '@/stores/monitoreos.js'
import { safeRedirect, USER_REDIRECT_WHITELIST } from '@/router/guards.js'
import { filtrarUsuarios, ordenarUsuarios, CAMPOS_ORDEN_USUARIO } from '@/services/users/userList.js'
import { notify } from '@/services/notifications/notifier.js'
import { formatFecha } from '@/utils/time.js'

/**
 * Mantenedor de pacientes (CRUD): crear, ver, editar y eliminar seudónimos "Paciente N".
 * No mezcla monitoreo: solo enlaza a las otras secciones. Editar y eliminar exigen ser el usuario
 * activo ("Elegir" = identificarse, sin contraseña) o tener sesión de administrador.
 */
const users = useUsersStore()
const cuenta = useAccountStore()
const channels = useChannelsStore()
const session = useSessionStore()
const auth = useAuthStore()
const monitoreos = useMonitoreosStore()
const route = useRoute()
const router = useRouter()

const texto = ref('')
const campo = ref('numero')
const dir = ref('asc')
const modoDialogo = ref(null) // 'crear' | 'editar'
const objetivoId = ref(null)
const verId = ref(null)
const aliasForm = ref('')
const declaraForm = ref(false)
const errorAlias = ref('')
const verConsentimiento = ref(false)
const confirmarRetiro = ref(false)
const confirmarBorrado = ref(false)
const ocupado = ref(false)
const historialDe = ref(null)

onMounted(() => monitoreos.refrescar())

const filas = computed(() => ordenarUsuarios(filtrarUsuarios(users.users, { texto: texto.value }), { campo: campo.value, dir: dir.value }, monitoreos.conteos))
const objetivo = computed(() => users.byId(objetivoId.value))
const detalle = computed(() => users.byId(verId.value))
const aviso = computed(() => `${filas.value.length} de ${users.users.length} paciente(s)`)

const puedeGestionar = (u) => !!u && (u.id === users.activeUserId || auth.isAdmin)
const enUso = (u) => !!u && (channels.channels.some((c) => c.usuarioId === u.id && c.estado !== 'idle' && c.estado !== 'finished') || session.actual?.participantes.some((p) => p.usuarioId === u.id))
const conteo = (u) => monitoreos.conteos[u.id] ?? 0

function abrirCrear() {
  aliasForm.value = ''
  declaraForm.value = false
  errorAlias.value = ''
  modoDialogo.value = 'crear'
}

function abrirEditar(u) {
  objetivoId.value = u.id
  aliasForm.value = u.alias ?? ''
  errorAlias.value = ''
  modoDialogo.value = 'editar'
}

function cerrarDialogo() {
  modoDialogo.value = null
  verConsentimiento.value = false
}

async function enviarAlias() {
  errorAlias.value = ''
  const a = aliasForm.value.trim()
  const errA = validarAlias(a)
  if (errA) {
    errorAlias.value = errA
    return
  }
  if (modoDialogo.value === 'crear' && !declaraForm.value) {
    errorAlias.value = 'Confirma que la persona medida es mayor de 18 años.'
    return
  }
  ocupado.value = true
  try {
    if (modoDialogo.value === 'crear') {
      const u = await users.createUser(a, { declaraMayorEdad: declaraForm.value })
      users.selectUser(u.id)
      notify(`Creado ${u.etiqueta} y elegido como paciente activo.`, { tipo: 'ok' })
      cerrarDialogo()
    } else {
      await users.updateAlias(objetivoId.value, a, auth.isAdmin && objetivoId.value !== users.activeUserId ? 'admin' : null)
      notify('Alias actualizado.', { tipo: 'ok' })
      cerrarDialogo()
    }
  } catch (e) {
    errorAlias.value = e.message
  } finally {
    ocupado.value = false
  }
}

function elegir(u) {
  users.selectUser(u.id)
  const destino = safeRedirect(route.query.redirect, USER_REDIRECT_WHITELIST, null)
  if (destino) router.push({ name: destino })
  else notify(`${u.etiqueta} es ahora el paciente activo.`, { tipo: 'ok', duracionMs: 2500 })
}

function ordenarPor(id) {
  if (campo.value === id) dir.value = dir.value === 'asc' ? 'desc' : 'asc'
  else {
    campo.value = id
    dir.value = 'asc'
  }
}

const ariaSort = (id) => (campo.value === id ? (dir.value === 'asc' ? 'ascending' : 'descending') : 'none')

async function declarar(u) {
  await users.declararMayorEdad(u.id)
  notify(`Declaración registrada para ${u.etiqueta}.`, { tipo: 'ok' })
}

async function aceptarConsentimiento() {
  verConsentimiento.value = false
  await users.giveConsent(objetivo.value.id)
  notify('Consentimiento registrado.', { tipo: 'ok' })
}

function rechazarConsentimiento() {
  verConsentimiento.value = false
  notify('Sin consentimiento no se guardan datos opcionales; puedes usar la app igualmente.', { tipo: 'info' })
}

async function retirar() {
  confirmarRetiro.value = false
  await users.withdrawConsent(objetivo.value.id)
  notify('Consentimiento retirado: los datos opcionales se borraron.', { tipo: 'ok' })
}

/** SEC-30: reutiliza "Eliminar mis datos" (cascada de monitoreos locales y de la nube). */
async function eliminar() {
  const u = objetivo.value
  ocupado.value = true
  try {
    for (const c of channels.channels.filter((x) => x.usuarioId === u.id)) channels.setUsuario(c.id, null)
    const esOtro = u.id !== users.activeUserId
    if (esOtro) auth.assertAdmin()
    await users.deleteUserData(u.id, esOtro ? 'admin' : null)
    await monitoreos.refrescar()
    confirmarBorrado.value = false
    if (verId.value === u.id) verId.value = null
    objetivoId.value = null
    notify(`${u.etiqueta} y sus monitoreos se eliminaron.`, { tipo: 'ok' })
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
      <h1>Pacientes</h1>
      <button class="btn primary" data-testid="nuevo-usuario" @click="abrirCrear">Nuevo paciente</button>
    </div>
    <p v-if="cuenta.iniciada" class="muted" data-testid="intro-cuenta">
      Estos pacientes (seudónimos <strong>«Paciente N»</strong>) pertenecen a tu cuenta <strong>{{ cuenta.cuenta.email }}</strong>: solo tú los ves. La correspondencia seudónimo ↔ persona, si se necesita, se gestiona <strong>fuera de la app</strong>.
    </p>
    <p v-else class="muted" data-testid="intro-sin-cuenta">
      Modo <strong>sin cuenta</strong>: los seudónimos <strong>«Paciente N»</strong> viven solo en este dispositivo. <RouterLink to="/acceso">Inicia sesión</RouterLink> para administrarlos desde tu cuenta.
      La correspondencia seudónimo ↔ persona, si se necesita, se gestiona <strong>fuera de la app</strong>.
    </p>
    <CloudOptInBanner />
    <LinkLocalBanner />

    <div class="toolbar">
      <div class="field">
        <label for="u-buscar">Buscar por seudónimo o alias</label>
        <input id="u-buscar" v-model="texto" type="search" autocomplete="off" placeholder="p. ej. Paciente 2">
      </div>
      <div class="field">
        <label for="u-orden">Ordenar por</label>
        <select id="u-orden" v-model="campo">
          <option v-for="c in CAMPOS_ORDEN_USUARIO" :key="c.id" :value="c.id">{{ c.nombre }}</option>
        </select>
      </div>
      <button class="btn" :aria-label="dir === 'asc' ? 'Orden ascendente, cambiar a descendente' : 'Orden descendente, cambiar a ascendente'" @click="dir = dir === 'asc' ? 'desc' : 'asc'">
        {{ dir === 'asc' ? '↑ Ascendente' : '↓ Descendente' }}
      </button>
    </div>
    <p class="sr-only" aria-live="polite" role="status">{{ aviso }}</p>

    <EmptyState v-if="!users.users.length" titulo="Aún no hay pacientes" texto="Crea el primero para poder medir y guardar monitoreos.">
      <button class="btn primary" @click="abrirCrear">Nuevo paciente</button>
    </EmptyState>
    <EmptyState v-else-if="!filas.length" titulo="Sin resultados" texto="Ningún paciente coincide con la búsqueda.">
      <button class="btn" @click="texto = ''">Limpiar búsqueda</button>
    </EmptyState>

    <div v-else class="table-wrap card">
      <table data-testid="tabla-usuarios">
        <caption class="sr-only">Pacientes registrados. {{ aviso }}</caption>
        <thead>
          <tr>
            <th scope="col" :aria-sort="ariaSort('numero')"><button class="th-btn" @click="ordenarPor('numero')">Paciente</button></th>
            <th scope="col" :aria-sort="ariaSort('alias')"><button class="th-btn" @click="ordenarPor('alias')">Alias</button></th>
            <th scope="col" :aria-sort="ariaSort('creado')"><button class="th-btn" @click="ordenarPor('creado')">Creado</button></th>
            <th scope="col" :aria-sort="ariaSort('monitoreos')"><button class="th-btn" @click="ordenarPor('monitoreos')">Monitoreos</button></th>
            <th scope="col">Consentimiento</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in filas" :key="u.id" :class="{ activo: u.id === users.activeUserId }">
            <th scope="row">
              {{ u.etiqueta }}
              <span v-if="u.id === users.activeUserId" class="chip info">Activo</span>
            </th>
            <td>{{ u.alias ?? '—' }}</td>
            <td>{{ formatFecha(u.creadoEn) }}</td>
            <td class="mono" :data-testid="`conteo-${u.numero}`">{{ conteo(u) }}</td>
            <td>{{ consentimientoVigente(u) ? `Sí (v${u.consentimiento.consentVersion})` : 'No' }}</td>
            <td class="acciones">
              <button class="btn small" :aria-pressed="u.id === users.activeUserId" :aria-label="`Elegir ${u.etiqueta}`" @click="elegir(u)">Elegir</button>
              <button class="btn small" :aria-label="`Ver detalle de ${u.etiqueta}`" @click="verId = u.id">Ver</button>
              <button class="btn small" :disabled="!puedeGestionar(u)" :title="puedeGestionar(u) ? '' : 'Elige este paciente primero'" :aria-label="`Editar ${u.etiqueta}`" @click="abrirEditar(u)">Editar</button>
              <button class="btn small danger" :disabled="!puedeGestionar(u)" :title="puedeGestionar(u) ? '' : 'Elige este paciente primero'" :aria-label="`Eliminar ${u.etiqueta}`" @click="objetivoId = u.id; confirmarBorrado = true">Eliminar</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="muted small">Editar y eliminar requieren que el paciente sea el activo (usa «Elegir») o una sesión de administrador.</p>

    <section v-if="detalle" class="card detalle" aria-labelledby="detalle-titulo" data-testid="detalle-usuario">
      <div class="page-header">
        <h2 id="detalle-titulo">{{ detalle.etiqueta }}</h2>
        <button class="btn small ghost" @click="verId = null">Cerrar detalle</button>
      </div>
      <dl class="datos">
        <dt>Alias</dt><dd>{{ detalle.alias ?? '—' }}</dd>
        <dt>Creado</dt><dd>{{ formatFecha(detalle.creadoEn) }}</dd>
        <dt>Actualizado</dt><dd>{{ formatFecha(detalle.actualizadoEn) }}</dd>
        <dt>Monitoreos guardados</dt><dd>{{ conteo(detalle) }}</dd>
        <dt>Consentimiento</dt>
        <dd>{{ consentimientoVigente(detalle) ? `Vigente (v${detalle.consentimiento.consentVersion}, ${formatFecha(detalle.consentimiento.acceptedAt)})` : requiereReconsentimiento(detalle) ? `Caducado (v${detalle.consentimiento.consentVersion}): hay que aceptar el texto nuevo` : 'No otorgado' }}</dd>
        <dt>Mayoría de edad</dt>
        <dd>
          <template v-if="declaracionVigente(detalle)">Declarada ({{ formatFecha(detalle.declaracion.fecha) }})</template>
          <template v-else>
            Sin declarar: no se sube a la nube ni se publica.
            <button class="btn small" :disabled="!puedeGestionar(detalle)" data-testid="declarar-mayor-edad" @click="declarar(detalle)">Declarar que es mayor de 18 años</button>
          </template>
        </dd>
      </dl>
      <p class="small muted">Los datos opcionales (edad, peso, actividad habitual) solo se muestran y editan al editar el paciente activo.</p>
      <div class="row">
        <RouterLink to="/monitor" class="btn" @click="users.selectUser(detalle.id)">Medir con este paciente</RouterLink>
        <RouterLink to="/monitoreos" class="btn" @click="users.selectUser(detalle.id)">Ver sus monitoreos</RouterLink>
        <button class="btn" :disabled="!puedeGestionar(detalle)" data-testid="historial-usuario" @click="historialDe = detalle.id">Descargar historial</button>
      </div>
    </section>

    <HistorialDialog v-if="historialDe" :usuario-id="historialDe" @cerrar="historialDe = null" />

    <!-- Crear / editar -->
    <BaseDialog v-if="modoDialogo" :titulo="modoDialogo === 'crear' ? 'Nuevo paciente' : `Editar ${objetivo?.etiqueta}`" ancho="600px" @cerrar="cerrarDialogo">
      <form id="form-usuario" novalidate @submit.prevent="enviarAlias">
        <div class="field">
          <label for="alias">Alias (opcional)</label>
          <input id="alias" v-model="aliasForm" type="text" maxlength="20" autocomplete="off" placeholder="p. ej. Grupo A-2" aria-describedby="alias-ayuda">
          <p id="alias-ayuda" class="hint"><strong>No uses nombres reales, RUT, correo ni otros datos identificables.</strong> El alias solo se guarda en este dispositivo y nunca se sube. El seudónimo «Paciente N» lo asigna el sistema.</p>
        </div>
        <div v-if="modoDialogo === 'crear'" class="field">
          <label class="check"><input v-model="declaraForm" type="checkbox" data-testid="declara-mayor-edad"> {{ TEXTO_DECLARACION_MAYOR_EDAD }}</label>
        </div>
        <p v-if="errorAlias" class="error-text" role="alert">{{ errorAlias }}</p>
      </form>
      <template v-if="modoDialogo === 'editar' && objetivo">
        <h3>Datos opcionales</h3>
        <template v-if="!consentimientoVigente(objetivo)">
          <p>Para registrar edad, peso o actividad física habitual necesitas aceptar el consentimiento informado.</p>
          <button class="btn" @click="verConsentimiento = true">Agregar datos opcionales…</button>
        </template>
        <template v-else>
          <p class="ok-text small">✓ Consentimiento v{{ objetivo.consentimiento.consentVersion }} otorgado el {{ formatFecha(objetivo.consentimiento.acceptedAt) }}</p>
          <OptionalDataForm :usuario="objetivo" />
          <button class="btn ghost" @click="confirmarRetiro = true">Retirar consentimiento</button>
        </template>
      </template>
      <template #acciones>
        <button class="btn" @click="cerrarDialogo">{{ modoDialogo === 'crear' ? 'Cancelar' : 'Cerrar' }}</button>
        <button type="submit" form="form-usuario" class="btn primary" :disabled="ocupado">{{ modoDialogo === 'crear' ? 'Crear paciente' : 'Guardar alias' }}</button>
      </template>
    </BaseDialog>

    <ConsentDialog v-if="verConsentimiento && objetivo" :etiqueta="objetivo.etiqueta" :reconsentimiento="requiereReconsentimiento(objetivo)" @acepto="aceptarConsentimiento" @no-acepto="rechazarConsentimiento" />

    <BaseDialog v-if="confirmarRetiro" titulo="Retirar consentimiento" @cerrar="confirmarRetiro = false">
      <p>Se borrarán de inmediato los datos opcionales (edad, peso, actividad física). Los monitoreos se conservan.</p>
      <template #acciones>
        <button class="btn" @click="confirmarRetiro = false">Cancelar</button>
        <button class="btn danger" @click="retirar">Retirar y borrar</button>
      </template>
    </BaseDialog>

    <!-- Eliminar: flujo "Eliminar mis datos" (SEC-30) -->
    <BaseDialog v-if="confirmarBorrado && objetivo" titulo="Eliminar paciente y sus datos" @cerrar="confirmarBorrado = false">
      <DataClassBadge level="sensitive" />
      <p>
        Se eliminarán <strong>definitivamente</strong> {{ objetivo.etiqueta }}, sus datos opcionales, su consentimiento y
        <strong>{{ conteo(objetivo) }}</strong> monitoreo(s), en este navegador y en la nube si está activada. No se puede deshacer.
      </p>
      <p v-if="enUso(objetivo)" class="alert warn" role="alert">Este paciente está en un canal conectado o en un monitoreo activo. Detén el monitoreo y desconecta el canal antes de eliminar.</p>
      <template #acciones>
        <button class="btn" @click="confirmarBorrado = false">Cancelar</button>
        <button class="btn danger" data-testid="confirmar-eliminar-usuario" :disabled="ocupado || enUso(objetivo)" @click="eliminar">Eliminar definitivamente</button>
      </template>
    </BaseDialog>
  </section>
</template>

<style scoped>
.acciones {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

tr.activo th,
tr.activo td {
  background: var(--bg-elev-2);
}

.detalle {
  margin-top: var(--gap);
}

.datos {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 16px;
  margin: 0 0 12px;
}

.datos dt {
  color: var(--text-muted);
  font-weight: 600;
}

.datos dd {
  margin: 0;
}
</style>
