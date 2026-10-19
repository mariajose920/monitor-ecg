import { createMonitoreoService } from './monitoreoService.js'
import { getSession, saveSession, deleteSession } from '@/services/storage/sessionRepository.js'
import { pushSession, deleteCloudSessions } from '@/services/cloud/cloudSync.js'
import { audit } from '@/services/audit/auditService.js'

/** Instancia de la aplicación: IndexedDB cifrado + Supabase opcional + auditoría encadenada. */
export const monitoreoService = createMonitoreoService({
  repo: { getSession, saveSession, deleteSession },
  cloud: { pushSession, deleteCloudSessions },
  audit,
})
