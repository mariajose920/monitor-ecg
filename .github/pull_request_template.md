## Descripción

<!-- Qué cambia y por qué. Enlaza el requerimiento (RF/RNF) o la sugerencia (SUG-xx). -->

## Lista de verificación de seguridad (A.14.2.2, A.12.1.2)

- [ ] `npm run lint`, `npm test`, `npm run build` y `npm run test:e2e` pasan (CI en verde).
- [ ] No se agregan secretos ni la clave `service_role`; solo variables públicas `VITE_*`.
- [ ] No se registran datos de salud (ECG, BPM, edad, peso) en auditoría, consola ni URL.
- [ ] Si cambia `supabase/schema.sql`: es idempotente, mantiene RLS y la lista blanca de auditoría coincide con `AUDIT_EVENTS`.
- [ ] Si se agrega un dominio externo: se actualizó la CSP de `vercel.json` y se documentó.
- [ ] Se actualizó `CAMBIOS.md` y, si cambian controles, la SoA (`docs/ISO27001_controles.md`).
- [ ] Revisado por otra persona del equipo (segregación de tareas, A.6.1.2).
