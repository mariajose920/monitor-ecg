import { secureStorage } from './index.js'
import { auditLog } from '@/services/audit/auditService.js'
import { removeCredential } from '@/services/security/adminAuth.js'
import { clearPrefs } from '@/utils/prefs.js'
import { limpiarAuditoriaPendiente } from '@/services/cloud/cloudSync.js'

/**
 * Borrado total (SEC-31): datos cifrados + clave AES (crypto-shredding) + preferencias.
 * La auditoría se reinicia conservando solo el evento ALL_DATA_WIPED en un log nuevo.
 * @param {object} o
 * @param {boolean} [o.conservarCredencial=true] false = "Olvidé el PIN" (SEC-12)
 * @param {string} o.actor
 * @param {string} o.motivo
 */
export async function wipeAllData({ conservarCredencial = true, actor = 'admin', motivo = 'borrado-total' } = {}) {
  await secureStorage.wipe()
  clearPrefs()
  await limpiarAuditoriaPendiente().catch(() => {}) // la cola de eventos pendientes de la nube también es dato del equipo
  sessionStorage.removeItem('ecg.activeUser')
  if (!conservarCredencial) removeCredential()
  await auditLog.reset('ALL_DATA_WIPED', actor, { motivo })
}
