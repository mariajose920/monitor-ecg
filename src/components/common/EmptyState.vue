<script setup>
defineProps({ titulo: { type: String, required: true }, texto: { type: String, default: '' } })
</script>

<template>
  <div class="empty card">
    <p class="titulo">{{ titulo }}</p>
    <p v-if="texto" class="muted">{{ texto }}</p>
    <slot />
  </div>
</template>

<style scoped>
.empty {
  text-align: center;
  padding: 32px 16px;
}

.titulo {
  font-weight: 700;
  font-size: 1.1rem;
}
</style>
