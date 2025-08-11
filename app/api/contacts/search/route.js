import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request) {
  if (!supabaseAdmin) {
    return Response.json(
      { error: 'Database connection not configured' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const limit = parseInt(searchParams.get('limit')) || 20;

  try {
    let query;

    if (!q) {
      // Get recent contacts based on conversation activity
      const { data: recentConversations } = await supabaseAdmin
        .from('conversations')
        .select('contact_id, occurred_at')
        .order('occurred_at', { ascending: false })
        .limit(100);

      // Get unique contact IDs in order
      const contactIds = [];
      const seen = new Set();
      for (const conv of recentConversations || []) {
        if (conv.contact_id && !seen.has(conv.contact_id)) {
          seen.add(conv.contact_id);
          contactIds.push(conv.contact_id);
          if (contactIds.length >= limit) break;
        }
      }

      if (contactIds.length === 0) {
        // Fallback to contacts with last_activity_at
        query = supabaseAdmin
          .from('contacts')
          .select('*')
          .order('last_activity_at', { ascending: false, nullsFirst: false })
          .limit(limit);
      } else {
        // Get contacts in the order of recent activity
        const { data: contacts } = await supabaseAdmin
          .from('contacts')
          .select('*')
          .in('id', contactIds);

        // Sort contacts to match the order of contactIds
        const sortedContacts = contactIds.map(id => 
          contacts?.find(c => c.id === id)
        ).filter(Boolean);

        return Response.json(sortedContacts);
      }
    } else {
      // Search by name or email
      query = supabaseAdmin
        .from('contacts')
        .select('*')
        .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
        .order('last_activity_at', { ascending: false, nullsFirst: false })
        .limit(limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    return Response.json(data || []);
  } catch (error) {
    console.error('Contact search error:', error);
    return Response.json(
      { error: error.message || 'Search failed' },
      { status: 500 }
    );
  }
}