import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const limit = parseInt(searchParams.get('limit')) || 20;

  try {
    let query;

    if (!q) {
      // Get recent contacts based on conversation activity
      const { data: recentConversations } = await supabase
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
        query = supabase
          .from('contacts')
          .select('*')
          .order('last_activity_at', { ascending: false, nullsFirst: false })
          .limit(limit);
      } else {
        // Get contacts in the order of recent activity
        const { data: contacts } = await supabase
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
      query = supabase
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