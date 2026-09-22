'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Link2, PlusCircle, RefreshCw, ShieldAlert, Sparkles, Target, Zap } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { supabaseBrowser } from '@/lib/supabase';
import CountUp from '@/components/ui/CountUp';
import Skeleton from '@/components/ui/Skeleton';
import { toast } from '@/hooks/useToast';
import ErrorState from '@/components/ui/ErrorState';
import { PLAN_LIMITS } from '@/lib/plans';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Surface } from '@/components/dashboard/Surface';
import { ProgressBar } from '@/components/dashboard/ProgressBar';
import { SignalFeed } from '@/components/dashboard/SignalFeed';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { PressureInstrument } from '@/components/dashboard/PressureInstrument';

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

  const metricCards: Array<{ label: string; value: number; detail: string; Icon: React.ElementType }> = summary ? [
    { label: 'Active rules', value: summary.active_rules_count, detail: 'Personalization logic running', Icon: Target },
    { label: 'Tracked links', value: summary.tracked_links_count, detail: 'Prospect paths measured', Icon: Link2 },
    { label: 'Sessions this week', value: summary.sessions_this_week, detail: 'Engagement captured', Icon: Zap },
  ] : [];
  const capacity = useMemo(() => {
    const limit = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS]?.tracked_visits ?? 500;
    if (limit === Infinity) return null;
    const pct = Math.min((monthlyVisits / limit) * 100, 100);
    return { limit, pct, tone: pct >= 90 ? 'danger' as const : pct >= 70 ? 'warning' as const : 'accent' as const };
  }, [monthlyVisits, plan]);

  if (error) return <div className="py-12"><ErrorState message={error} onRetry={fetchSummary} /></div>;

  return (
    <div className="mx-auto w-full max-w-[1560px] space-y-7 text-[var(--text-secondary)] font-sans">
      <PageHeader eyebrow="Signal Field · Overview" title={`${getGreeting()}${firstName ? `, ${firstName}` : ''}.`} description="A calm read on pipeline pressure, active signals, and the next move worth making." actions={<div className="flex items-center gap-2">{planStatus !== 'active' && <StatusBadge tone="warning">{planStatus.replace('_', ' ')}</StatusBadge>}{lastUpdated && <span className="dashboard-status dashboard-status-neutral">Updated {lastUpdated}</span>}</div>} />
      {capacity?.pct === 100 && plan === 'starter' && <div role="status" className="rounded-[16px] border border-[var(--red)]/25 bg-[var(--red)]/8 px-4 py-3 text-sm font-semibold text-[var(--red)]">Visit limit reached — personalization is paused until the 1st of next month. <Link href="/dashboard/billing" className="underline">Review plan</Link></div>}

      <section className="flex flex-col gap-3 rounded-[20px] border border-[var(--border-default)] bg-[var(--bg-surface)]/75 p-3 shadow-[0_16px_36px_rgba(40,32,22,0.06)] sm:flex-row sm:items-center sm:justify-between" aria-label="Overview actions">
        <div className="flex min-w-0 items-center gap-3 px-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[var(--accent)]/12 text-[var(--accent)]" aria-hidden="true"><Sparkles className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--text-primary)]">Your clearest revenue signals, ready for action</p><p className="truncate text-xs text-[var(--text-muted)]">Turn the next meaningful signal into a useful move.</p></div></div>
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end"><Link href="/dashboard/links" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] bg-[var(--accent)] px-4 text-xs font-bold tracking-[0.05em] text-white shadow-[0_8px_18px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition hover:bg-[var(--accent-hover)]"><Link2 className="h-4 w-4" aria-hidden="true" />CREATE TRACKED LINK</Link><Link href="/dashboard/rules" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 text-xs font-bold tracking-[0.05em] text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:bg-[var(--accent)]/6"><PlusCircle className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />ADD ROUTING RULE</Link><button type="button" onClick={handleRunScout} disabled={runningScout} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 text-xs font-bold tracking-[0.05em] text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:bg-[var(--accent)]/6 disabled:opacity-60"><RefreshCw className={`h-4 w-4 text-[var(--accent)] ${runningScout ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />{runningScout ? 'RUNNING…' : 'RUN SCOUT ANALYSIS'}</button></div>
      </section>

      {onboarding && !onboardingDismissed && !allComplete && <Surface tone="subtle" className="overflow-hidden rounded-[26px] border-[var(--border-default)] p-5 md:p-6" aria-labelledby="room-setup-title"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="dashboard-eyebrow font-mono">Launch readiness</p><h2 id="room-setup-title" className="mt-1 text-xl font-semibold text-[var(--text-primary)]">Finish setting up your workspace</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Five signals take you from installed to confidently personalizing.</p></div><button onClick={() => { localStorage.setItem('churnaut_onboarding_dismissed', 'true'); setOnboardingDismissed(true); }} aria-label="Dismiss onboarding checklist" className="min-h-10 rounded-[10px] px-3 text-xs font-semibold text-[var(--text-muted)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]">Dismiss</button></div><div className="mt-5"><ProgressBar value={(setupCount / 5) * 100} label="Setup progress" /></div><ol className="mt-5 grid gap-2 md:grid-cols-2" aria-label="Launch readiness steps">{setupSteps.map((step, index) => { const done = Boolean(onboarding[step.key]); return <li key={step.key} className={`group flex min-w-0 items-center gap-3 rounded-[18px] border px-3 py-3 transition duration-200 ${done ? 'border-[var(--green)]/25 bg-[var(--green)]/8' : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:-translate-y-0.5 hover:border-[var(--accent)]/40'}`}><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${done ? 'border-[var(--green)]/30 bg-[var(--green)]/12 text-[var(--green)]' : 'border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-muted)]'}`} aria-hidden="true">{done ? <Check className="h-4 w-4" /> : String(index + 1).padStart(2, '0')}</span><div className="min-w-0 flex-1"><p className={`text-sm font-semibold ${done ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}`}>{step.title}</p><p className="mt-0.5 text-xs text-[var(--text-muted)]">{step.description}</p></div>{!done && <Link href={step.href} className="shrink-0 rounded-[10px] px-2 py-2 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)]/8">{step.cta} <ArrowRight className="inline h-3.5 w-3.5" aria-hidden="true" /></Link>}</li>; })}</ol></Surface>}
      {onboarding && !onboardingDismissed && allComplete && <Surface tone="subtle" className="flex items-center gap-3 rounded-[20px] border-[var(--green)]/25 p-4" role="status"><span className="h-2.5 w-2.5 rounded-full bg-[var(--green)]" aria-hidden="true" /><p className="text-sm font-semibold text-[var(--green)]">Setup complete — Churnaut is fully configured and running.</p></Surface>}

      {loading ? <div className="space-y-5" role="status" aria-busy="true" aria-label="Loading signal overview"><span className="sr-only">Loading signal overview.</span><div className="space-y-5 motion-safe:animate-pulse"><div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]"><Skeleton variant="card" height={300} /><div className="grid gap-5 sm:grid-cols-3 xl:grid-cols-1"><Skeleton variant="card" height={90} /><Skeleton variant="card" height={90} /><Skeleton variant="card" height={90} /></div></div><Skeleton variant="card" height={220} /></div></div> : summary && <motion.div initial={reduceMotion ? false : 'hidden'} animate="visible" variants={{ visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.06 } } }} className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]"><motion.div variants={entryMotion}><PressureInstrument score={summary.pressure_score} status={summary.pipeline_status} value={<CountUp value={summary.pressure_score} />} /></motion.div><div className="grid gap-5 sm:grid-cols-3 xl:grid-cols-1">{metricCards.map(({ label, value, detail, Icon }) => <motion.div key={label} variants={entryMotion} aria-label={`${label}: ${value}`} className="rounded-[22px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-[0_12px_30px_rgba(40,32,22,0.05)]"><div className="flex items-start justify-between"><span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span><span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[var(--accent)]/10 text-[var(--accent)]" aria-hidden="true"><Icon className="h-4 w-4" /></span></div><p className="mt-5 font-mono text-4xl font-semibold tracking-[-0.06em] text-[var(--text-primary)] tabular-nums"><CountUp value={value} /></p><p className="mt-2 text-xs text-[var(--text-secondary)]">{detail}</p></motion.div>)}</div></div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]"><motion.div variants={entryMotion}><Surface className="rounded-[24px] p-5 md:p-6" aria-labelledby="feed-title"><div className="flex items-end justify-between gap-3"><div><p className="dashboard-eyebrow font-mono">What changed</p><h2 id="feed-title" className="mt-1 text-xl font-semibold text-[var(--text-primary)]">Signal feed</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">The latest signals captured across your workspace.</p></div><Link href="/dashboard/analytics" className="hidden items-center gap-1 text-xs font-semibold text-[var(--accent)] sm:flex">View analytics <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link></div><SignalFeed events={summary.recent_activity} formatRelativeTime={formatRelativeTime} /><Link href="/dashboard/analytics" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] sm:hidden">View full analytics <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link></Surface></motion.div><motion.div variants={entryMotion} className="space-y-5"><Surface tone="subtle" className="rounded-[24px] border-[var(--amber)]/25 p-5" aria-labelledby="attention-title"><div className="flex items-start justify-between gap-3"><div><p className="dashboard-eyebrow font-mono">Priority queue</p><h2 id="attention-title" className="mt-1 text-xl font-semibold text-[var(--text-primary)]">Needs attention</h2></div><ShieldAlert className="h-5 w-5 text-[var(--amber)]" aria-hidden="true" /></div>{!summary.scout_inbox.has_red_deals ? <div className="mt-5 rounded-[16px] border border-[var(--green)]/25 bg-[var(--green)]/8 p-4"><p className="text-sm font-semibold text-[var(--text-primary)]">No urgent items today.</p><p className="mt-1 text-xs text-[var(--text-secondary)]">Scout will surface the next meaningful change here.</p></div> : <div className="mt-5 space-y-3">{summary.scout_inbox.top_red_deal && <div className="rounded-[16px] border border-[var(--red)]/25 bg-[var(--red)]/8 p-4"><p className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-[var(--red)]">Critical signal · deal</p><p className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]">{summary.scout_inbox.top_red_deal.deal_name}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">Next action: {summary.scout_inbox.top_red_deal.next_action}</p></div>}{summary.scout_inbox.top_rep && <div className="rounded-[16px] border border-[var(--amber)]/25 bg-[var(--amber)]/8 p-4"><p className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-[var(--amber)]">Warning signal · rep</p><p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{summary.scout_inbox.top_rep.rep_name}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{summary.scout_inbox.top_rep.count} red deals need a closer look.</p></div>}</div>}<Link href="/dashboard/scout" className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)]">View full Scout analysis <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link></Surface>{capacity && <Surface className="rounded-[24px] p-5" aria-label="Capacity telemetry"><div className="flex items-center justify-between gap-3"><div><p className="dashboard-eyebrow font-mono">Capacity</p><h3 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">Monthly tracked visits</h3></div><span className="font-mono text-sm font-semibold text-[var(--text-primary)]">{monthlyVisits.toLocaleString()} / {capacity.limit.toLocaleString()}</span></div><div className="mt-4"><ProgressBar value={capacity.pct} label="Visit capacity" tone={capacity.tone} /></div>{capacity.pct >= 80 && <p className={`mt-3 text-xs ${capacity.pct >= 90 ? 'text-[var(--red)]' : 'text-[var(--amber)]'}`}>{capacity.pct >= 100 ? 'Visit limit reached.' : `You've used ${Math.round(capacity.pct)}% of your monthly limit.`} {(plan === 'starter' || plan === 'growth') && <Link href="/dashboard/billing" className="font-semibold underline">Review plan <ArrowRight className="inline h-3 w-3" aria-hidden="true" /></Link>}</p>}</Surface>}</motion.div></div>

        {plan === 'starter' && <motion.div variants={entryMotion} className="flex flex-col gap-4 rounded-[22px] border border-[var(--accent)]/25 bg-[var(--accent)]/8 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Unlock Scout AI + unlimited rules</p><p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">Growth gives you Scout deal intelligence, AI weekly digests, webhook intake for Pipedrive, Zoho &amp; Close, and 10× more tracked visits — starting at $399/mo.</p></div><Link href="/dashboard/billing" className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--accent)] px-4 text-xs font-bold text-white transition hover:bg-[var(--accent-hover)]">Upgrade to Growth <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" /></Link></motion.div>}
      </motion.div>}
    </div>
  );
}
