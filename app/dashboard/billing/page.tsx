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
      <div className="dashboard-billing space-y-6 max-w-4xl mx-auto">
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
    <div className="dashboard-billing space-y-8 max-w-5xl mx-auto font-sans">

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

      {/* Monthly / Yearly segmented pill control */}
      <div className="flex items-center justify-center my-2">
        <div className="dashboard-segmented-tabs p-1" role="group" aria-label="Billing frequency">
          <button
            type="button"
            onClick={() => setYearly(false)}
            className={`dashboard-segmented-tab ${!yearly ? 'is-active' : ''}`}
          >
            Monthly billing
          </button>
          <button
            type="button"
            onClick={() => setYearly(true)}
            className={`dashboard-segmented-tab ${yearly ? 'is-active' : ''}`}
          >
            Yearly billing
            <span className="ml-1.5 rounded-full bg-emerald-100 text-[#165B40] px-2 py-0.5 text-[10px] font-bold">
              2 MONTHS FREE
            </span>
          </button>
        </div>
      </div>

      {/* Plan cards: Clean Bento Cards */}
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
              className={`relative flex flex-col rounded-3xl border ${
                isCurrent 
                  ? 'border-[#165B40] bg-white shadow-md ring-2 ring-[#165B40]/20' 
                  : 'border-slate-200/90 bg-white shadow-xs hover:border-slate-300 hover:shadow-md'
              } space-y-5 p-7 transition-all duration-300`}
            >
              {/* Badge */}
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-[#165B40] px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-white shadow-xs">
                    {plan.badge}
                  </span>
                </div>
              )}

              {/* Current plan tag */}
              {isCurrent && (
                <div className="absolute top-5 right-5">
                  <StatusBadge tone="info">Current</StatusBadge>
                </div>
              )}

              {/* Plan name + price */}
              <div className="space-y-1 pt-1">
                <h2 className="text-base font-bold text-slate-900 tracking-tight font-sans">
                  {plan.name}
                </h2>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-slate-900 leading-none">
                    ${price}
                  </span>
                  <span className="text-xs text-slate-500 font-sans">/month</span>
                </div>
                {yearly && (
                  <p className="text-[11px] font-medium text-slate-400">
                    Billed ${plan.yearlyPrice.toLocaleString()}/yr
                  </p>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-2.5 flex-1 pt-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-xs text-slate-600 font-sans">
                    <Check aria-hidden="true" className="mt-0.5 w-3.5 h-3.5 flex-shrink-0 text-[#165B40]" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <div className="pt-3">
                {isCurrent ? (
                  <div className="space-y-2 w-full">
                    <div className="w-full text-center text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-full py-2.5">
                      Current Plan
                    </div>
                    {currentPlan !== 'starter' && (
                      portalLoading ? (
                        <div role="status" aria-busy="true" className="w-full rounded-full border border-slate-200 py-2 text-center text-xs text-slate-400">
                          Loading billing portal…
                        </div>
                      ) : portalUrl ? (
                        <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="block w-full rounded-full border border-[#165B40]/40 py-2 text-center text-xs font-semibold text-[#165B40] transition-all hover:bg-[#165B40]/10">
                          Manage subscription →
                        </a>
                      ) : portalError ? (
                        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-center text-xs text-red-600">
                          Billing portal unavailable. <button type="button" onClick={() => window.location.reload()} className="font-semibold underline">Retry</button>
                        </div>
                      ) : null
                    )}
                  </div>
                ) : isUpgrade ? (
                  <a
                    href={buildCheckoutUrl(variantId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full rounded-full bg-[#165B40] py-2.5 text-center text-xs font-bold text-white transition-all hover:bg-[#114933] shadow-sm active:scale-[0.98]"
                  >
                    Upgrade to {plan.name} &rarr;
                  </a>
                ) : isDowngrade ? (
                  <a
                    href="mailto:support@churnaut.com?subject=Downgrade request"
                    className="block w-full text-center border border-slate-200 text-slate-500 hover:text-slate-800 text-xs font-semibold py-2.5 rounded-full transition-all hover:bg-slate-50"
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
