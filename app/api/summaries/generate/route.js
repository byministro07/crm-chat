// app/api/summaries/generate/route.js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { MODEL_BY_TIER } from '@/lib/models';

const SUMMARY_MODEL = MODEL_BY_TIER.light; // Use light model for summaries
const SUMMARY_CUTOFF_HOURS = 24;

export async function POST(request) {
  try {
    const body = await request.json();
    const { contactId, forceRegenerate = false } = body;

    if (!contactId) {
      return NextResponse.json({ error: 'contactId required' }, { status: 400 });
    }

    // Check if we already have today's summary
    const today = new Date().toISOString().split('T')[0];
    
    if (!forceRegenerate) {
      const { data: existing } = await supabaseAdmin
        .from('contact_summaries')
        .select('*')
        .eq('contact_id', contactId)
        .eq('summary_date', today)
        .eq('summary_type', 'daily')
        .single();

      if (existing) {
        return NextResponse.json({ 
          summary: existing,
          cached: true 
        });
      }
    }

    // Fetch recent conversations (last 24-48 hours for context)
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - SUMMARY_CUTOFF_HOURS);

    const { data: messages } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('contact_id', contactId)
      .gte('occurred_at', cutoffDate.toISOString())
      .order('occurred_at', { ascending: true })
      .limit(100);

    // Fetch recent orders
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('contact_id', contactId)
      .gte('order_date', cutoffDate.toISOString())
      .order('order_date', { ascending: false })
      .limit(20);

    // If no recent activity, create a minimal summary
    if ((!messages || messages.length === 0) && (!orders || orders.length === 0)) {
      const minimalSummary = {
        contact_id: contactId,
        summary_date: today,
        summary_type: 'daily',
        conversation_summary: 'No recent conversations in the last 24 hours.',
        order_summary: 'No recent orders in the last 24 hours.',
        key_topics: [],
        action_items: [],
        message_count: 0,
        order_count: 0,
        total_order_value: 0,
        model_used: 'none',
        input_tokens_used: 0
      };

      const { data: saved } = await supabaseAdmin
        .from('contact_summaries')
        .upsert(minimalSummary)
        .select()
        .single();

      return NextResponse.json({ summary: saved, cached: false });
    }

    // Generate summary using AI
    const summaryPrompt = buildSummaryPrompt(messages, orders);
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.VERCEL_URL || 'http://localhost:3000',
        'X-Title': 'CRM Chat Summary Generator'
      },
      body: JSON.stringify({
        model: SUMMARY_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a CRM assistant that creates concise daily summaries of customer interactions.
Focus on: key topics discussed, action items, order details, and important context.
Keep summaries brief but comprehensive. Extract specific action items and topics.
Format your response as JSON with these exact keys:
{
  "conversation_summary": "Brief paragraph summarizing conversations",
  "order_summary": "Brief paragraph about orders if any",
  "key_topics": ["topic1", "topic2"],
  "action_items": ["item1", "item2"]
}`
          },
          {
            role: 'user',
            content: summaryPrompt
          }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const summaryData = JSON.parse(aiResponse.choices[0].message.content);

    // Calculate totals
    const totalOrderValue = orders?.reduce((sum, o) => sum + (parseFloat(o.order_total) || 0), 0) || 0;
    const lastMessageAt = messages?.[messages.length - 1]?.occurred_at || null;

    // Save summary to database
    const summaryRecord = {
      contact_id: contactId,
      summary_date: today,
      summary_type: 'daily',
      conversation_summary: summaryData.conversation_summary || 'No significant conversations.',
      order_summary: summaryData.order_summary || 'No orders to summarize.',
      key_topics: summaryData.key_topics || [],
      action_items: summaryData.action_items || [],
      message_count: messages?.length || 0,
      order_count: orders?.length || 0,
      total_order_value: totalOrderValue,
      last_message_at: lastMessageAt,
      model_used: SUMMARY_MODEL,
      input_tokens_used: aiResponse.usage?.prompt_tokens || 0
    };

    const { data: saved, error } = await supabaseAdmin
      .from('contact_summaries')
      .upsert(summaryRecord)
      .select()
      .single();

    if (error) {
      console.error('Error saving summary:', error);
      throw error;
    }

    return NextResponse.json({ 
      summary: saved,
      cached: false,
      tokens_used: aiResponse.usage?.prompt_tokens || 0
    });

  } catch (err) {
    console.error('Summary generation error:', err);
    return NextResponse.json({ 
      error: 'Failed to generate summary',
      details: err.message 
    }, { status: 500 });
  }
}

function buildSummaryPrompt(messages, orders) {
  let prompt = 'Create a daily summary for this customer based on the following activity:\n\n';

  if (messages && messages.length > 0) {
    prompt += 'RECENT CONVERSATIONS:\n';
    messages.forEach(msg => {
      const time = new Date(msg.occurred_at).toLocaleString();
      prompt += `[${time}] ${msg.direction === 'inbound' ? 'Customer' : 'Agent'}: ${msg.body?.substring(0, 500)}\n`;
    });
    prompt += '\n';
  }

  if (orders && orders.length > 0) {
    prompt += 'RECENT ORDERS:\n';
    orders.forEach(order => {
      prompt += `Order #${order.order_id} - ${order.status} - $${order.order_total} - ${order.order_date}\n`;
      if (order.shipping_address_raw) {
        prompt += `Shipping: ${order.shipping_address_raw.substring(0, 100)}\n`;
      }
    });
  }

  return prompt;
}

// GET endpoint to retrieve existing summaries
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('contactId');
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    if (!contactId) {
      return NextResponse.json({ error: 'contactId required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('contact_summaries')
      .select('*')
      .eq('contact_id', contactId)
      .eq('summary_date', date)
      .eq('summary_type', 'daily')
      .single();

    if (error && error.code !== 'PGRST116') { // Not found is ok
      throw error;
    }

    return NextResponse.json({ summary: data });

  } catch (err) {
    console.error('Summary fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 });
  }
}