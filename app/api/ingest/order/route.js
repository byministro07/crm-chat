import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getOrCreateContactByGHL } from '@/lib/contacts';

export async function POST(req) {
  try {
    // simple auth
    const secret = process.env.INGEST_SECRET;
    if (secret && req.headers.get('x-ingest-secret') !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ghl_contact_id, contact = {}, order } = await req.json();
    if (!ghl_contact_id) return NextResponse.json({ error: 'ghl_contact_id required' }, { status: 400 });
    if (!order?.order_id) return NextResponse.json({ error: 'order.order_id required' }, { status: 400 });

    const contactId = await getOrCreateContactByGHL(ghl_contact_id, contact);

    const payload = {
      order_id: order.order_id,
      contact_id: contactId,
      ghl_contact_id,
      status: order.status ?? null,
      order_date: order.order_date ?? null,
      order_total: order.order_total ?? null,
      tax: order.tax ?? null,
      tips: order.tips ?? null,
      shipping_cost: order.shipping_cost ?? null,
      invoice_link: order.invoice_link ?? null,
      invoice_description: order.invoice_description ?? null,
      invoice_line_items: order.invoice_line_items ?? null, // plain text
      shipping_address_raw: order.shipping_address_raw ?? null,
      shipping_street1: order.shipping_street1 ?? null,
      shipping_street2: order.shipping_street2 ?? null,
      shipping_city: order.shipping_city ?? null,
      shipping_state: order.shipping_state ?? null,
      shipping_zip: order.shipping_zip ?? null,
      tracking_number: order.tracking_number ?? null,
      tracking_link: order.tracking_link ?? null,
      terms_notes: order.terms_notes ?? null,
      ai_summary: order.ai_summary ?? null,
      ai_extracted_needs: order.ai_extracted_needs ?? null,
      aggregated_data: order.aggregated_data ?? null,
      monday_id: order.monday_id ?? null,
    };

    const { error } = await supabaseAdmin.from('orders').upsert(payload, { onConflict: 'order_id' });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 400 });
  }
}