<script setup>
import { ref, computed, watch } from 'vue'
import { useUsersStore } from '@/stores/users.js'
import { filtrarMonitoreos, ordenarMonitoreos, nombreMonitoreo, participantesVisibles, actividadPrincipal, duracionMs } from '@/services/monitoreos/catalog.js'
import { miniaturaDe } from '@/services/monitoreos/miniatura.js'
import { ACTIVIDADES, nombreActividad } from '@/data/activities.js'
import { formatFecha, formatDuracion } from '@/utils/time.js'

/**
 * Selector de medición en 2 pasos: 1) usuario, 2) medición de una lista con búsqueda, filtro de actividad,
 * fecha, BPM medio, duración y miniatura de la señal. Emite sesionId y canal (índice de la participación).
 */
const props = defineProps({
  idBase: { type: String, required: true },
  lista: { type: Array, required: true },
  ctx: { type: Object, required: true },
  sesionId: { type: String, default: '' },
  canal: { type: [String, Number], default: '' },
  titulo: { type: String, default: 'Medición' },
})
const emit = defineEmits(['update:sesionId', 'update:canal'])
const users = useUsersStore()

const usuarioSel = ref('')
const texto = ref('')
const actividad = ref('')
const miniaturas = ref({}) // 'sesion:canal' → path d

const etiqueta = (id) => (id === 'publico' ? 'Paciente anónimo' : users.byId(id)?.etiqueta ?? 'Paciente eliminado')

const usuarios = computed(() => {
  const ids = new Set()
  for (const s of props.lista) for (const p of participantesVisibles(s, props.ctx)) ids.add(p.usuarioId)
  return [...ids].map((id) => ({ id, etiqueta: etiqueta(id) })).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es', { numeric: true }))
})

// Con un solo usuario visible (caso del participante) se elige solo.
watch(usuarios, (u) => { if (u.length === 1 && !usuarioSel.value) usuarioSel.value = u[0].id }, { immediate: true })

/** Una fila por (monitoreo, participación) del usuario elegido. */
const filas = computed(() => {
  if (!usuarioSel.value) return []
  const sesiones = filtrarMonitoreos(props.lista, { usuarioId: usuarioSel.value, texto: texto.value, actividad: actividad.value }, { ...props.ctx, etiquetaDe: etiqueta })
  return ordenarMonitoreos(sesiones, { campo: 'fecha', dir: 'desc' }, { ...props.ctx, usuarioId: usuarioSel.value })
    .flatMap((s) => participantesVisibles(s, props.ctx).filter((p) => p.usuarioId === usuarioSel.value).map((p) => ({ s, p, key: `${s.id}:${p.canalIndex}` })))
    .slice(0, 30)
})

watch(filas, async (fs) => {
  for (const f of fs.slice(0, 12)) {
    if (miniaturas.value[f.key] === undefined) {
      miniaturas.value = { ...miniaturas.value, [f.key]: await miniaturaDe(f.s.id, f.p.canalIndex) }
    }
  }
}, { immediate: true })

const seleccionada = computed(() => `${props.sesionId}:${props.canal}`)

function elegir(f) {
  emit('update:sesionId', f.s.id)
  emit('update:canal', f.p.canalIndex)
}

// Si llegan sesión y canal desde fuera (enlaces), se preselecciona el usuario.
watch(() => [props.sesionId, props.canal], () => {
  const s = props.lista.find((x) => x.id === props.sesionId)
  const p = s ? participantesVisibles(s, props.ctx).find((x) => x.canalIndex === Number(props.canal)) : null
  if (p && usuarioSel.value !== p.usuarioId) usuarioSel.value = p.usuarioId
}, { immediate: true })

function cambiarUsuario() {
  emit('update:sesionId', '')
  emit('update:canal', '')
}
</script>

<template>
  <div class="selector" role="group" :aria-label="titulo">
    <div v-if="!lista.length" class="vacio" data-testid="selector-vacio">
      <p><strong>Aún no tienes monitoreos.</strong> Haz uno en <RouterLink to="/monitor">Monitor</RouterLink> y guárdalo.</p>
    </div>
    <template v-else>
      <div class="field">
        <label :for="`${idBase}-usuario`">1. Usuario</label>
        <select :id="`${idBase}-usuario`" v-model="usuarioSel" @change="cambiarUsuario">
          <option value="">— Elige un usuario —</option>
          <option v-for="u in usuarios" :key="u.id" :value="u.id">{{ u.etiqueta }}</option>
        </select>
      </div>
      <template v-if="usuarioSel">
        <div class="filtros">
          <div class="field">
            <label :for="`${idBase}-buscar`">2. Buscar medición</label>
            <input :id="`${idBase}-buscar`" v-model="texto" type="search" autocomplete="off" placeholder="nombre o nota">
          </div>
          <div class="field">
            <label :for="`${idBase}-act`">Actividad</label>
            <select :id="`${idBase}-act`" v-model="actividad">
              <option value="">Todas</option>
              <option v-for="a in ACTIVIDADES" :key="a.id" :value="a.id">{{ a.nombre }}</option>
            </select>
          </div>
        </div>
        <p v-if="!filas.length" class="muted small" role="status">Ninguna medición coincide. Prueba otra búsqueda.</p>
        <ul v-else class="lista" role="radiogroup" :aria-label="`Mediciones de ${etiqueta(usuarioSel)}`">
          <li v-for="f in filas" :key="f.key">
            <button type="button" role="radio" :aria-checked="seleccionada === f.key" :class="['item', { sel: seleccionada === f.key }]" :data-testid="`medicion-${f.s.id}`" @click="elegir(f)">
              <svg class="mini" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
                <path v-if="miniaturas[f.key]" :d="miniaturas[f.key]" fill="none" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" />
              </svg>
              <span class="datos">
                <strong>{{ nombreMonitoreo(f.s) }}</strong>
                <span class="muted small">{{ formatFecha(f.s.inicio) }} · {{ actividadPrincipal(f.s, [f.p]) ? nombreActividad(actividadPrincipal(f.s, [f.p])) : '—' }}</span>
                <span class="muted small">BPM medio {{ f.p.resumen?.bpmMedio ?? '--' }} · {{ duracionMs(f.s) === null ? '—' : formatDuracion(duracionMs(f.s)) }}</span>
              </span>
              <span v-if="seleccionada === f.key" class="chip ok">✓ Elegida</span>
            </button>
          </li>
        </ul>
      </template>
    </template>
  </div>
</template>

<style scoped>
.filtros {
  display: grid;
  gap: 8px 12px;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
  max-height: 340px;
  overflow-y: auto;
}

.item {
  width: 100%;
  display: grid;
  grid-template-columns: 88px 1fr auto;
  gap: 10px;
  align-items: center;
  text-align: left;
  min-height: var(--touch);
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}

.item.sel {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent);
}

.mini {
  width: 88px;
  height: 30px;
  color: var(--signal);
  background: var(--bg-elev-2);
  border-radius: 4px;
}

.datos {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.datos strong {
  overflow-wrap: anywhere;
}

@media (max-width: 480px) {
  .item {
    grid-template-columns: 1fr;
  }

  .mini {
    width: 100%;
  }
}

.vacio {
  padding: 8px 0;
}
</style>
