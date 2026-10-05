<script setup>
import { ref, computed, onMounted, shallowRef, markRaw } from 'vue'
import { useRoute } from 'vue-router'
import SignalChart from '@/components/common/SignalChart.vue'
import DataClassBadge from '@/components/common/DataClassBadge.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { getSession, getChannelSignal } from '@/services/storage/sessionRepository.js'
import { useUsersStore } from '@/stores/users.js'
import { useAuthStore } from '@/stores/auth.js'
import { formatFecha, formatDuracion } from '@/utils/time.js'
import { nombreActividad } from '@/data/activities.js'

/** Revisión de una sesión: resumen, actividad (RF19), eventos y señal. */
const route = useRoute()
const users = useUsersStore()
const auth = useAuthStore()
const sesion = ref(null)
const cargando = ref(true)
const senal = shallowRef(null) // { canal, data } fuera de la reactividad profunda
const cargandoSenal = ref(null)

onMounted(async () => {
  sesion.value = await getSession(String(route.params.id))
  cargando.value = false
})

const visibles = computed(() => {
  if (!sesion.value) return []
  if (auth.isAdmin && !users.activeUserId) return sesion.value.participantes
  return sesion.value.participantes.filter((p) => p.usuarioId === users.activeUserId)
})

const TIPOS = {
  'leads-off': 'Electrodos desconectados',
  'leads-on': 'Electrodos reconectados',
  'senal-perdida': 'Señal perdida',
  'alerta-alta': 'Alerta: sobre el rango',
  'alerta-baja': 'Alerta: bajo el rango',
  marca: 'Marca manual',
  'fin-canal': 'Fin del canal',
  'reinicio-dispositivo': 'Reinicio de la placa',
}

async function verSenal(p) {
  cargandoSenal.value = p.canalIndex
  try {
    const s = await getChannelSignal(sesion.value.id, p.canalIndex)
    const x = new Float64Array(s.n)
    const y = new Array(s.n)
    for (let i = 0; i < s.n; i++) {
      x[i] = s.t[i] / 1000
      y[i] = s.lo[i] ? null : s.raw[i]
    }
    senal.value = markRaw({ canal: p.canalIndex, data: [x, y], n: s.n })
  } finally {
    cargandoSenal.value = null
  }
}

const seriesSenal = [{ label: 'ECG (cuentas ADC)', color: '--signal' }]
</script>

<template>
  <section>
    <div class="page-header">
      <h1>Detalle de sesión</h1>
      <DataClassBadge level="sensitive" />
    </div>
    <RouterLink to="/sesiones">← Volver a sesiones</RouterLink>

    <p v-if="cargando" class="muted">Cargando…</p>
    <EmptyState v-else-if="!sesion || !visibles.length" titulo="Sesión no encontrada" texto="No existe o no tienes acceso a ella." />

    <template v-else>
      <div class="card info">
        <p>
          Inicio: <strong>{{ formatFecha(sesion.inicio) }}</strong> · Fin: <strong>{{ formatFecha(sesion.fin) }}</strong>
          · Estado: <strong>{{ sesion.estado }}</strong><template v-if="sesion.motivoFin"> ({{ sesion.motivoFin }})</template>
        </p>
        <p class="muted small">Parámetros aplicados: global {{ sesion.parametrosAplicados.bpm.global.min }}–{{ sesion.parametrosAplicados.bpm.global.max }} BPM, por actividad: {{ sesion.parametrosAplicados.bpm.usarPorActividad ? 'sí' : 'no' }}.</p>
      </div>

      <article v-for="p in visibles" :key="p.canalIndex" class="card">
        <h2>{{ users.byId(p.usuarioId)?.etiqueta ?? 'Usuario eliminado' }} · {{ p.canalNombre }}</h2>
        <p class="muted small">Fuente: {{ p.fuente.tipo }} ({{ p.fuente.perfilId }}) · {{ p.fs }} Hz · estado final: {{ p.estadoFinal ?? 'en curso' }}<template v-if="p.motivoFin"> ({{ p.motivoFin }})</template></p>

        <div v-if="p.resumen" class="grid cols-3 resumen">
          <div><span class="muted small">Duración</span><br><strong class="mono">{{ formatDuracion(p.resumen.duracionMs) }}</strong></div>
          <div><span class="muted small">BPM medio (mín.–máx.)</span><br><strong class="mono">{{ p.resumen.bpmMedio ?? '--' }} ({{ p.resumen.bpmMin ?? '--' }}–{{ p.resumen.bpmMax ?? '--' }})</strong></div>
          <div><span class="muted small">Tiempo fuera de rango</span><br><strong class="mono">{{ p.resumen.pctFueraRango ?? '--' }} %</strong></div>
          <div><span class="muted small">Muestras</span><br><strong class="mono">{{ p.resumen.muestras }}</strong></div>
          <div><span class="muted small">Líneas descartadas</span><br><strong class="mono">{{ p.resumen.descartadas }}</strong></div>
        </div>

        <h3>Actividad (RF19)</h3>
        <ol class="timeline">
          <li v-for="(a, i) in p.actividad" :key="i"><span class="mono">{{ formatDuracion(a.tMs) }}</span> · {{ nombreActividad(a.valor) }}</li>
        </ol>

        <h3>Eventos</h3>
        <p v-if="!p.eventos.length" class="muted small">Sin eventos.</p>
        <ul v-else class="eventos">
          <li v-for="(e, i) in p.eventos.slice(0, 200)" :key="i"><span class="mono">{{ formatDuracion(e.tMs) }}</span> · {{ TIPOS[e.tipo] ?? e.tipo }}</li>
        </ul>

        <button class="btn" :disabled="cargandoSenal === p.canalIndex" @click="verSenal(p)">
          {{ cargandoSenal === p.canalIndex ? 'Descifrando…' : 'Ver señal grabada' }}
        </button>
        <div v-if="senal && senal.canal === p.canalIndex" class="grafico">
          <p class="muted small">{{ senal.n }} muestras. Los huecos corresponden a electrodos desconectados.</p>
          <SignalChart :data="senal.data" :series="seriesSenal" :height="280" y-label="ADC" />
        </div>
      </article>
    </template>
  </section>
</template>

<style scoped>
.info {
  margin: var(--gap) 0;
}

.resumen {
  margin: 12px 0;
}

.timeline,
.eventos {
  max-height: 220px;
  overflow-y: auto;
  padding-left: 20px;
}

.grafico {
  margin-top: 12px;
}
</style>
