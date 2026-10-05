<script setup>
defineProps({ compacto: { type: Boolean, default: false } })
</script>

<template>
  <div class="alert warn safety" role="note">
    <strong>⚠ Seguridad eléctrica:</strong>
    Usa batería o Bluetooth aislado (HC-05/HC-06) si tienes electrodos puestos.
    <template v-if="!compacto">
      No conectes el Arduino por cable USB a un computador enchufado a la red mientras los electrodos están en tu cuerpo:
      una falla de aislación podría inyectar corriente de fuga.
    </template>
  </div>
</template>
