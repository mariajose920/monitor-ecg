import { defineStore } from 'pinia'
import { ref } from 'vue'
import { notify, beep } from '@/services/notifications/notifier.js'
import { audit } from '@/services/audit/auditService.js'
import { useSettingsStore } from './settings.js'
import { useSessionStore } from './session.js'

/** Alertas por valor fuera de rango (RF20). */
export const useAlertsStore = defineStore('alerts', () => {
  const historial = ref([])
  const silenciado = ref(false)
  let seq = 0

  function trigger({ channelId, canal, etiqueta, tipo }) {
    const a = { id: ++seq, ts: new Date().toISOString(), canal, etiqueta, tipo }
    historial.value.unshift(a)
    if (historial.value.length > 50) historial.value.pop()
    const texto = tipo === 'alta' ? 'sobre el máximo' : 'bajo el mínimo'
    notify(`${canal} (${etiqueta}): frecuencia cardíaca ${texto} del rango configurado.`, {
      tipo: 'alerta',
      duracionMs: 10000,
      enlace: { to: '/aprende/variacion', texto: '¿Por qué puede pasar?' },
    })
    if (useSettingsStore().parametros.alertas.sonido && !silenciado.value) beep({ freq: tipo === 'alta' ? 990 : 520 })
    useSessionStore().addEvent(channelId, tipo === 'alta' ? 'alerta-alta' : 'alerta-baja')
    audit('ALERT_TRIGGERED', 'system', { canal, usuario: etiqueta, tipo })
  }

  function toggleSilencio() {
    silenciado.value = !silenciado.value
  }

  return { historial, silenciado, trigger, toggleSilencio }
})
