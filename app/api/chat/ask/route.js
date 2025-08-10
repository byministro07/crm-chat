// app/api/chat/ask/route.js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { MODEL_BY_TIER } from '@/lib/models';

export async function POST(req) {
  try {
    const { contactId, question, tier = 'light' } = await req.json();
    if (!question || !contactId) {
      return NextResponse.json({ error: 'Missing question or contactId' }, { status: 400 });
    }

    const model = MODEL_BY_TIER[tier] || MODEL_BY_TIER.light;

    // Fetch a little context about the contact (we’ll add more later)
    const { data: contact, error } = await supabaseAdmin
      .from('contacts')
      .select('name,email,company,last_activity_at')
      .eq('id', contactId)
      .single();

    if (error) throw error;

    const system = [
      'You are a helpful assistant for an internal sales team.',
      'Answer concisely. If a fact is missing, say so briefly.',
    ].join(' ');

    const user = `Customer:
- Name: ${contact?.name ?? 'Unknown'}
- Email: ${contact?.email ?? 'Unknown'}
- Company: ${contact?.company ?? 'Unknown'}
- Last Activity: ${contact?.last_activity_at ?? 'Unknown'}

Question: ${question}`;

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
        max_tokens: 300,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json({ error: `OpenRouter ${res.status}: ${text}` }, { status: 500 });
    }

    const data = await res.json();
    const answer = data?.choices?.[0]?.message?.content ?? '(no answer)';
    return NextResponse.json({ answer, model, contact });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}