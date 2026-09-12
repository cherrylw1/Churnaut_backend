'use client';

import React, { useState, useEffect } from 'react';
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
import { MetricCard } from '@/components/dashboard/MetricCard';
import { DataTable } from '@/components/dashboard/DataTable';
import { SectionHeader } from '@/components/dashboard/SectionHeader';

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
    return <div className="text-center py-12 text-[var(--text-muted)] font-mono text-sm bg-[var(--bg-base)] text-[var(--text-primary)] min-h-screen">RETRIEVING ANALYTICS...</div>;
  }

  if (error) {
    return (
      <div className="py-12 bg-[var(--bg-base)] min-h-screen">
        <ErrorState message={error} onRetry={fetchAnalytics} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-12 bg-[var(--bg-base)] min-h-screen">
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

  return (
    <div className="mx-auto w-full max-w-[1560px] space-y-6 bg-[var(--bg-base)] text-[var(--text-primary)] min-h-screen">
      <PageHeader eyebrow="Measure impact" title="Analytics" description="Understand which signals, rules, and links are moving the pipeline." />

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
          {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Links created (MTD)" value={<CountUp value={summaryStats.totalLinksCreatedThisMonth} />} detail="Active tracked links" />
        <MetricCard label="Click events (MTD)" value={<CountUp value={summaryStats.totalClicksThisMonth} />} detail="Engagement captured" />
        <MetricCard label="Trigger rate" value={<CountUp value={summaryStats.personalizationTriggerRate} suffix="%" />} detail="Personalized sessions" emphasis="primary" />
        <MetricCard label="Overall conversion" value={<CountUp value={summaryStats.overallConversionRate} suffix="%" />} detail="Converted sessions" />
      </div>

      {/* Visual Graphs Row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Line Chart: Daily personalization volume */}
        <Surface tone="subtle" className="lg:col-span-3 p-5 space-y-4">
          <SectionHeader title="Personalization volume" description="Past 30 days" />
          <div className="h-64">
            {mounted && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={dailyVolume}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis
                    dataKey="date"
                    stroke="#4b5563"
                    fontSize={10}
                    tickLine={false}
                    fontFamily="monospace"
                  />
                  <YAxis
                    stroke="#4b5563"
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
                    type="monotone"
                    dataKey="count"
                    name="Personalization Triggers"
                    stroke="#C2683D"
                    strokeWidth={2}
                    activeDot={{ r: 6 }}
                    dot={{ r: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Surface>

        {/* Bar Chart: Signal Breakdown comparison */}
        <Surface tone="subtle" className="lg:col-span-2 p-5 space-y-4">
          <SectionHeader title="Signal conversion" description="Links compared with conversions" />
          <div className="h-64">
            {mounted && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={signalBreakdown}
                  margin={{ top: 10, right: 5, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis
                    dataKey="signal"
                    stroke="#4b5563"
                    fontSize={10}
                    tickLine={false}
                    fontFamily="monospace"
                  />
                  <YAxis
                    stroke="#4b5563"
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
                  <Bar dataKey="links" name="Links" fill="#C2683D" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="conversions" name="Conversions" fill="var(--green)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Surface>
      </div>

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
          <div className="grid grid-cols-3 gap-4">
            <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 rounded-lg text-center">
              <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider mb-1">Personalized</p>
              <p className="text-2xl font-bold font-mono text-[var(--text-primary)]">{liftReport.personalized_rate}%</p>
              <p className="text-[10px] font-mono text-[var(--text-muted)] mt-1">{liftReport.personalized_sessions} sessions</p>
            </div>
            <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 rounded-lg text-center">
              <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider mb-1">Baseline</p>
              <p className="text-2xl font-bold font-mono text-[var(--text-secondary)]">{liftReport.baseline_rate}%</p>
              <p className="text-[10px] font-mono text-[var(--text-muted)] mt-1">{liftReport.unpersonalized_sessions} sessions</p>
            </div>
            <div className={`border p-4 rounded-lg text-center ${liftReport.overall_lift_pp > 0 ? 'border-[var(--green)]/30 bg-[var(--green)]/10' : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'}`}>
              <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider mb-1">Lift</p>
              <p className={`text-2xl font-bold font-mono ${liftReport.overall_lift_pp > 0 ? 'text-[var(--green)]' : 'text-[var(--text-secondary)]'}`}>
                {liftReport.overall_lift_pp > 0 ? '+' : ''}{liftReport.overall_lift_pp}pp
              </p>
              <p className="text-[10px] font-mono text-[var(--text-muted)] mt-1">percentage points</p>
            </div>
          </div>

          {/* Per-rule lift table */}
          {liftReport.rules.length > 0 && (
            <div className="overflow-x-auto">
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
