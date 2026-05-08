import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

if (!url || !anon) {
  // Soft-warn only; pages render with empty data so dev shell still works.
  // eslint-disable-next-line no-console
  console.warn('[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — see .env.example');
}

// Untyped client: row shapes come from src/types/db.ts where consumers cast.
// Once a Supabase project is linked we'll regenerate Database via the CLI.
export const supabase: SupabaseClient = createClient(
  url || 'http://localhost:54321',
  anon || 'public-anon-key-placeholder',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);
