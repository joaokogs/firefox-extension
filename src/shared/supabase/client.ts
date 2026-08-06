import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const isConfigured =
  Boolean(supabaseUrl && publishableKey) &&
  !supabaseUrl.includes('YOUR_') &&
  !publishableKey.includes('YOUR_');

export const supabase = isConfigured
  ? createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export function getSupabaseClient() {
  if (!supabase) {
    throw new Error('SUPABASE_NOT_CONFIGURED');
  }

  return supabase;
}
