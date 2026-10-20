<script setup>
import { ref } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { useAccountStore } from '@/stores/account.js'
import { notify } from '@/services/notifications/notifier.js'

/** Ofrece "Vincular los datos de este dispositivo a mi cuenta" (con confirmación explícita). */
const cuenta = useAccountStore()
const confirmando = ref(false)
const ocupado = ref(false)
const progreso = ref('')

async function vincular() {
  ocupado.value = true
  try {
    const r = await cuenta.vincular((h, t) => (progreso.value = `${h} de ${t}`))
    confirmando.value = false
    notify(
      r.fallos
        ? `Se vincularon los datos, pero ${r.fallos} elemento(s) no se pudieron subir; la copia de este dispositivo se conservó. Inténtalo de nuevo más tarde.`
        : `Listo: ${r.pacientes} paciente(s) y ${r.monitoreos} monitoreo(s) quedaron en tu cuenta (privados).`,
      { tipo: r.fallos ? 'aviso' : 'ok', duracionMs: 8000 },
    )
  } catch (e) {
    notify(`No se pudo vincular: ${e.message}`, { tipo: 'error' })
  } finally {
    ocupado.value = false
    progreso.value = ''
  }
}
</script>

<template>
  <section v-if="cuenta.iniciada && cuenta.vinculable" class="alert info" data-testid="banner-vincular" aria-labelledby="vinc-titulo">
    <h2 id="vinc-titulo" class="h3">Hay datos guardados solo en este dispositivo</h2>
    <p>
      Encontramos {{ cuenta.vinculable.pacientes }} paciente(s) y {{ cuenta.vinculable.monitoreos }} monitoreo(s) del modo sin cuenta.
      Puedes vincularlos a tu cuenta (quedarán <strong>privados</strong>) o dejarlos como están.
    </p>
    <div class="actions">
      <button class="btn primary" data-testid="vincular-datos" @click="confirmando = true">Vincular los datos de este dispositivo a mi cuenta</button>
      <button class="btn ghost" @click="cuenta.descartarVinculacion()">Ahora no</button>
    </div>
    <BaseDialog v-if="confirmando" titulo="Vincular datos a tu cuenta" @cerrar="confirmando = false">
      <p>
        Se subirán a la nube (Supabase, Estados Unidos o la región configurada) {{ cuenta.vinculable.pacientes }} paciente(s) y
        {{ cuenta.vinculable.monitoreos }} monitoreo(s), incluidos datos de salud seudonimizados. Se moverán a tu cuenta y,
        si todo sale bien, se quitará la copia sin cuenta de este dispositivo. Todos quedan como <strong>privados</strong>.
      </p>
      <p v-if="progreso" role="status">Subiendo… {{ progreso }}</p>
      <template #acciones>
        <button class="btn" :disabled="ocupado" @click="confirmando = false">Cancelar</button>
        <button class="btn primary" :disabled="ocupado" data-testid="confirmar-vincular" @click="vincular">Sí, vincular</button>
      </template>
    </BaseDialog>
  </section>
</template>
