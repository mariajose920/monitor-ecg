<script setup>
import { useToastsStore } from '@/stores/toasts.js'
import AppIcon from '@/components/common/AppIcon.vue'

const toasts = useToastsStore()

function iconoPara(tipo) {
  switch (tipo) {
    case 'ok':
      return 'check'
    case 'aviso':
    case 'alerta':
      return 'alert-triangle'
    case 'error':
      return 'x'
    default:
      return 'info'
  }
}
</script>

<template>
  <div class="toast-host" aria-live="assertive" aria-atomic="false">
    <div v-for="t in toasts.items" :key="t.id" :class="['toast', t.tipo]" role="alert">
      <span class="icono" aria-hidden="true">
        <AppIcon :name="iconoPara(t.tipo)" :size="18" />
      </span>
      <div class="cuerpo">
        <p>{{ t.mensaje }}</p>
        <RouterLink v-if="t.enlace" :to="t.enlace.to" @click="toasts.dismiss(t.id)">{{ t.enlace.texto }}</RouterLink>
      </div>
      <button class="cerrar" aria-label="Cerrar notificación" @click="toasts.dismiss(t.id)">
        <AppIcon name="x" :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  right: 18px;
  bottom: 18px;
  left: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 50;
  pointer-events: none;
}

@media (min-width: 600px) {
  .toast-host {
    left: auto;
    width: 390px;
  }
}

.toast {
  pointer-events: auto;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-left: 5px solid var(--info);
  border-radius: var(--radius);
  padding: 12px 16px;
  box-shadow: var(--shadow-hover);
  animation: slide-in 0.2s ease-out;
}

@keyframes slide-in {
  from {
    transform: translateY(10px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.toast.ok { border-left-color: var(--ok); }
.toast.aviso { border-left-color: var(--warn); }
.toast.alerta { border-left-color: var(--danger); }
.toast.error { border-left-color: var(--danger); }

.icono {
  flex-shrink: 0;
  margin-top: 2px;
}

.toast.ok .icono { color: var(--ok); }
.toast.aviso .icono { color: var(--warn); }
.toast.alerta .icono { color: var(--danger); }
.toast.error .icono { color: var(--danger); }
.toast.info .icono { color: var(--info); }

.cuerpo {
  flex: 1;
  font-size: 0.92rem;
  line-height: 1.45;
}

.cuerpo p {
  margin: 0;
}

.cerrar {
  background: none;
  border: 0;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease;
}

.cerrar:hover {
  background: var(--bg-card-tint-soft);
  color: var(--text);
}
</style>
