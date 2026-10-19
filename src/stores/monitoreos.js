import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { listSessions } from '@/services/storage/sessionRepository.js'
import { monitoreoService } from '@/services/monitoreos/index.js'
import { visibles, conteoPorUsuario, esUtilizable } from '@/services/monitoreos/catalog.js'
import { useUsersStore } from './users.js'
import { useAuthStore } from './auth.js'
import { useSessionStore } from './session.js'

/**
 * Lista compartida de monitoreos (sesiones) para Usuarios, Monitoreos, Comparar y Aprende.
 * El acceso se filtra siempre por el usuario activo o por la sesión de administrador (A.9.4.1).
 */
export const useMonitoreosStore = defineStore('monitoreos', () => {
  const todos = ref([])
  const cargando = ref(false)
  const cargado = ref(false)
  const users = useUsersStore()
  const auth = useAuthStore()
  const session = useSessionStore()

  const ctx = computed(() => ({
    usuarioId: users.activeUserId,
    esAdmin: auth.isAdmin,
    sesionActivaId: session.actual?.id ?? null,
    etiquetaDe: (id) => users.byId(id)?.etiqueta ?? '',
  }))
  const visiblesLista = computed(() => visibles(todos.value, ctx.value))
  const utilizables = computed(() => visiblesLista.value.filter(esUtilizable))
  const conteos = computed(() => conteoPorUsuario(todos.value))

  async function refrescar() {
    cargando.value = true
    try {
      todos.value = await listSessions()
      cargado.value = true
    } finally {
      cargando.value = false
    }
  }

  async function asegurar() {
    if (!cargado.value) await refrescar()
  }

  function actor() {
    if (users.activeUser) return `participant:${users.activeUser.etiqueta}`
    return auth.isAdmin ? 'admin' : 'system'
  }

  const opts = () => ({ actor: actor(), ctx: { usuarioId: users.activeUserId, esAdmin: auth.isAdmin } })

  async function guardar(id, datos) {
    const m = await monitoreoService.guardar(id, datos, opts())
    if (session.pendiente?.id === id) session.limpiarPendiente()
    await refrescar()
    return m
  }

  async function actualizar(id, datos) {
    const m = await monitoreoService.actualizar(id, datos, opts())
    await refrescar()
    return m
  }

  async function descartar(id) {
    await monitoreoService.descartar(id, opts())
    if (session.pendiente?.id === id) session.limpiarPendiente()
    await refrescar()
  }

  async function eliminar(ids) {
    const r = await monitoreoService.eliminar(ids, opts())
    if (session.pendiente && r.eliminados.includes(session.pendiente.id)) session.limpiarPendiente()
    await refrescar()
    return r
  }

  function reset() {
    todos.value = []
    cargado.value = false
  }

  return { todos, cargando, cargado, ctx, visiblesLista, utilizables, conteos, refrescar, asegurar, guardar, actualizar, descartar, eliminar, actor, reset }
})
