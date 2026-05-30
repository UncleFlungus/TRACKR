import { createClient } from '@supabase/supabase-js';

// Vite exposes env vars prefixed with VITE_ to client code.
// These are safe to ship publicly: RLS policies on the database
// itself are what scope data to the right user.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment. ' +
      'Add them to .env.local — see Supabase Dashboard → Project Settings → API.',
  );
}

export const supabase = createClient(url, anonKey);
