import { createClient } from '@supabase/supabase-js';

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
      return Response.json(
        { error: 'Database configuration error' },
        { status: 500 }
      );
    }

    // Get ALL sessions, not filtered by contact
    const { data: sessions, error } = await supabase
      .from('chat_sessions')
      .select(`
        *,
        contacts:contact_id (
          id,
          name,
          email
        )
      `)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Sessions fetch error:', error);
      throw error;
    }

    return Response.json({ sessions: sessions || [] });
  } catch (error) {
    console.error('Sessions API error:', error);
    return Response.json(
      { error: error.message || 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    if (!supabase) {
      return Response.json(
        { error: 'Database configuration error' },
        { status: 500 }
      );
    }

    const { sessionId, title } = await request.json();

    const { error } = await supabase
      .from('chat_sessions')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (error) throw error;

    return Response.json({ success: true });
  } catch (error) {
    console.error('Session update error:', error);
    return Response.json(
      { error: error.message || 'Failed to update session' },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    if (!supabase) {
      return Response.json(
        { error: 'Database configuration error' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    const { error } = await supabase
      .from('chat_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) throw error;

    return Response.json({ success: true });
  } catch (error) {
    console.error('Session delete error:', error);
    return Response.json(
      { error: error.message || 'Failed to delete session' },
      { status: 500 }
    );
  }
}