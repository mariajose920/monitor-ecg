<script setup>
import { ref, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings.js'
import { useAdminStore } from '@/stores/admin.js'
import { useAuthStore } from '@/stores/auth.js'
import PinPrompt from './PinPrompt.vue'
import ExportWarningDialog from '@/components/common/ExportWarningDialog.vue'
import DataClassBadge from '@/components/common/DataClassBadge.vue'
import { RETENCION_MAX_DIAS, validarRetencion } from '@/data/defaultSettings.js'
import { validateNewPin } from '@/services/security/pinHash.js'
import { notify } from '@/services/notifications/notifier.js'

/** Retención (SEC-32), exportación global (SEC-43/44), borrado total (SEC-31) y cambio de PIN (SEC-12). */
const settings = useSettingsStore()
const admin = useAdminStore()
const auth = useAuthStore()

const dias = ref(settings.retencionDias)
watch(() => settings.retencionDias, (v) => (dias.value = v))
const errorRet = ref('')

const pedirReauthRet = ref(false)
async function guardarRetencion() {
  errorRet.value = ''
  const d = Number.parseInt(String(dias.value), 10)
  const e = validarRetencion(d)
  if (e) return (errorRet.value = e)
  // Parámetro crítico (borra datos por antigüedad): con nube exige un código TOTP nuevo (A.9.4.2).
  if (auth.nube && !pedirReauthRet.value) {
    errorPin.value = ''
    pedirReauthRet.value = true
    return
  }
  try {
    await settings.setRetencion(d)
    pedirReauthRet.value = false
    notify('Retención guardada. La purga se aplica al iniciar la app.', { tipo: 'ok' })
  } catch (err) {
    errorRet.value = err.message
  }
}

async function confirmarRetencion(codigo) {
  ocupado.value = true
  errorPin.value = ''
  try {
    if (!(await auth.reauth(codigo))) {
      errorPin.value = 'Código incorrecto o vencido'
      return
    }
    await guardarRetencion()
  } finally {
    ocupado.value = false
  }
}

// Exportación global
const avisoExport = ref(false)
const pedirPinExport = ref(false)
const incluirOpcionales = ref(false)
const errorPin = ref('')
const ocupado = ref(false)

async function exportarTodo(pin) {
  ocupado.value = true
  errorPin.value = ''
  try {
    const filas = await admin.exportAll(pin, incluirOpcionales.value)
    pedirPinExport.value = false
    notify(`Exportadas ${filas} filas seudonimizadas.`, { tipo: 'ok' })
  } catch (e) {
    errorPin.value = e.message
  } finally {
    ocupado.value = false
  }
}

// Borrado total
const pedirPinBorrado = ref(false)
async function borrarTodo(pin) {
  ocupado.value = true
  errorPin.value = ''
  try {
    await admin.wipeAll(pin)
    pedirPinBorrado.value = false
    notify('Todos los datos fueron borrados (incluida la clave de cifrado).', { tipo: 'ok' })
  } catch (e) {
    errorPin.value = e.message
  } finally {
    ocupado.value = false
  }
}

// Cambio de PIN
const pinActual = ref('')
const pinNuevo = ref('')
const pinNuevo2 = ref('')
const errorCambio = ref('')
async function cambiarPin() {
  errorCambio.value = ''
  const e = validateNewPin(pinNuevo.value)
  if (e) return (errorCambio.value = e)
  if (pinNuevo.value !== pinNuevo2.value) return (errorCambio.value = 'Los PIN nuevos no coinciden')
  ocupado.value = true
  try {
    const r = await auth.changePin(pinActual.value, pinNuevo.value)
    if (r.ok) notify('PIN actualizado.', { tipo: 'ok' })
    else errorCambio.value = r.error || (r.locked ? 'Acceso bloqueado por intentos fallidos.' : 'PIN actual incorrecto')
  } catch (err) {
    errorCambio.value = err.message
  } finally {
    pinActual.value = pinNuevo.value = pinNuevo2.value = ''
    ocupado.value = false
  }
}
</script>

<template>
  <div>
    <section class="card">
      <h2>Retención de mediciones (SEC-32)</h2>
      <form class="row" @submit.prevent="guardarRetencion">
        <label for="ret" class="sr-only">Días de retención</label>
        <input id="ret" v-model="dias" type="number" min="1" :max="RETENCION_MAX_DIAS" step="1" class="corto">
        <span>días (máx. {{ RETENCION_MAX_DIAS }})</span>
        <button class="btn primary" type="submit">Guardar</button>
      </form>
      <p v-if="errorRet" class="error-text" role="alert">{{ errorRet }}</p>
    </section>

    <section class="card">
      <h2>Exportar todas las sesiones <DataClassBadge level="sensitive" /></h2>
      <p class="muted">CSV seudonimizado de todos los participantes. Requiere volver a confirmar tu identidad ({{ auth.nube ? 'código del segundo factor' : 'PIN' }}).</p>
      <label class="check"><input v-model="incluirOpcionales" type="checkbox"> Incluir datos opcionales (rango de edad y peso) solo de quienes dieron consentimiento</label>
      <button class="btn" @click="avisoExport = true">Exportar todo…</button>
    </section>

    <section v-if="!auth.nube" class="card">
      <h2>Cambiar PIN</h2>
      <form @submit.prevent="cambiarPin">
        <div class="grid cols-3">
          <div class="field"><label for="p-act">PIN actual</label><input id="p-act" v-model="pinActual" type="password" autocomplete="current-password" required></div>
          <div class="field"><label for="p-new">PIN nuevo</label><input id="p-new" v-model="pinNuevo" type="password" autocomplete="new-password" required></div>
          <div class="field"><label for="p-new2">Repite el PIN nuevo</label><input id="p-new2" v-model="pinNuevo2" type="password" autocomplete="new-password" required></div>
        </div>
        <p v-if="errorCambio" class="error-text" role="alert">{{ errorCambio }}</p>
        <button class="btn" type="submit" :disabled="ocupado">Cambiar PIN</button>
      </form>
    </section>

    <section class="card peligro">
      <h2>Borrar todos los datos (SEC-31)</h2>
      <p>Borra participantes, sesiones, configuración y la <strong>clave de cifrado</strong> (cualquier residuo queda ilegible). La auditoría se reinicia con el evento ALL_DATA_WIPED. Con la nube activa no hay PIN local; sin nube se conserva el PIN de administrador.</p>
      <button class="btn danger" @click="pedirPinBorrado = true">Borrar todo…</button>
    </section>

    <ExportWarningDialog
      v-if="avisoExport"
      detalle="Se exportarán todas las sesiones de todos los participantes."
      @confirmar="avisoExport = false; pedirPinExport = true; errorPin = ''"
      @cancelar="avisoExport = false"
    />
    <PinPrompt v-if="pedirReauthRet" titulo="Confirmar cambio de retención" accion="Confirmar" :ocupado="ocupado" :error="errorPin" @confirmar="confirmarRetencion" @cancelar="pedirReauthRet = false" />
    <PinPrompt v-if="pedirPinExport" titulo="Confirmar exportación global" accion="Exportar" :ocupado="ocupado" :error="errorPin" @confirmar="exportarTodo" @cancelar="pedirPinExport = false" />
    <PinPrompt
      v-if="pedirPinBorrado"
      titulo="Confirmar borrado total"
      mensaje="Esta acción no se puede deshacer."
      accion="Borrar todo"
      peligro
      :ocupado="ocupado"
      :error="errorPin"
      @confirmar="borrarTodo"
      @cancelar="pedirPinBorrado = false; errorPin = ''"
    />
  </div>
</template>

<style scoped>
.corto {
  max-width: 120px;
}

.peligro {
  border-color: var(--danger);
}
</style>
