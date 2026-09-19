'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Zap,
  RefreshCw,
  ArrowRight,
  PlusCircle,
  Link2,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase';
import CountUp from '@/components/ui/CountUp';
import Skeleton from '@/components/ui/Skeleton';
import { motion } from 'framer-motion';
import { toast } from '@/hooks/useToast';
import ErrorState from '@/components/ui/ErrorState';
import { PLAN_LIMITS } from '@/lib/plans';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Surface } from '@/components/dashboard/Surface';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { ProgressBar } from '@/components/dashboard/ProgressBar';
import { PressureInstrument } from '@/components/dashboard/PressureInstrument';
import { SignalFeed } from '@/components/dashboard/SignalFeed';

interface ScoutInboxData {
  top_red_deal: { deal_name: string; next_action: string } | null;
  top_rep: { rep_name: string; count: number } | null;
  has_red_deals: boolean;
}

interface RecentActivityEvent {
  event_type: string;
  signal_type: string | null;
  created_at: string;
}

interface DashboardSummary {
  pressure_score: number;
  pipeline_status: 'HEALTHY' | 'NEEDS ATTENTION' | 'AT RISK';
  active_rules_count: number;
  tracked_links_count: number;
  sessions_this_week: number;
  scout_inbox: ScoutInboxData;
  recent_activity: RecentActivityEvent[];
}

interface OnboardingStatus {
  snippet_installed: boolean;
  first_link_created: boolean;
  first_rule_created: boolean;
  crm_connected: boolean;
  first_personalized_visit: boolean;
}

