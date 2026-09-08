import { logError } from '@/lib/observability/logger';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getClientPlan, planGate } from '@/lib/gate';
import { getAuthedClientId } from '@/lib/auth';
import { readJson, createRuleRequestSchema, reorderRulesRequestSchema, updateRuleRequestSchema } from '@/lib/validation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';


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
      logError('[GET Rules Error] Database error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rules: rules || [] });
  } catch (err) {
    logError('[GET Rules Exception] Unhandled exception:', err);
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
    const accountGate = planGate(plan, 'starter')
    if (accountGate) return accountGate
    const { data: existingRules, error: existingRulesError } = await supabaseAdmin
      .from('routing_rules')
      .select('id')
      .eq('client_id', clientId)

    if (existingRulesError) {
      logError('[POST Rules Error] Rule limit lookup failed:', existingRulesError)
      return NextResponse.json({ error: 'Unable to verify the routing rule limit' }, { status: 503 })
    }

    const ruleLimit = plan === 'starter' ? 5 : Infinity
    if (existingRules && existingRules.length >= ruleLimit) {
      return NextResponse.json(
        { error: 'upgrade_required', required_plan: 'growth', message: 'Starter plan is limited to 5 routing rules' },
        { status: 403 }
      )
    }

    // action_payload can contain a swaps array: { swaps: Array<{selector: string, content: string}> }
    const parsedBody = await readJson(req, createRuleRequestSchema);
    if (!parsedBody.ok) return NextResponse.json({ error: parsedBody.error }, { status: 400 });
    const { signal_type, conditions, action_type, action_payload, target_selector, variant_content } = parsedBody.data;

    // Determine the next priority number
    const { count, error: countError } = await supabaseAdmin
      .from('routing_rules')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId);

    if (countError) {
      logError('[POST Rules Error] Priority count fetch failed:', countError);
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
      logError('[POST Rules Error] Insertion failed:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, rule: newRule });
  } catch (err) {
    logError('[POST Rules Exception] Unhandled exception:', err);
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

    const parsedBody = await readJson(req, reorderRulesRequestSchema.or(updateRuleRequestSchema));
    if (!parsedBody.ok) return NextResponse.json({ error: parsedBody.error }, { status: 400 });
    const body = parsedBody.data;

    // Case 1: Bulk Priority Reorder
    if ('rules' in body && Array.isArray(body.rules)) {
      const { data: updatedCount, error: reorderError } = await supabaseAdmin.rpc(
        'reorder_routing_rules',
        { client_id_input: clientId, rules_input: body.rules }
      );
      if (reorderError || updatedCount !== body.rules.length) {
        logError('[PATCH Rules Error] Atomic reorder failed:', reorderError);
        return NextResponse.json({ error: 'Unable to reorder routing rules' }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    // Case 2: Individual Rule Edit
    if (!('id' in body)) {
      return NextResponse.json({ error: 'Rule id is required for updates' }, { status: 400 });
    }
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

    const changesConfiguration = action_type !== undefined || action_payload !== undefined || target_selector !== undefined || variant_content !== undefined || conditions !== undefined || signal_type !== undefined;
    if (changesConfiguration || active === true) {
      const { data: existingRule, error: existingError } = await supabaseAdmin
        .from('routing_rules')
        .select('signal_type, conditions, action_type, action_payload, target_selector, variant_content')
        .eq('id', id)
        .eq('client_id', clientId)
        .maybeSingle();
      if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
      if (!existingRule) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
      const validated = createRuleRequestSchema.safeParse({
        signal_type: signal_type !== undefined ? signal_type : existingRule.signal_type,
        conditions: conditions !== undefined ? conditions : existingRule.conditions,
        action_type: action_type !== undefined ? action_type : existingRule.action_type,
        action_payload: action_payload !== undefined ? action_payload : existingRule.action_payload,
        target_selector: target_selector !== undefined ? target_selector : existingRule.target_selector,
        variant_content: variant_content !== undefined ? variant_content : existingRule.variant_content,
      });
      if (!validated.success) {
        return NextResponse.json({ error: validated.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') }, { status: 400 });
      }
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
      logError('[PATCH Rules Error] Update failed:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, rule: updatedRule });
  } catch (err) {
    logError('[PATCH Rules Exception] Unhandled exception:', err);
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

    if (!id || !z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: 'A valid rule id is required' }, { status: 400 });
    }

    const { data: deleted, error: deleteError } = await supabaseAdmin.rpc(
      'delete_routing_rule_and_resequence',
      { client_id_input: clientId, rule_id_input: id }
    );
    if (deleteError) {
      logError('[DELETE Rule Error] Atomic delete failed:', deleteError);
      return NextResponse.json({ error: 'Unable to delete routing rule' }, { status: 500 });
    }
    if (!deleted) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError('[DELETE Rule Exception] Unhandled exception:', err);
    const errMsg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
