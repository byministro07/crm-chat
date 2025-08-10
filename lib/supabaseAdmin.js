// lib/supabaseAdmin.js
import { createClient } from '@supabase/supabase-js';
// (optional) import 'server-only'; // fine to omit if it confuses anything

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE;

if (!url || !serviceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');
}

// Server-only admin client (uses service role; don't import in client components)
export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});