import { createClient } from '@supabase/supabase-js';

// Vite exposes VITE_-prefixed vars to client code. These are safe to ship
// publicly; the RLS policies on the database are what scope data to a user.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment. ' +
      'Add them to .env.local — see Supabase Dashboard → Project Settings → API.',
  );
}

export const supabase = createClient(url, anonKey);
