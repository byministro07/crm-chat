import { createClient } from '@supabase/supabase-js';

// Check if we're in a server environment
const isServer = typeof window === 'undefined';

// Get environment variables with fallbacks
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}

// For server-side: use service key
export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// For client-side: use anon key
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Helper to get the appropriate client
export function getSupabaseClient() {
  if (isServer) {
    if (!supabaseAdmin) {
      throw new Error('Supabase Admin client not initialized. Check environment variables.');
    }
    return supabaseAdmin;
  }
  if (!supabase) {
    throw new Error('Supabase client not initialized. Check environment variables.');
  }
  return supabase;
}