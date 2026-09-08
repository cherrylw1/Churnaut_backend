import { logError, logWarn } from '@/lib/observability/logger';
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
      logError('[GET Playbooks Error] Database query failed:', error);
      // Return an empty array or handle error gracefully if table doesn't exist yet
      if (error.code === 'PGRST205') {
        logWarn('[GET Playbooks Warning] Table playbook_templates does not exist yet.');
        return NextResponse.json({ playbooks: [], warning: 'Table not seeded yet' });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ playbooks: playbooks || [] });
  } catch (err) {
    logError('[GET Playbooks Exception] Unhandled exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
