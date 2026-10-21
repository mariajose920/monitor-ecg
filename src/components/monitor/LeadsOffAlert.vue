<script setup>
import AppIcon from '@/components/common/AppIcon.vue'
</script>

<template>
  <div class="alert danger" role="alert">
    <div class="leads-off-content">
      <AppIcon name="alert-triangle" :size="18" />
      <div>
        <strong>Sin señal del sensor (leads-off):</strong>
        ECG: revisa que los electrodos estén bien adheridos. Sensor óptico (MAX30100/MAX30102): apoya bien la yema del dedo sobre el sensor y permanece quieto.
        La señal se muestra como hueco y no se usa para el cálculo de BPM ni la comparación.
      </div>
    </div>
  </div>
</template>

<style scoped>
.leads-off-content {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
</style>
