import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req) {
  try {
    const { contactId, title = null, modelTier = null } = await req.json();
    if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('chat_sessions')
      .insert({ contact_id: contactId, title, model_tier: modelTier })
      .select('id')
      .single();

    if (error) throw error;
    return NextResponse.json({ sessionId: data.id });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'unknown error' }, { status: 400 });
  }
}