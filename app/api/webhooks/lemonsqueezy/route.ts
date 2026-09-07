import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyWebhookSignature, getVariantId, getCustomerId, getSubscriptionId, getTrialEndsAt, getStatus, getCustomClientId } from '@/lib/lemonsqueezy'
import { VARIANT_TO_PLAN } from '@/lib/plans'

export const dynamic = 'force-dynamic';

const CLAIM_TIMEOUT_MS = 5 * 60 * 1000

async function claimWebhookEvent(eventId: string): Promise<'claimed' | 'completed' | 'busy'> {
  const claimedAt = new Date().toISOString()
  const { error: insertError } = await supabaseAdmin
    .from('processed_webhooks')
    .insert({
      event_id: eventId,
      status: 'processing',
      claimed_at: claimedAt,
      completed_at: null,
      attempts: 1,
      last_error: null,
    })

  if (!insertError) return 'claimed'
  if (insertError.code !== '23505') throw insertError

  const { data: existing, error: readError } = await supabaseAdmin
    .from('processed_webhooks')
    .select('status, claimed_at, attempts')
    .eq('event_id', eventId)
    .single()
  if (readError) throw readError
  if (existing.status === 'completed') return 'completed'

  const staleBefore = new Date(Date.now() - CLAIM_TIMEOUT_MS).toISOString()
  const canRetry = existing.status === 'failed' ||
    (existing.status === 'processing' && (!existing.claimed_at || existing.claimed_at < staleBefore))
  if (!canRetry) return 'busy'

  let retryQuery = supabaseAdmin
    .from('processed_webhooks')
    .update({
      status: 'processing',
      claimed_at: claimedAt,
      completed_at: null,
      attempts: (existing.attempts || 1) + 1,
      last_error: null,
    })
    .eq('event_id', eventId)
    .eq('status', existing.status)

  retryQuery = existing.claimed_at
    ? retryQuery.eq('claimed_at', existing.claimed_at)
    : retryQuery.is('claimed_at', null)

  const { data: reclaimed, error: reclaimError } = await retryQuery.select('event_id').maybeSingle()
  if (reclaimError) throw reclaimError
  return reclaimed ? 'claimed' : 'busy'
}

async function requireUpdatedClient(
  subscriptionId: string | null,
  updates: Record<string, unknown>
) {
  if (!subscriptionId) throw new Error('Webhook is missing a subscription ID')
  const { data, error } = await supabaseAdmin
    .from('clients')
    .update(updates)
    .eq('lemonsqueezy_subscription_id', subscriptionId)
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`No client found for Lemon Squeezy subscription ${subscriptionId}`)
}

