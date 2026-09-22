'use client';

import React, { useState, useEffect } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import { Check, AlertTriangle } from 'lucide-react';
import { PLAN_LIMITS, PLAN_PRICING } from '@/lib/plans';
import Skeleton from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Surface } from '@/components/dashboard/Surface';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { ProgressBar } from '@/components/dashboard/ProgressBar';

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
      'HubSpot native + Pipedrive, Zoho, Close webhook intake',
      'Scout AI deal intelligence',
      'AI weekly digest + anomaly alerts',
      'AI copywriter',
      'Bulk CSV import',
    ],
    accent: 'border-[var(--accent)]',
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
      'All currently available CRM and webhook capabilities',
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
  const [profileState, setProfileState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [yearly, setYearly] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [clientId, setClientId] = useState('');
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [portalError, setPortalError] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    const init = async () => {
      try { const res = await fetch('/api/client'); if (!res.ok) throw new Error(); const data = await res.json(); if (!data.client) throw new Error(); setClient(data.client); setClientId(data.client.id || ''); setProfileState('ready'); if (data.client.plan && data.client.plan !== 'starter') { setPortalLoading(true); try { const portal = await fetch('/api/billing/portal'); if (!portal.ok) throw new Error(); const payload = await portal.json(); if (payload.url) setPortalUrl(payload.url); else setPortalError(true); } catch { setPortalError(true); } finally { setPortalLoading(false); } } }
      catch { setProfileState('error'); }
      try { const { data: { user } } = await supabaseBrowser.auth.getUser(); if (user?.email) setUserEmail(user.email); } catch { /* checkout email is optional */ }
    };
    void init();
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

  const hierarchy: Record<string, number> = { starter: 0, growth: 1, pro: 2 };

  if (profileState === 'loading') {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <PageHeader eyebrow="Signal Field · Commercial controls" title="Billing & plan" description="Manage your Churnaut subscription. Changes take effect immediately after payment." />
        <div role="status" aria-busy="true" aria-label="Loading billing account"><Skeleton variant="card" height={80} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Skeleton variant="card" height={420} />
          <Skeleton variant="card" height={420} />
          <Skeleton variant="card" height={420} />
        </div></div>
      </div>
    );
  }

  if (profileState === 'error') return <div className="space-y-6 max-w-4xl mx-auto"><PageHeader eyebrow="Signal Field · Commercial controls" title="Billing & plan" description="Manage your Churnaut subscription. Changes take effect immediately after payment." /><div role="alert" className="dashboard-surface p-6 text-sm text-[var(--red)]">Billing account unavailable. <button type="button" onClick={() => window.location.reload()} className="font-semibold underline">TRY AGAIN</button></div></div>;

  return (
    <div className="space-y-8 max-w-5xl mx-auto font-sans">

      <PageHeader eyebrow="Signal Field · Commercial controls" title="Billing & plan" description="Manage your Churnaut subscription. Changes take effect immediately after payment." />

      {/* Past due / cancelled warning */}
      {(planStatus === 'past_due' || planStatus === 'cancelled' || planStatus === 'expired') && (
        <div role="alert" className="flex items-start gap-3 rounded-[10px] border border-[var(--red)]/30 bg-[var(--red)]/10 px-5 py-4">
          <AlertTriangle aria-hidden="true" className="mt-0.5 w-4 h-4 flex-shrink-0 text-[var(--red)]" />
          <div>
            <p className="text-sm font-bold text-[var(--red)]">
              {planStatus === 'cancelled' ? 'Subscription cancelled' : 'Payment issue — action required'}
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {planStatus === 'cancelled'
                ? 'Your subscription has been cancelled. You can resubscribe below.'
                : 'Your last payment failed. Please update your billing details to avoid losing access.'}
              {' '}
              <a href="mailto:support@churnaut.com" className="text-[var(--red)] underline transition-colors hover:opacity-80">
                Contact support &rarr;
              </a>
            </p>
          </div>
        </div>
      )}

      {/* Current usage strip */}
      {visitLimit !== Infinity && (
        <Surface className="space-y-3 px-6 py-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
              Monthly Tracked Visits — {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} Plan
            </span>
            <span className={`text-[11px] font-mono font-bold ${visitPct >= 90 ? 'text-[var(--red)]' : visitPct >= 70 ? 'text-[var(--amber)]' : 'text-[var(--text-muted)]'}`}>
              {monthlyVisits.toLocaleString()} / {visitLimit.toLocaleString()}
            </span>
          </div>
          <ProgressBar value={visitPct} tone={visitPct >= 90 ? 'danger' : visitPct >= 70 ? 'warning' : 'accent'} label="Usage" />
          <p className="text-[10px] font-mono text-[var(--text-muted)]">
            Resets on the 1st of each month.
          </p>
        </Surface>
      )}

      {/* Monthly / Yearly toggle */}
      <div className="flex items-center justify-center gap-4">
        <span className={`text-sm font-sans ${!yearly ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-muted)]'}`}>
          Monthly
        </span>
        <button
          onClick={() => setYearly(v => !v)}
          role="switch"
          aria-label="Switch between monthly and yearly billing"
          aria-checked={yearly}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${yearly ? 'bg-[var(--accent)]' : 'bg-[var(--border-subtle)]'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${yearly ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
        <span className={`text-sm font-sans ${yearly ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-muted)]'}`}>
          Yearly <span className="ml-1 text-[10px] font-mono text-[var(--accent)]">2 MONTHS FREE</span>
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
              className={`relative flex flex-col rounded-[14px] border-2 ${plan.accent} ${isCurrent ? 'bg-[var(--bg-elevated)]' : 'bg-[var(--bg-surface)]'} space-y-5 p-6 transition-all`}
            >
              {/* Badge */}
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-white">
                    {plan.badge}
                  </span>
                </div>
              )}

              {/* Current plan tag */}
              {isCurrent && (
                <div className="absolute top-4 right-4">
                  <StatusBadge tone="info">Current</StatusBadge>
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
                    <Check aria-hidden="true" className="mt-0.5 w-3.5 h-3.5 flex-shrink-0 text-[var(--accent)]" />
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
                    {currentPlan !== 'starter' && (portalLoading ? <div role="status" aria-busy="true" className="w-full rounded-[8px] border border-[var(--border-subtle)] py-2.5 text-center text-[12px] text-[var(--text-muted)]">Loading billing portal…</div> : portalUrl ? <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="block w-full rounded-[8px] border border-[var(--accent)]/30 py-2.5 text-center text-[12px] font-sans text-[var(--accent)] transition-all hover:bg-[var(--accent)] hover:text-white">Manage subscription →</a> : portalError ? <div role="alert" className="rounded-[8px] border border-[var(--red)]/30 bg-[var(--red)]/5 p-3 text-center text-[12px] text-[var(--red)]">Billing portal unavailable. <button type="button" onClick={() => window.location.reload()} className="font-semibold underline">TRY AGAIN</button></div> : null)}
                  </div>
                ) : isUpgrade ? (
                  <a
                    href={buildCheckoutUrl(variantId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full rounded-[8px] bg-[var(--accent)] py-2.5 text-center text-[13px] font-semibold font-sans text-white transition-all hover:bg-[var(--accent-hover)] motion-safe:active:scale-[0.98]"
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
          <a href="mailto:support@churnaut.com" className="text-[var(--accent)] hover:underline">
          Contact support
        </a>{' '}
        for billing queries.
      </p>
    </div>
  );
}
