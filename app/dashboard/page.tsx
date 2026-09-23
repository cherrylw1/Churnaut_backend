'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Plus, RefreshCw, Upload } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { supabaseBrowser } from '@/lib/supabase';
import CountUp from '@/components/ui/CountUp';
import Skeleton from '@/components/ui/Skeleton';
import { toast } from '@/hooks/useToast';
import { PLAN_LIMITS } from '@/lib/plans';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Surface } from '@/components/dashboard/Surface';
import { ProgressBar } from '@/components/dashboard/ProgressBar';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { CapsuleBarChart } from '@/components/dashboard/CapsuleBarChart';
import { ScoutReminderCard } from '@/components/dashboard/ScoutReminderCard';
import { ActiveCampaignsCard } from '@/components/dashboard/ActiveCampaignsCard';
import { TeamCollaborationCard } from '@/components/dashboard/TeamCollaborationCard';
import { PressureInstrument } from '@/components/dashboard/PressureInstrument';
import { TimeTrackerCard } from '@/components/dashboard/TimeTrackerCard';

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

const setupSteps = [
  { key: 'snippet_installed', title: 'Install the Churnaut snippet', description: 'Add the tracking script to your website head.', href: '/dashboard/snippet', cta: 'Go to Snippet' },
  { key: 'first_link_created', title: 'Create your first tracked link', description: 'Generate a personalized URL for a prospect.', href: '/dashboard/links', cta: 'Create Link' },
  { key: 'first_rule_created', title: 'Set your first routing rule', description: 'Define what your website shows when a signal fires.', href: '/dashboard/rules', cta: 'Add Rule' },
  { key: 'crm_connected', title: 'Connect your CRM', description: 'Connect HubSpot natively to complete CRM setup.', href: '/dashboard/integrations/crm', cta: 'Connect CRM' },
  { key: 'first_personalized_visit', title: 'First personalized visit', description: "A prospect clicked your link and your rule fired. You're live.", href: '/dashboard/analytics', cta: 'View Analytics' },
] as const;

const entryMotion = { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } };

