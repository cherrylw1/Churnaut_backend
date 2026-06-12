'use client';

import React, { useState, useEffect } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import { Check, AlertTriangle } from 'lucide-react';
import { PLAN_LIMITS, PLAN_PRICING } from '@/lib/plans';
import Skeleton from '@/components/ui/Skeleton';

interface ClientProfile {
  plan: string;
  plan_status: string;
  monthly_visits: number;
}

const PLANS = [
  {
    key: 'starter',
    name: 'Starter',
    ...PLAN_PRICING.starter,
    features: [
      '1 domain',
      '500 tracked visits/mo',
      '5 routing rules',
      'HubSpot CRM only',
      'Tracked links + analytics',
      'Webhook integrations',
    ],
    accent: 'border-[var(--border-subtle)]',
    badge: null,
  },
  {
    key: 'growth',
    name: 'Growth',
    ...PLAN_PRICING.growth,
    features: [
      '3 domains',
      '5,000 tracked visits/mo',
      'Unlimited routing rules',
      'HubSpot, Pipedrive, Zoho, Close',
      'Scout AI deal intelligence',
      'AI weekly digest + anomaly alerts',
      'AI copywriter',
      'Bulk CSV import',
    ],
    accent: 'border-[#6366f1]',
    badge: 'Most Popular',
  },
  {
    key: 'pro',
    name: 'Pro',
    ...PLAN_PRICING.pro,
    features: [
      '10 domains',
      'Unlimited tracked visits',
      'Unlimited routing rules',
      'All CRM integrations',
      'Everything in Growth',
      'Zapier integration',
      'Multi-rep management',
      'Dedicated onboarding',
    ],
    accent: 'border-[var(--border-subtle)]',
    badge: null,
  },
];

const VISIT_LIMITS = Object.fromEntries(
  Object.entries(PLAN_LIMITS).map(([k, v]) => [k, v.tracked_visits])
) as Record<string, number>;

