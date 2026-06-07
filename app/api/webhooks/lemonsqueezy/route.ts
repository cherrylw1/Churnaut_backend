import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyWebhookSignature, getVariantId, getCustomerId, getSubscriptionId, getTrialEndsAt, getStatus } from '@/lib/lemonsqueezy'
import { VARIANT_TO_PLAN } from '@/lib/plans'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
    const plan = variantId ? VARIANT_TO_PLAN[variantId] ?? 'starter' : 'starter'

    console.log(`Webhook received: ${eventName}`, { subscriptionId, customerId, variantId, plan, status })

    switch (eventName) {
      case 'subscription_created': {
        await supabase
          .from('clients')
          .update({
            plan,
            plan_status: 'trialing',
            lemonsqueezy_customer_id: customerId,
            lemonsqueezy_subscription_id: subscriptionId,
            lemonsqueezy_variant_id: variantId,
            trial_ends_at: trialEndsAt,
          })
          .eq('lemonsqueezy_customer_id', customerId)

        if (!customerId) break

        const email = data?.attributes?.user_email
        if (email) {
          await supabase
            .from('clients')
            .update({
              plan,
              plan_status: 'trialing',
              lemonsqueezy_customer_id: customerId,
              lemonsqueezy_subscription_id: subscriptionId,
              lemonsqueezy_variant_id: variantId,
              trial_ends_at: trialEndsAt,
            })
            .eq('email', email)
        }
        break
      }

      case 'subscription_updated': {
        await supabase
          .from('clients')
          .update({
            plan,
            plan_status: status ?? 'active',
            lemonsqueezy_variant_id: variantId,
            trial_ends_at: trialEndsAt,
          })
          .eq('lemonsqueezy_subscription_id', subscriptionId)
        break
      }

      case 'subscription_cancelled': {
        await supabase
          .from('clients')
          .update({ plan_status: 'cancelled' })
          .eq('lemonsqueezy_subscription_id', subscriptionId)
        break
      }

      case 'subscription_resumed': {
        await supabase
          .from('clients')
          .update({ plan_status: 'active' })
          .eq('lemonsqueezy_subscription_id', subscriptionId)
        break
      }

      case 'subscription_expired': {
        await supabase
          .from('clients')
          .update({ plan: 'starter', plan_status: 'expired' })
          .eq('lemonsqueezy_subscription_id', subscriptionId)
        break
      }

      case 'subscription_payment_failed': {
        await supabase
          .from('clients')
          .update({ plan_status: 'past_due' })
          .eq('lemonsqueezy_subscription_id', subscriptionId)
        break
      }

      default:
        console.log(`Unhandled event: ${eventName}`)
    }

    return NextResponse.json({ received: true }, { status: 200 })

  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