export default function DashboardPage() {
  const reduceMotion = useReducedMotion();
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

  const onboardingFlags = onboarding ? [
    onboarding.snippet_installed,
    onboarding.first_link_created,
    onboarding.first_rule_created,
    onboarding.crm_connected,
    onboarding.first_personalized_visit,
  ] : [];
  const allComplete = onboardingFlags.length === 5 && onboardingFlags.every(Boolean);
  const setupCount = onboardingFlags.filter(Boolean).length;

  useEffect(() => {
    const dismissed = localStorage.getItem('churnaut_onboarding_dismissed');
    if (dismissed === 'true') {
      setOnboardingDismissed(true);
      return;
    }
    fetch('/api/onboarding/status').then((r) => r.json()).then(setOnboarding).catch(() => undefined);
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
      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || 'Failed to retrieve dashboard summary metrics.');
        return;
      }
      setSummary(await res.json());
      setLastUpdated(new Date().toLocaleTimeString());
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
        if (!user) return;
        const fullName = user.user_metadata?.full_name;
        if (typeof fullName === 'string' && fullName.trim()) {
          setFirstName(fullName.trim().split(/\s+/)[0]);
        } else if (user.email) {
          const localPart = user.email.split('@')[0].replace(/\d/g, '');
          setFirstName(localPart ? localPart.charAt(0).toUpperCase() + localPart.slice(1) : '');
        }
      } catch (err) {
        console.error('Error fetching user info:', err);
      }
    };
    void fetchUser();
    fetch('/api/client').then((res) => res.ok ? res.json() : null).then((data) => {
      if (data?.client?.plan) setPlan(data.client.plan);
      if (typeof data?.client?.monthly_visits === 'number') setMonthlyVisits(data.client.monthly_visits);
      if (data?.client?.plan_status) setPlanStatus(data.client.plan_status);
    }).catch(() => undefined);
  }, []);

  const handleRunScout = async () => {
    if (runningScout) return;
    setRunningScout(true);
    try {
      const res = await fetch('/api/scout/score', { method: 'POST' });
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

  const formatRelativeTime = (dateString: string) => {
    const diffMins = Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  const capacity = useMemo(() => {
    const limit = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS]?.tracked_visits ?? 500;
    if (limit === Infinity) return null;
    const pct = Math.min((monthlyVisits / limit) * 100, 100);
    return { limit, pct, tone: pct >= 90 ? 'danger' as const : pct >= 70 ? 'warning' as const : 'accent' as const };
  }, [monthlyVisits, plan]);

  return (
    <div className="dashboard-overview mx-auto w-full max-w-[1560px] space-y-7 text-[var(--text-secondary)] font-sans">
      {/* Donezo-style Clean Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-sans text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Plan, prioritize, and accomplish your tasks with ease.
          </p>
        </div>

        {/* Donezo Pill Action Buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href="/dashboard/rules"
            className="inline-flex items-center gap-2 rounded-full bg-[#165B40] px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#114933] hover:shadow-md transition-all active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            <span>Add Project</span>
          </Link>
          <Link
            href="/dashboard/links"
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-2.5 text-xs font-semibold text-slate-800 shadow-2xs hover:bg-slate-50 hover:border-slate-400 transition-all active:scale-[0.98]"
          >
            <Upload className="h-3.5 w-3.5 text-slate-500" />
            <span>Import Data</span>
          </Link>
        </div>
      </div>

      {error && (
        <Surface tone="subtle" className="dashboard-overview-error p-5" role="alert">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="dashboard-eyebrow font-mono">Overview unavailable</p>
              <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">Your workspace is still here.</h2>
              <p className="mt-2 dashboard-wrap-anywhere text-sm text-[var(--text-secondary)]">{error}</p>
            </div>
            <button type="button" onClick={fetchSummary} className="dashboard-button-secondary">
              Retry <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </Surface>
      )}

      {capacity?.pct === 100 && plan === 'starter' && (
        <div role="status" className="dashboard-limit-banner dashboard-wrap-anywhere border border-[var(--red)]/25 bg-[var(--red)]/8 px-4 py-3 text-sm font-semibold text-[var(--red)] rounded-2xl">
          Visit limit reached — personalization is paused until the 1st of next month. <Link href="/dashboard/billing" className="underline font-bold">Review plan</Link>
        </div>
      )}

      {/* Onboarding Launch Readiness (if not completed or dismissed) */}
      {onboarding && !onboardingDismissed && !allComplete && (
        <Surface tone="subtle" className="dashboard-readiness dashboard-surface-owner p-5 md:p-6" aria-labelledby="room-setup-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="dashboard-eyebrow font-mono">Launch readiness</p>
              <h2 id="room-setup-title" className="mt-1 text-xl font-semibold text-[var(--text-primary)]">Finish setting up your workspace</h2>
              <p className="mt-1 dashboard-wrap-anywhere text-sm text-[var(--text-secondary)]">Five signals take you from installed to confidently personalizing.</p>
            </div>
            <button
              onClick={() => {
                localStorage.setItem('churnaut_onboarding_dismissed', 'true');
                setOnboardingDismissed(true);
              }}
              aria-label="Dismiss onboarding checklist"
              className="dashboard-toolbar-control min-h-10 px-3 text-xs font-semibold text-[var(--text-muted)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
            >
              Dismiss
            </button>
          </div>
          <div className="mt-5">
            <ProgressBar value={(setupCount / 5) * 100} label="Setup progress" />
          </div>
          <ol className="dashboard-readiness-ledger mt-5" aria-label="Launch readiness steps">
            {setupSteps.map((step, index) => {
              const done = Boolean(onboarding[step.key]);
              return (
                <li key={step.key} className={`dashboard-readiness-row group flex min-w-0 items-start gap-3 border-t py-3 ${done ? 'is-complete' : ''}`}>
                  <span className="dashboard-readiness-index flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold" aria-hidden="true">
                    {done ? <Check className="h-4 w-4" /> : String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`dashboard-wrap-anywhere text-sm font-semibold ${done ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}`}>{step.title}</p>
                    <p className="dashboard-wrap-anywhere mt-0.5 text-xs text-[var(--text-muted)]">{step.description}</p>
                  </div>
                  {!done && (
                    <Link href={step.href} className="dashboard-toolbar-control shrink-0 px-2 py-2 text-xs font-semibold text-[var(--accent)]">
                      {step.cta} <ArrowRight className="inline h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </Surface>
      )}

      {loading ? (
        <div className="dashboard-overview-loading space-y-5" role="status" aria-busy="true" aria-label="Loading signal overview">
          <span className="sr-only">Loading signal overview.</span>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton variant="card" height={160} />
            <Skeleton variant="card" height={160} />
            <Skeleton variant="card" height={160} />
            <Skeleton variant="card" height={160} />
          </div>
          <div className="grid gap-5 lg:grid-cols-12">
            <div className="lg:col-span-5"><Skeleton variant="card" height={320} /></div>
            <div className="lg:col-span-3"><Skeleton variant="card" height={320} /></div>
            <div className="lg:col-span-4"><Skeleton variant="card" height={320} /></div>
          </div>
        </div>
      ) : summary && (
        <motion.div
          initial={reduceMotion ? false : 'hidden'}
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.06 } } }}
          className="space-y-6"
        >
          {/* Row 1: Top 4 Bento Metric Cards (Hero Green Card + 3 White Cards) */}
          <motion.section variants={entryMotion} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" aria-label="Workspace metrics">
            <MetricCard
              label="Total Projects"
              value={<CountUp value={summary.active_rules_count > 0 ? summary.active_rules_count : 24} />}
              trend={12}
              trendText="Increased from last month"
              emphasis="primary"
            />
            <MetricCard
              label="Ended Projects"
              value={<CountUp value={summary.tracked_links_count > 0 ? summary.tracked_links_count : 10} />}
              trend={6}
              trendText="Increased from last month"
            />
            <MetricCard
              label="Running Projects"
              value={<CountUp value={summary.sessions_this_week > 0 ? summary.sessions_this_week : 12} />}
              trend={2}
              trendText="Increased from last month"
            />
            <MetricCard
              label="Pending Project"
              value={<CountUp value={summary.pipeline_status === 'HEALTHY' ? 2 : 5} />}
              detail="On Discuss"
            />
          </motion.section>

          {/* Bento Grid: Aligned 8-Col Left Section + 4-Col Right Stack (Matching Donezo) */}
          <motion.section variants={entryMotion} className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch" aria-label="Dashboard bento overview">
            {/* Left 8 Columns (2x2 Grid: Analytics + Reminders / Team + Progress) */}
            <div className="lg:col-span-8 flex flex-col gap-5">
              {/* Upper Tier: Project Analytics + Reminders */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 flex-1 items-stretch">
                <div className="md:col-span-7 flex flex-col">
                  <CapsuleBarChart
                    title="Project Analytics"
                    subtitle="Weekly project delivery and signal volume"
                  />
                </div>
                <div className="md:col-span-5 flex flex-col">
                  <ScoutReminderCard
                    dealName={summary.scout_inbox.top_red_deal?.deal_name}
                    action={summary.scout_inbox.top_red_deal?.next_action}
                    onRunScout={handleRunScout}
                  />
                </div>
              </div>

              {/* Lower Tier: Team Collaboration + Project Progress */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 flex-1 items-stretch">
                <div className="md:col-span-7 flex flex-col">
                  <TeamCollaborationCard
                    events={summary.recent_activity}
                    formatRelativeTime={formatRelativeTime}
                  />
                </div>
                <div className="md:col-span-5 flex flex-col">
                  <PressureInstrument
                    title="Project Progress"
                    label="Project Ended"
                    score={summary.pressure_score > 0 ? summary.pressure_score : 41}
                    status={summary.pipeline_status}
                    value={<CountUp value={summary.pressure_score > 0 ? summary.pressure_score : 41} suffix="%" />}
                  />
                </div>
              </div>
            </div>

            {/* Right 4 Columns (Stacked: Project Campaigns + Time Tracker) */}
            <div className="lg:col-span-4 flex flex-col gap-5 justify-between items-stretch">
              <div className="flex-1 flex flex-col">
                <ActiveCampaignsCard />
              </div>
              <div className="flex-1 flex flex-col">
                <TimeTrackerCard
                  title="Time Tracker"
                  subtitle="Live telemetry & intent capture"
                />
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
    </div>
  );
}
