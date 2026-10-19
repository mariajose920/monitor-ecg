<script setup>
import { ref } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { useUsersStore, ALIAS_RE } from '@/stores/users.js'
import { notify } from '@/services/notifications/notifier.js'

/**
 * Alta rápida de usuario sin salir del Monitor: el sistema asigna "Usuario N" (seudónimo); el alias es opcional.
 * Los datos opcionales (edad, peso) se piden solo en /usuarios, con consentimiento.
 */
const emit = defineEmits(['creado', 'cerrar'])
const users = useUsersStore()
const alias = ref('')
const error = ref('')
const ocupado = ref(false)

async function crear() {
  error.value = ''
  const a = alias.value.trim()
  if (a && !ALIAS_RE.test(a)) {
    error.value = 'Solo letras sin tilde, números, espacio, _ y - (máx. 20).'
    return
  }
  ocupado.value = true
  try {
    const u = await users.createUser(a)
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
        <p id="quick-alias-ayuda" class="hint"><strong>No uses tu nombre real, RUT ni correo.</strong> El sistema asigna «Usuario N».</p>
        <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      </div>
    </form>
    <template #acciones>
      <button class="btn" @click="emit('cerrar')">Cancelar</button>
      <button type="submit" form="form-quick-user" class="btn primary" :disabled="ocupado" data-testid="crear-usuario-rapido">Crear usuario</button>
    </template>
  </BaseDialog>
</template>