export default function DashboardPage() {
  const [plan, setPlan] = useState<string>('starter');
  const [monthlyVisits, setMonthlyVisits] = useState<number>(0);
  const [planStatus, setPlanStatus] = useState<string>('active');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningScout, setRunningScout] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [firstName, setFirstName] = useState<string>('');

  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);


  const allComplete = !!(onboarding?.snippet_installed && onboarding?.first_link_created && onboarding?.first_rule_created && onboarding?.crm_connected && onboarding?.first_personalized_visit);

  if (planStatus === 'expired') {
    // future support for expired status banners
  }

  useEffect(() => {
    // Check localStorage for dismissed state
    const dismissed = localStorage.getItem('churnaut_onboarding_dismissed');
    if (dismissed === 'true') {
      setOnboardingDismissed(true);
      return;
    }
    fetch('/api/onboarding/status')
      .then(r => r.json())
      .then(data => setOnboarding(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (allComplete && onboarding && !onboardingDismissed) {
      const timer = setTimeout(() => {
        localStorage.setItem('churnaut_onboarding_dismissed', 'true');
        setOnboardingDismissed(true);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [allComplete, onboarding, onboardingDismissed]);



  const fetchSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/dashboard/summary');
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
        setLastUpdated(new Date().toLocaleTimeString());
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to retrieve dashboard summary metrics.');
      }
    } catch (err) {
      console.error('Failed to fetch dashboard summary:', err);
      setError('A network error occurred while loading your dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();

    const fetchUser = async () => {
      try {
        const { data: { user } } = await supabaseBrowser.auth.getUser();
        if (user) {
          const fullName = user.user_metadata?.full_name;
          if (fullName && typeof fullName === 'string' && fullName.trim()) {
            const first = fullName.trim().split(/\s+/)[0];
            setFirstName(first);
          } else if (user.email) {
            const localPart = user.email.split('@')[0];
            if (localPart) {
              const cleanPart = localPart.replace(/\d/g, '');
              if (cleanPart) {
                const name = cleanPart.charAt(0).toUpperCase() + cleanPart.slice(1);
                setFirstName(name);
              } else {
                setFirstName('');
              }
            } else {
              setFirstName('');
            }
          } else {
            setFirstName('');
          }
        }
      } catch (err) {
        console.error('Error fetching user info:', err);
      }
    };

    fetchUser();

    const fetchPlan = async () => {
      try {
        const res = await fetch('/api/client');
        if (res.ok) {
          const data = await res.json();
          if (data.client?.plan) setPlan(data.client.plan);
          if (typeof data.client?.monthly_visits === 'number') setMonthlyVisits(data.client.monthly_visits);
          if (data.client?.plan_status) setPlanStatus(data.client.plan_status);

        }
      } catch {}
    };
    fetchPlan();
  }, []);

  const handleRunScout = async () => {
    if (runningScout) return;
    setRunningScout(true);
    try {
      const res = await fetch('/api/scout/score', {
        method: 'POST',
      });
      if (res.ok) {
        await fetchSummary();
        toast.success('Scout analysis complete — pipeline updated');
      } else {
        toast.error('Scout analysis failed — check your HubSpot connection');
      }
    } catch (err) {
      console.error('Error running Scout analysis:', err);
      toast.error('An error occurred during Scout analysis.');
    } finally {
      setRunningScout(false);
    }
  };

  const getGreeting = () => {
    const hr = new Date().getHours();
    if (hr < 12) return 'Good morning';
    if (hr < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (error) {
    return (
      <div className="py-12">
        <ErrorState message={error} onRetry={fetchSummary} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1560px] space-y-8 text-[var(--text-secondary)] font-sans">
      <PageHeader
        eyebrow="Signal Room"
        title={`${getGreeting()}${firstName ? `, ${firstName}` : ''}.`}
        description="Your operating view of pipeline pressure, active signals, and the next action worth taking."
        actions={lastUpdated ? <span className="dashboard-status dashboard-status-neutral">Updated {lastUpdated}</span> : undefined}
      />

      {onboarding && !onboardingDismissed && !allComplete && (
        <Surface tone="subtle" className="space-y-5 border-l-2 border-l-[var(--accent)] p-5 md:p-6" aria-labelledby="room-setup-title">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 id="room-setup-title" className="text-base font-bold text-[var(--text-primary)]">Room setup</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Complete these steps to start personalizing your website.
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* Progress fraction */}
              <span className="text-xs font-mono text-[var(--text-muted)]">
                {[onboarding.snippet_installed, onboarding.first_link_created, onboarding.first_rule_created, onboarding.crm_connected, onboarding.first_personalized_visit].filter(Boolean).length} / 5 complete
              </span>
              {/* Dismiss button */}
              <button
                onClick={() => {
                  localStorage.setItem('churnaut_onboarding_dismissed', 'true');
                  setOnboardingDismissed(true);
                }}
                aria-label="Dismiss onboarding checklist"
                className="min-h-10 rounded-lg px-2 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)] text-xs transition-colors"
              >
                [DISMISS]
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <ProgressBar value={([onboarding.snippet_installed, onboarding.first_link_created, onboarding.first_rule_created, onboarding.crm_connected, onboarding.first_personalized_visit].filter(Boolean).length / 5) * 100} label="Setup progress" />

          {/* Steps list */}
          <div className="space-y-3">
            {[
              {
                key: 'snippet_installed',
                done: onboarding.snippet_installed,
                title: 'Install the Churnaut snippet',
                description: 'Add the tracking script to your website head.',
                href: '/dashboard/snippet',
                cta: 'Go to Snippet →',
              },
              {
                key: 'first_link_created',
                done: onboarding.first_link_created,
                title: 'Create your first tracked link',
                description: 'Generate a personalized URL for a prospect.',
                href: '/dashboard/links',
                cta: 'Create Link →',
              },
              {
                key: 'first_rule_created',
                done: onboarding.first_rule_created,
                title: 'Set your first routing rule',
                description: 'Define what your website shows when a signal fires.',
                href: '/dashboard/rules',
                cta: 'Add Rule →',
              },
              {
                key: 'crm_connected',
                done: onboarding.crm_connected,
                title: 'Connect your CRM',
                description: 'Sync HubSpot, Pipedrive, or any supported CRM.',
                href: '/dashboard/integrations/crm',
                cta: 'Connect CRM →',
              },
              {
                key: 'first_personalized_visit',
                done: onboarding.first_personalized_visit,
                title: '🎉 First personalized visit',
                description: 'A prospect clicked your link and your rule fired. You\'re live.',
                href: '/dashboard/analytics',
                cta: 'View Analytics →',
              },
            ].map((step) => (
              <div
                key={step.key}
                className={`flex items-center justify-between gap-4 p-3.5 rounded-lg border transition-colors ${
                  step.done
                    ? 'border-[var(--green)]/30 bg-[var(--green)]/10 opacity-50'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 hover:border-[var(--accent)]/40'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Completion indicator */}
                  <div className={`flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                    step.done
                      ? 'bg-[var(--green)]/10 border-[var(--green)]/30 text-[var(--green)]'
                      : 'border-[var(--border-subtle)] text-transparent'
                  }`}>
                    {step.done && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-mono font-bold uppercase tracking-wide ${step.done ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}`}>
                      {step.title}
                    </p>
                    <p className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5">{step.description}</p>
                  </div>
                </div>
                {!step.done && (
                  <Link
                    href={step.href}
                    className="flex min-h-10 flex-shrink-0 items-center text-sm font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] border border-[var(--accent)]/30 hover:border-[var(--accent)] px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                  >
                    {step.cta}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </Surface>
      )}

      {onboarding && !onboardingDismissed && allComplete && (
        <Surface tone="subtle" className="border-[var(--green)]/30 p-4 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-[var(--green)] animate-pulse flex-shrink-0" />
          <p className="text-sm text-[var(--green)] font-semibold">
            Setup complete — Churnaut is fully configured and running.
          </p>
        </Surface>
      )}

      {loading ? (
        <div className="space-y-8 animate-pulse">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <Skeleton variant="card" height={242} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-1">
              <Skeleton variant="card" height={70} />
              <Skeleton variant="card" height={70} />
              <Skeleton variant="card" height={70} />
            </div>
          </div>
          <Skeleton variant="card" height={150} />
          <Skeleton variant="card" height={220} />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Primary instrumentation */}
          {summary && (
            <section aria-labelledby="instrumentation-title" className="space-y-3">
              <SectionHeader headingId="instrumentation-title" title="Instrumentation" description="The signals shaping this workspace right now." />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                <PressureInstrument score={summary.pressure_score} status={summary.pipeline_status} value={<CountUp value={summary.pressure_score} />} />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-1">
                  <MetricCard label="Active rules" value={<CountUp value={summary.active_rules_count} />} detail="Personalization logic running" />
                  <MetricCard label="Tracked links" value={<CountUp value={summary.tracked_links_count} />} detail="Prospect paths measured" />
                  <MetricCard label="Sessions this week" value={<CountUp value={summary.sessions_this_week} />} detail="Engagement captured" />
                </div>
              </div>
            </section>
          )}

          {/* Needs attention */}
          {summary && (
            <Surface tone="subtle" className="border-l-2 border-l-[var(--amber)] p-5 md:p-6" aria-labelledby="attention-title">
              <SectionHeader headingId="attention-title" title="Needs attention" description="The clearest next signal from your pipeline today." />
              <div className="mt-5 space-y-3">
                {!summary.scout_inbox.has_red_deals ? (
                  <div className="flex items-center gap-3 rounded-[8px] border border-[var(--green)]/20 bg-[var(--green)]/5 px-4 py-4">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--green)]/30 text-[var(--green)]" aria-hidden="true">✓</span>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">No urgent items today.</p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">Scout will surface the next meaningful change here.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {summary.scout_inbox.top_red_deal && (
                      <div className="flex items-start gap-3 rounded-[8px] border border-[var(--red)]/25 bg-[var(--red)]/5 px-4 py-4">
                        <Zap className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--red)]" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="text-[10px] font-mono font-semibold uppercase tracking-[0.1em] text-[var(--red)]">Critical signal · deal</p>
                          <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{summary.scout_inbox.top_red_deal.deal_name}</p>
                          <p className="mt-1 text-xs text-[var(--text-secondary)]">Next action: {summary.scout_inbox.top_red_deal.next_action}</p>
                        </div>
                      </div>
                    )}
                    {summary.scout_inbox.top_rep && (
                      <div className="flex items-start gap-3 rounded-[8px] border border-[var(--amber)]/25 bg-[var(--amber)]/5 px-4 py-4">
                        <Zap className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--amber)]" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="text-[10px] font-mono font-semibold uppercase tracking-[0.1em] text-[var(--amber)]">Warning signal · rep</p>
                          <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{summary.scout_inbox.top_rep.rep_name}</p>
                          <p className="mt-1 text-xs text-[var(--text-secondary)]">{summary.scout_inbox.top_rep.count} red deals need a closer look.</p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="mt-5 flex justify-end">
                <Link
                  href="/dashboard/scout"
                  className="text-[12px] text-[var(--accent)] hover:text-[var(--accent-hover)] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors font-mono"
                >
                  View full Scout analysis <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </Surface>
          )}

          {/* Signal feed */}
          {summary && (
            <Surface className="p-5 md:p-6" aria-labelledby="feed-title">
              <SectionHeader headingId="feed-title" title="Signal feed" description="The latest signals captured across your workspace." />
              <SignalFeed events={summary.recent_activity} formatRelativeTime={formatRelativeTime} />
              <div className="mt-4 flex justify-end">
                <Link
                  href="/dashboard/analytics"
                  className="text-[12px] text-[var(--accent)] hover:text-[var(--accent-hover)] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors font-mono"
                >
                  View full analytics <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </Surface>
          )}

          {/* Capacity */}
          {(() => {
            const limit = (PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS]?.tracked_visits) ?? 500;
            if (limit === Infinity) return null;
            const pct = Math.min((monthlyVisits / limit) * 100, 100);
            const textColor = pct >= 100 ? 'text-[var(--red)]' : pct >= 90 ? 'text-[var(--red)]' : pct >= 70 ? 'text-[var(--amber)]' : 'text-[var(--text-muted)]';
            const atLimit = pct >= 100;
            return (
              <Surface tone="subtle" className="space-y-3 px-5 py-5 md:px-6" aria-label="Capacity telemetry">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                    Capacity · monthly tracked visits
                  </span>
                  <span className={`text-[11px] font-mono font-bold ${textColor}`}>
                    {monthlyVisits.toLocaleString()} / {limit.toLocaleString()}
                  </span>
                </div>
                <ProgressBar value={pct} label="Visit capacity" tone={pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'accent'} />
                {pct >= 80 && plan === 'starter' && (
                  <p className="text-[10px] font-mono text-[var(--amber)]">
                    {atLimit ? (
                      <span className="text-[var(--red)] font-semibold">⛔ Visit limit reached — personalization is paused until the 1st of next month.</span>
                    ) : (
                      `You've used ${Math.round(pct)}% of your monthly limit.`
                    )}
                    {' '}<a href="/dashboard/billing" className="underline hover:text-[#A8552F] transition-colors">Upgrade to Growth for 10× more visits &rarr;</a>
                  </p>
                )}
                {pct >= 80 && plan === 'growth' && (
                  <p className="text-[10px] font-mono text-[var(--amber)]">
                    {pct >= 100 ? 'Visit limit reached.' : `You've used ${Math.round(pct)}% of your monthly limit.`}
                    {' '}<a href="/dashboard/billing" className="underline hover:text-[#A8552F] transition-colors">Upgrade to Pro for unlimited visits &rarr;</a>
                  </p>
                )}
              </Surface>
            );
          })()}

          {/* SECTION 4C: UPSELL NUDGE (starter only) */}
          {plan === 'starter' && (
            <div className="border border-[var(--accent)]/15 bg-[var(--accent)]/5 rounded-[12px] px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-[12px] font-mono font-bold uppercase tracking-wider text-[var(--accent)]">
                  Unlock Scout AI + Unlimited Rules
                </p>
                <p className="text-[11px] font-sans text-[var(--text-secondary)] max-w-md">
                  Growth gives you Scout deal intelligence, AI weekly digests, Pipedrive, Zoho & Close CRM support, and 10× more tracked visits — starting at $399/mo.
                </p>
              </div>
              <a
                href="/dashboard/billing"
                className="flex-shrink-0 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-sans text-xs font-semibold py-2 px-5 rounded-[8px] transition-all active:scale-[0.98] whitespace-nowrap"
              >
                Upgrade to Growth &rarr;
              </a>
            </div>
          )}

          {/* Command actions */}
          <section aria-labelledby="command-actions-title">
          <SectionHeader headingId="command-actions-title" title="Command actions" description="Move from signal to action without leaving the room." />
          <motion.div 
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: {
                  staggerChildren: 0.1
                }
              }
            }}
          >
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } }
              }}
            >
              <Link
                href="/dashboard/links"
                className="card flex min-h-14 w-full items-center justify-between rounded-[8px] border border-[var(--border-default)] bg-transparent p-4 font-sans text-[13px] font-semibold text-[var(--text-secondary)] transition-all hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
              >
                <span>CREATE TRACKED LINK</span>
                <Link2 className="w-4 h-4 text-[var(--accent)]" />
              </Link>
            </motion.div>

            <motion.div
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } }
              }}
            >
              <Link
                href="/dashboard/rules"
                className="card flex min-h-14 w-full items-center justify-between rounded-[8px] border border-[var(--border-default)] bg-transparent p-4 font-sans text-[13px] font-semibold text-[var(--text-secondary)] transition-all hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
              >
                <span>ADD ROUTING RULE</span>
                <PlusCircle className="w-4 h-4 text-[var(--accent)]" />
              </Link>
            </motion.div>

            <motion.div
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } }
              }}
            >
              <button
                onClick={handleRunScout}
                disabled={runningScout}
                className="card flex min-h-14 w-full items-center justify-between rounded-[8px] border border-[var(--border-default)] bg-transparent p-4 text-left font-sans text-[13px] font-semibold text-[var(--text-secondary)] transition-all hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                <span>{runningScout ? 'RUNNING...' : 'RUN SCOUT ANALYSIS'}</span>
                <RefreshCw className={`w-4 h-4 text-[var(--accent)] ${runningScout ? 'animate-spin' : ''}`} />
              </button>
            </motion.div>
          </motion.div>
          </section>
        </div>
      )}
    </div>
  );
}
