import { NextResponse } from 'next/server';

export async function GET() {
  console.log('Testing OpenRouter connection...');
  console.log('API Key exists:', !!process.env.OPENROUTER_API_KEY);
  console.log('API Key first 10 chars:', process.env.OPENROUTER_API_KEY?.substring(0, 10));
  
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [{ role: 'user', content: 'Say "TEST OK"' }],
        max_tokens: 10
      })
    });
    
    const data = await response.json();
    console.log('OpenRouter test response:', data);
    
    return NextResponse.json({ 
      success: response.ok,
      status: response.status,
      data 
    });
  } catch (error) {
    console.error('Test failed:', error);
    return NextResponse.json({ error: error.message });
  }
}

