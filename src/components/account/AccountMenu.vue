<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { useAccountStore } from '@/stores/account.js'
import { notify } from '@/services/notifications/notifier.js'

/** Indicador de cuenta del encabezado (escritorio y menú móvil) y cierre de sesión. */
const cuenta = useAccountStore()
const router = useRouter()
const saliendo = ref(false)
const ocupado = ref(false)

async function salir(borrar) {
  ocupado.value = true
  try {
    await cuenta.cerrarSesion({ borrarDatosDelEquipo: borrar })
    saliendo.value = false
    notify(borrar ? 'Sesión cerrada. Los datos de tu cuenta se quitaron de este equipo.' : 'Sesión cerrada.', { tipo: 'ok' })
    router.push('/')
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  } finally {
    ocupado.value = false
  }
}
</script>

<template>
  <div class="cuenta" data-testid="menu-cuenta">
    <template v-if="cuenta.iniciada">
      <span class="chip info correo" :title="cuenta.cuenta.email"><span aria-hidden="true">🔐</span><span class="sr-only">Cuenta: </span>{{ cuenta.cuenta.email }}</span>
      <button class="btn small ghost" data-testid="cerrar-sesion-cuenta" @click="saliendo = true">Cerrar sesión</button>
    </template>
    <RouterLink v-else class="btn small" to="/acceso" data-testid="enlace-acceso">Iniciar sesión</RouterLink>

    <BaseDialog v-if="saliendo" titulo="Cerrar sesión" @cerrar="saliendo = false">
      <p>
        Tus pacientes y monitoreos están guardados en tu cuenta. En un equipo compartido conviene
        <strong>quitar los datos de salud de este equipo</strong> al salir.
      </p>
      <template #acciones>
        <button class="btn" :disabled="ocupado" @click="saliendo = false">Cancelar</button>
        <button class="btn" :disabled="ocupado" data-testid="salir-conservar" @click="salir(false)">Cerrar y conservar copia cifrada</button>
        <button class="btn primary" :disabled="ocupado" data-testid="salir-borrar" @click="salir(true)">Cerrar y quitar datos del equipo</button>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.cuenta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.correo { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; }
</style>
