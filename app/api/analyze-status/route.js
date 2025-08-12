import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request) {
  try {
    const { contactId, sessionId } = await request.json();
    console.log('🔍 Analyzing status for:', { contactId, sessionId });
    
    // Get conversation messages
    let messages = [];
    if (sessionId) {
      const { data, error } = await supabaseAdmin
        .from('messages')  // ← FIX: Changed from 'chat_messages' to 'messages'
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
    
    // If no messages in session, return ACTIVE for new contacts
    if (messages.length === 0) {
      console.log('✨ New contact - returning ACTIVE');
      return NextResponse.json({ status: 'ACTIVE' });
    }
    
    // Get last message date
    const lastMessageDate = new Date(messages[messages.length - 1].created_at);
    const daysSinceLastMessage = Math.floor((new Date() - lastMessageDate) / (1000 * 60 * 60 * 24));
    
    // Format conversation for analysis
    const conversationText = messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n')
      .slice(0, 2000); // Limit context to save tokens
    
    console.log(`📅 Days since last message: ${daysSinceLastMessage}`);
    
    // Quick check for payment keywords before calling AI
    const paymentKeywords = ['payment received', 'order placed', 'paid', 'purchased', 'payment confirmed'];
    const hasPaymentMention = paymentKeywords.some(keyword => 
      conversationText.toLowerCase().includes(keyword)
    );
    
    if (hasPaymentMention) {
      console.log('💰 Payment keywords found - calling AI to confirm');
    }
    
    // Analyze with Gemini Flash
    const prompt = `Analyze this conversation and return ONLY one status word:
- PAID: if you find words like "payment received", "order placed", "paid", "purchased", "payment confirmed", "transaction complete"
- ACTIVE: if last message was less than 30 days ago (${daysSinceLastMessage} days ago) and no payment mentioned
- DORMANT: if last message was more than 30 days ago (${daysSinceLastMessage} days ago) and no payment mentioned
- UNSURE: if cannot determine

Today is ${new Date().toLocaleDateString()}.
Days since last message: ${daysSinceLastMessage}

Conversation:
${conversationText}

Return only the status word.`;

    console.log('🤖 Calling OpenRouter...');
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'CRM Status Analyzer'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',  // ← FIX: Correct model name
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 10,
        temperature: 0.1
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OpenRouter error:', response.status, errorText);
      
      // Fallback logic if AI fails
      if (daysSinceLastMessage > 30) return NextResponse.json({ status: 'DORMANT' });
      if (daysSinceLastMessage <= 30) return NextResponse.json({ status: 'ACTIVE' });
      return NextResponse.json({ status: 'UNSURE' });
    }

    const data = await response.json();
    console.log('✅ OpenRouter response:', data);
    
    const responseText = data.choices?.[0]?.message?.content || '';
    const status = responseText.trim().toUpperCase();
    
    // Validate status
    const validStatuses = ['PAID', 'ACTIVE', 'DORMANT', 'UNSURE'];
    const finalStatus = validStatuses.includes(status) ? status : 'UNSURE';
    
    console.log('📊 Final status:', finalStatus);
    return NextResponse.json({ status: finalStatus });
    
  } catch (error) {
    console.error('💥 Status analysis error:', error);
    return NextResponse.json({ status: 'UNSURE' });
  }
}


