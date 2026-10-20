-- OBSOLETA — NO HACE NADA (a propósito).
-- Antes reemplazaba la lista blanca de auditoría por una versión incompleta (sin ACCOUNT_*, ADMIN_*, ...), lo que rompía la
-- auditoría de la nube sin avisar (H-18). La lista blanca vive ahora en la tabla public.tipos_evento (migracion_endurecimiento_2.sql
-- y schema.sql) y el evento de cámara (CAMERA_STARTED, etc.) ya figura en ella.
select 1;
