import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json([], { status: 200 });

  // simple fuzzy pattern, newest activity first
  const safe = q.replaceAll('%','').replaceAll('_','');
  const pattern = `%${safe}%`;

  const { data, error } = await supabaseAdmin
    .from('contacts')
    .select('id,name,email,company,last_activity_at')
    .or(`name.ilike.${pattern},email.ilike.${pattern}`)
    .order('last_activity_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? [], { status: 200 });
}