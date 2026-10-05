<script setup>
import { ref, computed } from 'vue'
import ChannelPanel from './ChannelPanel.vue'
import { useChannelsStore } from '@/stores/channels.js'

/** Rejilla responsiva de 1–5 canales (RF07): 1 columna en móvil, 2 en tablet/escritorio; modo foco. */
const emit = defineEmits(['conectar'])
const channels = useChannelsStore()
const foco = ref(null)

const visibles = computed(() => (foco.value ? channels.channels.filter((c) => c.id === foco.value) : channels.channels))

function alternarFoco(id) {
  foco.value = foco.value === id ? null : id
}
</script>

<template>
  <div :class="['canales', { foco: foco !== null }]">
    <ChannelPanel
      v-for="c in visibles"
      :key="c.id"
      :canal="c"
      :enfocado="foco === c.id"
      @conectar="emit('conectar', $event)"
      @enfocar="alternarFoco(c.id)"
    />
  </div>
</template>

<style scoped>
.canales {
  display: grid;
  gap: var(--gap);
  grid-template-columns: 1fr;
}

.canales > * + * {
  margin-top: 0;
}

@media (min-width: 960px) {
  .canales:not(.foco) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
