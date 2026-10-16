<script setup>
import DataClassBadge from '@/components/common/DataClassBadge.vue'
import IncidentReportForm from '@/components/security/IncidentReportForm.vue'
import { POLITICA } from '@/data/securityPolicy.js'
import { POLICY_VERSION } from '@/services/security/isms.js'

/** Política de seguridad visible (ISO/IEC 27001:2013 cláusula 5.2, A.5.1.1, A.8.1.3, A.8.2.1) y notificación de incidentes (A.16.1.2/A.16.1.3). */
const NIVEL = { 'Confidencial-Sensible': 'sensitive', Confidencial: 'confidential', Interno: 'internal', Público: 'public' }
</script>

<template>
  <section class="seguridad">
    <div class="page-header">
      <h1>Política de seguridad</h1>
      <DataClassBadge level="public" texto="Política" />
    </div>
    <p class="muted small">Versión {{ POLICY_VERSION }} · Basada en ISO/IEC 27001:2013 (UNE-EN ISO/IEC 27001:2017) · Aprobada por el docente supervisor.</p>

    <article class="card">
      <h2>Objetivo (5.2, A.5.1.1)</h2>
      <p>{{ POLITICA.objetivo }}</p>
      <h3>Compromisos</h3>
      <ul><li v-for="(c, i) in POLITICA.compromisos" :key="i">{{ c }}</li></ul>
    </article>

    <article class="card">
      <h2>Uso aceptable (A.8.1.3)</h2>
      <ul><li v-for="(c, i) in POLITICA.usoAceptable" :key="i">{{ c }}</li></ul>
    </article>

    <article class="card">
      <h2>Roles y responsabilidades (5.3, A.6.1.1)</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Rol</th><th>Responsabilidad</th></tr></thead>
          <tbody><tr v-for="r in POLITICA.roles" :key="r.rol"><td>{{ r.rol }}</td><td>{{ r.resp }}</td></tr></tbody>
        </table>
      </div>
    </article>

    <article class="card">
      <h2>Clasificación de la información (A.8.2.1, A.8.2.2)</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nivel</th><th>Ejemplos</th></tr></thead>
          <tbody>
            <tr v-for="c in POLITICA.clasificacion" :key="c.nivel">
              <td><DataClassBadge :level="NIVEL[c.nivel]" /></td>
              <td>{{ c.ejemplo }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>

    <IncidentReportForm id="reportar" />

    <p class="muted small">Más detalles en el <RouterLink to="/privacidad">aviso de privacidad</RouterLink> y en <RouterLink to="/aprende/seguridad-informacion">Aprende → Seguridad de la información</RouterLink>.</p>
  </section>
</template>

<style scoped>
.seguridad {
  max-width: 900px;
}

h3 {
  margin-top: 12px;
}
</style>
