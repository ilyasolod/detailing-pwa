import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const initialConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('placeholder') &&
  !supabaseUrl.includes('example.com') &&
  // Only attempt localhost Supabase if browser itself is running on localhost (prevents dead requests on mobile devices)
  (!supabaseUrl.includes('localhost') ||
    (typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')))
)

export let isSupabaseConfigured = initialConfigured

export function setSupabaseConfigured(value: boolean): void {
  isSupabaseConfigured = value
}

export function resetSupabaseConfigured(): void {
  isSupabaseConfigured = initialConfigured
}

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null
