import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { MODEL_BY_TIER } from '@/lib/models';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// ====== tunables (can override with env on Vercel) ======
const MAX_CONTEXT_MSGS = Number(process.env.MAX_CONTEXT_MSGS || 50);     // how many recent messages
const CONTEXT_DAYS     = Number(process.env.CONTEXT_DAYS || 120);        // lookback window
const MAX_MSG_LENGTH   = Number(process.env.MAX_MSG_LENGTH || 1000);     // trim each msg body chars

// ---------------- helpers ----------------
const isoSince = () => new Date(Date.now() - CONTEXT_DAYS*24*60*60*1000).toISOString();
const truncate = (s='', n=MAX_MSG_LENGTH) => (s.length > n ? s.slice(0, n) + '…' : s);

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
      .filter(Boolean).join(', ')
  ) || null;
}

async function getMessages(contactId, limit = MAX_CONTEXT_MSGS) {
  const { data } = await supabaseAdmin
    .from('conversations')
    .select('channel, direction, sender, body, occurred_at')
    .eq('contact_id', contactId)
    .gte('occurred_at', isoSince())
    .order('occurred_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

async function getOrdersSnapshot(contactId, limit = 5) {
  const { data } = await supabaseAdmin
    .from('orders')
    .select('order_id, order_date, status, order_total, tracking_number, tracking_link, shipping_address_raw')
    .eq('contact_id', contactId)
    .order('order_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

function buildMessageLog(msgs) {
  return msgs
    .slice().reverse() // oldest -> newest
    .map(m => {
      const stamp = m.occurred_at ? new Date(m.occurred_at).toISOString() : 'unknown time';
      const who = m.sender || (m.direction === 'inbound' ? 'Customer' : 'Agent');
      return `[${stamp}] ${who} (${m.channel || 'msg'}): ${truncate(m.body || '(no content)')}`;
    })
    .join('\n');
}

// build the full context once per request
async function buildContext(contactId, contactHeader) {
  const [msgs, orders] = await Promise.all([
    getMessages(contactId, MAX_CONTEXT_MSGS),
    getOrdersSnapshot(contactId, 5),
  ]);

  const messagesLog = buildMessageLog(msgs);

  const ordersText = orders.length
    ? orders.map(o =>
        `${o.order_id} • ${o.order_date} • ${o.status ?? '—'} • $${Number(o.order_total ?? 0).toFixed(2)}`
        + (o.tracking_number ? ` • tracking ${o.tracking_number}` : '')
      ).join('\n')
    : '(no recent orders)';

  const profileText =
    `Name: ${contactHeader?.name ?? 'Unknown'}\n` +
    `Email: ${contactHeader?.email ?? 'Unknown'}\n` +
    `Company: ${contactHeader?.company ?? 'Unknown'}\n` +
    `Last Activity: ${contactHeader?.last_activity_at ?? 'Unknown'}`;

  return { messagesLog, ordersText, profileText, messageCount: msgs.length };
}

// ---------------- intent detection (same as before, trimmed) --------------
function parseCount(text, def = 10) {
  const m = text.match(/last\s+(\d+)\s+(?:messages?|msgs?|conversations?|notes?)/i);
  return m ? Math.max(1, Math.min(50, parseInt(m[1], 10))) : def;
}
function detectIntent(q) {
  const text = q.toLowerCase();
  const nMsgs = parseCount(text, 10);

  if (/(summari[sz]e|recap|overview)/i.test(text) && /(messages?|conversations?|thread)/i.test(text))
    return { type: 'summarize_recent', n: nMsgs, mode: 'summary' };

  if (/(what.*mean|what do you think|is .*approved|approved or not|decision|intent|meaning)/i.test(text)
      && /(last|recent).*(messages?|conversations?)/i.test(text))
    return { type: 'summarize_recent', n: nMsgs, mode: 'qa' };

  if (/(from|based on).*(?:the|his|her|their)?\s*last message/i.test(text))
    return { type: 'qa_last_message' };

  if (/(\bwhat|which|show|list|display)\b.*(messages?|conversations?)/i.test(text)
      || /(messages?\s+(he|she|they)\s+has)/i.test(text)
      || /(last\s+\d+\s+messages?)/i.test(text))
    return { type: 'list_recent', n: nMsgs };

  const lastNOrders = text.match(/last\s+(\d+)\s+orders?/i);
  if (lastNOrders) return { type: 'last_n_orders', n: Math.max(1, Math.min(10, parseInt(lastNOrders[1], 10))) };
  if (/(shipping address|ship(ping)?\s*address|where.*ship)/i.test(text)) return { type: 'shipping_address' };
  if (/(last|latest).*order.*(total|amount|price)/i.test(text) || /invoice.*total/i.test(text)) return { type: 'last_order_total' };
  if (/(tracking|tracking number|tracking link)/i.test(text)) return { type: 'tracking' };

  if (/(?:^|\b)(last|latest)\s+message\b(?!s)/i.test(text)) return { type: 'last_message' };
  if (/(when|what).*(last|latest).*(talk|contact|message|reach(ed)? out)/i.test(text) || /last contact date/i.test(text))
    return { type: 'last_contact_date' };

  return null;
}

// ---------------- route ----------------
export async function POST(req) {
  try {
    const { contactId, question, tier = 'light' } = await req.json();
    if (!question || !contactId) {
      return NextResponse.json({ error: 'Missing question or contactId' }, { status: 400 });
    }

    // header contact
    const { data: contact, error: cErr } = await supabaseAdmin
      .from('contacts')
      .select('name,email,company,last_activity_at')
      .eq('id', contactId)
      .single();
    if (cErr) throw cErr;

    const intent = detectIntent(question);

    // Fast DB tools (no model needed)
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
      const lines = orders.map(o => `${o.order_id} • ${o.order_date} • ${o.status ?? '—'} • $${Number(o.order_total ?? 0).toFixed(2)}`);
      return NextResponse.json({ answer: `Last ${orders.length} orders:\n` + lines.join('\n'), model: 'tool:db' });
    }

    // Build the full context once for any model usage
    const ctx = await buildContext(contactId, contact);
    const model = MODEL_BY_TIER[tier] || MODEL_BY_TIER.light;

    // Conversations (DB list)
    if (intent?.type === 'list_recent') {
      if (!ctx.messageCount) return NextResponse.json({ answer: 'No conversations found for this contact.', model: 'tool:db' });
      const answer = ctx.messagesLog
        .split('\n')
        .slice(-intent.n * 2 || undefined) // crude thinning if user asked for a number
        .join('\n');
      return NextResponse.json({ answer, model: 'tool:db' });
    }

    if (intent?.type === 'last_message') {
      if (!ctx.messageCount) return NextResponse.json({ answer: 'No conversations found for this contact.', model: 'tool:db' });
      // last line pair ~ good enough for display
      const last = ctx.messagesLog.split('\n').slice(-1)[0] || '(no body)';
      return NextResponse.json({ answer: last, model: 'tool:db' });
    }

    if (intent?.type === 'last_contact_date') {
      if (!ctx.messageCount) return NextResponse.json({ answer: 'No conversations found for this contact.', model: 'tool:db' });
      // parse the last line timestamp
      const lastLine = ctx.messagesLog.split('\n').slice(-1)[0];
      const match = lastLine?.match(/^\[(.*?)\]/);
      const when = match ? new Date(match[1]).toLocaleString() : '(no timestamp)';
      return NextResponse.json({ answer: `Last contact: ${when}`, model: 'tool:db' });
    }

    // QA over the single last message (but still provide broader context)
    if (intent?.type === 'qa_last_message') {
      const prompt =
        `You will answer ONLY from the last message. Use the broader context only to clarify references, not to invent facts.\n\n` +
        `Profile:\n${ctx.profileText}\n\nRecent Orders:\n${ctx.ordersText}\n\n` +
        `Recent Messages (oldest→newest):\n${ctx.messagesLog}\n\n` +
        `User question: ${question}\n\n` +
        `If the last message does not explicitly answer, reply exactly: "I can’t tell from the last message."`;

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
            { role: 'system', content: 'You are an internal assistant. Be precise and concise.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 350,
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

    // Summaries or general Q&A => ALWAYS include full context
    const system =
      'You are an internal assistant for a sales team. Base answers STRICTLY on the provided context. ' +
      'If the context does not contain the answer, say exactly: "I can’t tell from the provided data." Keep answers short.';

    const userPrompt =
      `Context — Profile:\n${ctx.profileText}\n\n` +
      `Context — Recent Orders:\n${ctx.ordersText}\n\n` +
      `Context — Recent Messages (oldest→newest):\n${ctx.messagesLog}\n\n` +
      `Question: ${question}`;

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
        max_tokens: 450,
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
