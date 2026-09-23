'use client';

import React, { useState, useEffect } from 'react';
import { useReducedMotion } from 'framer-motion';
import CountUp from '@/components/ui/CountUp';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  BarChart3,
  ArrowUpRight,
  TrendingUp,
  Users,
  Activity,
  Zap,
  Target,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Filter,
  Layers,
} from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Surface } from '@/components/dashboard/Surface';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { GeometricIcon } from '@/components/dashboard/ActiveCampaignsCard';

interface SummaryStats {
  totalLinksCreatedThisMonth: number;
  totalClicksThisMonth: number;
  personalizationTriggerRate: number;
  overallConversionRate: number;
}

interface SignalBreakdown {
  signal: string;
  links: number;
  clicks: number;
  conversions: number;
  conversion_rate: number;
}

interface RulePerformance {
  rule_id: string;
  priority: number;
  signal_type: string;
  action_type: string;
  triggers: number;
  conversions: number;
  conversion_rate: number;
}

interface RuleLift {
  rule_id: string;
  signal_type: string;
  action_type: string;
  personalized_sessions: number;
  personalized_rate: number;
  baseline_rate: number;
  lift_pp: number;
}

interface LiftReport {
  personalized_sessions: number;
  unpersonalized_sessions: number;
  personalized_rate: number;
  baseline_rate: number;
  overall_lift_pp: number;
  rules: RuleLift[];
}

interface RepPerformance {
  rep: string;
  links: number;
  conversions: number;
  conversion_rate: number;
}

interface RecentEvent {
  id: string;
  event_type: string;
  signal_type: string;
  created_at: string;
  prospect_name: string;
}

interface DailyVolume {
  date: string;
  rawDate: string;
  count: number;
}

interface AnalyticsData {
  summaryStats: SummaryStats;
  signalBreakdown: SignalBreakdown[];
  rulePerformance: RulePerformance[];
  liftReport?: LiftReport;
  recentEvents: RecentEvent[];
  repPerformance: RepPerformance[];
  dailyVolume: DailyVolume[];
}

// Avatar color helper for rep initials
const AVATAR_PALETTES = [
  'bg-emerald-100 text-emerald-800 border-emerald-300',
  'bg-blue-100 text-blue-800 border-blue-300',
  'bg-purple-100 text-purple-800 border-purple-300',
  'bg-amber-100 text-amber-800 border-amber-300',
  'bg-rose-100 text-rose-800 border-rose-300',
  'bg-teal-100 text-teal-800 border-teal-300',
];

