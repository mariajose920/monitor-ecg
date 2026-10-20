<script setup>
import { useAccountStore } from '@/stores/account.js'
import { nubeActivada, nubeDecidida, fijarOptIn } from '@/services/cloud/nubeOptIn.js'
import { NUBE_PROVEEDOR, NUBE_REGION } from '@/data/privacidad.js'

/** C-03: primera vez con una cuenta, pregunta si quiere guardar en la nube (por defecto NO: nada se envía hasta que lo active en Mi cuenta). */
const cuenta = useAccountStore()
function ahoraNo() {
  fijarOptIn(cuenta.cuenta.id, false)
}
</script>

<template>
  <section v-if="cuenta.iniciada && !nubeDecidida && !nubeActivada" class="alert info" data-testid="banner-nube" aria-labelledby="nube-titulo">
    <h2 id="nube-titulo" class="h3">¿Guardar tus datos en la nube?</h2>
    <p>
      Por ahora todo se guarda <strong>solo en este dispositivo</strong>. Si lo activas, los monitoreos que guardes (señal, BPM y actividad) y tus pacientes («Paciente N») se copiarán a
      {{ NUBE_PROVEEDOR }} ({{ NUBE_REGION }}) y podrás publicar monitoreos. Los borradores, alias, nombres y notas nunca se suben.
    </p>
    <div class="actions">
      <RouterLink class="btn primary" to="/cuenta" data-testid="banner-nube-ver">Ver opciones</RouterLink>
      <button class="btn ghost" data-testid="banner-nube-no" @click="ahoraNo">Mantener solo en este dispositivo</button>
    </div>
  </section>
</template>
