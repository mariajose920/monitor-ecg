<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import BaseDialog from '@/components/common/BaseDialog.vue'
import ReauthDialog from '@/components/account/ReauthDialog.vue'
import { useAccountStore } from '@/stores/account.js'
import { AuthError } from '@/services/accounts/authService.js'
import { PASSWORD_MIN } from '@/services/accounts/validation.js'
import { resumenLocal, ocultarVinculacionEnEsteEquipo, vinculacionOcultaEnEsteEquipo } from '@/services/accounts/linkLocal.js'
import { notify } from '@/services/notifications/notifier.js'
import { NUBE_PROVEEDOR, NUBE_REGION, INACTIVIDAD_SESION_MIN, CIFRADO_LOCAL_ALCANCE } from '@/data/privacidad.js'

/**
 * Mi cuenta: nube opcional (C-03), sesión y equipo compartido (C-07), cambio de contraseña y borrados con reautenticación (C-13),
 * y vinculación de datos del dispositivo con selección explícita (C-15).
 */
const cuenta = useAccountStore()
const router = useRouter()
const ocupado = ref(false)

// ---------- Reautenticación ----------
const reauth = ref(false)
let pendiente = null
function conReauth(fn) {
  if (cuenta.reauthVigente()) return fn()
  pendiente = fn
  reauth.value = true
}
async function reauthOk() {
  reauth.value = false
  const fn = pendiente
  pendiente = null
  if (fn) await fn()
}

// ---------- Nube ----------
const dlgNube = ref(null) // 'activar' | 'apagar'
const subirGuardado = ref(false)
const progreso = ref('')

async function activarNube() {
  ocupado.value = true
  try {
    const r = await cuenta.configurarNube(true, { subirGuardado: subirGuardado.value, onProgreso: (h, t) => (progreso.value = `${h} de ${t}`) })
    dlgNube.value = null
    notify(r ? `Nube activada. Subidos: ${r.subidos}; fallidos: ${r.fallidos}; sin declaración de mayoría de edad: ${r.sinDeclaracion}.` : 'Nube activada: lo que guardes desde ahora se copiará a tu nube.', { tipo: 'ok', duracionMs: 7000 })
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  } finally {
    ocupado.value = false
    progreso.value = ''
  }
}

async function apagarNube(borrar) {
  ocupado.value = true
  try {
    await cuenta.configurarNube(false)
    if (borrar) {
      const r = await cuenta.borrarDatosNube()
      notify(`Nube apagada y datos eliminados de la nube (${r?.sesiones ?? 0} monitoreo(s), ${r?.pacientes ?? 0} paciente(s)).`, { tipo: 'ok', duracionMs: 7000 })
    } else notify('Nube apagada. Lo que ya estaba subido se conserva; no se enviará nada nuevo.', { tipo: 'ok', duracionMs: 7000 })
    dlgNube.value = null
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  } finally {
    ocupado.value = false
  }
}

function cambiarNube(e) {
  e.target.checked = cuenta.nubeActivada // el estado real lo fija el diálogo
  dlgNube.value = cuenta.nubeActivada ? 'apagar' : 'activar'
  subirGuardado.value = false
}

// ---------- Contraseña ----------
const pw = reactive({ actual: '', nueva: '', confirmar: '' })
const pwErrores = ref({})
const pwMensaje = ref('')
async function cambiarPassword() {
  pwErrores.value = {}
  pwMensaje.value = ''
  if (pw.nueva !== pw.confirmar) {
    pwErrores.value = { confirmar: 'Las contraseñas no coinciden.' }
    return
  }
  ocupado.value = true
  try {
    await cuenta.cambiarPassword({ actual: pw.actual, nueva: pw.nueva, confirmar: pw.confirmar })
    notify('Contraseña cambiada. Se cerraron las demás sesiones de tu cuenta.', { tipo: 'ok', duracionMs: 7000 })
  } catch (e) {
    if (e instanceof AuthError) pwErrores.value = e.campos
    pwMensaje.value = e.message
  } finally {
    pw.actual = pw.nueva = pw.confirmar = ''
    ocupado.value = false
  }
}

