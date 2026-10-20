<script setup>
import { ref } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { useUsersStore } from '@/stores/users.js'
import { validarAlias } from '@/services/privacidad/alias.js'
import { TEXTO_DECLARACION_MAYOR_EDAD } from '@/services/privacidad/consentimiento.js'
import { notify } from '@/services/notifications/notifier.js'

/**
 * Alta rápida de usuario sin salir del Monitor: el sistema asigna "Paciente N" (seudónimo); el alias es opcional.
 * Los datos opcionales (edad, peso) se piden solo en /usuarios, con consentimiento.
 */
const emit = defineEmits(['creado', 'cerrar'])
const users = useUsersStore()
const alias = ref('')
const mayorEdad = ref(false)
const error = ref('')
const ocupado = ref(false)

async function crear() {
  error.value = ''
  const a = alias.value.trim()
  const err = validarAlias(a)
  if (err) {
    error.value = err
    return
  }
  if (!mayorEdad.value) {
    error.value = 'Confirma que la persona medida es mayor de 18 años.'
    return
  }
  ocupado.value = true
  try {
    const u = await users.createUser(a, { declaraMayorEdad: mayorEdad.value })
    notify(`Creado ${u.etiqueta}.`, { tipo: 'ok', duracionMs: 2500 })
    emit('creado', u)
  } catch (e) {
    error.value = e.message
  } finally {
    ocupado.value = false
  }
}
</script>

<template>
  <BaseDialog titulo="Nuevo usuario" ancho="460px" @cerrar="emit('cerrar')">
    <form id="form-quick-user" novalidate @submit.prevent="crear">
      <div class="field">
        <label for="quick-alias">Alias (opcional)</label>
        <input id="quick-alias" v-model="alias" type="text" maxlength="20" autocomplete="off" aria-describedby="quick-alias-ayuda">
        <p id="quick-alias-ayuda" class="hint"><strong>No uses nombres reales, RUT ni correo.</strong> El alias solo se guarda en este dispositivo (no se sube). El sistema asigna «Paciente N».</p>
      </div>
      <div class="field">
        <label class="check"><input v-model="mayorEdad" type="checkbox" data-testid="declara-mayor-edad"> {{ TEXTO_DECLARACION_MAYOR_EDAD }}</label>
        <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      </div>
    </form>
    <template #acciones>
      <button class="btn" @click="emit('cerrar')">Cancelar</button>
      <button type="submit" form="form-quick-user" class="btn primary" :disabled="ocupado" data-testid="crear-usuario-rapido">Crear usuario</button>
    </template>
  </BaseDialog>
</template>
