<script setup>
import { useAccountStore } from '@/stores/account.js'
import { ocultarVinculacionEnEsteEquipo } from '@/services/accounts/linkLocal.js'

/**
 * C-15: aviso de que hay datos creados en este dispositivo sin cuenta. NO vincula nada por sí solo: lleva a Mi cuenta, donde se elige
 * paciente por paciente y se confirma. Desactivado por defecto en equipos compartidos; se puede ocultar de forma persistente.
 */
const cuenta = useAccountStore()

function noOfrecer() {
  ocultarVinculacionEnEsteEquipo(true)
  cuenta.descartarVinculacion()
}
</script>

<template>
  <section v-if="cuenta.iniciada && cuenta.vinculable" class="alert info" data-testid="banner-vincular" aria-labelledby="vinc-titulo">
    <h2 id="vinc-titulo" class="h3">Hay datos guardados solo en este dispositivo</h2>
    <p>
      Encontramos {{ cuenta.vinculable.pacientes }} paciente(s) y {{ cuenta.vinculable.monitoreos }} monitoreo(s) creados sin cuenta.
      Puedes vincularlos a tu cuenta eligiendo cuáles (solo si son tuyos o tienes el consentimiento de las personas medidas), o dejarlos como están.
    </p>
    <div class="actions">
      <RouterLink class="btn primary" to="/cuenta#c-vinc" data-testid="vincular-datos">Elegir qué vincular…</RouterLink>
      <button class="btn ghost" @click="cuenta.descartarVinculacion()">Ahora no</button>
      <button class="btn ghost" data-testid="no-ofrecer-vincular" @click="noOfrecer">No ofrecer en este equipo</button>
    </div>
  </section>
</template>
