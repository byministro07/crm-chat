// app/api/chat/ask/route.js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { MODEL_BY_TIER } from '@/lib/models';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/* ---------------------- helpers ---------------------- */
async function getLatestOrder(contactId) {
  const { data } = await supabaseAdmin
    .from('orders')
    .select(
      'order_id, order_date, order_total, invoice_link, ' +
      'shipping_address_raw, shipping_street1, shipping_street2, shipping_city, shipping_state, shipping_zip, ' +
      'tracking_number, tracking_link'
    )
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

async function getLastMessages(contactId, n = 10) {
  const { data } = await supabaseAdmin
    .from('conversations')
    .select('channel, direction, sender, body, occurred_at')
    .eq('contact_id', contactId)
    .order('occurred_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(n);
  return data || [];
}

/* ---------------- intent detection (fixed) ------------ */
function parseCount(text, def = 10) {
  const m = text.match(/last\s+(\d+)\s+(?:messages?|msgs?|conversations?|notes?)/i);
  return m ? Math.max(1, Math.min(50, parseInt(m[1], 10))) : def;
}

function detectIntent(q) {
  const text = q.toLowerCase();
  const nMsgs = parseCount(text, 10);

  // Summaries / analysis FIRST (so it doesn't get caught by "last message")
  if (/(summari[sz]e|recap|overview)/i.test(text) && /(messages?|conversations?|thread)/i.test(text)) {
    return { type: 'summarize_recent', n: nMsgs, mode: 'summary' };
  }
  if (/(what.*mean|what do you think|is .*approved|approved or not|decision|intent|meaning)/i.test(text)
      && /(last|recent).*(messages?|conversations?)/i.test(text)) {
    return { type: 'summarize_recent', n: nMsgs, mode: 'qa' };
  }

  // Orders/tools
  const lastNOrders = text.match(/last\s+(\d+)\s+orders?/i);
  if (lastNOrders) return { type: 'last_n_orders', n: Math.max(1, Math.min(10, parseInt(lastNOrders[1], 10))) };
  if (/(shipping address|ship(ping)?\s*address|where.*ship)/i.test(text)) return { type: 'shipping_address' };
  if (/(last|latest).*order.*(total|amount|price)/i.test(text) || /invoice.*total/i.test(text)) return { type: 'last_order_total' };
  if (/(tracking|tracking number|tracking link)/i.test(text)) return { type: 'tracking' };

  // Single last message & last contact date
  if (/(?:^|\b)(last|latest)\s+message\b(?!s)/i.test(text)) return { type: 'last_message' }; // singular only
  if (/(when|what).*(last|latest).*(talk|contact|message|reach(ed)? out)/i.test(text) || /last contact date/i.test(text))
    return { type: 'last_contact_date' };

  return null;
}

/* ----------------------- route ------------------------ */
export async function POST(req) {
  try {
    const { contactId, question, tier = 'light' } = await req.json();
    if (!question || !contactId) {
      return NextResponse.json({ error: 'Missing question or contactId' }, { status: 400 });
    }

    // header context
    const { data: contact, error: cErr } = await supabaseAdmin
      .from('contacts')
      .select('name,email,company,last_activity_at')
      .eq('id', contactId)
      .single();
    if (cErr) throw cErr;

    const intent = detectIntent(question);

    // DB tools
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
      if (!orders || orders.length === 0)
        return NextResponse.json({ answer: 'No orders found for this contact.', model: 'tool:db' });
      const lines = orders.map(o =>
        `${o.order_id} • ${o.order_date} • ${o.status ?? '—'} • $${Number(o.order_total ?? 0).toFixed(2)}`
      );
      return NextResponse.json({ answer: `Last ${orders.length} orders:\n` + lines.join('\n'), model: 'tool:db' });
    }

    if (intent?.type === 'last_message') {
      const msgs = await getLastMessages(contactId, 1);
      if (!msgs.length) return NextResponse.json({ answer: 'No conversations found for this contact.', model: 'tool:db' });
      const m = msgs[0];
      const line = `${m.occurred_at ?? ''} • ${m.channel ?? ''} • ${m.direction ?? ''} ${m.sender ? `• ${m.sender}` : ''}\n${m.body ?? '(no body)'}`;
      return NextResponse.json({ answer: line, model: 'tool:db' });
    }

    if (intent?.type === 'last_contact_date') {
      const msgs = await getLastMessages(contactId, 1);
      if (!msgs.length) return NextResponse.json({ answer: 'No conversations found for this contact.', model: 'tool:db' });
      const when = msgs[0].occurred_at ? new Date(msgs[0].occurred_at).toLocaleString() : '(no timestamp)';
      return NextResponse.json({ answer: `Last contact: ${when}`, model: 'tool:db' });
    }

    if (intent?.type === 'summarize_recent') {
      const n = intent.n ?? 10;
      const msgs = await getLastMessages(contactId, n);
      if (!msgs.length) return NextResponse.json({ answer: 'No conversations found for this contact.', model: 'tool:db' });

      const model = MODEL_BY_TIER[tier] || MODEL_BY_TIER.light;

      const convo = msgs
        .slice()
        .reverse()
        .map(m => {
          const stamp = m.occurred_at ? new Date(m.occurred_at).toISOString() : 'unknown time';
          const who = m.sender || (m.direction === 'inbound' ? 'Customer' : 'Agent');
          return `[${stamp}] ${who} (${m.channel || 'msg'}): ${m.body || '(no content)'}`;
        })
        .join('\n');

      const system =
        'You are an internal assistant. Base your answer STRICTLY on the provided messages. ' +
        'If the user asks for a judgment (e.g., is the order approved), answer only if stated; ' +
        'otherwise say you cannot tell from the messages. Be concise.';

      const userPrompt =
        intent.mode === 'summary'
          ? `Summarize these ${msgs.length} recent messages into up to 3 short bullets with dates and any explicit next steps:\n\n${convo}`
          : `Based ONLY on these ${msgs.length} recent messages, answer the user question:\n"${question}"\n\n` +
            `If the messages do not say, respond: "I can't tell from the messages."\n\nMessages:\n${convo}`;

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
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 400,
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        return NextResponse.json({ error: `OpenRouter ${res.status}: ${t}` }, { status: 500 });
      }
      const data = await res.json();
      const answer = data?.choices?.[0]?.message?.content ?? '(no answer)';
      return NextResponse.json({ answer, model });
    }

    // Fallback: general model Q&A
    const model = MODEL_BY_TIER[tier] || MODEL_BY_TIER.light;
    const system = 'You are a helpful assistant for an internal sales team. Be concise.';
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