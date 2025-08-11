import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request, { params }) {
  if (!supabaseAdmin) {
    return Response.json(
      { error: 'Database connection not configured' },
      { status: 500 }
    );
  }

  const { id } = params;

  try {
    const { data, error } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    return Response.json(data);
  } catch (error) {
    console.error('Contact fetch error:', error);
    return Response.json(
      { error: error.message || 'Contact not found' },
      { status: 404 }
    );
  }
}