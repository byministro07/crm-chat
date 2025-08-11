import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });

    // Get session data WITH contact info
    const { data: sessionData, error: sessionError } = await supabaseAdmin
      .from('chat_sessions')
      .select(`
        id,
        contact_id,
        title,
        model_tier,
        created_at,
        updated_at,
        contacts:contact_id (
          id,
          name,
          email,
          phone,
          company
        )
      `)
      .eq('id', sessionId)
      .single();

    if (sessionError) throw sessionError;

    // Get messages for this session
    const { data: messagesData, error: messagesError } = await supabaseAdmin
      .from('chat_messages')
      .select('role, content, model, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (messagesError) throw messagesError;

    return NextResponse.json({ 
      session: sessionData,
      messages: messagesData ?? [] 
    });
  } catch (e) {
    console.error('Session messages API error:', e);
    return NextResponse.json({ error: e.message || 'unknown error' }, { status: 500 });
  }
}