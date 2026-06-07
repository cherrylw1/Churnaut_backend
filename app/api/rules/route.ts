import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getClientPlan } from '@/lib/gate';
import { getAuthedClientId } from '@/lib/auth';

// GET: Retrieve all rules for the authenticated client in priority order
export async function GET(req: NextRequest) {
  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: rules, error } = await supabaseAdmin
      .from('routing_rules')
      .select('*')
      .eq('client_id', clientId)
      .order('priority', { ascending: true });

    if (error) {
      console.error('[GET Rules Error] Database error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rules: rules || [] });
  } catch (err) {
    console.error('[GET Rules Exception] Unhandled exception:', err);
    const errMsg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

// POST: Create a new routing rule
export async function POST(req: NextRequest) {
  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const plan = await getClientPlan(req)
    const { data: existingRules } = await supabaseAdmin
      .from('routing_rules')
      .select('id')
      .eq('client_id', clientId)

    const ruleLimit = plan === 'starter' ? 5 : Infinity
    if (existingRules && existingRules.length >= ruleLimit) {
      return NextResponse.json(
        { error: 'upgrade_required', required_plan: 'growth', message: 'Starter plan is limited to 5 routing rules' },
        { status: 403 }
      )
    }

    // action_payload can contain a swaps array: { swaps: Array<{selector: string, content: string}> }
    const body = await req.json();
    const {
      signal_type,
      conditions,
      action_type,
      action_payload,
      target_selector,
      variant_content,
    } = body;

    if (!action_type) {
      return NextResponse.json({ error: 'action_type is required' }, { status: 400 });
    }

    // Determine the next priority number
    const { count, error: countError } = await supabaseAdmin
      .from('routing_rules')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId);

    if (countError) {
      console.error('[POST Rules Error] Priority count fetch failed:', countError);
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    const nextPriority = (count || 0) + 1;

    // Insert new rule
    const { data: newRule, error: insertError } = await supabaseAdmin
      .from('routing_rules')
      .insert({
        client_id: clientId,
        priority: nextPriority,
        active: true,
        signal_type: signal_type || null,
        conditions: conditions || {},
        action_type,
        action_payload: action_payload || {},
        target_selector: target_selector || null,
        variant_content: variant_content || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[POST Rules Error] Insertion failed:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, rule: newRule });
  } catch (err) {
    console.error('[POST Rules Exception] Unhandled exception:', err);
    const errMsg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

// PATCH: Update rule(s) - either bulk priority reorder or individual field updates
export async function PATCH(req: NextRequest) {
  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    // Case 1: Bulk Priority Reorder
    if (body.rules && Array.isArray(body.rules)) {
      for (const ruleItem of body.rules) {
        const { error: updateError } = await supabaseAdmin
          .from('routing_rules')
          .update({ priority: ruleItem.priority })
          .eq('id', ruleItem.id)
          .eq('client_id', clientId);

        if (updateError) {
          console.error(`[PATCH Rules Error] Failed to update priority for ${ruleItem.id}:`, updateError);
          return NextResponse.json({ error: updateError.message }, { status: 500 });
        }
      }
      return NextResponse.json({ success: true });
    }

    // Case 2: Individual Rule Edit
    const {
      id,
      active,
      signal_type,
      conditions,
      action_type,
      action_payload,
      target_selector,
      variant_content,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'Rule id is required for updates' }, { status: 400 });
    }

    // Construct dynamic updates object
    const updates: Record<string, unknown> = {};
    if (active !== undefined) updates.active = active;
    if (signal_type !== undefined) updates.signal_type = signal_type || null;
    if (conditions !== undefined) updates.conditions = conditions || {};
    if (action_type !== undefined) updates.action_type = action_type;
    if (action_payload !== undefined) updates.action_payload = action_payload || {};
    if (target_selector !== undefined) updates.target_selector = target_selector || null;
    if (variant_content !== undefined) updates.variant_content = variant_content || null;
    updates.updated_at = new Date().toISOString();

    const { data: updatedRule, error: updateError } = await supabaseAdmin
      .from('routing_rules')
      .update(updates)
      .eq('id', id)
      .eq('client_id', clientId)
      .select()
      .single();

    if (updateError) {
      console.error('[PATCH Rules Error] Update failed:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, rule: updatedRule });
  } catch (err) {
    console.error('[PATCH Rules Exception] Unhandled exception:', err);
    const errMsg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

// DELETE: Remove routing rule by ID
export async function DELETE(req: NextRequest) {
  try {
    const clientId = await getAuthedClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id parameter is required' }, { status: 400 });
    }

    // Delete rule
    const { error: deleteError } = await supabaseAdmin
      .from('routing_rules')
      .delete()
      .eq('id', id)
      .eq('client_id', clientId);

    if (deleteError) {
      console.error('[DELETE Rule Error] Deletion failed:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // Recalculate remaining priorities so they remain sequential starting from 1
    const { data: remaining, error: selectError } = await supabaseAdmin
      .from('routing_rules')
      .select('id')
      .eq('client_id', clientId)
      .order('priority', { ascending: true });

    if (selectError) {
      console.error('[DELETE Rule Error] Post-deletion sorting fetch failed:', selectError);
      return NextResponse.json({ error: selectError.message }, { status: 500 });
    }

    if (remaining && remaining.length > 0) {
      for (let i = 0; i < remaining.length; i++) {
        const { error: reorderError } = await supabaseAdmin
          .from('routing_rules')
          .update({ priority: i + 1 })
          .eq('id', remaining[i].id)
          .eq('client_id', clientId);

        if (reorderError) {
          console.error(`[DELETE Rule Error] Post-deletion priority reorder failed for ${remaining[i].id}:`, reorderError);
          return NextResponse.json({ error: reorderError.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE Rule Exception] Unhandled exception:', err);
    const errMsg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
