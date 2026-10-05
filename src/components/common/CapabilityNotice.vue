<script setup>
import { useCapabilities } from '@/composables/useCapabilities.js'

const caps = useCapabilities()
</script>

<template>
  <div v-if="!caps.webSerial" class="alert info" role="note">
    <strong>Tu navegador no soporta Web Serial.</strong>
    La captura por cable requiere Chrome, Edge u Opera de escritorio. Puedes usar el
    <strong>simulador</strong>, la <strong>reproducción de CSV</strong>, la comparación y el contenido educativo.
  </div>
  <div v-if="!caps.secureContext" class="alert warn" role="note">
    La aplicación no se está sirviendo en un contexto seguro (HTTPS o localhost): Web Serial y el cifrado no estarán disponibles.
  </div>
</template>
