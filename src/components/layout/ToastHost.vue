<script setup>
import { useToastsStore } from '@/stores/toasts.js'

const toasts = useToastsStore()
const iconos = { info: 'ℹ', aviso: '⚠', alerta: '❗', error: '✕', ok: '✓' }
</script>

<template>
  <div class="toast-host" aria-live="assertive" aria-atomic="false">
    <div v-for="t in toasts.items" :key="t.id" :class="['toast', t.tipo]" role="alert">
      <span class="icono" aria-hidden="true">{{ iconos[t.tipo] || 'ℹ' }}</span>
      <div class="cuerpo">
        <p>{{ t.mensaje }}</p>
        <RouterLink v-if="t.enlace" :to="t.enlace.to" @click="toasts.dismiss(t.id)">{{ t.enlace.texto }}</RouterLink>
      </div>
      <button class="cerrar" aria-label="Cerrar notificación" @click="toasts.dismiss(t.id)">×</button>
    </div>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  right: 12px;
  bottom: 12px;
  left: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 50;
  pointer-events: none;
}

@media (min-width: 600px) {
  .toast-host {
    left: auto;
    width: 380px;
  }
}

.toast {
  pointer-events: auto;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  background: var(--bg-elev-2);
  border: 1px solid var(--border);
  border-left: 5px solid var(--info);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  box-shadow: var(--shadow);
}

.toast.aviso { border-left-color: var(--warn); }
.toast.alerta, .toast.error { border-left-color: var(--danger); }
.toast.ok { border-left-color: var(--ok); }

.toast p { margin: 0 0 4px; }

.icono {
  font-weight: 800;
}

.cuerpo {
  flex: 1;
}

.cerrar {
  background: none;
  border: 0;
  color: var(--text-muted);
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  min-width: 32px;
  min-height: 32px;
}
</style>
