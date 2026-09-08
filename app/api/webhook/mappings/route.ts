import { logError } from '@/lib/observability/logger';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthedClientId } from '@/lib/auth';
import { readJson, webhookMappingRequestSchema } from '@/lib/validation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// GET: Retrieve all webhook field mappings for client
export async function GET(req: NextRequest) {
  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: mappings, error } = await supabaseAdmin
      .from('webhook_mappings')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true });

    if (error) {
      logError('[GET Webhook Mappings Error] Database error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ mappings: mappings || [] });
  } catch (err) {
    logError('[GET Webhook Mappings Exception] Unhandled exception:', err);
    const errMsg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

// POST: Create or upsert a webhook field mapping
export async function POST(req: NextRequest) {
  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsedBody = await readJson(req, webhookMappingRequestSchema);
    if (!parsedBody.ok) return NextResponse.json({ error: parsedBody.error }, { status: 400 });
    const { external_field, internal_field } = parsedBody.data;

    // Insert new mapping
    const { data: mapping, error: insertError } = await supabaseAdmin
      .from('webhook_mappings')
      .upsert({
        client_id: clientId,
        external_field: external_field.trim(),
        internal_field: internal_field.trim(),
      }, { onConflict: 'client_id,external_field,internal_field' })
      .select()
      .single();

    if (insertError) {
      logError('[POST Webhook Mappings Error] Insertion failed:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, mapping });
  } catch (err) {
    logError('[POST Webhook Mappings Exception] Unhandled exception:', err);
    const errMsg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

// DELETE: Remove field mapping
export async function DELETE(req: NextRequest) {
  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id || !z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: 'A valid id parameter is required' }, { status: 400 });
    }

    // Delete mapping row
    const { error: deleteError } = await supabaseAdmin
      .from('webhook_mappings')
      .delete()
      .eq('id', id)
      .eq('client_id', clientId);

    if (deleteError) {
      logError('[DELETE Webhook Mapping Error] Deletion failed:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError('[DELETE Webhook Mapping Exception] Unhandled exception:', err);
    const errMsg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