export default function BillingPage() {
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [yearly, setYearly] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [clientId, setClientId] = useState('');

  useEffect(() => {
    const init = async () => {
      try {
        const [clientRes, { data: { user } }] = await Promise.all([
          fetch('/api/client').then(r => r.json()),
          supabaseBrowser.auth.getUser(),
        ]);
        if (clientRes.client) {
          setClient(clientRes.client);
          setClientId(clientRes.client.id || '');
        }
        if (user?.email) setUserEmail(user.email);
      } catch {}
      setLoading(false);
    };
    init();
  }, []);

  const buildCheckoutUrl = (variantId: string) => {
    const base = `https://app.lemonsqueezy.com/buy/${variantId}`;
    const params = new URLSearchParams();
    if (userEmail) params.set('checkout[email]', userEmail);
    if (clientId) params.set('checkout[custom][client_id]', clientId);
    return `${base}?${params.toString()}`;
  };

  const currentPlan = client?.plan || 'starter';
  const planStatus = client?.plan_status || 'active';
  const monthlyVisits = client?.monthly_visits || 0;
  const visitLimit = VISIT_LIMITS[currentPlan] ?? 500;
  const visitPct = visitLimit === Infinity ? 0 : Math.min((monthlyVisits / visitLimit) * 100, 100);
  const barColor = visitPct >= 90 ? '#ef4444' : visitPct >= 70 ? '#f59e0b' : '#6366f1';

  const hierarchy: Record<string, number> = { starter: 0, growth: 1, pro: 2 };

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Skeleton variant="card" height={80} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Skeleton variant="card" height={420} />
          <Skeleton variant="card" height={420} />
          <Skeleton variant="card" height={420} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto font-sans">

      {/* Page header */}
      <div>
        <h1 className="text-[24px] font-bold text-[var(--text-primary)]">Billing & Plan</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Manage your Churnaut subscription. Changes take effect immediately after payment.
        </p>
      </div>

      {/* Past due / cancelled warning */}
      {(planStatus === 'past_due' || planStatus === 'cancelled' || planStatus === 'expired') && (
        <div className="flex items-start gap-3 border border-red-500/30 bg-red-500/10 rounded-[10px] px-5 py-4">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-400">
              {planStatus === 'cancelled' ? 'Subscription cancelled' : 'Payment issue — action required'}
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {planStatus === 'cancelled'
                ? 'Your subscription has been cancelled. You can resubscribe below.'
                : 'Your last payment failed. Please update your billing details to avoid losing access.'}
              {' '}
              <a href="mailto:support@churnaut.com" className="text-red-400 underline hover:text-white transition-colors">
                Contact support &rarr;
              </a>
            </p>
          </div>
        </div>
      )}

      {/* Current usage strip */}
      {visitLimit !== Infinity && (
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-[12px] px-6 py-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
              Monthly Tracked Visits — {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} Plan
            </span>
            <span className={`text-[11px] font-mono font-bold ${visitPct >= 90 ? 'text-red-400' : visitPct >= 70 ? 'text-amber-400' : 'text-[var(--text-muted)]'}`}>
              {monthlyVisits.toLocaleString()} / {visitLimit.toLocaleString()}
            </span>
          </div>
          <div className="h-1.5 bg-[var(--border-subtle)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${visitPct}%`, backgroundColor: barColor }}
            />
          </div>
          <p className="text-[10px] font-mono text-[var(--text-muted)]">
            Resets on the 1st of each month.
          </p>
        </div>
      )}

      {/* Monthly / Yearly toggle */}
      <div className="flex items-center justify-center gap-4">
        <span className={`text-sm font-sans ${!yearly ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-muted)]'}`}>
          Monthly
        </span>
        <button
          onClick={() => setYearly(v => !v)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${yearly ? 'bg-[#6366f1]' : 'bg-[var(--border-subtle)]'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${yearly ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
        <span className={`text-sm font-sans ${yearly ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-muted)]'}`}>
          Yearly <span className="text-[10px] font-mono text-[#6366f1] ml-1">2 MONTHS FREE</span>
        </span>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.key;
          const isUpgrade = hierarchy[plan.key] > hierarchy[currentPlan];
          const isDowngrade = hierarchy[plan.key] < hierarchy[currentPlan];
          const variantId = yearly ? plan.yearlyVariantId : plan.monthlyVariantId;
          const price = yearly ? Math.round(plan.yearlyPrice / 12) : plan.monthlyPrice;

          return (
            <div
              key={plan.key}
              className={`relative flex flex-col border-2 ${plan.accent} ${isCurrent ? 'bg-[var(--bg-elevated)]' : 'bg-[var(--bg-surface)]'} rounded-[14px] p-6 space-y-5 transition-all`}
            >
              {/* Badge */}
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-[#6366f1] text-white text-[10px] font-mono font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                    {plan.badge}
                  </span>
                </div>
              )}

              {/* Current plan tag */}
              {isCurrent && (
                <div className="absolute top-4 right-4">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-[#6366f1] border border-[#6366f1]/30 bg-[#6366f1]/10 px-2 py-0.5 rounded-full">
                    Current
                  </span>
                </div>
              )}

              {/* Plan name + price */}
              <div className="space-y-1 pt-2">
                <h2 className="text-[15px] font-bold text-[var(--text-primary)] uppercase tracking-wide font-mono">
                  {plan.name}
                </h2>
                <div className="flex items-baseline gap-1">
                  <span className="text-[30px] font-bold text-[var(--text-primary)] leading-none">
                    ${price}
                  </span>
                  <span className="text-[12px] text-[var(--text-muted)] font-sans">/mo</span>
                </div>
                {yearly && (
                  <p className="text-[10px] font-mono text-[var(--text-muted)]">
                    Billed ${plan.yearlyPrice.toLocaleString()}/yr
                  </p>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-2 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)] font-sans">
                    <Check className="w-3.5 h-3.5 text-[#6366f1] flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <div className="pt-2">
                {isCurrent ? (
                  <div className="space-y-2 w-full">
                    <div className="w-full text-center text-[12px] font-mono text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-[8px] py-2.5">
                      Current Plan
                    </div>
                    {currentPlan !== 'starter' && (
                      <a
                        href="https://churnaut.lemonsqueezy.com/billing"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full text-center border border-[#6366f1]/30 text-[#6366f1] hover:text-white hover:bg-[#6366f1] text-[12px] font-sans py-2.5 rounded-[8px] transition-all"
                      >
                        Manage subscription &rarr;
                      </a>
                    )}
                  </div>
                ) : isUpgrade ? (
                  <a
                    href={buildCheckoutUrl(variantId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center bg-[#6366f1] hover:bg-[#5053e1] text-white text-[13px] font-semibold font-sans py-2.5 rounded-[8px] transition-all active:scale-[0.98]"
                  >
                    Upgrade to {plan.name} &rarr;
                  </a>
                ) : isDowngrade ? (
                  <a
                    href="mailto:support@churnaut.com?subject=Downgrade request"
                    className="block w-full text-center border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[12px] font-sans py-2.5 rounded-[8px] transition-all"
                  >
                    Contact us to downgrade
                  </a>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="text-center text-[11px] font-mono text-[var(--text-muted)] pb-4">
        Payments processed securely by Lemon Squeezy. Subscriptions renew automatically.{' '}
        <a href="mailto:support@churnaut.com" className="text-[#6366f1] hover:underline">
          Contact support
        </a>{' '}
        for billing queries.
      </p>
    </div>
  );
}
