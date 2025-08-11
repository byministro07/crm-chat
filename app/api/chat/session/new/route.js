import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request) {
  try {
    // Check if Supabase is initialized
    if (!supabaseAdmin) {
      console.error('Supabase Admin not initialized');
      return Response.json(
        { error: 'Database connection not configured' },
        { status: 500 }
      );
    }

    const { contactId, firstMessage, modelTier } = await request.json();

    if (!contactId) {
      return Response.json({ error: 'Contact ID required' }, { status: 400 });
    }

    // Get contact details
    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('name, email')
      .eq('id', contactId)
      .single();

    let title = `${contact?.name || 'Unknown'}`;

    // If we have a first message, generate AI summary
    if (firstMessage && process.env.OPENROUTER_API_KEY) {
      try {
        const summaryResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'openai/gpt-5-nano',
            messages: [
              {
                role: 'system',
                content: 'Generate a 3-6 word summary of this customer question. Be specific and concise. Examples: "shipping address update request", "order status inquiry", "refund processing question", "product availability check"'
              },
              {
                role: 'user',
                content: firstMessage
              }
            ],
            max_tokens: 20,
            temperature: 0.3
          })
        });

        if (summaryResponse.ok) {
          const summaryData = await summaryResponse.json();
          const summary = summaryData.choices[0]?.message?.content?.trim();
          if (summary) {
            title = `${contact?.name || 'Unknown'} - ${summary}`;
          }
        }
      } catch (err) {
        console.error('Failed to generate summary:', err);
      }
    }

    // Create the session
    const { data: session, error } = await supabaseAdmin
      .from('chat_sessions')
      .insert({
        contact_id: contactId,
        title,
        model_tier: modelTier || 'medium',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    return Response.json({ 
      sessionId: session.id,
      title: session.title 
    });
  } catch (error) {
    console.error('Session creation error:', error);
    return Response.json(
      { error: error.message || 'Failed to create session' },
      { status: 500 }
    );
  }
}