// ---------- Borrados ----------
const confirmar = ref(null) // 'datos-nube' | 'cuenta'
async function borrarNube() {
  confirmar.value = null
  ocupado.value = true
  try {
    const r = await cuenta.borrarDatosNube()
    notify(`Se eliminaron de la nube ${r?.sesiones ?? 0} monitoreo(s) y ${r?.pacientes ?? 0} paciente(s).`, { tipo: 'ok', duracionMs: 7000 })
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  } finally {
    ocupado.value = false
  }
}
async function eliminarCuenta() {
  confirmar.value = null
  ocupado.value = true
  try {
    await cuenta.eliminarCuenta()
    notify('Tu cuenta y sus datos se eliminaron.', { tipo: 'ok' })
    router.push('/')
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  } finally {
    ocupado.value = false
  }
}

// ---------- Vincular datos del dispositivo ----------
const local = ref(null)
const elegidos = ref([])
const quitarCopia = ref(false)
const confirmaVincular = ref(false)
const confirmaQuitar = ref(false)
const ocultar = ref(vinculacionOcultaEnEsteEquipo())

async function revisarLocal() {
  local.value = await resumenLocal()
  elegidos.value = []
  quitarCopia.value = false
}
async function vincular() {
  ocupado.value = true
  try {
    const r = await cuenta.vincular({ pacientesIds: [...elegidos.value], quitarCopia: quitarCopia.value, onProgreso: (h, t) => (progreso.value = `${h} de ${t}`) })
    confirmaVincular.value = false
    confirmaQuitar.value = false
    notify(`Vinculados ${r.pacientes} paciente(s) y ${r.monitoreos} monitoreo(s) (privados)${r.fallos ? `; ${r.fallos} no se pudieron subir a la nube` : ''}.`, { tipo: r.fallos ? 'aviso' : 'ok', duracionMs: 8000 })
    await revisarLocal()
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  } finally {
    ocupado.value = false
    progreso.value = ''
  }
}
function cambiarOcultar() {
  ocultarVinculacionEnEsteEquipo(ocultar.value)
  cuenta.revisarVinculable()
}
</script>

