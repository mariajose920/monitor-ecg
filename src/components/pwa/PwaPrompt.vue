<script setup>
import { ref } from 'vue'
import { usePwaInstall } from '@/composables/usePwaInstall.js'
import { getPref, setPref } from '@/utils/prefs.js'

/** Aviso de "Instalar app" (Android/iOS) y de nueva versión disponible. */
const { estado, instalar, aplicarActualizacion } = usePwaInstall()
const oculto = ref(getPref('pwaAvisoOculto', false) === true)

function cerrar() {
  oculto.value = true
  setPref('pwaAvisoOculto', true)
}
</script>

<template>
  <div class="pwa-barra" data-testid="pwa-barra">
    <div v-if="estado.actualizacion" class="pwa-aviso card" role="status">
      <span>Hay una nueva versión de la app.</span>
      <button class="btn small primary" data-testid="pwa-actualizar" @click="aplicarActualizacion">Actualizar</button>
    </div>
    <div v-else-if="!estado.instalada && !oculto && (estado.puedeInstalar || estado.esIos)" class="pwa-aviso card" role="region" aria-label="Instalar app">
      <span v-if="estado.puedeInstalar"><strong>Instalar aplicación:</strong> agrégala a tu celular y úsala sin conexión.</span>
      <span v-else>Para instalar: toca <strong>Compartir</strong> y luego <strong>Agregar a pantalla de inicio</strong>.</span>
      <button v-if="estado.puedeInstalar" class="btn small primary" data-testid="pwa-instalar" @click="instalar">Instalar</button>
      <button class="btn small ghost" @click="cerrar">Ahora no</button>
    </div>
  </div>
</template>

<style scoped>
.pwa-barra {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 80;
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
  pointer-events: none;
}

.pwa-aviso {
  pointer-events: auto;
  max-width: 560px;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
}

.pwa-aviso span {
  flex: 1 1 200px;
}
</style>
