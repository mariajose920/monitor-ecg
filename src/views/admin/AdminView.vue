<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import RangeSettingsForm from '@/components/admin/RangeSettingsForm.vue'
import SyncSettingsForm from '@/components/admin/SyncSettingsForm.vue'
import UserAdminTable from '@/components/admin/UserAdminTable.vue'
import DataManagement from '@/components/admin/DataManagement.vue'
import CloudSettings from '@/components/admin/CloudSettings.vue'
import AdminRolesPanel from '@/components/admin/AdminRolesPanel.vue'
import IsmsPanel from '@/components/admin/IsmsPanel.vue'
import SoportePanel from '@/components/admin/SoportePanel.vue'
import TotpRenovarDialog from '@/components/admin/TotpRenovarDialog.vue'
import { useIsmsStore } from '@/stores/isms.js'
import { useAuthStore } from '@/stores/auth.js'

/** RF25–RF27: panel de administración (protegido por guard + assertAdmin en las acciones). */
const auth = useAuthStore()
const isms = useIsmsStore()
const tab = ref('parametros')
const TABS = [
  { id: 'parametros', texto: 'Parámetros' },
  { id: 'sincronizacion', texto: 'Sincronización' },
  { id: 'usuarios', texto: 'Participantes' },
  { id: 'datos', texto: 'Datos y seguridad' },
  { id: 'nube', texto: 'Nube' },
  ...(auth.nube ? [{ id: 'administradores', texto: 'Administradores' }, { id: 'soporte', texto: 'Soporte y moderación' }] : []),
  { id: 'sgsi', texto: 'SGSI (ISO 27001)' },
]
// A.7.2.2: si la política vigente no está aceptada, se abre directamente la pestaña SGSI.
if (isms.debeAceptarPolitica) tab.value = 'sgsi'
const ahora = ref(Date.now())
const t = setInterval(() => (ahora.value = Date.now()), 1000)
// C-09: el contador de incidentes abiertos se refresca desde la nube cada minuto (el reporte de otro navegador llega en <= 1 min).
const abiertos = computed(() => isms.abiertos.length)
let tIncidentes = null
onMounted(async () => {
  await isms.ensureLoaded()
  tIncidentes = setInterval(() => isms.sincronizarNube().catch(() => {}), 60_000)
})
onBeforeUnmount(() => {
  clearInterval(t)
  clearInterval(tIncidentes)
})
const restante = computed(() => {
  const s = Math.max(0, Math.ceil(((auth.adminSessionExpiresAt ?? 0) - ahora.value) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})
</script>

<template>
  <section>
    <div class="page-header">
      <h1>Administración</h1>
      <div class="row">
        <span class="muted small">La sesión expira por inactividad en <span class="mono">{{ restante }}</span></span>
        <RouterLink to="/admin/auditoria" class="btn small">Auditoría</RouterLink>
        <button class="btn small danger" @click="auth.logout()">Cerrar sesión</button>
      </div>
    </div>
    <p v-if="isms.debeAceptarPolitica && tab !== 'sgsi'" class="alert warn small" role="status">Falta aceptar la política de seguridad vigente (A.7.2.2): pestaña SGSI.</p>
    <div class="tabs" role="tablist">
      <button v-for="tb in TABS" :key="tb.id" role="tab" :aria-selected="tab === tb.id" :class="{ active: tab === tb.id }" @click="tab = tb.id">{{ tb.texto }}<span v-if="tb.id === 'sgsi' && abiertos" class="chip danger" data-testid="incidentes-abiertos" :aria-label="`${abiertos} incidentes abiertos`">{{ abiertos }}</span></button>
    </div>
    <RangeSettingsForm v-if="tab === 'parametros'" />
    <SyncSettingsForm v-else-if="tab === 'sincronizacion'" />
    <UserAdminTable v-else-if="tab === 'usuarios'" />
    <CloudSettings v-else-if="tab === 'nube'" />
    <AdminRolesPanel v-else-if="tab === 'administradores'" />
    <SoportePanel v-else-if="tab === 'soporte'" />
    <IsmsPanel v-else-if="tab === 'sgsi'" />
    <DataManagement v-else />
    <TotpRenovarDialog />
  </section>
</template>