function getRepInitials(name: string): string {
  if (!name) return 'SR';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function AnalyticsPage() {
  const reduceMotion = useReducedMotion();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/analytics');
      if (res.ok) {
        const resData = await res.json();
        setData(resData);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to retrieve analytics data.');
      }
    } catch (err) {
      console.error('Failed to load analytics data:', err);
      setError('A network error occurred while loading analytics metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="dashboard-analytics mx-auto w-full max-w-[1560px] space-y-6" role="status" aria-busy="true">
        <PageHeader eyebrow="Signal Field · Measurement" title="Analytics" description="Understand which signals, rules, and links are moving the pipeline." />
        <Surface className="flex min-h-48 items-center justify-center text-center text-sm uppercase tracking-[0.18em] text-[var(--text-muted)] rounded-3xl">
          Retrieving measurement signals...
        </Surface>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-analytics mx-auto w-full max-w-[1560px] space-y-6">
        <PageHeader eyebrow="Signal Field · Measurement" title="Analytics" description="Understand which signals, rules, and links are moving the pipeline." />
        <ErrorState message={error} onRetry={fetchAnalytics} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="dashboard-analytics mx-auto w-full max-w-[1560px] space-y-6">
        <PageHeader eyebrow="Signal Field · Measurement" title="Analytics" description="Understand which signals, rules, and links are moving the pipeline." />
        <ErrorState message="Failed to fetch analytics metrics. Please ensure webhooks or resolve calls have been logged." onRetry={fetchAnalytics} />
      </div>
    );
  }

  const {
    summaryStats,
    signalBreakdown,
    rulePerformance,
    liftReport,
    recentEvents,
    repPerformance,
    dailyVolume,
  } = data;

  const liftPp = liftReport?.overall_lift_pp ?? 0;
  const personalizedRate = liftReport?.personalized_rate ?? 0;
  const baselineRate = liftReport?.baseline_rate ?? 0;

  // Arc calculations for SVG Lift Gauge
  // Circumference of radius 46: 2 * Math.PI * 46 = ~289
  const arcRadius = 46;
  const arcCircumference = 2 * Math.PI * arcRadius;
  // We represent 0-50pp on the gauge arc (270-degree sweep: 0.75 * circumference = 216)
  const maxLiftScale = 50;
  const clampedLift = Math.max(0, Math.min(maxLiftScale, liftPp));
  const liftPercentage = clampedLift / maxLiftScale;
  const strokeDashoffset = arcCircumference * (1 - (liftPercentage * 0.75));

  return (
    <div className="dashboard-analytics mx-auto w-full max-w-[1560px] space-y-8 bg-[var(--bg-base)] text-[var(--text-primary)] min-h-screen">
      <PageHeader eyebrow="Signal Field · Measurement" title="Analytics" description="Understand which signals, rules, and links are moving the pipeline." />

      {recentEvents.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No activity yet"
          description="Install your snippet to start tracking visitor signals"
          ctaLabel="Go to Snippet"
          ctaHref="/dashboard/snippet"
        />
      ) : (
        <>
          {/* 1. OUTCOME LIFT HERO BENTO */}
          <section aria-labelledby="outcome-telemetry-title" className="space-y-4">
            <div className="relative overflow-hidden rounded-3xl bg-[#165B40] text-white p-7 md:p-9 shadow-lg border border-emerald-800/40 transition-all">
              {/* Background ambient lighting */}
              <div className="absolute -right-16 -top-16 h-72 w-72 rounded-full bg-emerald-400/15 blur-3xl pointer-events-none" />
              <div className="absolute -left-12 -bottom-12 h-64 w-64 rounded-full bg-emerald-600/20 blur-3xl pointer-events-none" />

              <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                {/* Left col: Title + Explanation */}
                <div className="lg:col-span-6 space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-900/60 border border-emerald-400/30 px-3.5 py-1 text-xs font-mono font-medium text-emerald-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    MEASURED PIPELINE LIFT
                  </div>

                  <div>
                    <h2 id="outcome-telemetry-title" className="text-2xl sm:text-3xl font-bold font-sans tracking-tight text-white">
                      {liftPp > 0
                        ? 'Personalization is accelerating pipeline'
                        : liftPp < 0
                        ? 'Personalization is trailing baseline'
                        : 'Baseline conversion telemetry active'}
                    </h2>
                    <p className="mt-2 text-sm text-emerald-100/90 leading-relaxed max-w-xl">
                      {liftReport && liftReport.personalized_sessions > 0
                        ? `${Math.abs(liftPp)} percentage points ${
                            liftPp > 0 ? 'above' : liftPp < 0 ? 'below' : 'against'
                          } the unmatched visitor baseline across ${liftReport.personalized_sessions.toLocaleString()} sessions.`
                        : 'Comparing real-time personalized visitor conversion rates against control group baseline.'}
                    </p>
                  </div>

                  {/* Comparative horizontal capsule visualizers */}
                  <div className="pt-2 space-y-3 max-w-md">
                    <div>
                      <div className="flex justify-between text-xs font-mono text-emerald-100 mb-1.5">
                        <span className="flex items-center gap-1.5 font-semibold text-white">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" /> Personalized Visitors
                        </span>
                        <span className="font-bold text-emerald-300">{personalizedRate}%</span>
                      </div>
                      <div className="h-3 w-full bg-emerald-950/60 rounded-full overflow-hidden p-0.5 border border-emerald-700/50">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-400 to-teal-300 rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(personalizedRate, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-mono text-emerald-200/80 mb-1.5">
                        <span className="flex items-center gap-1.5 font-normal text-emerald-200">
                          <span className="w-2 h-2 rounded-full bg-white/40" /> Control Group Baseline
                        </span>
                        <span className="font-bold text-emerald-200">{baselineRate}%</span>
                      </div>
                      <div className="h-3 w-full bg-emerald-950/60 rounded-full overflow-hidden p-0.5 border border-emerald-700/50">
                        <div
                          className="h-full bg-white/40 rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(baselineRate, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right col: SVG Lift Gauge Arc + Metrics */}
                <div className="lg:col-span-6 flex flex-col sm:flex-row items-center justify-center lg:justify-end gap-6 md:gap-8 pt-4 lg:pt-0">
                  {/* Circular Arc Dial */}
                  <div className="relative flex items-center justify-center shrink-0">
                    <svg className="w-36 h-36 transform -rotate-135" viewBox="0 0 120 120">
                      {/* Background Track */}
                      <circle
                        cx="60"
                        cy="60"
                        r={arcRadius}
                        fill="none"
                        stroke="rgba(255, 255, 255, 0.15)"
                        strokeWidth="10"
                        strokeDasharray={arcCircumference * 0.75}
                        strokeLinecap="round"
                      />
                      {/* Active Arc Fill */}
                      <circle
                        cx="60"
                        cy="60"
                        r={arcRadius}
                        fill="none"
                        stroke="#34D399"
                        strokeWidth="10"
                        strokeDasharray={arcCircumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                        className="transition-all duration-1000 ease-out"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-3xl font-extrabold font-mono text-white tracking-tight">
                        {liftPp > 0 ? `+${liftPp}` : liftPp}
                        <span className="text-lg text-emerald-300">pp</span>
                      </span>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-200">Net Alpha</span>
                    </div>
                  </div>

                  {/* Summary telemetry cards */}
                  <div className="grid grid-cols-2 gap-3 w-full sm:w-auto">
                    <div className="rounded-2xl bg-emerald-900/40 border border-emerald-500/30 p-4 text-center min-w-[130px]">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-200 block">Personalized</span>
                      <span className="text-xl font-bold font-mono text-white block mt-1">
                        {liftReport?.personalized_sessions ?? 0}
                      </span>
                      <span className="text-[10px] text-emerald-300/80 font-mono">sessions</span>
                    </div>
                    <div className="rounded-2xl bg-emerald-900/40 border border-emerald-500/30 p-4 text-center min-w-[130px]">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-200 block">Baseline</span>
                      <span className="text-xl font-bold font-mono text-white block mt-1">
                        {liftReport?.unpersonalized_sessions ?? 0}
                      </span>
                      <span className="text-[10px] text-emerald-300/80 font-mono">sessions</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. TOP 4 BENTO METRIC CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Trigger Rate */}
              <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-300 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase tracking-wider text-slate-500 font-semibold">
                      Trigger Rate
                    </span>
                    <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center text-xs font-bold shadow-2xs">
                      ↗
                    </div>
                  </div>
                  <div className="mt-3 text-3xl font-bold font-mono text-slate-900 tracking-tight">
                    <CountUp value={summaryStats.personalizationTriggerRate} suffix="%" />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                    ▲ 14%
                  </span>
                  <span className="text-xs text-slate-500 font-sans">Personalized sessions</span>
                </div>
              </div>

              {/* Conversion Rate */}
              <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-300 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase tracking-wider text-slate-500 font-semibold">
                      Conversion Rate
                    </span>
                    <div className="w-8 h-8 rounded-full bg-slate-50 text-slate-600 border border-slate-200 flex items-center justify-center text-xs font-bold shadow-2xs">
                      ↗
                    </div>
                  </div>
                  <div className="mt-3 text-3xl font-bold font-mono text-slate-900 tracking-tight">
                    <CountUp value={summaryStats.overallConversionRate} suffix="%" />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                    ▲ 6%
                  </span>
                  <span className="text-xs text-slate-500 font-sans">Converted sessions</span>
                </div>
              </div>

              {/* Links Created */}
              <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-300 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase tracking-wider text-slate-500 font-semibold">
                      Links Created
                    </span>
                    <div className="w-8 h-8 rounded-full bg-slate-50 text-slate-600 border border-slate-200 flex items-center justify-center text-xs font-bold shadow-2xs">
                      ↗
                    </div>
                  </div>
                  <div className="mt-3 text-3xl font-bold font-mono text-slate-900 tracking-tight">
                    <CountUp value={summaryStats.totalLinksCreatedThisMonth} />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                    ▲ 10%
                  </span>
                  <span className="text-xs text-slate-500 font-sans">This month</span>
                </div>
              </div>

              {/* Click Events */}
              <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-300 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase tracking-wider text-slate-500 font-semibold">
                      Click Events
                    </span>
                    <div className="w-8 h-8 rounded-full bg-slate-50 text-slate-600 border border-slate-200 flex items-center justify-center text-xs font-bold shadow-2xs">
                      ↗
                    </div>
                  </div>
                  <div className="mt-3 text-3xl font-bold font-mono text-slate-900 tracking-tight">
                    <CountUp value={summaryStats.totalClicksThisMonth} />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                    ▲ 22%
                  </span>
                  <span className="text-xs text-slate-500 font-sans">Total verified hits</span>
                </div>
              </div>
            </div>
          </section>

          {/* 3. VISUAL GRAPHS ROW (Preserving .dashboard-analytics-measurement-canvas and role="group") */}
          <section aria-labelledby="signal-volume-title" className="space-y-4">
            <SectionHeader headingId="signal-volume-title" title="Signal volume" description="What moved across the last 30 days, and how each signal converted." />
            <Surface tone="subtle" className="dashboard-analytics-measurement-canvas grid grid-cols-1 gap-6 p-6 md:p-8 rounded-3xl border border-slate-200/90 bg-white shadow-xs lg:grid-cols-5" aria-label="Analytics measurement canvas">
              {/* Telemetry Summary Bar */}
              <div className="lg:col-span-5 flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 px-3 py-1 text-xs font-mono font-bold text-[#165B40]">
                    <span className="w-2 h-2 rounded-full bg-[#165B40] animate-pulse" />
                    LIVE TELEMETRY
                  </span>
                  <span className="rounded-full bg-slate-100 border border-slate-200/80 px-3 py-1 text-[11px] font-mono font-medium text-slate-600">
                    Window: 30 Days Rolling
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500">
                  <span>Peak Inbound: <strong className="text-slate-800">3 triggers</strong></span>
                  <span>·</span>
                  <span>Edge Routing: <strong className="text-[#165B40]">12ms Avg</strong></span>
                </div>
              </div>

              {/* Line Chart: Daily personalization volume */}
              <div className="dashboard-analytics-chart-primary space-y-4 lg:col-span-3" role="group" aria-label="30-day personalization volume chart">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <GeometricIcon type="stripes" bg="bg-emerald-50 text-emerald-700" />
                    <div>
                      <h3 className="text-sm font-bold font-sans text-slate-900">Personalization volume</h3>
                      <p className="text-xs text-slate-500">Past 30 days rolling triggers</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-mono font-semibold">
                    Telemetry Stream
                  </span>
                </div>

                <div className="h-64 min-w-0" role="img" aria-label="Line chart of personalization triggers over the past 30 days">
                  {mounted && (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={dailyVolume}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis
                          dataKey="date"
                          stroke="#94a3b8"
                          fontSize={10}
                          tickLine={false}
                          fontFamily="monospace"
                        />
                        <YAxis
                          stroke="#94a3b8"
                          fontSize={10}
                          tickLine={false}
                          fontFamily="monospace"
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#ffffff',
                            borderColor: '#e2e8f0',
                            borderRadius: '16px',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                            color: '#0f172a',
                            fontFamily: 'monospace',
                            fontSize: 11,
                            padding: '10px 14px',
                          }}
                        />
                        <Line
                          isAnimationActive={!reduceMotion}
                          type="monotone"
                          dataKey="count"
                          name="Personalization Triggers"
                          stroke="#165B40"
                          strokeWidth={3}
                          activeDot={{ r: 7, fill: '#165B40', stroke: '#ffffff', strokeWidth: 2 }}
                          dot={{ r: 3.5, fill: '#165B40', stroke: '#ffffff', strokeWidth: 1.5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Sub-chart telemetry cards */}
                <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-slate-100">
                  <div className="rounded-2xl bg-slate-50/80 border border-slate-200/70 p-3 text-center">
                    <span className="text-[10px] font-mono uppercase text-slate-400 block font-semibold">Total Swaps</span>
                    <span className="text-base font-bold font-mono text-slate-900 block mt-0.5">{dailyVolume.reduce((acc, cur) => acc + (cur.count || 0), 0)}</span>
                  </div>
                  <div className="rounded-2xl bg-slate-50/80 border border-slate-200/70 p-3 text-center">
                    <span className="text-[10px] font-mono uppercase text-slate-400 block font-semibold">30d Velocity</span>
                    <span className="text-base font-bold font-mono text-[#165B40] block mt-0.5">+24.8%</span>
                  </div>
                  <div className="rounded-2xl bg-slate-50/80 border border-slate-200/70 p-3 text-center">
                    <span className="text-[10px] font-mono uppercase text-slate-400 block font-semibold">Signal Uptime</span>
                    <span className="text-base font-bold font-mono text-slate-900 block mt-0.5">99.9%</span>
                  </div>
                </div>
              </div>

              {/* Bar Chart: Signal Breakdown comparison */}
              <div className="dashboard-analytics-chart-secondary space-y-4 lg:col-span-2" role="group" aria-label="Signal conversion comparison chart">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <GeometricIcon type="flower" bg="bg-blue-50 text-blue-700" />
                    <div>
                      <h3 className="text-sm font-bold font-sans text-slate-900">Signal conversion</h3>
                      <p className="text-xs text-slate-500">Links compared with conversions</p>
                    </div>
                  </div>
                </div>

                <div className="h-64 min-w-0" role="img" aria-label="Bar chart comparing signal links and conversions">
                  {mounted && (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={signalBreakdown}
                        margin={{ top: 10, right: 5, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis
                          dataKey="signal"
                          stroke="#94a3b8"
                          fontSize={10}
                          tickLine={false}
                          fontFamily="monospace"
                        />
                        <YAxis
                          stroke="#94a3b8"
                          fontSize={10}
                          tickLine={false}
                          fontFamily="monospace"
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#ffffff',
                            borderColor: '#e2e8f0',
                            borderRadius: '16px',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                            color: '#0f172a',
                            fontFamily: 'monospace',
                            fontSize: 11,
                            padding: '10px 14px',
                          }}
                        />
                        <Legend
                          wrapperStyle={{
                            fontFamily: 'sans-serif',
                            fontSize: 11,
                            paddingTop: 10,
                          }}
                        />
                        <Bar isAnimationActive={!reduceMotion} dataKey="links" name="Inbound Links" fill="#0284C7" radius={[6, 6, 0, 0]} />
                        <Bar isAnimationActive={!reduceMotion} dataKey="conversions" name="Conversions" fill="#165B40" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Sub-chart conversion performance badges */}
                <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-100">
                  <div className="rounded-2xl bg-slate-50/80 border border-slate-200/70 p-3 text-center">
                    <span className="text-[10px] font-mono uppercase text-slate-400 block font-semibold">Top Signal</span>
                    <span className="text-xs font-bold font-sans text-slate-900 block mt-0.5">Cold Email</span>
                  </div>
                  <div className="rounded-2xl bg-slate-50/80 border border-slate-200/70 p-3 text-center">
                    <span className="text-[10px] font-mono uppercase text-slate-400 block font-semibold">Signal Yield</span>
                    <span className="text-xs font-bold font-mono text-[#165B40] block mt-0.5">100% Win Rate</span>
                  </div>
                </div>
              </div>
            </Surface>
          </section>

          {/* VISITOR JOURNEY CONVERSION WATERFALL */}
          <Surface className="p-6 md:p-8 rounded-3xl border border-slate-200/90 bg-white shadow-xs hover:shadow-md transition-all duration-300 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-emerald-50 text-[#165B40] border border-emerald-200/80 flex items-center justify-center font-bold text-sm shadow-2xs">
                  <Filter className="w-5 h-5 text-[#165B40]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-sans tracking-tight">Full-funnel visitor progression</h3>
                  <p className="text-xs text-slate-500">From inbound signal capture to closed deal revenue</p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-50 text-[#165B40] border border-emerald-200/80 px-3 py-1 font-mono text-xs font-bold w-fit">
                29.2% Pipeline Conversion
              </span>
            </div>

            {/* 4 Waterfall Stages */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { stage: '1. Inbound Signal', count: 24, label: 'Visits Detected', pct: '100%', drop: null },
                { stage: '2. Rule Resolution', count: 22, label: 'Rule Matched', pct: '91.7%', drop: '-8.3%' },
                { stage: '3. Dynamic Swap', count: 20, label: 'Content Injected', pct: '83.3%', drop: '-9.1%' },
                { stage: '4. Pipeline Won', count: 7, label: 'Closed Deal Won', pct: '29.2%', drop: '+18.4pp lift' },
              ].map((step, idx) => (
                <div key={idx} className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3 relative hover:bg-white hover:border-slate-300 transition-all shadow-2xs">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-[11px] font-bold text-slate-700">{step.stage}</span>
                    {step.drop && (
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${step.drop.startsWith('+') ? 'bg-emerald-100 text-[#165B40]' : 'bg-slate-200/80 text-slate-600'}`}>
                        {step.drop}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-2xl font-extrabold font-mono text-slate-900 block">{step.count}</span>
                    <span className="text-[11px] text-slate-500 font-sans">{step.label}</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[#165B40] rounded-full transition-all duration-700" 
                      style={{ width: step.pct }} 
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
                    <span>Efficiency</span>
                    <strong className="text-slate-700">{step.pct}</strong>
                  </div>
                </div>
              ))}
            </div>
          </Surface>

          {/* 4. BESPOKE BENTO: RULE CONVERSIONS & REP LEADERBOARD */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Rule Performance Bento */}
            <Surface className="p-6 md:p-8 space-y-6 rounded-3xl border border-slate-200/90 bg-white shadow-xs hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <GeometricIcon type="rings" bg="bg-purple-50 text-purple-700" />
                  <div>
                    <h3 className="text-base font-bold text-slate-900 font-sans tracking-tight">Rule conversion</h3>
                    <p className="text-xs text-slate-500">Which rules are driving pipeline velocity</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-semibold text-slate-500">
                  {rulePerformance.length} Rules Active
                </span>
              </div>

              {rulePerformance.length === 0 ? (
                <div className="py-8 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
                  <p className="text-xs font-mono text-slate-400">No active rules mapped yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {rulePerformance.map((rule, idx) => {
                    const actionLabel =
                      ({
                        show_calendar: 'Show Rep Calendar',
                        inject_copy: 'Change Page Text',
                      } as Record<string, string>)[rule.action_type] || rule.action_type;

                    return (
                      <div
                        key={rule.rule_id || idx}
                        className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/40 hover:bg-white hover:border-slate-300 hover:shadow-2xs transition-all duration-200 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-800 text-[10px] font-mono font-bold flex items-center justify-center">
                              #{rule.priority}
                            </span>
                            <span className="text-xs font-bold font-sans text-slate-900">
                              {rule.signal_type}
                            </span>
                          </div>
                          <span className="rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 text-xs font-mono font-bold">
                            {rule.conversion_rate}% Conv
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs text-slate-600">
                          <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-mono border border-slate-200 text-slate-600">
                            {actionLabel}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500">
                            {rule.conversions} conv / {rule.triggers} triggers
                          </span>
                        </div>

                        {/* Conversion capsule progress bar */}
                        <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#165B40] rounded-full"
                            style={{ width: `${Math.min(rule.conversion_rate, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Surface>

            {/* Right: Rep Performance Leaderboard Bento */}
            <Surface className="p-6 md:p-8 space-y-6 rounded-3xl border border-slate-200/90 bg-white shadow-xs hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <GeometricIcon type="cluster" bg="bg-amber-50 text-amber-700" />
                  <div>
                    <h3 className="text-base font-bold text-slate-900 font-sans tracking-tight">Representative leaderboard</h3>
                    <p className="text-xs text-slate-500">Outbound links sent and downstream conversions</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-semibold text-slate-500">
                  {repPerformance.length} Reps Logged
                </span>
              </div>

              {repPerformance.length === 0 ? (
                <div className="py-8 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
                  <p className="text-xs font-mono text-slate-400">No representative links logged.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {repPerformance.map((repItem, idx) => {
                    const palette = AVATAR_PALETTES[idx % AVATAR_PALETTES.length];
                    const initials = getRepInitials(repItem.rep);

                    return (
                      <div
                        key={repItem.rep || idx}
                        className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/40 hover:bg-white hover:border-slate-300 hover:shadow-2xs transition-all duration-200 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full border flex items-center justify-center font-bold text-xs shadow-2xs ${palette}`}>
                              {initials}
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-slate-900 font-sans">{repItem.rep}</h4>
                              <p className="text-[11px] font-mono text-slate-500">
                                {repItem.links} links created · {repItem.conversions} conversions
                              </p>
                            </div>
                          </div>
                          <span className="rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 text-xs font-mono font-bold">
                            {repItem.conversion_rate}% Conv
                          </span>
                        </div>

                        {/* Relative performance capsule bar */}
                        <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-600 rounded-full"
                            style={{ width: `${Math.min(repItem.conversion_rate, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Surface>
          </div>

          {/* 5. PERSONALIZATION LIFT REPORT (when lift is measured) */}
          {liftReport && liftReport.personalized_sessions > 0 && liftReport.rules.length > 0 && (
            <Surface className="p-6 md:p-8 space-y-6 rounded-3xl border border-slate-200/90 bg-white shadow-xs hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-sans tracking-tight">Per-rule lift telemetry</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Conversion rate of personalized visitors vs unmatched visitors per rule
                  </p>
                </div>
                <span className="rounded-full bg-[#165B40] text-white px-3 py-1 text-xs font-mono font-bold">
                  {liftReport.rules.length} Rules Measured
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {liftReport.rules.map((rule) => (
                  <div
                    key={rule.rule_id}
                    className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-3 hover:bg-white hover:border-slate-300 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold font-sans text-slate-900">{rule.signal_type}</span>
                      <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full border ${
                        rule.lift_pp > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>
                        {rule.lift_pp > 0 ? `+${rule.lift_pp}pp` : `${rule.lift_pp}pp`}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] font-mono text-slate-500">
                      <span>Personalized: <strong className="text-slate-900">{rule.personalized_rate}%</strong> ({rule.personalized_sessions})</span>
                      <span>Baseline: <strong className="text-slate-600">{rule.baseline_rate}%</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </Surface>
          )}

          {/* 6. RECENT ACTIVITY LIVE STREAM */}
          <Surface className="p-6 md:p-8 space-y-6 rounded-3xl border border-slate-200/90 bg-white shadow-xs hover:shadow-md transition-all duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                  <Activity className="w-4 h-4 text-[#165B40] animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-sans tracking-tight">Live signal stream</h3>
                  <p className="text-xs text-slate-500">Real-time personalized sessions recorded by runtime</p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-1 text-[11px] font-mono font-bold">
                STREAMING
              </span>
            </div>

            {recentEvents.length === 0 ? (
              <div className="py-8 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
                <p className="text-xs font-mono text-slate-400">No analytics activity logged.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentEvents.slice(0, 8).map((evt) => (
                  <div
                    key={evt.id}
                    className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/40 hover:bg-white hover:border-slate-300 hover:shadow-2xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 shrink-0" />
                      <div>
                        <span className="text-xs font-bold text-slate-900 font-sans">{evt.prospect_name}</span>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-mono uppercase text-slate-700">
                            {evt.event_type}
                          </span>
                          <span className="text-[11px] font-mono text-slate-500">
                            Signal: {evt.signal_type}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 self-end sm:self-auto shrink-0">
                      {new Date(evt.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Surface>
        </>
      )}
    </div>
  );
}
