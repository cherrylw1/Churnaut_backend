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
    return <div className="text-center py-12 text-gray-500 font-mono text-sm bg-[var(--bg-base)] text-[var(--text-primary)] min-h-screen">RETRIEVING ANALYTICS...</div>;
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
    <div className="space-y-6 bg-[var(--bg-base)] text-[var(--text-primary)] min-h-screen">
      {/* Top Header */}
      <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-wider font-mono">ANALYTICS</h1>
          <p className="text-xs font-mono text-gray-400 mt-1">Real-time performance metrics and signal conversions logs</p>
        </div>
      </div>

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
        {/* Card 1 */}
        <div className="stat-card border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 rounded-lg flex flex-col justify-between space-y-2">
          <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">
            Links Created (MTD)
          </span>
          <div className="flex justify-between items-end">
            <span className="text-2xl font-bold font-mono text-white">
              <CountUp value={summaryStats.totalLinksCreatedThisMonth} />
            </span>
            <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950/20 px-2 py-0.5 rounded border border-indigo-900/40">
              Active
            </span>
          </div>
        </div>

        {/* Card 2 */}
        <div className="stat-card border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 rounded-lg flex flex-col justify-between space-y-2">
          <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">
            Click Events (MTD)
          </span>
          <div className="flex justify-between items-end">
            <span className="text-2xl font-bold font-mono text-white">
              <CountUp value={summaryStats.totalClicksThisMonth} />
            </span>
            <span className="text-[10px] font-mono text-green-400 bg-green-950/20 px-2 py-0.5 rounded border border-green-900/40">
              Engaged
            </span>
          </div>
        </div>

        {/* Card 3 */}
        <div className="stat-card border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 rounded-lg flex flex-col justify-between space-y-2">
          <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">
            Trigger Rate
          </span>
          <div className="flex justify-between items-end">
            <span className="text-2xl font-bold font-mono text-[#6366f1]">
              <CountUp value={summaryStats.personalizationTriggerRate} suffix="%" />
            </span>
            <span className="text-[9px] font-mono text-gray-500">
              Personalized
            </span>
          </div>
        </div>

        {/* Card 4 */}
        <div className="stat-card border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 rounded-lg flex flex-col justify-between space-y-2">
          <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">
            Overall Conversion
          </span>
          <div className="flex justify-between items-end">
            <span className="text-2xl font-bold font-mono text-[#10b981]">
              <CountUp value={summaryStats.overallConversionRate} suffix="%" />
            </span>
            <span className="text-[9px] font-mono text-gray-500">
              Converted
            </span>
          </div>
        </div>
      </div>

      {/* Visual Graphs Row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Line Chart: Daily personalization volume */}
        <div className="lg:col-span-3 border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 p-5 rounded-lg space-y-4">
          <h2 className="text-xs font-bold tracking-widest font-mono text-[#6366f1] uppercase">
            Personalization Volume (Past 30 Days)
          </h2>
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
                      color: '#ffffff',
                      fontFamily: 'monospace',
                      fontSize: 11,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Personalization Triggers"
                    stroke="#6366f1"
                    strokeWidth={2}
                    activeDot={{ r: 6 }}
                    dot={{ r: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Bar Chart: Signal Breakdown comparison */}
        <div className="lg:col-span-2 border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 p-5 rounded-lg space-y-4">
          <h2 className="text-xs font-bold tracking-widest font-mono text-[#6366f1] uppercase">
            Signal Conversion Comparison
          </h2>
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
                      color: '#ffffff',
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
                  <Bar dataKey="links" name="Links" fill="#6366f1" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="conversions" name="Conversions" fill="#10b981" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Tables Row: Rule Performance & Rep Conversion */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Rule Performance Table */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 p-5 rounded-lg space-y-4">
          <h2 className="text-xs font-bold tracking-widest font-mono text-gray-300 uppercase">
            Rule Conversion Triggers
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-gray-400 uppercase">
                  <th className="py-2 pb-3 font-normal">Rule</th>
                  <th className="py-2 pb-3 font-normal">Action Type</th>
                  <th className="py-2 pb-3 font-normal text-center">Triggers</th>
                  <th className="py-2 pb-3 font-normal text-center">Conversions</th>
                  <th className="py-2 pb-3 font-normal text-right">Conversion Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-gray-300">
                {rulePerformance.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-gray-500">
                      No active rules mapped.
                    </td>
                  </tr>
                ) : (
                  rulePerformance.map((rule, idx) => (
                    <tr key={rule.rule_id || idx} className="hover:bg-[var(--border-subtle)]/10">
                      <td className="py-2.5 font-bold">
                        #{rule.priority} - {rule.signal_type}
                      </td>
                      <td className="py-2.5 text-gray-400">
                        {
                          (
                            {
                              show_calendar: 'Show Rep Calendar',
                              show_short_form: 'Show Demo Request Form',
                              inject_copy: 'Change Page Text',
                              show_case_study: 'Show Case Study',
                              redirect: 'Send to Different Page'
                            } as Record<string, string>
                          )[rule.action_type] || rule.action_type
                        }
                      </td>
                      <td className="py-2.5 text-center">{rule.triggers}</td>
                      <td className="py-2.5 text-center text-green-400">{rule.conversions}</td>
                      <td className="py-2.5 text-right font-bold text-indigo-400">
                        {rule.conversion_rate}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Rep Performance Table */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 p-5 rounded-lg space-y-4">
          <h2 className="text-xs font-bold tracking-widest font-mono text-gray-300 uppercase">
            Representative Conversions
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-gray-400 uppercase">
                  <th className="py-2 pb-3 font-normal">Representative</th>
                  <th className="py-2 pb-3 font-normal text-center">Links Sent</th>
                  <th className="py-2 pb-3 font-normal text-center">Conversions</th>
                  <th className="py-2 pb-3 font-normal text-right">Conversion Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-gray-300">
                {repPerformance.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-gray-500">
                      No representative links logged.
                    </td>
                  </tr>
                ) : (
                  repPerformance.map((repItem, idx) => (
                    <tr key={repItem.rep || idx} className="hover:bg-[var(--border-subtle)]/10">
                      <td className="py-2.5 font-bold">{repItem.rep}</td>
                      <td className="py-2.5 text-center">{repItem.links}</td>
                      <td className="py-2.5 text-center text-green-400">{repItem.conversions}</td>
                      <td className="py-2.5 text-right font-bold text-indigo-400">
                        {repItem.conversion_rate}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Personalization Lift Report */}
      {liftReport && liftReport.personalized_sessions > 0 && (
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 p-5 rounded-lg space-y-5">
          <div>
            <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-white">Personalization Lift</h2>
            <p className="text-[10px] font-mono text-gray-500 mt-1">
              Conversion rate of personalized visitors vs unmatched visitors (control group)
            </p>
          </div>

          {/* Overall lift summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 rounded-lg text-center">
              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-1">Personalized</p>
              <p className="text-2xl font-bold font-mono text-white">{liftReport.personalized_rate}%</p>
              <p className="text-[10px] font-mono text-gray-600 mt-1">{liftReport.personalized_sessions} sessions</p>
            </div>
            <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 rounded-lg text-center">
              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-1">Baseline</p>
              <p className="text-2xl font-bold font-mono text-gray-400">{liftReport.baseline_rate}%</p>
              <p className="text-[10px] font-mono text-gray-600 mt-1">{liftReport.unpersonalized_sessions} sessions</p>
            </div>
            <div className={`border p-4 rounded-lg text-center ${liftReport.overall_lift_pp > 0 ? 'border-green-900/30 bg-green-950/10' : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'}`}>
              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-1">Lift</p>
              <p className={`text-2xl font-bold font-mono ${liftReport.overall_lift_pp > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                {liftReport.overall_lift_pp > 0 ? '+' : ''}{liftReport.overall_lift_pp}pp
              </p>
              <p className="text-[10px] font-mono text-gray-600 mt-1">percentage points</p>
            </div>
          </div>

          {/* Per-rule lift table */}
          {liftReport.rules.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="py-2 pr-4 text-[10px] text-gray-500 uppercase tracking-wider font-normal">Signal</th>
                    <th className="py-2 pr-4 text-[10px] text-gray-500 uppercase tracking-wider font-normal">Action</th>
                    <th className="py-2 pr-4 text-[10px] text-gray-500 uppercase tracking-wider font-normal text-right">Personalized</th>
                    <th className="py-2 pr-4 text-[10px] text-gray-500 uppercase tracking-wider font-normal text-right">Baseline</th>
                    <th className="py-2 text-[10px] text-gray-500 uppercase tracking-wider font-normal text-right">Lift</th>
                  </tr>
                </thead>
                <tbody>
                  {liftReport.rules.map((rule, idx) => (
                    <tr key={rule.rule_id} className={idx < liftReport.rules.length - 1 ? 'border-b border-[var(--border-subtle)]/50' : ''}>
                      <td className="py-2.5 pr-4 text-white">{rule.signal_type}</td>
                      <td className="py-2.5 pr-4 text-gray-400">{rule.action_type}</td>
                      <td className="py-2.5 pr-4 text-white text-right">{rule.personalized_rate}% <span className="text-gray-600">({rule.personalized_sessions})</span></td>
                      <td className="py-2.5 pr-4 text-gray-400 text-right">{rule.baseline_rate}%</td>
                      <td className={`py-2.5 text-right font-bold ${rule.lift_pp > 0 ? 'text-green-400' : rule.lift_pp < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                        {rule.lift_pp > 0 ? '+' : ''}{rule.lift_pp}pp
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Bottom Table: Recent Activity Log */}
      <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 p-5 rounded-lg space-y-4">
        <h2 className="text-xs font-bold tracking-widest font-mono text-gray-300 uppercase">
          Recent Activity Logs
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-gray-400 uppercase">
                <th className="py-2 pb-3 font-normal">Prospect Name</th>
                <th className="py-2 pb-3 font-normal">Action Type</th>
                <th className="py-2 pb-3 font-normal">Signal Context</th>
                <th className="py-2 pb-3 font-normal text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-gray-300">
              {recentEvents.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-gray-500">
                    No analytics activity logged.
                  </td>
                </tr>
              ) : (
                recentEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-[var(--border-subtle)]/10">
                    <td className="py-2.5 font-bold">{evt.prospect_name}</td>
                    <td className="py-2.5">
                      <span className="px-2 py-0.5 bg-[var(--border-subtle)] text-gray-300 border border-[var(--border-subtle)] rounded uppercase text-[10px]">
                        {evt.event_type}
                      </span>
                    </td>
                    <td className="py-2.5 text-gray-400">{evt.signal_type}</td>
                    <td className="py-2.5 text-right text-gray-500">
                      {new Date(evt.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>)}
    </div>
  );
}
