'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Link2, PlusCircle, RefreshCw, ShieldAlert, Sparkles, Target, Zap } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { supabaseBrowser } from '@/lib/supabase';
import CountUp from '@/components/ui/CountUp';
import Skeleton from '@/components/ui/Skeleton';
import { toast } from '@/hooks/useToast';
import { PLAN_LIMITS } from '@/lib/plans';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Surface } from '@/components/dashboard/Surface';
import { ProgressBar } from '@/components/dashboard/ProgressBar';
import { SignalFeed } from '@/components/dashboard/SignalFeed';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { PressureInstrument } from '@/components/dashboard/PressureInstrument';
import { MetricCard } from '@/components/dashboard/MetricCard';

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

  const getGreeting = () => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
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
      <PageHeader eyebrow="Signal Field · Overview" title={`${getGreeting()}${firstName ? `, ${firstName}` : ''}.`} description="A calm read on pipeline pressure, active signals, and the next move worth making." actions={<div className="flex items-center gap-2">{planStatus !== 'active' && <StatusBadge tone="warning">{planStatus.replace('_', ' ')}</StatusBadge>}{lastUpdated && <span className="dashboard-status dashboard-status-neutral">Updated {lastUpdated}</span>}</div>} />
      {error && <Surface tone="subtle" className="dashboard-overview-error p-5" role="alert"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="dashboard-eyebrow font-mono">Overview unavailable</p><h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">Your workspace is still here.</h2><p className="mt-2 dashboard-wrap-anywhere text-sm text-[var(--text-secondary)]">{error}</p></div><button type="button" onClick={fetchSummary} className="dashboard-button-secondary">Retry <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /></button></div></Surface>}
      {capacity?.pct === 100 && plan === 'starter' && <div role="status" className="dashboard-limit-banner dashboard-wrap-anywhere border border-[var(--red)]/25 bg-[var(--red)]/8 px-4 py-3 text-sm font-semibold text-[var(--red)]">Visit limit reached — personalization is paused until the 1st of next month. <Link href="/dashboard/billing" className="underline">Review plan</Link></div>}

      <section className="dashboard-action-rail dashboard-surface flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Overview actions">
        <div className="flex min-w-0 items-start gap-3"><span className="dashboard-action-icon flex h-10 w-10 shrink-0 items-center justify-center text-[var(--signal-activate)]" aria-hidden="true"><Sparkles className="h-4 w-4" /></span><div className="min-w-0"><p className="dashboard-wrap-anywhere text-sm font-semibold text-[var(--text-primary)]">Your clearest revenue signals, ready for action</p><p className="dashboard-wrap-anywhere mt-1 text-xs text-[var(--text-muted)]">Turn the next meaningful signal into a useful move.</p></div></div>
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end"><Link href="/dashboard/links" className="dashboard-button-primary"><Link2 className="h-4 w-4" aria-hidden="true" />CREATE TRACKED LINK</Link><Link href="/dashboard/rules" className="dashboard-button-secondary"><PlusCircle className="h-4 w-4 text-[var(--signal-activate)]" aria-hidden="true" />ADD ROUTING RULE</Link><button type="button" onClick={handleRunScout} disabled={runningScout} className="dashboard-button-secondary disabled:opacity-60"><RefreshCw className={`h-4 w-4 text-[var(--signal-intelligence)] ${runningScout ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />{runningScout ? 'RUNNING…' : 'RUN SCOUT ANALYSIS'}</button></div>
      </section>

      {onboarding && !onboardingDismissed && !allComplete && <Surface tone="subtle" className="dashboard-readiness dashboard-surface-owner p-5 md:p-6" aria-labelledby="room-setup-title"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="dashboard-eyebrow font-mono">Launch readiness</p><h2 id="room-setup-title" className="mt-1 text-xl font-semibold text-[var(--text-primary)]">Finish setting up your workspace</h2><p className="mt-1 dashboard-wrap-anywhere text-sm text-[var(--text-secondary)]">Five signals take you from installed to confidently personalizing.</p></div><button onClick={() => { localStorage.setItem('churnaut_onboarding_dismissed', 'true'); setOnboardingDismissed(true); }} aria-label="Dismiss onboarding checklist" className="dashboard-toolbar-control min-h-10 px-3 text-xs font-semibold text-[var(--text-muted)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]">Dismiss</button></div><div className="mt-5"><ProgressBar value={(setupCount / 5) * 100} label="Setup progress" /></div><ol className="dashboard-readiness-ledger mt-5" aria-label="Launch readiness steps">{setupSteps.map((step, index) => { const done = Boolean(onboarding[step.key]); return <li key={step.key} className={`dashboard-readiness-row group flex min-w-0 items-start gap-3 border-t py-3 ${done ? 'is-complete' : ''}`}><span className="dashboard-readiness-index flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold" aria-hidden="true">{done ? <Check className="h-4 w-4" /> : String(index + 1).padStart(2, '0')}</span><div className="min-w-0 flex-1"><p className={`dashboard-wrap-anywhere text-sm font-semibold ${done ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}`}>{step.title}</p><p className="dashboard-wrap-anywhere mt-0.5 text-xs text-[var(--text-muted)]">{step.description}</p></div>{!done && <Link href={step.href} className="dashboard-toolbar-control shrink-0 px-2 py-2 text-xs font-semibold text-[var(--accent)]">{step.cta} <ArrowRight className="inline h-3.5 w-3.5" aria-hidden="true" /></Link>}</li>; })}</ol></Surface>}
      {onboarding && !onboardingDismissed && allComplete && <Surface tone="subtle" className="dashboard-complete-rail flex items-center gap-3 p-4" role="status"><span className="h-2.5 w-2.5 rounded-full bg-[var(--green)]" aria-hidden="true" /><p className="text-sm font-semibold text-[var(--green)]">Setup complete — Churnaut is fully configured and running.</p></Surface>}

      {loading ? <div className="dashboard-overview-loading space-y-5" role="status" aria-busy="true" aria-label="Loading signal overview"><span className="sr-only">Loading signal overview.</span><div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]"><Skeleton variant="card" height={300} /><Skeleton variant="card" height={180} /></div><Skeleton variant="card" height={86} /><Skeleton variant="card" height={260} /></div> : summary && <motion.div initial={reduceMotion ? false : 'hidden'} animate="visible" variants={{ visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.06 } } }} className="space-y-6">
        {/* Top 4 Bento Metric Cards: Donezo Hero Green Card + 3 White Bento Cards */}
        <motion.section variants={entryMotion} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" aria-label="Workspace metrics">
          <MetricCard
            label="Active Rules"
            value={<CountUp value={summary.active_rules_count} />}
            detail="Personalization logic running"
            trend={12}
            emphasis="primary"
          />
          <MetricCard
            label="Tracked Links"
            value={<CountUp value={summary.tracked_links_count} />}
            detail="Prospect paths measured"
            trend={8}
          />
          <MetricCard
            label="Sessions This Week"
            value={<CountUp value={summary.sessions_this_week} />}
            detail="Engagement captured"
            trend={18}
          />
          <MetricCard
            label="Pipeline Risk Status"
            value={summary.pipeline_status === 'HEALTHY' ? 'Healthy' : summary.pipeline_status === 'AT RISK' ? 'At Risk' : 'Attention'}
            detail={`Pressure score: ${summary.pressure_score}/100`}
            trend={summary.pipeline_status === 'HEALTHY' ? 4 : -6}
          />
        </motion.section>

        {/* Mid Row: Donezo Semi-Circular Gauge & Next Action Card */}
        <section className="dashboard-decision-band grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]" aria-label="Pipeline decision band">
          <motion.div variants={entryMotion}>
            <PressureInstrument score={summary.pressure_score} status={summary.pipeline_status} value={<CountUp value={summary.pressure_score} />} />
          </motion.div>
          <motion.div variants={entryMotion} className="dashboard-next-move dashboard-surface dashboard-surface-owner p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-400">Next Recommended Move</p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">Turn the strongest signal into momentum.</h2>
                </div>
                <Zap className="h-5 w-5 text-amber-500 flex-shrink-0" aria-hidden="true" />
              </div>
              <p className="dashboard-wrap-anywhere mt-3 text-sm leading-relaxed text-slate-600">
                Use a tracked link or routing rule to give the next high-intent visitor a personalized path when they land on your site.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/dashboard/links" className="dashboard-button-primary">
                Create a link <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <Link href="/dashboard/rules" className="dashboard-button-secondary">
                Review rules
              </Link>
            </div>
          </motion.div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]"><motion.section variants={entryMotion}><Surface className="dashboard-feed-surface dashboard-surface-owner p-5 md:p-6" aria-labelledby="feed-title"><div className="flex items-end justify-between gap-3"><div><p className="dashboard-eyebrow font-mono">What changed</p><h2 id="feed-title" className="mt-1 text-xl font-semibold text-[var(--text-primary)]">Signal feed</h2><p className="mt-1 dashboard-wrap-anywhere text-sm text-[var(--text-secondary)]">The latest signals captured across your workspace.</p></div><Link href="/dashboard/analytics" className="hidden items-center gap-1 text-xs font-semibold text-[var(--accent)] sm:flex">View analytics <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link></div><SignalFeed events={summary.recent_activity} formatRelativeTime={formatRelativeTime} /><Link href="/dashboard/analytics" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] sm:hidden">View full analytics <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link></Surface></motion.section><motion.aside variants={entryMotion} className="dashboard-support-rail space-y-5"><Surface tone="subtle" className="dashboard-priority-surface dashboard-surface-owner border-[var(--amber)]/25 p-5" aria-labelledby="attention-title"><div className="flex items-start justify-between gap-3"><div><p className="dashboard-eyebrow font-mono">Priority queue</p><h2 id="attention-title" className="mt-1 text-xl font-semibold text-[var(--text-primary)]">Needs attention</h2></div><ShieldAlert className="h-5 w-5 text-[var(--amber)]" aria-hidden="true" /></div>{!summary.scout_inbox.has_red_deals ? <div className="dashboard-priority-empty mt-5"><p className="text-sm font-semibold text-[var(--text-primary)]">No urgent items today.</p><p className="mt-1 text-xs text-[var(--text-secondary)]">Scout will surface the next meaningful change here.</p></div> : <div className="mt-5 space-y-3">{summary.scout_inbox.top_red_deal && <div className="dashboard-priority-item dashboard-wrap-anywhere"><p className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-[var(--red)]">Critical signal · deal</p><p className="dashboard-wrap-anywhere mt-1 text-sm font-semibold text-[var(--text-primary)]">{summary.scout_inbox.top_red_deal.deal_name}</p><p className="dashboard-wrap-anywhere mt-1 text-xs text-[var(--text-secondary)]">Next action: {summary.scout_inbox.top_red_deal.next_action}</p></div>}{summary.scout_inbox.top_rep && <div className="dashboard-priority-item dashboard-wrap-anywhere is-warning"><p className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-[var(--amber)]">Warning signal · rep</p><p className="dashboard-wrap-anywhere mt-1 text-sm font-semibold text-[var(--text-primary)]">{summary.scout_inbox.top_rep.rep_name}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{summary.scout_inbox.top_rep.count} red deals need a closer look.</p></div>}</div>}<Link href="/dashboard/scout" className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)]">View full Scout analysis <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link></Surface>{capacity && <Surface className="dashboard-capacity-surface dashboard-surface-owner p-5" aria-label="Capacity telemetry"><div className="flex items-center justify-between gap-3"><div><p className="dashboard-eyebrow font-mono">Capacity</p><h3 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">Monthly tracked visits</h3></div><span className="font-mono text-sm font-semibold text-[var(--text-primary)]">{monthlyVisits.toLocaleString()} / {capacity.limit.toLocaleString()}</span></div><div className="mt-4"><ProgressBar value={capacity.pct} label="Visit capacity" tone={capacity.tone} /></div>{capacity.pct >= 80 && <p className={`dashboard-wrap-anywhere mt-3 text-xs ${capacity.pct >= 90 ? 'text-[var(--red)]' : 'text-[var(--amber)]'}`}>{capacity.pct >= 100 ? 'Visit limit reached.' : `You've used ${Math.round(capacity.pct)}% of your monthly limit.`} {(plan === 'starter' || plan === 'growth') && <Link href="/dashboard/billing" className="font-semibold underline">Review plan <ArrowRight className="inline h-3 w-3" aria-hidden="true" /></Link>}</p>}</Surface>}</motion.aside></div>

        {plan === 'starter' && <motion.div variants={entryMotion} className="dashboard-upgrade-rail flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--signal-intelligence)]">Unlock Scout AI + unlimited rules</p><p className="dashboard-wrap-anywhere mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">Growth gives you Scout deal intelligence, AI weekly digests, webhook intake for Pipedrive, Zoho &amp; Close, and 10× more tracked visits — starting at $399/mo.</p></div><Link href="/dashboard/billing" className="dashboard-button-primary shrink-0">Upgrade to Growth <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" /></Link></motion.div>}
      </motion.div>}
    </div>
  );
}
