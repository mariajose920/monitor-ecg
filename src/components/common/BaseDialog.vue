<script setup>
import { onMounted, onBeforeUnmount, ref, nextTick } from 'vue'

const props = defineProps({
  titulo: { type: String, required: true },
  ancho: { type: String, default: '520px' },
})
const emit = defineEmits(['cerrar'])
const caja = ref(null)
let previo = null

function onKey(e) {
  if (e.key === 'Escape') emit('cerrar')
}

onMounted(async () => {
  previo = document.activeElement
  document.addEventListener('keydown', onKey)
  await nextTick()
  const foco = caja.value?.querySelector('input, select, textarea, button')
  foco?.focus()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  previo?.focus?.()
})

const idTitulo = `dlg-${Math.random().toString(36).slice(2, 8)}`
</script>

<template>
  <Teleport to="body">
    <div class="overlay" @click.self="emit('cerrar')">
      <div ref="caja" class="dialog card" role="dialog" aria-modal="true" :aria-labelledby="idTitulo" :style="{ maxWidth: props.ancho }">
        <h2 :id="idTitulo">{{ titulo }}</h2>
        <slot />
        <div class="acciones">
          <slot name="acciones" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 60;
}

.dialog {
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
}

.acciones {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
