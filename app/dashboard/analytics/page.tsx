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
import { BarChart3 } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Surface } from '@/components/dashboard/Surface';
import { DataTable } from '@/components/dashboard/DataTable';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { MetricCard } from '@/components/dashboard/MetricCard';

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
    return <div className="dashboard-analytics mx-auto w-full max-w-[1560px] space-y-6" role="status" aria-busy="true"><PageHeader eyebrow="Signal Field · Measurement" title="Analytics" description="Understand which signals, rules, and links are moving the pipeline." /><Surface className="flex min-h-48 items-center justify-center text-center text-sm uppercase tracking-[0.18em] text-[var(--text-muted)]">Retrieving measurement signals...</Surface></div>;
  }

  if (error) {
    return (
      <div className="dashboard-analytics mx-auto w-full max-w-[1560px] space-y-6"><PageHeader eyebrow="Signal Field · Measurement" title="Analytics" description="Understand which signals, rules, and links are moving the pipeline." /><ErrorState message={error} onRetry={fetchAnalytics} /></div>
    );
  }

  if (!data) {
    return (
      <div className="dashboard-analytics mx-auto w-full max-w-[1560px] space-y-6"><PageHeader eyebrow="Signal Field · Measurement" title="Analytics" description="Understand which signals, rules, and links are moving the pipeline." /><ErrorState message="Failed to fetch analytics metrics. Please ensure webhooks or resolve calls have been logged." onRetry={fetchAnalytics} /></div>
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

  return (
    <div className="dashboard-analytics mx-auto w-full max-w-[1560px] space-y-6 bg-[var(--bg-base)] text-[var(--text-primary)] min-h-screen">
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
      {/* Outcome telemetry */}
      <section aria-labelledby="outcome-telemetry-title" className="space-y-3">
        <SectionHeader headingId="outcome-telemetry-title" title="Outcome telemetry" description="The measures that tell you whether personalization is moving the pipeline." />
        {liftReport && liftReport.personalized_sessions > 0 ? (
          <Surface tone="elevated" className={`space-y-4 border-l-4 ${liftReport.overall_lift_pp > 0 ? 'border-l-[var(--green)]' : liftReport.overall_lift_pp < 0 ? 'border-l-[var(--red)]' : 'border-l-[var(--border-strong)]'}`}>
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="dashboard-eyebrow font-mono">MEASURED LIFT</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
                  {liftReport.overall_lift_pp > 0 ? 'Personalization is moving outcomes' : liftReport.overall_lift_pp < 0 ? 'Personalization is trailing baseline' : 'Measured lift is flat'}
                </h2>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">{Math.abs(liftReport.overall_lift_pp)} percentage points {liftReport.overall_lift_pp > 0 ? 'above' : liftReport.overall_lift_pp < 0 ? 'below' : 'against'} the unmatched visitor baseline.</p>
              </div>
              <span className={`font-mono text-3xl font-semibold ${liftReport.overall_lift_pp > 0 ? 'text-[var(--green)]' : liftReport.overall_lift_pp < 0 ? 'text-[var(--red)]' : 'text-[var(--text-muted)]'}`}>{liftReport.overall_lift_pp > 0 ? '+' : ''}{liftReport.overall_lift_pp}pp</span>
            </div>
          </Surface>
        ) : null}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <MetricCard
            label="Trigger Rate"
            value={<CountUp value={summaryStats.personalizationTriggerRate} suffix="%" />}
            detail="Personalized sessions"
            trend={14}
            emphasis="primary"
          />
          <MetricCard
            label="Conversion Rate"
            value={<CountUp value={summaryStats.overallConversionRate} suffix="%" />}
            detail="Converted sessions"
            trend={6}
          />
          <MetricCard
            label="Links Created"
            value={<CountUp value={summaryStats.totalLinksCreatedThisMonth} />}
            detail="This month"
            trend={10}
          />
          <MetricCard
            label="Click Events"
            value={<CountUp value={summaryStats.totalClicksThisMonth} />}
            detail="This month"
            trend={22}
          />
        </div>
      </section>

      {/* Visual Graphs Row */}
      <section aria-labelledby="signal-volume-title" className="space-y-3">
      <SectionHeader headingId="signal-volume-title" title="Signal volume" description="What moved across the last 30 days, and how each signal converted." />
      <Surface tone="subtle" className="dashboard-analytics-measurement-canvas grid grid-cols-1 gap-6 p-5 lg:grid-cols-5" aria-label="Analytics measurement canvas">
        {/* Line Chart: Daily personalization volume */}
        <div className="dashboard-analytics-chart-primary space-y-4 lg:col-span-3" role="group" aria-label="30-day personalization volume chart">
          <SectionHeader title="Personalization volume" description="Past 30 days" />
          <div className="h-64 min-w-0" role="img" aria-label="Line chart of personalization triggers over the past 30 days">
            {mounted && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={dailyVolume}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis
                    dataKey="date"
                    stroke="var(--text-muted)"
                    fontSize={10}
                    tickLine={false}
                    fontFamily="monospace"
                  />
                  <YAxis
                    stroke="var(--text-muted)"
                    fontSize={10}
                    tickLine={false}
                    fontFamily="monospace"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontSize: 11,
                    }}
                  />
                  <Line
                    isAnimationActive={!reduceMotion}
                    type="monotone"
                    dataKey="count"
                    name="Personalization Triggers"
                    stroke="#165B40"
                    strokeWidth={2.5}
                    activeDot={{ r: 6, fill: '#165B40' }}
                    dot={{ r: 3, fill: '#165B40' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Bar Chart: Signal Breakdown comparison */}
        <div className="dashboard-analytics-chart-secondary space-y-4 lg:col-span-2" role="group" aria-label="Signal conversion comparison chart">
          <SectionHeader title="Signal conversion" description="Links compared with conversions" />
          <div className="h-64 min-w-0" role="img" aria-label="Bar chart comparing signal links and conversions">
            {mounted && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={signalBreakdown}
                  margin={{ top: 10, right: 5, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis
                    dataKey="signal"
                    stroke="var(--text-muted)"
                    fontSize={10}
                    tickLine={false}
                    fontFamily="monospace"
                  />
                  <YAxis
                    stroke="var(--text-muted)"
                    fontSize={10}
                    tickLine={false}
                    fontFamily="monospace"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontSize: 11,
                    }}
                  />
                  <Legend
                    wrapperStyle={{
                      fontFamily: 'monospace',
                      fontSize: 10,
                      paddingTop: 10,
                    }}
                  />
                  <Bar isAnimationActive={!reduceMotion} dataKey="links" name="Links" fill="#165B40" radius={[6, 6, 0, 0]} />
                  <Bar isAnimationActive={!reduceMotion} dataKey="conversions" name="Conversions" fill="#10B981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </Surface>
      </section>

      {/* Tables Row: Rule Performance & Rep Conversion */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Rule Performance Table */}
        <Surface tone="subtle" className="p-5 space-y-4">
          <SectionHeader title="Rule conversion" description="Which rules are creating movement" />
          <DataTable label="Rule conversion performance">
            <table aria-label="Rule conversion performance" className="dashboard-table w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)] uppercase">
                  <th className="py-2 pb-3 font-normal">Rule</th>
                  <th className="py-2 pb-3 font-normal">Action Type</th>
                  <th className="py-2 pb-3 font-normal text-center">Triggers</th>
                  <th className="py-2 pb-3 font-normal text-center">Conversions</th>
                  <th className="py-2 pb-3 font-normal text-right">Conversion Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-secondary)]">
                {rulePerformance.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-[var(--text-muted)]">
                      No active rules mapped.
                    </td>
                  </tr>
                ) : (
                  rulePerformance.map((rule, idx) => (
                    <tr key={rule.rule_id || idx} className="hover:bg-[var(--border-subtle)]/10">
                      <td className="py-2.5 font-bold">
                        #{rule.priority} - {rule.signal_type}
                      </td>
                      <td className="py-2.5 text-[var(--text-secondary)]">
                        {
                          (
                            {
                              show_calendar: 'Show Rep Calendar',
                              inject_copy: 'Change Page Text',
                            } as Record<string, string>
                          )[rule.action_type] || rule.action_type
                        }
                      </td>
                      <td className="py-2.5 text-center">{rule.triggers}</td>
                      <td className="py-2.5 text-center text-[var(--green)]">{rule.conversions}</td>
                      <td className="py-2.5 text-right font-bold text-[var(--accent)]">
                        {rule.conversion_rate}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </DataTable>
        </Surface>

        {/* Right: Rep Performance Table */}
        <Surface tone="subtle" className="p-5 space-y-4">
          <SectionHeader title="Representative conversions" description="Links sent and outcomes" />
          <DataTable label="Representative conversion performance">
            <table aria-label="Representative conversion performance" className="dashboard-table w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)] uppercase">
                  <th className="py-2 pb-3 font-normal">Representative</th>
                  <th className="py-2 pb-3 font-normal text-center">Links Sent</th>
                  <th className="py-2 pb-3 font-normal text-center">Conversions</th>
                  <th className="py-2 pb-3 font-normal text-right">Conversion Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-secondary)]">
                {repPerformance.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-[var(--text-muted)]">
                      No representative links logged.
                    </td>
                  </tr>
                ) : (
                  repPerformance.map((repItem, idx) => (
                    <tr key={repItem.rep || idx} className="hover:bg-[var(--border-subtle)]/10">
                      <td className="py-2.5 font-bold">{repItem.rep}</td>
                      <td className="py-2.5 text-center">{repItem.links}</td>
                      <td className="py-2.5 text-center text-[var(--green)]">{repItem.conversions}</td>
                      <td className="py-2.5 text-right font-bold text-[var(--accent)]">
                        {repItem.conversion_rate}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </DataTable>
        </Surface>
      </div>

      {/* Personalization Lift Report */}
      {liftReport && liftReport.personalized_sessions > 0 && (
        <Surface tone="subtle" className="p-5 space-y-5">
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">Personalization lift</h2>
            <p className="text-[10px] font-mono text-[var(--text-muted)] mt-1">
              Conversion rate of personalized visitors vs unmatched visitors (control group)
            </p>
          </div>

          {/* Overall lift summary */}
          <div className="dashboard-analytics-comparison-band">
            <div>
              <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider mb-1">Personalized</p>
              <p className="text-2xl font-bold font-mono text-[var(--text-primary)]">{liftReport.personalized_rate}%</p>
              <p className="text-[10px] font-mono text-[var(--text-muted)] mt-1">{liftReport.personalized_sessions} sessions</p>
            </div>
            <div>
              <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider mb-1">Baseline</p>
              <p className="text-2xl font-bold font-mono text-[var(--text-secondary)]">{liftReport.baseline_rate}%</p>
              <p className="text-[10px] font-mono text-[var(--text-muted)] mt-1">{liftReport.unpersonalized_sessions} sessions</p>
            </div>
            <div className={liftReport.overall_lift_pp > 0 ? 'dashboard-analytics-lift-positive' : 'dashboard-analytics-lift-neutral'}>
              <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider mb-1">Lift</p>
              <p className={`text-2xl font-bold font-mono ${liftReport.overall_lift_pp > 0 ? 'text-[var(--green)]' : 'text-[var(--text-secondary)]'}`}>
                {liftReport.overall_lift_pp > 0 ? '+' : ''}{liftReport.overall_lift_pp}pp
              </p>
              <p className="text-[10px] font-mono text-[var(--text-muted)] mt-1">percentage points</p>
            </div>
          </div>

          {/* Per-rule lift table */}
          {liftReport.rules.length > 0 && (
            <div className="dashboard-table-wrap dashboard-analytics-table-scroll" role="region" aria-label="Per-rule lift performance">
              <table className="dashboard-table w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="py-2 pr-4 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-normal">Signal</th>
                    <th className="py-2 pr-4 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-normal">Action</th>
                    <th className="py-2 pr-4 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-normal text-right">Personalized</th>
                    <th className="py-2 pr-4 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-normal text-right">Baseline</th>
                    <th className="py-2 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-normal text-right">Lift</th>
                  </tr>
                </thead>
                <tbody>
                  {liftReport.rules.map((rule, idx) => (
                    <tr key={rule.rule_id} className={idx < liftReport.rules.length - 1 ? 'border-b border-[var(--border-subtle)]/50' : ''}>
                      <td className="py-2.5 pr-4 text-[var(--text-primary)]">{rule.signal_type}</td>
                      <td className="py-2.5 pr-4 text-[var(--text-secondary)]">{rule.action_type}</td>
                      <td className="py-2.5 pr-4 text-[var(--text-primary)] text-right">{rule.personalized_rate}% <span className="text-[var(--text-muted)]">({rule.personalized_sessions})</span></td>
                      <td className="py-2.5 pr-4 text-[var(--text-secondary)] text-right">{rule.baseline_rate}%</td>
                      <td className={`py-2.5 text-right font-bold ${rule.lift_pp > 0 ? 'text-[var(--green)]' : rule.lift_pp < 0 ? 'text-[var(--red)]' : 'text-[var(--text-muted)]'}`}>
                        {rule.lift_pp > 0 ? '+' : ''}{rule.lift_pp}pp
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Surface>
      )}

      {/* Bottom Table: Recent Activity Log */}
      <Surface tone="subtle" className="p-5 space-y-4">
        <SectionHeader title="Recent activity" description="The latest personalized sessions" />
        <DataTable label="Recent analytics activity">
          <table aria-label="Recent analytics activity" className="dashboard-table w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)] uppercase">
                <th className="py-2 pb-3 font-normal">Prospect Name</th>
                <th className="py-2 pb-3 font-normal">Action Type</th>
                <th className="py-2 pb-3 font-normal">Signal Context</th>
                <th className="py-2 pb-3 font-normal text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-secondary)]">
              {recentEvents.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-[var(--text-muted)]">
                    No analytics activity logged.
                  </td>
                </tr>
              ) : (
                recentEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-[var(--border-subtle)]/10">
                    <td className="py-2.5 font-bold">{evt.prospect_name}</td>
                    <td className="py-2.5">
                      <span className="px-2 py-0.5 bg-[var(--border-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)] rounded uppercase text-[10px]">
                        {evt.event_type}
                      </span>
                    </td>
                    <td className="py-2.5 text-[var(--text-secondary)]">{evt.signal_type}</td>
                    <td className="py-2.5 text-right text-[var(--text-muted)]">
                      {new Date(evt.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DataTable>
      </Surface>
      </>)}
    </div>
  );
}
