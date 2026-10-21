<script setup>
import { reactive, ref, computed } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { ACTIVIDADES } from '@/data/activities.js'
import DataClassBadge from '@/components/common/DataClassBadge.vue'
import { cloudCuenta } from '@/services/cloud/cloudSync.js'
import { nubeActivada } from '@/services/cloud/nubeOptIn.js'
import { TEXTO_CONSENTIMIENTO_PUBLICACION } from '@/services/privacidad/consentimiento.js'
import { useMonitoreosStore } from '@/stores/monitoreos.js'
import { validarVisibilidad, visibilidadDe, perfilPublicable, CAMPOS_PUBLICADOS, CAMPOS_NO_PUBLICADOS } from '@/services/monitoreos/visibilidad.js'
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
const monitoreos = useMonitoreosStore()
const conCuenta = computed(() => !!cloudCuenta.value)
const puedePublicar = computed(() => conCuenta.value && nubeActivada.value)
const hayPerfil = computed(() => perfilPublicable(monitoreos.perfilDe(props.sesion)) !== null)
const vis = reactive({
  visibilidad: visibilidadDe(props.sesion),
  consentimientoPublicar: false,
  compartirPerfil: props.sesion.compartirPerfil === true,
  consentimientoPerfil: false,
})
const errores = ref({})
const confirmandoDescarte = ref(false)
const titulo = computed(() => (props.modo === 'guardar' ? 'Guardar monitoreo' : 'Editar monitoreo'))

function enviar() {
  const v = validarMetadatos(form)
  const extra = puedePublicar.value ? validarVisibilidad({ ...vis, tienePerfil: hayPerfil.value }) : { ok: true, errores: {} }
  errores.value = { ...v.errores, ...extra.errores }
  if (v.ok && extra.ok) {
    // Sin cuenta no se envía visibilidad: el monitoreo se queda privado y local.
    emit('guardar', puedePublicar.value ? { ...v.valores, ...vis } : v.valores)
  }
}
</script>

