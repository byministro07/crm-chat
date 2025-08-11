// lib/contacts.js
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Upsert by GHL id and return internal UUID
export async function getOrCreateContactByGHL(ghlId, profile = {}) {
  if (!ghlId) throw new Error('Missing ghlId');
  
  // Check if contact exists first
  const { data: existingContact } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('external_id', ghlId)
    .single();
  
  if (existingContact) {
    // Contact exists - only update if we have actual data to update
    const hasRealData = profile && Object.keys(profile).length > 0 && 
                        (profile.name || profile.email || profile.phone || profile.company);
    
    if (hasRealData) {
      // Build update object with only provided fields (skip undefined/null values)
      const updateData = {};
      if (profile.name !== undefined && profile.name !== null) updateData.name = profile.name;
      if (profile.email !== undefined && profile.email !== null) updateData.email = profile.email;
      if (profile.phone !== undefined && profile.phone !== null) updateData.phone = profile.phone;
      if (profile.company !== undefined && profile.company !== null) updateData.company = profile.company;
      if (profile.last_activity_at !== undefined && profile.last_activity_at !== null) {
        updateData.last_activity_at = profile.last_activity_at;
      }
      
      // Only update if we have fields to update
      if (Object.keys(updateData).length > 0) {
        const { error } = await supabaseAdmin
          .from('contacts')
          .update(updateData)
          .eq('external_id', ghlId);
        
        if (error) throw error;
      }
    }
    
    return existingContact.id;
  } else {
    // Contact doesn't exist - create new one
    const { data, error } = await supabaseAdmin
      .from('contacts')
      .insert({
        external_id: ghlId,
        name: profile.name ?? null,
        email: profile.email ?? null,
        phone: profile.phone ?? null,
        company: profile.company ?? null,
        last_activity_at: profile.last_activity_at ?? null,
      })
      .select('id')
      .single();
    
    if (error) throw error;
    return data.id;
  }
}