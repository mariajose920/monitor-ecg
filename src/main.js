import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router/index.js'
import 'uplot/dist/uPlot.min.css'
import './assets/styles/tokens.css'
import './assets/styles/base.css'
import './assets/styles/uplot-theme.css'
import './assets/styles/responsive.css'
import { initPwa } from '@/composables/usePwaInstall.js'
import { setIntegrityHandler } from '@/services/storage/index.js'
import { audit } from '@/services/audit/auditService.js'
import { notify } from '@/services/notifications/notifier.js'
import { purgeOlderThan } from '@/services/storage/sessionRepository.js'
import { useSettingsStore } from '@/stores/settings.js'
import { useUsersStore } from '@/stores/users.js'
import { useAccountStore } from '@/stores/account.js'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

// SEC-27: fallo seguro ante datos dañados o manipulados.
setIntegrityHandler((key) => {
  notify('Datos dañados o manipulados: se descartó un registro.', { tipo: 'error', duracionMs: 8000 })
  audit('INTEGRITY_ERROR', 'system', { clave: String(key).split(':')[0] })
})

async function bootstrap() {
  const settings = useSettingsStore()
  try {
    await settings.load()
    const cuenta = useAccountStore()
    await cuenta.init() // fija el espacio de datos (con o sin cuenta) antes de cargar pacientes
    await useUsersStore().ensureLoaded()
    if (cuenta.iniciada) {
      useUsersStore().sincronizarConNube().catch(() => {})
      cuenta.revisarVinculable()
    }
    // SEC-32: purga automática por retención al iniciar.
    const n = await purgeOlderThan(settings.retencionDias)
    if (n > 0) await audit('RETENTION_PURGE', 'system', { sesiones: n, dias: settings.retencionDias })
  } catch {
    notify('No se pudo acceder al almacenamiento local. Algunas funciones no guardarán datos.', { tipo: 'error', duracionMs: 10000 })
  }
  // SEC-61: cuota de almacenamiento.
  try {
    if (navigator.storage?.estimate) {
      const { usage, quota } = await navigator.storage.estimate()
      if (quota && usage / quota > 0.8) notify('El almacenamiento local supera el 80 % de la cuota. Exporta y borra sesiones antiguas.', { tipo: 'aviso', duracionMs: 10000 })
    }
    if (navigator.storage?.persist) await navigator.storage.persist()
  } catch {
    /* no soportado */
  }
}

initPwa()
bootstrap().finally(() => app.mount('#app'))
