import { defineStore } from 'pinia'
import { useAuthStore } from './auth.js'
import { useUsersStore } from './users.js'
import { useSettingsStore } from './settings.js'
import { useChannelsStore } from './channels.js'
import { useIsmsStore } from './isms.js'
import { auditLog, audit } from '@/services/audit/auditService.js'
import { buildSessionsCsv } from '@/services/export/sessionExport.js'
import { exportFilename, downloadText } from '@/services/export/csvExporter.js'
import { wipeAllData } from '@/services/storage/wipe.js'
import { listSessions } from '@/services/storage/sessionRepository.js'
import { deleteCloudSessions } from '@/services/cloud/cloudSync.js'
import { stampUtc } from '@/utils/time.js'
import { concederRol as srvConceder, retirarRol as srvRetirar, puedeRetirarRol } from '@/services/security/adminMfa.js'
import { cloudCuenta } from '@/services/cloud/cloudSync.js'

/**
 * Acciones privilegiadas (SEC-03): todas llaman a assertAdmin(); las destructivas exigen
 * reautenticación con el PIN (SEC-11).
 */
export const useAdminStore = defineStore('admin', () => {
  async function readAudit() {
    useAuthStore().assertAdmin()
    return auditLog.list()
  }

  async function verifyAudit() {
    useAuthStore().assertAdmin()
    const r = await auditLog.verify()
    if (!r.ok) await audit('INTEGRITY_ERROR', 'system', { objeto: 'auditoria', seq: r.brokenAt })
    return r
  }

  async function exportAudit() {
    useAuthStore().assertAdmin()
    const entries = await auditLog.list()
    const v = await auditLog.verify()
    const json = JSON.stringify({ exportado: new Date().toISOString(), integridad: v, entradas: entries }, null, 2)
    downloadText(json, `auditoria_${stampUtc()}.json`, 'application/json')
    await audit('AUDIT_EXPORTED', 'admin', { entradas: entries.length })
  }

  async function exportAll(pin, includeOptional = false) {
    const auth = useAuthStore()
    auth.assertAdmin()
    if (!(await auth.reauth(pin))) throw new Error(auth.metodoReauth === 'totp' ? 'Código incorrecto o vencido' : 'PIN incorrecto')
    const users = useUsersStore()
    const sessions = await listSessions()
    const { csv, filas } = await buildSessionsCsv({ sessions, userById: users.byId, includeOptional })
    downloadText(csv, exportFilename('todos'))
    await audit('EXPORT_CSV', 'admin', { scope: 'todas', rows: filas, pseudonymized: true, opcionales: includeOptional })
    return filas
  }

  async function wipeAll(pin) {
    const auth = useAuthStore()
    auth.assertAdmin()
    if (!(await auth.reauth(pin))) throw new Error(auth.metodoReauth === 'totp' ? 'Código incorrecto o vencido' : 'PIN incorrecto')
    const channels = useChannelsStore()
    await channels.disconnectAll()
    channels.reset()
    // Borra también en la nube las sesiones registradas desde este equipo.
    await deleteCloudSessions((await listSessions()).map((x) => x.id))
    await wipeAllData({ conservarCredencial: true, actor: 'admin', motivo: 'borrado-total-admin' })
    useUsersStore().reset()
    useSettingsStore().reset()
    useIsmsStore().reset()
    await useUsersStore().ensureLoaded()
  }

  async function deleteUser(id) {
    useAuthStore().assertAdmin()
    await useUsersStore().deleteUserData(id, 'admin')
  }

  async function reautenticar(codigo) {
    const auth = useAuthStore()
    if (!(await auth.reauth(codigo))) {
      const e = new Error(auth.metodoReauth === 'totp' ? 'Código incorrecto o vencido' : 'PIN incorrecto')
      e.reauth = true // el diálogo sigue abierto para reintentar
      throw e
    }
  }

  /** A.9.2.3: concede el rol de administrador a una cuenta registrada (exige aal2 + código TOTP nuevo). */
  async function concederRol(correo, codigo) {
    useAuthStore().assertAdmin()
    await reautenticar(codigo)
    const fila = await srvConceder(correo)
    // El servidor ya registra ADMIN_ROLE_GRANTED en la auditoría de la nube; este evento queda solo en el log local
    // (pushAudit no replica los eventos de origen 'servidor': sin doble registro, H-20).
    await audit('ADMIN_ROLE_GRANTED', 'admin', { objetivo: fila.user_id })
    return fila
  }

  /** A.9.2.6: retira el rol a otro administrador (confirmación + código TOTP nuevo). */
  async function retirarRol(userId, codigo, total) {
    useAuthStore().assertAdmin()
    const regla = puedeRetirarRol({ total, objetivoId: userId, yoId: cloudCuenta.value?.id })
    if (!regla.ok) throw new Error(regla.motivo)
    await reautenticar(codigo)
    const ok = await srvRetirar(userId)
    if (ok) await audit('ADMIN_ROLE_REVOKED', 'admin', { objetivo: userId })
    return ok
  }

  return { concederRol, retirarRol, readAudit, verifyAudit, exportAudit, exportAll, wipeAll, deleteUser }
})
