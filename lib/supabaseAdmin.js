// lib/supabaseAdmin.js
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE;

if (!url || !serviceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE env vars');
}

// Server-only client using the service role key (never import in client components)
export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});