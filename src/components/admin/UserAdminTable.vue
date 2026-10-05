<script setup>
import { useUsersStore, consentimientoVigente } from '@/stores/users.js'
import { useAdminStore } from '@/stores/admin.js'
import { useChannelsStore } from '@/stores/channels.js'
import { notify } from '@/services/notifications/notifier.js'
import { formatFecha } from '@/utils/time.js'

/** Gestión de identificadores (5.16): alta desde Participantes, baja aquí. Sin datos opcionales visibles. */
const users = useUsersStore()
const admin = useAdminStore()
const channels = useChannelsStore()

async function borrar(u) {
  if (channels.channels.some((c) => c.usuarioId === u.id && !['idle', 'finished'].includes(c.estado))) {
    notify('El usuario está en un canal conectado. Desconéctalo primero.', { tipo: 'error' })
    return
  }
  if (!window.confirm(`¿Eliminar ${u.etiqueta} y todas sus mediciones?`)) return
  try {
    for (const c of channels.channels.filter((x) => x.usuarioId === u.id)) channels.setUsuario(c.id, null)
    await admin.deleteUser(u.id)
    notify(`${u.etiqueta} eliminado.`, { tipo: 'ok' })
  } catch (e) {
    notify(e.message, { tipo: 'error' })
  }
}
</script>

<template>
  <section class="card">
    <h2>Participantes</h2>
    <p v-if="!users.users.length" class="muted">No hay participantes.</p>
    <div v-else class="table-wrap">
      <table>
        <thead><tr><th>Seudónimo</th><th>Alias</th><th>Creado</th><th>Consentimiento</th><th></th></tr></thead>
        <tbody>
          <tr v-for="u in users.users" :key="u.id">
            <td>{{ u.etiqueta }}</td>
            <td>{{ u.alias ?? '—' }}</td>
            <td>{{ formatFecha(u.creadoEn) }}</td>
            <td>{{ consentimientoVigente(u) ? `v${u.consentimiento.consentVersion}` : 'No' }}</td>
            <td><button class="btn small danger" @click="borrar(u)">Eliminar</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
