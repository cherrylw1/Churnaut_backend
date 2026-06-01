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
  recentEvents: RecentEvent[];
  repPerformance: RepPerformance[];
  dailyVolume: DailyVolume[];
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/analytics');
        if (res.ok) {
          const resData = await res.json();
          setData(resData);
        }
      } catch (err) {
        console.error('Failed to load analytics data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  if (loading) {
    return <div className="text-center py-12 text-gray-500 font-mono text-sm bg-[var(--bg-base)] text-[var(--text-primary)] min-h-screen">RETRIEVING ANALYTICS...</div>;
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-gray-500 font-mono text-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-lg text-[var(--text-primary)]">
        Failed to fetch analytics metrics. Please ensure webhooks or resolve calls have been logged.
      </div>
    );
  }

  const {
    summaryStats,
    signalBreakdown,
    rulePerformance,
    recentEvents,
    repPerformance,
    dailyVolume,
  } = data;

  return (
    <div className="space-y-6 bg-[var(--bg-base)] text-[var(--text-primary)] min-h-screen">
      {/* Top Header */}
      <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-wider font-mono">ANALYTICS SYSTEM</h1>
          <p className="text-xs font-mono text-gray-400 mt-1">Real-time performance metrics and signal conversions logs</p>
        </div>
      </div>

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
              CRMs Synced
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
                      <td className="py-2.5 text-gray-400">{rule.action_type}</td>
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
    </div>
  );
}
