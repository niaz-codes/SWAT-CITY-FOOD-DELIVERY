// ============================================================
// Swat City Backend - Config: Supabase client
//
// One server-side client used for everything: Postgres data access
// (through PostgREST) and Storage uploads. It authenticates with the
// service-role key, so it bypasses Row Level Security — keep it on
// the server only.
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

/** Cheap round-trip used by /health and boot logging. */
export async function pingSupabase(): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('users')
      .select('_id', { count: 'exact', head: true });
    return !error;
  } catch {
    return false;
  }
}
