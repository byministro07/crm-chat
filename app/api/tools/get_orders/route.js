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
    const limit = Number(searchParams.get('limit') || 10);

    const id = await resolveContactId({ contactId, ghlContactId });

    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('id, order_id, order_date, status, order_total, tracking_link, invoice_link')
      .eq('contact_id', id)
      .order('order_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return NextResponse.json({ orders: data || [] });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}