<script setup>
/** Tarjeta de contenido educativo: todo se interpola como texto (SEC-53, sin v-html). */
defineProps({ tema: { type: Object, required: true } })
</script>

<template>
  <article class="card learn">
    <div class="learn-header">
      <h2>
        <span>{{ tema.titulo }}</span>
        <span class="chip neutral">{{ tema.rf }}</span>
      </h2>
      <p class="resumen">{{ tema.resumen }}</p>
    </div>

    <slot name="figura" />

    <div class="secciones-container">
      <section v-for="(s, i) in tema.secciones" :key="i" class="seccion">
        <h3>{{ s.subtitulo }}</h3>
        <p v-for="(p, j) in s.parrafos || []" :key="`p${j}`">{{ p }}</p>
        <ul v-if="s.lista">
          <li v-for="(l, k) in s.lista" :key="`l${k}`">{{ l }}</li>
        </ul>
      </section>
    </div>

    <aside v-for="(r, i) in tema.recuadros" :key="`r${i}`" :class="['alert', r.tipo]">
      <strong>{{ r.titulo }}.</strong> {{ r.texto }}
    </aside>

    <footer v-if="tema.fuentes?.length" class="fuentes">
      <h3>Fuentes y referencias</h3>
      <ul class="small muted">
        <li v-for="(f, i) in tema.fuentes" :key="i">{{ f }}</li>
      </ul>
    </footer>
  </article>
</template>

<style scoped>
.learn {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  padding: 32px 36px;
}

.learn-header {
  margin-bottom: 20px;
}

.learn-header h2 {
  font-size: 1.65rem;
  font-weight: 800;
  color: #0f172a;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin: 0 0 8px;
}

.resumen {
  font-size: 1.05rem;
  line-height: 1.6;
  color: #64748b;
  margin: 0;
}

.secciones-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin-top: 24px;
}

.seccion {
  padding-top: 20px;
  border-top: 1px solid rgba(226, 232, 240, 0.7);
}

.seccion:first-child {
  padding-top: 0;
  border-top: none;
}

.seccion h3 {
  font-size: 1.2rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 12px;
}

.seccion p {
  font-size: 1rem;
  line-height: 1.75;
  color: #334155;
  margin: 0 0 12px;
}

.seccion p:last-child {
  margin-bottom: 0;
}

.seccion ul {
  margin: 12px 0 12px 20px;
  padding: 0;
  color: #334155;
  line-height: 1.7;
}

.seccion li {
  margin-bottom: 8px;
}

.seccion li:last-child {
  margin-bottom: 0;
}

.fuentes {
  margin-top: 32px;
  border-top: 1px solid var(--border);
  padding-top: 16px;
}

.fuentes h3 {
  font-size: 1.05rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 8px;
}

.fuentes ul {
  margin: 0 0 0 18px;
  padding: 0;
}

.fuentes li {
  margin-bottom: 6px;
}

@media (max-width: 768px) {
  .learn {
    padding: 20px;
  }

  .learn-header h2 {
    font-size: 1.35rem;
  }
}
</style>
