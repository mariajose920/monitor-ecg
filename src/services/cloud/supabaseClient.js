import { createClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase (opcional). Si faltan las variables de entorno la app funciona solo en local.
 * Solo se usa la clave PUBLICABLE (anon/publishable): la seguridad la imponen las políticas RLS
 * de supabase/schema.sql. Nunca usar la clave service_role en el frontend (SEC-55).
 * Acepta prefijos VITE_ y NEXT_PUBLIC_ (los que crea la integración Supabase ↔ Vercel).
 */
const env = import.meta.env
const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || ''
const key =
  env.VITE_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const cloudEnabled = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) && key.length > 20

export const supabase = cloudEnabled
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ecg-cloud-auth' },
    })
  : null
