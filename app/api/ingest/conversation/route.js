// app/api/ingest/conversation/route.js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req) {
  try {
    const secret = process.env.INGEST_SECRET;
    if (secret && req.headers.get('x-ingest-secret') !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ghl_contact_id, contact = {}, message } = await req.json();
    if (!ghl_contact_id) return NextResponse.json({ error: 'ghl_contact_id required' }, { status: 400 });
    if (!message?.ghl_message_id) return NextResponse.json({ error: 'message.ghl_message_id required' }, { status: 400 });

    let contactId;
    
    // Check if contact data was actually provided (not empty object)
    const hasContactData = contact && Object.keys(contact).length > 0 && contact.name;
    
    if (hasContactData) {
      // Contact data provided - create or update the contact
      const { data: existingContact } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('external_id', ghl_contact_id)
        .single();

      if (existingContact) {
        // Update existing contact
        const { data, error } = await supabaseAdmin
          .from('contacts')
          .update({
            name: contact.name,
            email: contact.email,
            phone: contact.phone,
            company: contact.company,
            updated_at: new Date().toISOString()
          })
          .eq('external_id', ghl_contact_id)
          .select('id')
          .single();
        
        if (error) throw error;
        contactId = data.id;
      } else {
        // Create new contact
        const { data, error } = await supabaseAdmin
          .from('contacts')
          .insert({
            external_id: ghl_contact_id,
            name: contact.name,
            email: contact.email,
            phone: contact.phone,
            company: contact.company
          })
          .select('id')
          .single();
        
        if (error) throw error;
        contactId = data.id;
      }
    } else {
      // No contact data - just find existing contact
      const { data: existingContact, error } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('external_id', ghl_contact_id)
        .single();
      
      if (error || !existingContact) {
        return NextResponse.json({ 
          error: `Contact not found for GHL ID: ${ghl_contact_id}. Import contacts first.` 
        }, { status: 400 });
      }
      
      contactId = existingContact.id;
    }

    // Now insert the conversation
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