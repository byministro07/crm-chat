import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function GET(request, { params }) {
  const { id } = params;

  try {
    const { data, error } = await supabase
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