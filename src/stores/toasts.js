import { defineStore } from 'pinia'
import { ref } from 'vue'

/** Notificaciones in-app (ToastHost). */
export const useToastsStore = defineStore('toasts', () => {
  const items = ref([])
  let seq = 0

  function push({ mensaje, tipo = 'info', duracionMs = 5000, enlace = null }) {
    const id = ++seq
    items.value.push({ id, mensaje: String(mensaje), tipo, enlace })
    if (items.value.length > 5) items.value.shift()
    if (duracionMs > 0) setTimeout(() => dismiss(id), duracionMs)
    return id
  }

  function dismiss(id) {
    items.value = items.value.filter((t) => t.id !== id)
  }

  return { items, push, dismiss }
})
