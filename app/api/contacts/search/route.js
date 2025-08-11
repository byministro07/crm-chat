import { createClient } from '@supabase/supabase-js';

// Use YOUR environment variable names
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE;

const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    })
  : null;

export async function GET(request) {
  try {
    if (!supabase) {
      console.error('Supabase client not initialized. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE');
      return Response.json(
        { error: 'Database configuration error' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit')) || 20;

    if (!q) {
      // Get recent contacts based on last_activity_at
      const { data: contacts, error } = await supabase
        .from('contacts')
        .select('*')
        .order('last_activity_at', { ascending: false, nullsFirst: false })
        .limit(limit);

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      return Response.json(contacts || []);
    } else {
      // Search by name or email
      const { data: contacts, error } = await supabase
        .from('contacts')
        .select('*')
        .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
        .order('last_activity_at', { ascending: false, nullsFirst: false })
        .limit(limit);

      if (error) {
        console.error('Search error:', error);
        throw error;
      }

      return Response.json(contacts || []);
    }
  } catch (error) {
    console.error('Contact search error:', error);
    return Response.json(
      { error: error.message || 'Search failed' },
      { status: 500 }
    );
  }
}