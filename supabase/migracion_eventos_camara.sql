-- Migración idempotente: eventos de auditoría de la cámara del celular (PPG).
-- Aplicar en Supabase > SQL Editor. Reemplaza la lista blanca por la lista COMPLETA de AUDIT_EVENTS.
-- ISO/IEC 27001:2013 A.12.4.1 / A.18.1.4. Se puede ejecutar varias veces sin efectos adversos.
alter table public.auditoria drop constraint if exists auditoria_tipo_lista_blanca;
alter table public.auditoria add constraint auditoria_tipo_lista_blanca check (tipo in (
  'ADMIN_SETUP', 'ADMIN_LOGIN_OK', 'ADMIN_LOGIN_FAIL', 'ADMIN_LOCKED', 'ADMIN_LOGOUT', 'ADMIN_SESSION_EXPIRED',
  'ADMIN_PIN_CHANGED', 'PARAM_CHANGED', 'USER_CREATED', 'CONSENT_GIVEN', 'CONSENT_WITHDRAWN', 'USER_DATA_DELETED',
  'ALL_DATA_WIPED', 'CLOUD_ADMIN_LOGIN', 'CLOUD_ADMIN_LOGOUT', 'RETENTION_PURGE', 'EXPORT_CSV', 'SERIAL_CONNECTED',
  'SERIAL_DISCONNECTED', 'SERIAL_LOST', 'SERIAL_INVALID_DATA', 'DEVICE_RESET', 'INTEGRITY_ERROR', 'AUDIT_EXPORTED',
  'SESSION_STARTED', 'SESSION_ENDED', 'ALERT_TRIGGERED',
  'INCIDENT_REPORTED', 'INCIDENT_UPDATED', 'POLICY_ACCEPTED', 'ACCESS_REVIEW_DONE', 'CLOCK_SKEW',
  'ELECTRICAL_SAFETY_ACK', 'CLOUD_DATA_DELETED',
  'USER_UPDATED', 'SESSION_SAVED', 'SESSION_UPDATED', 'SESSION_DISCARDED', 'SESSION_DELETED', 'EXPORT_REPORT',
  'CAMERA_STARTED', 'CAMERA_STOPPED', 'CAMERA_DENIED', 'TORCH_UNAVAILABLE'
)) not valid;
