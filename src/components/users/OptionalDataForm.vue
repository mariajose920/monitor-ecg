<script setup>
import { reactive, ref, watch } from 'vue'
import DataClassBadge from '@/components/common/DataClassBadge.vue'
import { RANGOS_EDAD, NIVELES_ACTIVIDAD } from '@/data/activities.js'
import { useUsersStore, validarPerfil } from '@/stores/users.js'
import { notify } from '@/services/notifications/notifier.js'

/** RF03 + SEC-20: datos opcionales minimizados (edad por rangos, peso con 1 decimal, lista cerrada). */
const props = defineProps({ usuario: { type: Object, required: true } })
const users = useUsersStore()
const form = reactive({ rangoEdad: '', pesoKg: '', nivelActividad: '' })
const error = ref('')
const mostrar = ref(false)

watch(
  () => props.usuario,
  (u) => {
    form.rangoEdad = u.perfil?.rangoEdad ?? ''
    form.pesoKg = u.perfil?.pesoKg ?? ''
    form.nivelActividad = u.perfil?.nivelActividad ?? ''
  },
  { immediate: true },
)

async function guardar() {
  error.value = ''
  const r = validarPerfil(form)
  if (r.error) {
    error.value = r.error
    return
  }
  try {
    await users.updateProfile(props.usuario.id, form)
    notify('Datos opcionales guardados (cifrados).', { tipo: 'ok' })
  } catch (e) {
    error.value = e.message
  }
}
</script>

<template>
  <form class="stack" novalidate @submit.prevent="guardar">
    <div class="row">
      <DataClassBadge level="sensitive" texto="Datos opcionales" />
      <button type="button" class="btn small ghost" :aria-pressed="mostrar" @click="mostrar = !mostrar">
        {{ mostrar ? 'Ocultar datos (modo presentación)' : 'Mostrar datos opcionales' }}
      </button>
    </div>
    <template v-if="mostrar">
      <div class="grid cols-2">
        <div class="field">
          <label for="opt-edad">Rango de edad</label>
          <select id="opt-edad" v-model="form.rangoEdad">
            <option value="">— Prefiero no indicar —</option>
            <option v-for="r in RANGOS_EDAD" :key="r" :value="r">{{ r }} años</option>
          </select>
          <p class="hint">Solo mayores de edad. Se guarda el rango, no la edad exacta.</p>
        </div>
        <div class="field">
          <label for="opt-peso">Peso (kg)</label>
          <input id="opt-peso" v-model="form.pesoKg" type="text" inputmode="decimal" maxlength="5" placeholder="p. ej. 68.5" autocomplete="off">
          <p class="hint">Entre 30 y 250 kg, 1 decimal como máximo.</p>
        </div>
        <div class="field">
          <label for="opt-nivel">Actividad física habitual</label>
          <select id="opt-nivel" v-model="form.nivelActividad">
            <option value="">— Prefiero no indicar —</option>
            <option v-for="n in NIVELES_ACTIVIDAD" :key="n.id" :value="n.id">{{ n.nombre }}</option>
          </select>
        </div>
      </div>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <button class="btn primary" type="submit">Guardar datos opcionales</button>
    </template>
  </form>
</template>
