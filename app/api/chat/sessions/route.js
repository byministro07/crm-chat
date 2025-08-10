// app/api/chat/sessions/route.js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// GET all sessions for a contact (or all if no contactId)
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('contactId');
    const limit = parseInt(searchParams.get('limit') || '20');
    
    let query = supabaseAdmin
      .from('chat_sessions')
      .select(`
        id,
        contact_id,
        title,
        model_tier,
        created_at,
        updated_at,
        contacts!inner(name, email, company)
      `)
      .order('updated_at', { ascending: false })
      .limit(limit);
    
    if (contactId) {
      query = query.eq('contact_id', contactId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching sessions:', error);
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
    }
    
    return NextResponse.json({ sessions: data || [] });
  } catch (err) {
    console.error('Sessions fetch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH to rename a session
export async function PATCH(request) {
  try {
    const body = await request.json();
    const { sessionId, title } = body;
    
    if (!sessionId || !title) {
      return NextResponse.json({ error: 'sessionId and title required' }, { status: 400 });
    }
    
    const { data, error } = await supabaseAdmin
      .from('chat_sessions')
      .update({ 
        title,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating session:', error);
      return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
    }
    
    return NextResponse.json({ session: data });
  } catch (err) {
    console.error('Session update error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE a session
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }
    
    const { error } = await supabaseAdmin
      .from('chat_sessions')
      .delete()
      .eq('id', sessionId);
    
    if (error) {
      console.error('Error deleting session:', error);
      return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Session delete error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}