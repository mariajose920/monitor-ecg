<script setup>
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import LearnCard from '@/components/learn/LearnCard.vue'
import MyMonitorings from '@/components/learn/MyMonitorings.vue'
import EcgAnatomyFigure from '@/components/learn/EcgAnatomyFigure.vue'
import AppIcon from '@/components/common/AppIcon.vue'
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

const tabsNav = ref(null)
const puedeIzquierda = ref(false)
const puedeDerecha = ref(false)

function actualizarScroll() {
  const el = tabsNav.value
  if (!el) return
  puedeIzquierda.value = el.scrollLeft > 10
  puedeDerecha.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 10
}

function desplazar(delta) {
  const el = tabsNav.value
  if (!el) return
  el.scrollBy({ left: delta, behavior: 'smooth' })
}

function centrarPestanaActiva() {
  nextTick(() => {
    const el = tabsNav.value
    if (!el) return
    const activa = el.querySelector('.active')
    if (activa) {
      activa.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
    actualizarScroll()
  })
}

watch(() => route.params.tema, () => {
  centrarPestanaActiva()
})

onMounted(() => {
  actualizarScroll()
  centrarPestanaActiva()
  window.addEventListener('resize', actualizarScroll)
})

onUnmounted(() => {
  window.removeEventListener('resize', actualizarScroll)
})
</script>

<template>
  <section class="learn-view">
    <div class="page-header">
      <div>
        <h1>Aprende</h1>
        <p class="header-sub">Guías interactivas, fisiología cardíaca y conceptos de medición de bioseñales</p>
      </div>
    </div>

    <p class="alert warn small">
      <AppIcon name="alert-triangle" :size="16" />
      <span>Contenido educativo. No reemplaza la opinión de un profesional de salud ni sirve para diagnóstico.</span>
    </p>

    <!-- Barra de apartados interactiva con desplazamiento suave y barrita estilizada -->
    <div class="tabs-slider-wrap">
      <button
        v-show="puedeIzquierda"
        type="button"
        class="tab-scroll-btn prev"
        aria-label="Ver apartados anteriores"
        @click="desplazar(-280)"
      >
        <AppIcon name="chevron-left" :size="18" />
      </button>

      <nav
        ref="tabsNav"
        class="tabs learn-tabs"
        aria-label="Temas educativos"
        @scroll.passive="actualizarScroll"
      >
        <RouterLink
          v-for="t in TEMAS"
          :key="t.id"
          :to="`/aprende/${t.id}`"
          :class="{ active: !esMis && tema.id === t.id }"
        >
          {{ t.titulo }}
        </RouterLink>
        <RouterLink
          :to="`/aprende/${MIS}`"
          :class="{ active: esMis }"
        >
          Mis monitoreos
        </RouterLink>
      </nav>

      <button
        v-show="puedeDerecha"
        type="button"
        class="tab-scroll-btn next"
        aria-label="Ver apartados siguientes"
        @click="desplazar(280)"
      >
        <AppIcon name="chevron-right" :size="18" />
      </button>
    </div>

    <MyMonitorings v-if="esMis" />
    <LearnCard v-else :tema="tema">
      <template v-if="tema.figura" #figura>
        <EcgAnatomyFigure />
      </template>
    </LearnCard>
  </section>
</template>

<style scoped>
.learn-view {
  width: 100%;
}

.header-sub {
  color: var(--text-muted);
  font-size: 0.95rem;
  margin-top: 4px;
}

.tabs-slider-wrap {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  margin-bottom: var(--gap);
}

.learn-tabs {
  width: 100%;
  margin-bottom: 0;
  padding: 4px 4px 10px 4px;
  scroll-behavior: smooth;
  gap: 10px;
}

.learn-tabs a {
  padding: 10px 22px;
  border-radius: var(--radius-pill);
  font-size: 0.93rem;
  font-weight: 600;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  color: var(--text-muted);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  white-space: nowrap;
  flex-shrink: 0;
}

.learn-tabs a:hover {
  color: var(--text);
  border-color: rgba(225, 29, 72, 0.3);
  background: #ffffff;
  transform: translateY(-1px);
}

.learn-tabs a.active {
  color: var(--accent);
  background: #ffffff;
  border-color: rgba(225, 29, 72, 0.35);
  box-shadow: 0 4px 12px rgba(225, 29, 72, 0.1);
  font-weight: 700;
}

.tab-scroll-btn {
  position: absolute;
  top: 45%;
  transform: translateY(-50%);
  z-index: 10;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: #ffffff;
  color: var(--text);
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 0;
}

.tab-scroll-btn:hover {
  background: #ffffff;
  color: var(--accent);
  border-color: var(--accent);
  transform: translateY(-50%) scale(1.08);
  box-shadow: 0 6px 18px rgba(225, 29, 72, 0.2);
}

.tab-scroll-btn.prev {
  left: -12px;
}

.tab-scroll-btn.next {
  right: -12px;
}

@media (max-width: 768px) {
  .tab-scroll-btn {
    display: none;
  }
}
</style>
