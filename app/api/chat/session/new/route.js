import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

async function createSession(contactId, title = null, modelTier = null) {
  const { data, error } = await supabaseAdmin
    .from('chat_sessions')
    .insert({ contact_id: contactId, title, model_tier: modelTier })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function POST(req) {
  try {
    const { contactId, title = null, modelTier = null } = await req.json();
    if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 });
    const sessionId = await createSession(contactId, title, modelTier);
    return NextResponse.json({ sessionId });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'unknown error' }, { status: 400 });
  }
}

// <-- This makes GET work too (so you never see 405 again)
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const contactId = searchParams.get('contactId');
    const title = searchParams.get('title');
    const modelTier = searchParams.get('modelTier');
    if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 });
    const sessionId = await createSession(contactId, title, modelTier);
    return NextResponse.json({ sessionId, via: 'GET' });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'unknown error' }, { status: 400 });
  }
}

export async function OPTIONS() {
  return NextResponse.json({ ok: true });
}