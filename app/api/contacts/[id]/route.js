import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE;

const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    })
  : null;

export async function GET(request, { params }) {
  try {
    if (!supabase) {
      return Response.json(
        { error: 'Database configuration error' },
        { status: 500 }
      );
    }

    const { id } = params;

    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Contact fetch error:', error);
      throw error;
    }

    return Response.json(data);
  } catch (error) {
    return Response.json(
      { error: error.message || 'Contact not found' },
      { status: 404 }
    );
  }
}