<template>
  <BaseDialog :titulo="titulo" ancho="560px" @cerrar="emit('cerrar')">
    <form id="form-monitoreo" novalidate @submit.prevent="enviar">
      <div class="field">
        <label for="mon-nombre">Nombre del monitoreo</label>
        <input id="mon-nombre" v-model="form.nombre" type="text" :maxlength="NOMBRE_MAX" autocomplete="off" :aria-invalid="!!errores.nombre" aria-describedby="mon-nombre-ayuda">
        <p id="mon-nombre-ayuda" class="hint">Letras, números, espacio y . , : ( ) / # _ - (máx. {{ NOMBRE_MAX }}). El nombre solo se guarda en este dispositivo (no se sube).</p>
        <p v-if="errores.nombre" class="error-text" role="alert">{{ errores.nombre }}</p>
      </div>
      <div class="field">
        <label for="mon-actividad">Actividad principal</label>
        <select id="mon-actividad" v-model="form.actividad">
          <option v-for="a in ACTIVIDADES" :key="a.id" :value="a.id">{{ a.nombre }}</option>
        </select>
        <p v-if="errores.actividad" class="error-text" role="alert">{{ errores.actividad }}</p>
      </div>
      <div class="field">
        <label for="mon-notas">Nota (opcional)</label>
        <textarea id="mon-notas" v-model="form.notas" rows="3" :maxlength="NOTA_MAX" aria-describedby="mon-notas-ayuda" />
        <p id="mon-notas-ayuda" class="hint"><strong>No escribas nombres reales, RUT, correo ni otros datos que identifiquen a una persona.</strong> La nota solo se guarda en este dispositivo (no se sube). Máx. {{ NOTA_MAX }} caracteres.</p>
        <p v-if="errores.notas" class="error-text" role="alert">{{ errores.notas }}</p>
      </div>
      <fieldset class="field vis-box" data-testid="bloque-visibilidad">
        <legend>Visibilidad del monitoreo <DataClassBadge /></legend>
        <label class="radio"><input v-model="vis.visibilidad" type="radio" value="privado" name="mon-vis"> <strong>Privado</strong> · solo tú, dentro de tu cuenta (recomendado)</label>
        <label class="radio"><input v-model="vis.visibilidad" type="radio" value="publico" name="mon-vis" :disabled="!puedePublicar"> <strong>Público</strong> · cualquier persona con una cuenta podrá verlo (solo lectura)</label>
        <div v-if="vis.visibilidad === 'publico'" class="alert warn" data-testid="aviso-publico">
          <p><strong>Se publicará:</strong> {{ CAMPOS_PUBLICADOS.join(', ') }}. <strong>No se publicará:</strong> {{ CAMPOS_NO_PUBLICADOS.join(', ') }}. Puedes volver a privado cuando quieras y se retira de inmediato.</p>
          <label class="check"><input v-model="vis.consentimientoPublicar" type="checkbox" data-testid="consentimiento-publicar"> {{ TEXTO_CONSENTIMIENTO_PUBLICACION }}</label>
          <p v-if="errores.consentimientoPublicar" class="error-text" role="alert">{{ errores.consentimientoPublicar }}</p>
          <template v-if="hayPerfil">
            <label class="check"><input v-model="vis.compartirPerfil" type="checkbox" data-testid="compartir-perfil"> Incluir datos del paciente (rango de edad, actividad…)</label>
            <label v-if="vis.compartirPerfil" class="check"><input v-model="vis.consentimientoPerfil" type="checkbox"> Confirmo que el paciente consintió que estos datos sean públicos.</label>
            <p v-if="errores.compartirPerfil || errores.consentimientoPerfil" class="error-text" role="alert">{{ errores.compartirPerfil || errores.consentimientoPerfil }}</p>
          </template>

        </div>
      </fieldset>
      <p v-if="!conCuenta" class="hint" data-testid="aviso-sin-cuenta">Sin cuenta, el monitoreo queda solo en este dispositivo y no se puede publicar. Inicia sesión y activa la nube para poder publicarlo.</p>
      <p v-else-if="!nubeActivada" class="hint" data-testid="aviso-nube-apagada">«Guardar mis datos en la nube» está apagado: este monitoreo se guardará solo en este dispositivo y no se podrá publicar. Puedes activarlo en <RouterLink to="/cuenta">Mi cuenta</RouterLink>.</p>
      <p v-else class="hint" data-testid="aviso-nube-activa">«Guardar mis datos en la nube» está activado: al guardar se copiará a tu nube (Supabase, EE. UU.) la señal, el BPM y la actividad. El nombre y la nota no se suben.</p>
    </form>

    <p v-if="confirmandoDescarte" class="alert danger" role="alert">
      ¿Descartar este monitoreo? Se borrarán sus muestras de este navegador (un borrador nunca se envía a la nube). No se puede deshacer.
    </p>

    <template #acciones>
      <template v-if="modo === 'guardar'">
        <template v-if="!confirmandoDescarte">
          <button type="button" class="btn ghost" @click="emit('cerrar')">Decidir después</button>
          <button type="button" class="btn btn-descartar" :disabled="ocupado" @click="confirmandoDescarte = true">Descartar</button>
          <button type="submit" form="form-monitoreo" class="btn btn-guardar" :disabled="ocupado">Guardar monitoreo</button>
        </template>
        <template v-else>
          <button type="button" class="btn" @click="confirmandoDescarte = false">No, volver</button>
          <button type="button" class="btn danger" :disabled="ocupado" @click="emit('descartar')">Sí, descartar definitivamente</button>
        </template>
      </template>
      <template v-else>
        <button type="button" class="btn" @click="emit('cerrar')">Cancelar</button>
        <button type="submit" form="form-monitoreo" class="btn btn-guardar" :disabled="ocupado">Guardar cambios</button>
      </template>
    </template>
  </BaseDialog>
</template>

<style scoped>
.vis-box { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 12px; }
.radio, .check { display: flex; gap: 8px; align-items: flex-start; margin: 6px 0; }
.radio input, .check input { margin-top: 4px; flex: none; }

/* Botón Guardar Monitoreo: Azul médico clínico seguro y destacado */
.btn-guardar {
  background: var(--info);
  color: #ffffff;
  border: none;
  font-weight: 800;
  box-shadow: 0 4px 16px rgba(2, 132, 199, 0.3);
}

.btn-guardar:hover:not(:disabled) {
  background: #0369a1;
  box-shadow: 0 6px 20px rgba(2, 132, 199, 0.42);
  transform: translateY(-2px);
}

/* Botón Descartar: Tono suave rojizo de advertencia, claramente diferenciado */
.btn-descartar {
  background: #fff1f2;
  color: var(--danger);
  border: 1.5px solid rgba(225, 29, 72, 0.35);
  font-weight: 700;
}

.btn-descartar:hover:not(:disabled) {
  background: var(--danger);
  color: #ffffff;
  border-color: var(--danger);
  box-shadow: 0 4px 14px rgba(225, 29, 72, 0.25);
  transform: translateY(-2px);
}
</style>