export async function POST(req: NextRequest) {
  let claimedEventId: string | null = null
  let ownsClaim = false
  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-signature') ?? ''
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? ''

    if (!verifyWebhookSignature(rawBody, signature, secret)) {
      console.error('Invalid webhook signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const body = JSON.parse(rawBody)
    const eventName = body?.meta?.event_name
    const data = body?.data

    if (!eventName || !data) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const subscriptionId = getSubscriptionId(data)
    const customerId = getCustomerId(data)
    const variantId = getVariantId(data)
    const trialEndsAt = getTrialEndsAt(data)
    const status = getStatus(data)

    const eventId = signature || `${eventName}_${data.id}`
    claimedEventId = eventId

    // Claims are recoverable after failures and stale after five minutes, so a
    // server crash cannot cause a webhook to be discarded forever.
    const claimState = await claimWebhookEvent(eventId)
    if (claimState === 'completed') {
      console.log(`Webhook already processed: ${eventId}`)
      return NextResponse.json({ received: true, alreadyProcessed: true }, { status: 200 })
    }
    if (claimState === 'busy') {
      return NextResponse.json({ error: 'Webhook processing is already in progress' }, { status: 503 })
    }
    ownsClaim = true

    // Process event
    console.log(`Webhook received: ${eventName}`, { subscriptionId, customerId, variantId, status })

    switch (eventName) {
      case 'subscription_created': {
        const email = data?.attributes?.user_email
        const customClientId = getCustomClientId(body)

        let clientUser: { id: string } | null = null

        // Prefer client_id from checkout custom data — reliable even if email differs
        if (customClientId) {
          const { data: found, error } = await supabaseAdmin
            .from('clients')
            .select('id')
            .eq('id', customClientId)
            .maybeSingle()
          if (!error && found) clientUser = found
        }

        // Fallback: match by email
        if (!clientUser && email) {
          const { data: found, error } = await supabaseAdmin
            .from('clients')
            .select('id')
            .eq('email', email.toLowerCase())
            .maybeSingle()
          if (!error && found) clientUser = found
        }

        if (!clientUser) {
          console.error('No client profile found for subscription_created. email:', email, 'client_id:', customClientId)
          throw new Error('Client not found for subscription_created')
        }

        const updateData: any = {
          plan_status: 'trialing',
          lemonsqueezy_customer_id: customerId,
          lemonsqueezy_subscription_id: subscriptionId,
          lemonsqueezy_variant_id: variantId,
          trial_ends_at: trialEndsAt,
        }

        if (variantId) {
          const mappedPlan = VARIANT_TO_PLAN[variantId]
          if (mappedPlan) {
            updateData.plan = mappedPlan
          } else {
            console.error(`Unknown variant ID in subscription_created: ${variantId}`)
          }
        }

        const { data: updatedClient, error: updateError } = await supabaseAdmin
          .from('clients')
          .update(updateData)
          .eq('id', clientUser.id)
          .select('id')
          .maybeSingle()

        if (updateError) throw updateError
        if (!updatedClient) throw new Error(`Client ${clientUser.id} disappeared during subscription creation`)

        break
      }

      case 'subscription_updated': {
        const updateData: any = {
          plan_status: status ?? 'active',
          lemonsqueezy_variant_id: variantId,
          trial_ends_at: trialEndsAt,
        }

        if (variantId) {
          const mappedPlan = VARIANT_TO_PLAN[variantId]
          if (mappedPlan) {
            updateData.plan = mappedPlan
          } else {
            console.error(`Unknown variant ID in subscription_updated: ${variantId}`)
          }
        }

        await requireUpdatedClient(subscriptionId, updateData)
        break
      }

      case 'subscription_cancelled': {
        await requireUpdatedClient(subscriptionId, { plan_status: 'cancelled' })
        break
      }

      case 'subscription_resumed': {
        await requireUpdatedClient(subscriptionId, { plan_status: 'active' })
        break
      }

      case 'subscription_expired': {
        await requireUpdatedClient(subscriptionId, { plan: 'starter', plan_status: 'expired' })
        break
      }

      case 'subscription_payment_failed': {
        await requireUpdatedClient(subscriptionId, { plan_status: 'past_due' })
        break
      }

      default:
        console.log(`Unhandled event: ${eventName}`)
    }

    const { data: completedClaim, error: completionError } = await supabaseAdmin
      .from('processed_webhooks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('event_id', eventId)
      .eq('status', 'processing')
      .select('event_id')
      .maybeSingle()
    if (completionError) throw completionError
    if (!completedClaim) throw new Error('Webhook claim was lost before completion')

    return NextResponse.json({ received: true }, { status: 200 })

  } catch (err) {
    console.error('Webhook error:', err)
    // Keep a recoverable failure record. The next delivery may reclaim it
    // immediately; stale in-progress claims can be reclaimed after a crash.
    try {
      if (claimedEventId && ownsClaim) {
        await supabaseAdmin
          .from('processed_webhooks')
          .update({
            status: 'failed',
            last_error: err instanceof Error ? err.message.slice(0, 2000) : 'Unknown webhook processing error',
          })
          .eq('event_id', claimedEventId)
          .eq('status', 'processing')
      }
    } catch {}
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
