// app/api/chat/ask/route.js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { MODEL_BY_TIER } from '@/lib/models';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Detect simple factual intents we can answer from DB */
function detectIntent(q) {
  const text = q.toLowerCase();

  // last N orders (e.g., "last 3 orders")
  const m = text.match(/last\s+(\d+)\s+orders?/i);
  if (m) return { type: 'last_n_orders', n: Math.max(1, Math.min(10, parseInt(m[1], 10))) };

  if (/(shipping address|ship(ping)?\s*address|where.*ship)/i.test(text))
    return { type: 'shipping_address' };

  if (/(last|latest).*order.*(total|amount|price)/i.test(text) || /invoice.*total/i.test(text))
    return { type: 'last_order_total' };

  if (/(tracking|tracking number|tracking link)/i.test(text))
    return { type: 'tracking' };

  return null;
}

async function getLatestOrder(contactId) {
  const { data } = await supabaseAdmin
    .from('orders')
    .select('order_id, order_date, order_total, invoice_link, shipping_address_raw, shipping_street1, shipping_street2, shipping_city, shipping_state, shipping_zip, tracking_number, tracking_link')
    .eq('contact_id', contactId)
    .order('order_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

function formatOfficialAddress(order) {
  if (!order) return null;
  return (
    order.shipping_address_raw ||
    [order.shipping_street1, order.shipping_street2, order.shipping_city, order.shipping_state, order.shipping_zip]
      .filter(Boolean)
      .join(', ')
  ) || null;
}

export async function POST(req) {
  try {
    const { contactId, question, tier = 'light' } = await req.json();
    if (!question || !contactId) {
      return NextResponse.json({ error: 'Missing question or contactId' }, { status: 400 });
    }

    // Always load minimal contact header
    const { data: contact, error: cErr } = await supabaseAdmin
      .from('contacts')
      .select('name,email,company,last_activity_at')
      .eq('id', contactId)
      .single();
    if (cErr) throw cErr;

    // 1) Try DB “tools” first
    const intent = detectIntent(question);

    if (intent?.type === 'shipping_address') {
      const o = await getLatestOrder(contactId);
      if (!o) return NextResponse.json({ answer: 'No orders found for this contact.', model: 'tool:db' });
      const addr = formatOfficialAddress(o);
      const answer = addr
        ? `Official shipping address (latest order ${o.order_id} on ${o.order_date}):\n${addr}`
        : 'No shipping address found on the latest order.';
      return NextResponse.json({ answer, model: 'tool:db' });
    }

    if (intent?.type === 'last_order_total') {
      const o = await getLatestOrder(contactId);
      if (!o) return NextResponse.json({ answer: 'No orders found for this contact.', model: 'tool:db' });
      const parts = [`Latest order ${o.order_id} on ${o.order_date}`, `Total: $${Number(o.order_total ?? 0).toFixed(2)}`];
      if (o.invoice_link) parts.push(`Invoice: ${o.invoice_link}`);
      return NextResponse.json({ answer: parts.join(' • '), model: 'tool:db' });
    }

    if (intent?.type === 'tracking') {
      const o = await getLatestOrder(contactId);
      if (!o) return NextResponse.json({ answer: 'No orders found for this contact.', model: 'tool:db' });
      if (!o.tracking_number && !o.tracking_link)
        return NextResponse.json({ answer: `Latest order ${o.order_id} has no tracking recorded.`, model: 'tool:db' });
      const answer = [
        `Latest order ${o.order_id}:`,
        o.tracking_number ? `Tracking #: ${o.tracking_number}` : null,
        o.tracking_link ? `Link: ${o.tracking_link}` : null,
      ].filter(Boolean).join('\n');
      return NextResponse.json({ answer, model: 'tool:db' });
    }

    if (intent?.type === 'last_n_orders') {
      const n = intent.n ?? 3;
      const { data: orders } = await supabaseAdmin
        .from('orders')
        .select('order_id, order_date, status, order_total')
        .eq('contact_id', contactId)
        .order('order_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(n);

      if (!orders || orders.length === 0) {
        return NextResponse.json({ answer: 'No orders found for this contact.', model: 'tool:db' });
      }
      const lines = orders.map(o =>
        `${o.order_id} • ${o.order_date} • ${o.status ?? '—'} • $${Number(o.order_total ?? 0).toFixed(2)}`
      );
      return NextResponse.json({ answer: `Last ${orders.length} orders:\n` + lines.join('\n'), model: 'tool:db' });
    }

    // 2) Otherwise fall back to the model (keeps your earlier behavior)
    const model = MODEL_BY_TIER[tier] || MODEL_BY_TIER.light;
    const system = [
      'You are a helpful assistant for an internal sales team.',
      'Be concise. If specific facts (totals, addresses, dates) are requested but not provided, say you cannot find them.',
    ].join(' ');

    const user = `Customer:
- Name: ${contact?.name ?? 'Unknown'}
- Email: ${contact?.email ?? 'Unknown'}
- Company: ${contact?.company ?? 'Unknown'}
- Last Activity: ${contact?.last_activity_at ?? 'Unknown'}

Question: ${question}`;

    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: 350,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json({ error: `OpenRouter ${res.status}: ${text}` }, { status: 500 });
    }

    const data = await res.json();
    const answer = data?.choices?.[0]?.message?.content ?? '(no answer)';
    return NextResponse.json({ answer, model });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}