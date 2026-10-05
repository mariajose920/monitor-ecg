<script setup>
/** Tarjeta de contenido educativo: todo se interpola como texto (SEC-53, sin v-html). */
defineProps({ tema: { type: Object, required: true } })
</script>

<template>
  <article class="card learn">
    <h2>{{ tema.titulo }} <span class="chip neutral">{{ tema.rf }}</span></h2>
    <p class="muted">{{ tema.resumen }}</p>
    <slot name="figura" />
    <section v-for="(s, i) in tema.secciones" :key="i" class="seccion">
      <h3>{{ s.subtitulo }}</h3>
      <p v-for="(p, j) in s.parrafos || []" :key="`p${j}`">{{ p }}</p>
      <ul v-if="s.lista">
        <li v-for="(l, k) in s.lista" :key="`l${k}`">{{ l }}</li>
      </ul>
    </section>
    <aside v-for="(r, i) in tema.recuadros" :key="`r${i}`" :class="['alert', r.tipo]">
      <strong>{{ r.titulo }}.</strong> {{ r.texto }}
    </aside>
    <footer v-if="tema.fuentes?.length" class="fuentes">
      <h3>Fuentes</h3>
      <ul class="small muted">
        <li v-for="(f, i) in tema.fuentes" :key="i">{{ f }}</li>
      </ul>
    </footer>
  </article>
</template>

<style scoped>
.learn {
  max-width: 900px;
}

.seccion {
  margin-top: 16px;
}

.fuentes {
  margin-top: 20px;
  border-top: 1px solid var(--border);
  padding-top: 8px;
}
</style>
