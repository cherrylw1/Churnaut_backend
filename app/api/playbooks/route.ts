import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data: playbooks, error } = await supabaseAdmin
      .from('playbook_templates')
      .select('*')
      .order('tier', { ascending: true });

    if (error) {
      console.error('[GET Playbooks Error] Database query failed:', error);
      // Return an empty array or handle error gracefully if table doesn't exist yet
      if (error.code === 'PGRST205') {
        console.warn('[GET Playbooks Warning] Table playbook_templates does not exist yet.');
        return NextResponse.json({ playbooks: [], warning: 'Table not seeded yet' });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ playbooks: playbooks || [] });
  } catch (err) {
    console.error('[GET Playbooks Exception] Unhandled exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
