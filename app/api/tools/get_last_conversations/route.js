import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

async function resolveContactId({ contactId, ghlContactId }) {
  if (contactId) return contactId;
  if (!ghlContactId) throw new Error('Provide contactId or ghlContactId');
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('external_id', ghlContactId)
    .single();
  if (error || !data) throw new Error('Contact not found for that GHL id');
  return data.id;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const contactId = searchParams.get('contactId');
    const ghlContactId = searchParams.get('ghlContactId');
    const limit = Math.max(1, Math.min(50, parseInt(searchParams.get('limit') || '10', 10)));

    const id = await resolveContactId({ contactId, ghlContactId });

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('ghl_message_id, conversation_id, channel, direction, sender, message_type, status, body, occurred_at')
      .eq('contact_id', id)
      .order('occurred_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json({
      contactId: id,
      count: data?.length || 0,
      messages: (data || []).map(m => ({
        id: m.ghl_message_id,
        conversation_id: m.conversation_id,
        channel: m.channel,
        direction: m.direction,
        sender: m.sender,
        type: m.message_type,
        status: m.status,
        body: m.body,
        occurred_at: m.occurred_at,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}