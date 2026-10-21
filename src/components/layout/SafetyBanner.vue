<script setup>
import AppIcon from '@/components/common/AppIcon.vue'
defineProps({ compacto: { type: Boolean, default: false } })
</script>

<template>
  <div class="alert warn safety" role="note">
    <div class="safety-content">
      <AppIcon name="alert-triangle" :size="16" />
      <div>
        <strong>Seguridad eléctrica:</strong>
        Usa batería o Bluetooth aislado (HC-05/HC-06) si tienes electrodos puestos.
        <template v-if="!compacto">
          No conectes el microcontrolador por cable USB a un computador enchufado a la red mientras los electrodos están en tu cuerpo:
          una falla de aislación podría inyectar corriente de fuga.
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.safety-content {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
</style>
