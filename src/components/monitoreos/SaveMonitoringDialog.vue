<script setup>
import { reactive, ref, computed } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { ACTIVIDADES } from '@/data/activities.js'
import { validarMetadatos, sugerirNombre, actividadPrincipal, NOMBRE_MAX, NOTA_MAX } from '@/services/monitoreos/catalog.js'

/**
 * Pide nombre, nota y actividad. modo "guardar": confirma un borrador (con "Descartar" y "Decidir después");
 * modo "editar": cambia los metadatos de un monitoreo ya guardado.
 */
const props = defineProps({
  sesion: { type: Object, required: true },
  modo: { type: String, default: 'guardar', validator: (v) => ['guardar', 'editar'].includes(v) },
  ocupado: { type: Boolean, default: false },
})
const emit = defineEmits(['guardar', 'descartar', 'cerrar'])

const form = reactive({
  nombre: props.sesion.nombre || sugerirNombre(props.sesion),
  notas: props.sesion.notas || '',
  actividad: actividadPrincipal(props.sesion) || 'reposo',
})
const errores = ref({})
const confirmandoDescarte = ref(false)
const titulo = computed(() => (props.modo === 'guardar' ? 'Guardar monitoreo' : 'Editar monitoreo'))

function enviar() {
  const v = validarMetadatos(form)
  errores.value = v.errores
  if (v.ok) emit('guardar', v.valores)
}
</script>

<template>
  <BaseDialog :titulo="titulo" ancho="560px" @cerrar="emit('cerrar')">
    <form id="form-monitoreo" novalidate @submit.prevent="enviar">
      <div class="field">
        <label for="mon-nombre">Nombre del monitoreo</label>
        <input id="mon-nombre" v-model="form.nombre" type="text" :maxlength="NOMBRE_MAX" autocomplete="off" :aria-invalid="!!errores.nombre" aria-describedby="mon-nombre-ayuda">
        <p id="mon-nombre-ayuda" class="hint">Letras, números, espacio y . , : ( ) / # _ - (máx. {{ NOMBRE_MAX }}).</p>
        <p v-if="errores.nombre" class="error-text" role="alert">{{ errores.nombre }}</p>
      </div>
      <div class="field">
        <label for="mon-actividad">Actividad principal</label>
        <select id="mon-actividad" v-model="form.actividad">
          <option v-for="a in ACTIVIDADES" :key="a.id" :value="a.id">{{ a.icono }} {{ a.nombre }}</option>
        </select>
        <p v-if="errores.actividad" class="error-text" role="alert">{{ errores.actividad }}</p>
      </div>
      <div class="field">
        <label for="mon-notas">Nota (opcional)</label>
        <textarea id="mon-notas" v-model="form.notas" rows="3" :maxlength="NOTA_MAX" aria-describedby="mon-notas-ayuda" />
        <p id="mon-notas-ayuda" class="hint"><strong>No escribas nombres, RUT, correo ni otros datos que identifiquen a una persona.</strong> Máx. {{ NOTA_MAX }} caracteres.</p>
        <p v-if="errores.notas" class="error-text" role="alert">{{ errores.notas }}</p>
      </div>
    </form>

    <p v-if="confirmandoDescarte" class="alert danger" role="alert">
      ¿Descartar este monitoreo? Se borrarán sus muestras de este navegador y de la nube. No se puede deshacer.
    </p>

    <template #acciones>
      <template v-if="modo === 'guardar'">
        <template v-if="!confirmandoDescarte">
          <button type="button" class="btn ghost" @click="emit('cerrar')">Decidir después</button>
          <button type="button" class="btn danger" :disabled="ocupado" @click="confirmandoDescarte = true">Descartar</button>
          <button type="submit" form="form-monitoreo" class="btn primary" :disabled="ocupado">Guardar monitoreo</button>
        </template>
        <template v-else>
          <button type="button" class="btn" @click="confirmandoDescarte = false">No, volver</button>
          <button type="button" class="btn danger" :disabled="ocupado" @click="emit('descartar')">Sí, descartar definitivamente</button>
        </template>
      </template>
      <template v-else>
        <button type="button" class="btn" @click="emit('cerrar')">Cancelar</button>
        <button type="submit" form="form-monitoreo" class="btn primary" :disabled="ocupado">Guardar cambios</button>
      </template>
    </template>
  </BaseDialog>
</template>