<template>
  <section class="cuenta-pagina">
    <h1>Mi cuenta</h1>
    <p v-if="!cuenta.iniciada" class="alert info">Inicia sesión para administrar tu cuenta. <RouterLink to="/acceso">Iniciar sesión</RouterLink></p>
    <template v-else>
      <p class="muted">Sesión de <strong>{{ cuenta.cuenta.email }}</strong> · {{ cuenta.equipoCompartido ? 'equipo compartido' : 'equipo personal' }}.</p>

      <section class="card" aria-labelledby="c-nube">
        <h2 id="c-nube">Guardar mis datos en la nube</h2>
        <label class="check">
          <input type="checkbox" :checked="cuenta.nubeActivada" data-testid="interruptor-nube" @change="cambiarNube">
          <span><strong>{{ cuenta.nubeActivada ? 'Activado' : 'Desactivado' }}</strong> (viene desactivado)</span>
        </label>
        <p class="small">
          Desactivado: tus pacientes y monitoreos se guardan <strong>solo en este dispositivo</strong>. Activado: al pulsar «Guardar monitoreo» se copia a {{ NUBE_PROVEEDOR }} ({{ NUBE_REGION }}) la señal, el BPM y la actividad, junto con tus pacientes («Paciente N»).
          Nunca se suben los borradores, los alias, los nombres ni las notas. Lo necesitas activado para publicar un monitoreo. Es una copia de respaldo; recuperar monitoreos en otro equipo todavía no está disponible.
        </p>
        <template v-if="cuenta.nubeActivada">
          <button class="btn danger" data-testid="borrar-datos-nube" :disabled="ocupado" @click="confirmar = 'datos-nube'">Eliminar mis datos en la nube…</button>
        </template>
      </section>

      <section class="card" aria-labelledby="c-sesion">
        <h2 id="c-sesion">Sesión y equipo</h2>
        <ul class="small">
          <li v-if="cuenta.equipoCompartido">Equipo compartido: la sesión se pierde al cerrar la pestaña, se cierra tras {{ INACTIVIDAD_SESION_MIN }} min sin actividad y, al salir, se quitan tus datos de este equipo. La vinculación de datos del dispositivo está desactivada por defecto.</li>
          <li v-else>Equipo personal: la sesión se mantiene hasta que cierres sesión; igualmente se cierra tras {{ INACTIVIDAD_SESION_MIN }} min sin actividad (los datos cifrados quedan en este equipo).</li>
          <li>{{ CIFRADO_LOCAL_ALCANCE.protege }} {{ CIFRADO_LOCAL_ALCANCE.noProtege }}</li>
        </ul>
      </section>

      <section class="card" aria-labelledby="c-pass">
        <h2 id="c-pass">Cambiar contraseña</h2>
        <form novalidate @submit.prevent="cambiarPassword">
          <div class="field">
            <label for="pw-actual">Contraseña actual</label>
            <input id="pw-actual" v-model="pw.actual" type="password" autocomplete="current-password" maxlength="128">
          </div>
          <div class="field">
            <label for="pw-nueva">Contraseña nueva</label>
            <input id="pw-nueva" v-model="pw.nueva" type="password" autocomplete="new-password" maxlength="72">
            <p class="hint">Mínimo {{ PASSWORD_MIN }} caracteres, con letras y números; no se admiten contraseñas comunes ni que contengan tu correo.</p>
            <p v-if="pwErrores.password" class="error-text" role="alert">{{ pwErrores.password }}</p>
          </div>
          <div class="field">
            <label for="pw-conf">Repite la contraseña nueva</label>
            <input id="pw-conf" v-model="pw.confirmar" type="password" autocomplete="new-password" maxlength="72">
            <p v-if="pwErrores.confirmar" class="error-text" role="alert">{{ pwErrores.confirmar }}</p>
          </div>
          <p v-if="pwMensaje && !pwErrores.password && !pwErrores.confirmar" class="alert danger" role="alert">{{ pwMensaje }}</p>
          <button type="submit" class="btn primary" :disabled="ocupado">Cambiar contraseña</button>
        </form>
      </section>

      <section class="card" aria-labelledby="c-vinc">
        <h2 id="c-vinc">Vincular datos de este dispositivo</h2>
        <p class="small">
          Solo se pueden vincular datos creados <strong>en este dispositivo sin cuenta</strong>. Vincúlalos solo si son tuyos o tienes el consentimiento de las personas medidas.
          Los datos de otras cuentas de este equipo nunca se leen.
        </p>
        <label class="check"><input v-model="ocultar" type="checkbox" @change="cambiarOcultar"> No ofrecer vincular en este equipo (oculta el aviso de Pacientes)</label>
        <button class="btn" data-testid="revisar-local" @click="revisarLocal">Revisar datos sin cuenta de este dispositivo</button>
        <template v-if="local">
          <p v-if="!local.detalle.length" class="muted" data-testid="sin-datos-locales">No hay datos sin cuenta en este dispositivo.</p>
          <fieldset v-else>
            <legend>Elige qué pacientes (y sus monitoreos) vincular</legend>
            <label v-for="p in local.detalle" :key="p.id" class="check">
              <input v-model="elegidos" type="checkbox" :value="p.id" :data-testid="`vincular-${p.id}`"> {{ p.etiqueta }} · {{ p.monitoreos }} monitoreo(s)
            </label>
            <label class="check"><input v-model="quitarCopia" type="checkbox"> Después de vincular, quitar la copia sin cuenta de este dispositivo</label>
            <button class="btn primary" data-testid="vincular-elegidos" :disabled="!elegidos.length || ocupado" @click="confirmaVincular = true">Vincular lo elegido…</button>
          </fieldset>
        </template>
      </section>

      <section class="card peligro" aria-labelledby="c-del">
        <h2 id="c-del">Eliminar mi cuenta</h2>
        <p class="small">Elimina tu cuenta, tus datos en la nube y los de este equipo. No se puede deshacer. Te pediremos tu contraseña.</p>
        <button class="btn danger" data-testid="eliminar-cuenta" :disabled="ocupado" @click="confirmar = 'cuenta'">Eliminar mi cuenta…</button>
      </section>
    </template>

    <ReauthDialog v-if="reauth" @ok="reauthOk" @cerrar="reauth = false; pendiente = null" />

    <BaseDialog v-if="dlgNube === 'activar'" titulo="Activar «Guardar mis datos en la nube»" ancho="600px" @cerrar="dlgNube = null">
      <p>Se copiarán a {{ NUBE_PROVEEDOR }} ({{ NUBE_REGION }}): tus pacientes («Paciente N», solo los que tengan declarada la mayoría de edad) y los monitoreos que guardes. Es una transferencia internacional de datos de salud seudonimizados. No se suben los borradores, alias, nombres ni notas.</p>
      <label class="check"><input v-model="subirGuardado" type="checkbox" data-testid="subir-guardado"> Subir también los monitoreos que ya tengo guardados en este dispositivo</label>
      <p v-if="progreso" role="status">Subiendo… {{ progreso }}</p>
      <template #acciones>
        <button class="btn" :disabled="ocupado" @click="dlgNube = null">Cancelar</button>
        <button class="btn primary" :disabled="ocupado" data-testid="confirmar-activar-nube" @click="activarNube">Activar</button>
      </template>
    </BaseDialog>

    <BaseDialog v-if="dlgNube === 'apagar'" titulo="Desactivar la nube" ancho="600px" @cerrar="dlgNube = null">
      <p>No se enviará nada nuevo. ¿Qué hacemos con lo que ya está en la nube?</p>
      <template #acciones>
        <button class="btn" :disabled="ocupado" @click="dlgNube = null">Cancelar</button>
        <button class="btn" :disabled="ocupado" data-testid="apagar-conservar" @click="apagarNube(false)">Desactivar y conservar lo subido</button>
        <button class="btn danger" :disabled="ocupado" data-testid="apagar-borrar" @click="conReauth(() => apagarNube(true))">Desactivar y borrar lo subido</button>
      </template>
    </BaseDialog>

    <BaseDialog v-if="confirmar === 'datos-nube'" titulo="¿Eliminar tus datos en la nube?" @cerrar="confirmar = null">
      <p>Se borran de la nube tus monitoreos, pacientes e incidentes. Las copias de este dispositivo se conservan (y lo que estuviera publicado deja de estarlo).</p>
      <template #acciones>
        <button class="btn" @click="confirmar = null">Cancelar</button>
        <button class="btn danger" data-testid="confirmar-borrar-nube" @click="conReauth(borrarNube)">Eliminar</button>
      </template>
    </BaseDialog>

    <BaseDialog v-if="confirmar === 'cuenta'" titulo="¿Eliminar tu cuenta?" @cerrar="confirmar = null">
      <p>Se eliminan tu cuenta y todos tus datos, en la nube y en este equipo. Es irreversible.</p>
      <template #acciones>
        <button class="btn" @click="confirmar = null">Cancelar</button>
        <button class="btn danger" data-testid="confirmar-eliminar-cuenta" @click="conReauth(eliminarCuenta)">Eliminar mi cuenta</button>
      </template>
    </BaseDialog>

    <BaseDialog v-if="confirmaVincular" titulo="Vincular datos a tu cuenta" @cerrar="confirmaVincular = false">
      <p>Se copiarán a tu cuenta ({{ elegidos.length }} paciente(s) con sus monitoreos), como <strong>privados</strong>.<template v-if="cuenta.nubeActivada"> Como la nube está activada, también se subirán a {{ NUBE_PROVEEDOR }}.</template><template v-else> La nube está desactivada: quedarán solo en este dispositivo.</template></p>
      <p v-if="quitarCopia" class="alert warn" role="alert">Además se quitará la copia sin cuenta de este dispositivo.
        <label class="check"><input v-model="confirmaQuitar" type="checkbox" data-testid="confirmar-quitar-copia"> Entiendo que esa copia se borrará.</label>
      </p>
      <p v-if="progreso" role="status">Procesando… {{ progreso }}</p>
      <template #acciones>
        <button class="btn" :disabled="ocupado" @click="confirmaVincular = false">Cancelar</button>
        <button class="btn primary" :disabled="ocupado || (quitarCopia && !confirmaQuitar)" data-testid="confirmar-vincular" @click="vincular">Sí, vincular</button>
      </template>
    </BaseDialog>
  </section>
</template>

<style scoped>
.cuenta-pagina { max-width: 760px; }
.cuenta-pagina .card { margin-bottom: 16px; }
.check { display: flex; gap: 8px; align-items: flex-start; margin: 6px 0; }
.check input { margin-top: 4px; flex: none; }
.peligro { border-color: var(--danger); }
</style>
