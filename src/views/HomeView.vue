<script setup>
import SafetyBanner from '@/components/layout/SafetyBanner.vue'
import CapabilityNotice from '@/components/common/CapabilityNotice.vue'
import { useCapabilities } from '@/composables/useCapabilities.js'
import { useUsersStore } from '@/stores/users.js'

const caps = useCapabilities()
const users = useUsersStore()

const accesos = [
  { to: '/usuarios', titulo: '1. Usuarios', texto: 'Crea, edita o elimina seudónimos "Usuario N" (sin contraseña) y elige el usuario activo.' },
  { to: '/monitor', titulo: '2. Monitor', texto: 'Conecta la fuente, inicia y detén el monitoreo y guárdalo con nombre, nota y actividad.' },
  { to: '/monitoreos', titulo: '3. Monitoreos', texto: 'Filtra, revisa, edita, elimina y exporta (CSV, JSON, informe PDF) tus monitoreos guardados.' },
  { to: '/comparar', titulo: '4. Comparar', texto: 'Compara dos monitoreos, o uno con una referencia, con sincronización y métricas.' },
  { to: '/aprende', titulo: '5. Aprende', texto: 'Teoría del corazón y del sensor, y una lectura guiada de tus propios monitoreos.' },
]
</script>

<template>
  <section>
    <h1>Monitor ECG educativo</h1>
    <p class="lead">
      Visualiza en tiempo real la señal de un sensor <strong>AD8232</strong> conectado a un Arduino UNO/Nano o ESP32
      (CSV <span class="mono">t_ms,ecg_raw,leads_off,bpm</span> a 250 Hz y 115 200 baudios), calcula la frecuencia
      cardíaca, la evalúa frente a rangos configurables y la compara con una señal de referencia.
    </p>
    <SafetyBanner />
    <CapabilityNotice />
    <p v-if="users.activeUser" class="alert ok">Participante activo: <strong>{{ users.activeUser.etiqueta }}</strong></p>

    <div class="grid cols-2 cols-3">
      <RouterLink v-for="a in accesos" :key="a.to" :to="a.to" class="card acceso">
        <h2>{{ a.titulo }}</h2>
        <p class="muted">{{ a.texto }}</p>
      </RouterLink>
    </div>

    <section class="card compat">
      <h2>Compatibilidad de este navegador</h2>
      <ul>
        <li>Web Serial (captura por cable / HC-05): <strong>{{ caps.webSerial ? 'Sí' : 'No' }}</strong></li>
        <li>Contexto seguro (HTTPS/localhost): <strong>{{ caps.secureContext ? 'Sí' : 'No' }}</strong></li>
        <li>Cifrado local (Web Crypto + IndexedDB): <strong>{{ caps.webCrypto && caps.indexedDb ? 'Sí' : 'No' }}</strong></li>
      </ul>
      <p class="muted small">Todos los datos se guardan solo en este navegador, cifrados. Consulta el <RouterLink to="/privacidad">aviso de privacidad</RouterLink>.</p>
    </section>
  </section>
</template>

<style scoped>
.lead {
  font-size: 1.05rem;
  max-width: 75ch;
}

.acceso {
  text-decoration: none;
  color: inherit;
  display: block;
}

.acceso:hover {
  border-color: var(--accent);
}

.grid .card + .card {
  margin-top: 0;
}

.compat {
  margin-top: var(--gap);
}
</style>
