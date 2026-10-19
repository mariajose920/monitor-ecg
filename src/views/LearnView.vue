<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import LearnCard from '@/components/learn/LearnCard.vue'
import MyMonitorings from '@/components/learn/MyMonitorings.vue'
import EcgAnatomyFigure from '@/components/learn/EcgAnatomyFigure.vue'
import heartRate from '@/data/learn/heartRate.js'
import variationFactors from '@/data/learn/variationFactors.js'
import sensorAd8232 from '@/data/learn/sensorAd8232.js'
import engineering from '@/data/learn/engineering.js'
import electricalSafety from '@/data/learn/electricalSafety.js'
import informationSecurity from '@/data/learn/informationSecurity.js'

/** RF21–RF24: contenido educativo por pestañas (/aprende/:tema). */
const TEMAS = [heartRate, variationFactors, sensorAd8232, engineering, electricalSafety, informationSecurity]
const route = useRoute()
const MIS = 'mis-monitoreos'
const esMis = computed(() => route.params.tema === MIS)
const tema = computed(() => TEMAS.find((t) => t.id === route.params.tema) || TEMAS[0])
</script>

<template>
  <section>
    <div class="page-header">
      <h1>Aprende</h1>
    </div>
    <p class="alert warn small">Contenido educativo. No reemplaza la opinión de un profesional de salud ni sirve para diagnóstico.</p>
    <nav class="tabs" aria-label="Temas">
      <RouterLink v-for="t in TEMAS" :key="t.id" :to="`/aprende/${t.id}`" :class="{ active: !esMis && tema.id === t.id }">{{ t.titulo }}</RouterLink>
      <RouterLink :to="`/aprende/${MIS}`" :class="{ active: esMis }">Mis monitoreos</RouterLink>
    </nav>
    <MyMonitorings v-if="esMis" />
    <LearnCard v-else :tema="tema">
      <template v-if="tema.figura" #figura>
        <EcgAnatomyFigure />
      </template>
    </LearnCard>
  </section>
</template>
