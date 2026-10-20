import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchPublicos, cloudEnabled } from '@/services/cloud/cloudSync.js'
import { registrarComunitarios } from '@/services/monitoreos/senalAcceso.js'

/** Monitoreos públicos de la comunidad (solo lectura). Requiere una cuenta; no se guardan en el equipo. */
export const useComunidadStore = defineStore('comunidad', () => {
  const lista = ref([])
  const cargando = ref(false)
  const error = ref('')
  const cargada = ref(false)

  async function cargar() {
    error.value = ''
    if (!cloudEnabled) {
      error.value = 'La nube no está configurada en esta copia de la aplicación.'
      return
    }
    cargando.value = true
    try {
      lista.value = await fetchPublicos()
      registrarComunitarios(lista.value.map((m) => m.id))
      cargada.value = true
    } catch (e) {
      error.value = e?.message || 'No se pudieron cargar los monitoreos públicos.'
    } finally {
      cargando.value = false
    }
  }

  function reset() {
    lista.value = []
    cargada.value = false
    registrarComunitarios([])
  }

  return { lista, cargando, error, cargada, cargar, reset }
})
