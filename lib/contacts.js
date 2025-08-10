// lib/contacts.js
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Upsert by GHL id and return our internal UUID (contacts.id)
export async function getOrCreateContactByGHL(ghlId, profile = {}) {
  if (!ghlId) throw new Error('Missing ghlId');

  const { data, error } = await supabaseAdmin
    .from('contacts')
    .upsert(
      {
        external_id: ghlId, // GHL Contact ID
        name: profile.name ?? null,
        email: profile.email ?? null,
        phone: profile.phone ?? null,
        company: profile.company ?? null,
        last_activity_at: profile.last_activity_at ?? null,
      },
      { onConflict: 'external_id' }
    )
    .select('id')
    .single();

  if (error) throw error;
  return data.id; // our UUID
}