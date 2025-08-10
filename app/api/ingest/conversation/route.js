// app/api/ingest/conversation/route.js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getOrCreateContactByGHL } from '@/lib/contacts';

export async function POST(req) {
  try {
    const secret = process.env.INGEST_SECRET;
    if (secret && req.headers.get('x-ingest-secret') !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ghl_contact_id, contact = {}, message } = await req.json();
    if (!ghl_contact_id) return NextResponse.json({ error: 'ghl_contact_id required' }, { status: 400 });
    if (!message?.ghl_message_id) return NextResponse.json({ error: 'message.ghl_message_id required' }, { status: 400 });

    const contactId = await getOrCreateContactByGHL(ghl_contact_id, contact);

    const payload = {
      contact_id: contactId,
      ghl_contact_id,
      airtable_record_id: message.airtable_record_id ?? null,
      ghl_message_id: message.ghl_message_id,
      conversation_id: message.conversation_id ?? null,
      channel: message.channel ?? null,
      direction: message.direction ?? null,
      sender: message.sender ?? null,
      message_type: message.message_type ?? null,
      status: message.status ?? null,
      body: message.body ?? null,
      attachments: message.attachments ?? null,
      occurred_at: message.occurred_at ?? null,
      synced_at: message.synced_at ?? null
    };

    const { error } = await supabaseAdmin
      .from('conversations')
      .upsert(payload, { onConflict: 'ghl_message_id' });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 400 });
  }
}