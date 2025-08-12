import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request) {
  try {
    const { contactId, sessionId } = await request.json();
    
    // Get conversation messages
    let messages = [];
    if (sessionId) {
      const { data } = await supabaseAdmin
        .from('chat_messages')
        .select('content, role, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });
      messages = data || [];
    }
    
    // Get last message date
    const lastMessageDate = messages.length > 0 
      ? new Date(messages[messages.length - 1].created_at)
      : null;
    
    const daysSinceLastMessage = lastMessageDate 
      ? Math.floor((new Date() - lastMessageDate) / (1000 * 60 * 60 * 24))
      : null;
    
    // Format conversation for analysis
    const conversationText = messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');
    
    // Analyze with Gemini Flash
    const prompt = `Analyze this conversation and return ONLY one status word:
- PAID: if you find words like "payment received", "order placed", "paid", "purchased", "payment confirmed", "transaction complete"
- ACTIVE: if last message was less than 30 days ago (${daysSinceLastMessage} days ago) and no payment mentioned
- DORMANT: if last message was more than 30 days ago (${daysSinceLastMessage} days ago) and no payment mentioned
- UNSURE: if cannot determine

Today is ${new Date().toLocaleDateString()}.
Days since last message: ${daysSinceLastMessage || 'unknown'}

Conversation:
${conversationText || 'No messages yet'}

Return only the status word (PAID, ACTIVE, DORMANT, or UNSURE).`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 10,
        temperature: 0.1
      })
    });
    
    if (!response.ok) {
      const t = await response.text().catch(() => '');
      console.error('Analyze status model error:', t);
      return NextResponse.json({ status: 'UNSURE' });
    }

    const data = await response.json();
    const statusRaw = data.choices?.[0]?.message?.content?.trim().toUpperCase() || 'UNSURE';
    
    // Validate status
    const validStatuses = ['PAID', 'ACTIVE', 'DORMANT', 'UNSURE'];
    const finalStatus = validStatuses.includes(statusRaw) ? statusRaw : 'UNSURE';
    
    return NextResponse.json({ status: finalStatus });
    
  } catch (error) {
    console.error('Status analysis error:', error);
    return NextResponse.json({ status: 'UNSURE' });
  }
}


