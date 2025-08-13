import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request) {
  try {
    const { contactId, sessionId } = await request.json();
    console.log('🔍 Analyzing status for:', { contactId, sessionId });
    
    // Get conversation messages - FIX: Use correct table name
    let messages = [];
    if (sessionId) {
      const { data, error } = await supabaseAdmin
        .from('chat_messages')  // ← CORRECT TABLE NAME
        .select('content, role, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error('❌ Supabase error:', error);
        return NextResponse.json({ status: 'UNSURE' });
      }
      
      messages = data || [];
      console.log(`📝 Found ${messages.length} messages`);
    }
    
    // If no sessionId (new contact), return ACTIVE
    if (!sessionId || messages.length === 0) {
      console.log('✨ New contact - returning ACTIVE');
      return NextResponse.json({ status: 'ACTIVE' });
    }
    
    // Get last message date
    const lastMessageDate = new Date(messages[messages.length - 1].created_at);
    const daysSinceLastMessage = Math.floor((new Date() - lastMessageDate) / (1000 * 60 * 60 * 24));
    
    console.log(`📅 Days since last message: ${daysSinceLastMessage}`);
    
    // Format conversation
    const conversationText = messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n')
      .slice(0, 2000);
    
    // Quick check for payment keywords
    const paymentKeywords = ['payment received', 'order placed', 'paid', 'purchased', 'payment confirmed'];
    const hasPaymentMention = paymentKeywords.some(keyword => 
      conversationText.toLowerCase().includes(keyword)
    );
    
    // Only call AI if there's a conversation to analyze
    console.log('🤖 Calling OpenRouter...');
    
    const prompt = `Analyze this conversation and return ONLY one status word:
- PAID: if you find words like "payment received", "order placed", "paid", "purchased", "payment confirmed"
- ACTIVE: if last message < 30 days ago and no payment
- DORMANT: if last message > 30 days ago and no payment
- UNSURE: if cannot determine

Days since last message: ${daysSinceLastMessage}
Conversation:
${conversationText}

Return only the status word.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 10,
        temperature: 0.1
      })
    });
    
    if (!response.ok) {
      console.error('❌ OpenRouter error:', response.status);
      // Fallback without AI
      if (daysSinceLastMessage > 30) return NextResponse.json({ status: 'DORMANT' });
      return NextResponse.json({ status: 'ACTIVE' });
    }

    const data = await response.json();
    console.log('✅ OpenRouter response:', data);
    
    const status = data.choices?.[0]?.message?.content?.trim().toUpperCase() || 'UNSURE';
    const validStatuses = ['PAID', 'ACTIVE', 'DORMANT', 'UNSURE'];
    const finalStatus = validStatuses.includes(status) ? status : 'UNSURE';
    
    console.log('📊 Final status:', finalStatus);
    return NextResponse.json({ status: finalStatus });
    
  } catch (error) {
    console.error('💥 Status analysis error:', error);
    return NextResponse.json({ status: 'UNSURE' });
  }
}


