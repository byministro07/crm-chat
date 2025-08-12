// app/api/chat/ask/route.js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { MODEL_BY_TIER } from '@/lib/models';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_CONTEXT_MSGS = Number(process.env.MAX_CONTEXT_MSGS || 10000);
const CONTEXT_DAYS     = Number(process.env.CONTEXT_DAYS || 36500); // 100 years
const MAX_MSG_LENGTH   = Number(process.env.MAX_MSG_LENGTH || 10000);
const truncate = (s='', n=MAX_MSG_LENGTH) => (s.length > n ? s.slice(0, n) + '…' : s);

async function getMessages(contactId, limit = MAX_CONTEXT_MSGS) {
  const { data } = await supabaseAdmin
    .from('conversations')
    .select('channel, direction, sender, body, occurred_at')
    .eq('contact_id', contactId)
    .order('occurred_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}
async function getOrdersSnapshot(contactId, limit = 1000) {
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
  return msgs.slice().reverse().map(m => {
    const stamp = m.occurred_at ? new Date(m.occurred_at).toISOString() : 'unknown time';
    const who = m.sender || (m.direction === 'inbound' ? 'Customer' : 'Agent');
    return `[${stamp}] ${who} (${m.channel || 'msg'}): ${truncate(m.body || '(no content)')}`;
  }).join('\n');
}

async function buildContext(contactId, contactHeader) {
  const [msgs, orders] = await Promise.all([
    getMessages(contactId, MAX_CONTEXT_MSGS),
    getOrdersSnapshot(contactId, 1000),
  ]);
  const messagesLog = buildMessageLog(msgs);
  const ordersText = orders.length
    ? orders.map(o => `${o.order_id} • ${o.order_date} • ${o.status ?? '—'} • $${Number(o.order_total ?? 0).toFixed(2)}${o.tracking_number ? ` • tracking ${o.tracking_number}` : ''}`).join('\n')
    : '(no recent orders)';
  const profileText = `Name: ${contactHeader?.name ?? 'Unknown'}
Email: ${contactHeader?.email ?? 'Unknown'}
Company: ${contactHeader?.company ?? 'Unknown'}
Last Activity: ${contactHeader?.last_activity_at ?? 'Unknown'}`;
  return { messagesLog, ordersText, profileText };
}

async function getSessionTurns(sessionId, limit = 20) {
  if (!sessionId) return [];
  const { data } = await supabaseAdmin
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(limit);
  return (data || []).map(m => ({ role: m.role, content: truncate(m.content, 2000) }));
}

export async function POST(req) {
  try {
    const { contactId, question, tier = 'light', sessionId = null } = await req.json();
    if (!question || !contactId) return NextResponse.json({ error: 'Missing question or contactId' }, { status: 400 });

    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('name,email,company,last_activity_at')
      .eq('id', contactId)
      .single();

    // Build context & prior turns
    const ctx = await buildContext(contactId, contact);
    const priorTurns = await getSessionTurns(sessionId, 20); // chat memory

    // Persist the user's message (if we have a session)
    if (sessionId) {
      await supabaseAdmin.from('chat_messages').insert({
        session_id: sessionId, role: 'user', content: question
      });
    }

    const model = MODEL_BY_TIER[tier] || MODEL_BY_TIER.light;
    const system =
      'You are an intelligent assistant for a sales team analyzing customer data. ' +
      'Always provide helpful answers based on the available context. ' +
      'If information is partial, work with what you have and indicate your confidence level (0-100%). ' +
      'If critical information is missing, ask clarifying questions. ' +
      'Never just say you cannot help - either provide insights from available data or ask for more specific information.';

    const contextBlock =
`Context — Profile:
${ctx.profileText}

Context — Recent Orders:
${ctx.ordersText}

Context — Recent Messages (oldest→newest):
${ctx.messagesLog}`;

    // Assemble the chat for the model: system + prior chat + new user turn (with the context block)
    const messages = [
      { role: 'system', content: system },
      ...priorTurns,
      { role: 'user', content: `${contextBlock}\n\nQuestion: ${question}` }
    ];

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, temperature: 0.2, messages, max_tokens: 450 }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return NextResponse.json({ error: `OpenRouter ${res.status}: ${t}` }, { status: 500 });
    }

    const data = await res.json();
    const answer = data?.choices?.[0]?.message?.content ?? '(no answer)';

    // Persist assistant reply
    if (sessionId) {
      await supabaseAdmin.from('chat_messages').insert({
        session_id: sessionId, role: 'assistant', content: answer, model
      });
    }

    return NextResponse.json({ answer, model });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
