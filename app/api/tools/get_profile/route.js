import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Helper: resolve internal UUID from ?contactId (UUID) or ?ghlContactId (GHL)
async function resolveContactId({ contactId, ghlContactId }) {
  if (contactId) return contactId;
  if (!ghlContactId) throw new Error('Provide contactId or ghlContactId');
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('external_id', ghlContactId) // external_id stores your GHL Contact ID
    .single();
  if (error || !data) throw new Error('Contact not found for that GHL id');
  return data.id;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const contactId = searchParams.get('contactId');
    const ghlContactId = searchParams.get('ghlContactId');

    const id = await resolveContactId({ contactId, ghlContactId });

    // Contact basics
    const { data: contact, error: cErr } = await supabaseAdmin
      .from('contacts')
      .select('id, external_id, name, email, phone, company, last_activity_at')
      .eq('id', id)
      .single();
    if (cErr) throw cErr;

    // Latest order for this contact (for addresses)
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('order_id, order_date, order_total, shipping_address_raw, shipping_street1, shipping_street2, shipping_city, shipping_state, shipping_zip')
      .eq('contact_id', id)
      .order('order_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }) // tie-breaker
      .limit(1)
      .maybeSingle();

    // Official address is RAW first, else build from parsed fields
    const parsed = order ? [order.shipping_street1, order.shipping_street2, order.shipping_city, order.shipping_state, order.shipping_zip]
      .filter(Boolean).join(', ') : null;
    const officialShippingAddress = order?.shipping_address_raw || parsed || null;

    return NextResponse.json({
      contact,
      latest_order_summary: order ? {
        order_id: order.order_id,
        order_date: order.order_date,
        order_total: order.order_total,
        official_shipping_address: officialShippingAddress
      } : null
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}