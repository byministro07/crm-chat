import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('chat_messages')
      .select('role, content, model, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ messages: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'unknown error' }, { status: 400 });
  }
}