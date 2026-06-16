/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyWebhookSignature, getVariantId, getCustomerId, getSubscriptionId, getTrialEndsAt, getStatus, getCustomClientId } from '@/lib/lemonsqueezy'
import { VARIANT_TO_PLAN } from '@/lib/plans'

export const dynamic = 'force-dynamic';


export async function POST(req: NextRequest) {
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

    const eventId = signature || `${eventName}_${data.id}_${Date.now()}`

    // Idempotency check
    const { data: alreadyProcessed } = await supabaseAdmin
      .from('processed_webhooks')
      .select('event_id')
      .eq('event_id', eventId)
      .maybeSingle()

    if (alreadyProcessed) {
      console.log(`Webhook already processed: ${eventId}`)
      return NextResponse.json({ received: true, alreadyProcessed: true }, { status: 200 })
    }

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
          return NextResponse.json({ error: 'Client not found — will retry' }, { status: 500 })
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

        const { error: updateError } = await supabaseAdmin
          .from('clients')
          .update(updateData)
          .eq('id', clientUser.id)

        if (updateError) {
          console.error('Failed to update client subscription:', updateError)
        }

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

        const { error: updateError } = await supabaseAdmin
          .from('clients')
          .update(updateData)
          .eq('lemonsqueezy_subscription_id', subscriptionId)

        if (updateError) {
          console.error('Failed to update client subscription:', updateError)
        }
        break
      }

      case 'subscription_cancelled': {
        await supabaseAdmin
          .from('clients')
          .update({ plan_status: 'cancelled' })
          .eq('lemonsqueezy_subscription_id', subscriptionId)
        break
      }

      case 'subscription_resumed': {
        await supabaseAdmin
          .from('clients')
          .update({ plan_status: 'active' })
          .eq('lemonsqueezy_subscription_id', subscriptionId)
        break
      }

      case 'subscription_expired': {
        await supabaseAdmin
          .from('clients')
          .update({ plan: 'starter', plan_status: 'expired' })
          .eq('lemonsqueezy_subscription_id', subscriptionId)
        break
      }

      case 'subscription_payment_failed': {
        await supabaseAdmin
          .from('clients')
          .update({ plan_status: 'past_due' })
          .eq('lemonsqueezy_subscription_id', subscriptionId)
        break
      }

      default:
        console.log(`Unhandled event: ${eventName}`)
    }

    // Insert into processed_webhooks to ensure idempotency
    const { error: insertError } = await supabaseAdmin
      .from('processed_webhooks')
      .insert({ event_id: eventId })

    if (insertError) {
      if (insertError.code !== '23505') { // Do not print normal duplicate violations
        console.error('Failed to record processed webhook event_id:', insertError)
      }
    }

    return NextResponse.json({ received: true }, { status: 200 })

  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
