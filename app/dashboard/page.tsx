'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Zap,
  RefreshCw,
  ArrowRight,
  Activity,
  PlusCircle,
  Link2,
} from 'lucide-react';

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

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningScout, setRunningScout] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const fetchSummary = async () => {
    try {
      const res = await fetch('/api/dashboard/summary');
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error('Failed to fetch dashboard summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
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
      } else {
        alert('Failed to execute Scout AI analysis.');
      }
    } catch (err) {
      console.error('Error running Scout analysis:', err);
      alert('An error occurred during Scout analysis.');
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

  const getStatusColorClass = (status: string) => {
    if (status === 'HEALTHY') return 'text-green-500';
    if (status === 'NEEDS ATTENTION') return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto text-gray-300">
      {/* SECTION 1: HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-wider font-mono text-white">
            {getGreeting()}, Churnaut.
          </h1>
          <p className="text-xs font-mono text-gray-400 mt-1">
            {"Here's your pipeline and personalization summary."}
          </p>
        </div>
        {lastUpdated && (
          <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">
            Last Updated: {lastUpdated}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500 font-mono text-sm tracking-wider">
          RETRIEVING DASHBOARD DATA SUMMARY...
        </div>
      ) : (
        <div className="space-y-8">
          {/* SECTION 2: KEY STATS */}
          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Stat 1: Pipeline Pressure */}
              <div className="border border-[#1a1f2e] bg-[#0d1117]/30 p-5 rounded-lg flex flex-col justify-between h-28 font-mono relative overflow-hidden">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                  Pipeline Pressure
                </div>
                <div className="flex items-baseline justify-between mt-auto">
                  <span className="text-4xl font-extrabold text-white">
                    {summary.pressure_score}
                  </span>
                  <span className={`text-xs font-bold uppercase ${getStatusColorClass(summary.pipeline_status)}`}>
                    {summary.pipeline_status}
                  </span>
                </div>
              </div>

              {/* Stat 2: Active Rules */}
              <div className="border border-[#1a1f2e] bg-[#0d1117]/30 p-5 rounded-lg flex flex-col justify-between h-28 font-mono">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                  Active Rules
                </div>
                <div className="mt-auto">
                  <span className="text-4xl font-extrabold text-white">
                    {summary.active_rules_count}
                  </span>
                </div>
              </div>

              {/* Stat 3: Tracked Links */}
              <div className="border border-[#1a1f2e] bg-[#0d1117]/30 p-5 rounded-lg flex flex-col justify-between h-28 font-mono">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                  Tracked Links
                </div>
                <div className="mt-auto">
                  <span className="text-4xl font-extrabold text-white">
                    {summary.tracked_links_count}
                  </span>
                </div>
              </div>

              {/* Stat 4: Sessions This Week */}
              <div className="border border-[#1a1f2e] bg-[#0d1117]/30 p-5 rounded-lg flex flex-col justify-between h-28 font-mono">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                  Sessions This Week
                </div>
                <div className="mt-auto">
                  <span className="text-4xl font-extrabold text-white">
                    {summary.sessions_this_week}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: SCOUT INBOX */}
          {summary && (
            <div className="border border-[#1a1f2e] border-l-4 border-l-amber-500 bg-[#0d1117]/40 rounded-lg p-5 font-mono relative">
              <div className="flex items-center gap-2 text-white font-bold tracking-wider uppercase text-xs">
                <Zap className="text-amber-500 w-4 h-4 fill-amber-500/20" />
                SCOUT INBOX — TODAY
              </div>

              <div className="mt-4 space-y-2 text-xs text-gray-400">
                {!summary.scout_inbox.has_red_deals ? (
                  <p className="text-gray-500 italic">No urgent items today.</p>
                ) : (
                  <>
                    {summary.scout_inbox.top_red_deal && (
                      <p className="flex items-start gap-2">
                        <span className="text-amber-500/80">•</span>
                        <span>
                          <strong className="text-white">RED Deal Attention:</strong> {summary.scout_inbox.top_red_deal.deal_name} - {summary.scout_inbox.top_red_deal.next_action}
                        </span>
                      </p>
                    )}
                    {summary.scout_inbox.top_rep && (
                      <p className="flex items-start gap-2">
                        <span className="text-amber-500/80">•</span>
                        <span>
                          <strong className="text-white">Sales Representative Alert:</strong> {summary.scout_inbox.top_rep.rep_name} has {summary.scout_inbox.top_rep.count} RED deals.
                        </span>
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="flex justify-end mt-4">
                <Link
                  href="/dashboard/scout"
                  className="text-[10px] text-[#6366f1] hover:text-[#5053e1] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors"
                >
                  View full Scout analysis <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          )}

          {/* SECTION 4: RECENT ACTIVITY */}
          {summary && (
            <div className="border border-[#1a1f2e] bg-[#0d1117]/15 rounded-lg p-5 font-mono">
              <div className="flex items-center gap-2 text-white font-bold tracking-wider uppercase text-xs border-b border-[#1a1f2e] pb-3">
                <Activity className="text-indigo-400 w-4 h-4" />
                RECENT ACTIVITY
              </div>

              {summary.recent_activity.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-500">
                  No recent activities recorded.
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#1a1f2e] text-gray-500 uppercase text-[9px] tracking-widest">
                        <th className="pb-2 font-medium">Event Type</th>
                        <th className="pb-2 font-medium">Signal</th>
                        <th className="pb-2 font-medium text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1a1f2e]/40">
                      {summary.recent_activity.map((event, idx) => (
                        <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-2.5 font-medium text-white">{event.event_type}</td>
                          <td className="py-2.5 text-gray-400">
                            {event.signal_type || 'N/A'}
                          </td>
                          <td className="py-2.5 text-right text-gray-500">
                            {formatRelativeTime(event.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-end mt-4">
                <Link
                  href="/dashboard/analytics"
                  className="text-[10px] text-[#6366f1] hover:text-[#5053e1] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors"
                >
                  View full analytics <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          )}

          {/* SECTION 5: QUICK ACTIONS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link
              href="/dashboard/links"
              className="border border-[#1a1f2e] bg-[#0d1117]/35 hover:bg-[#161b22]/40 p-4 rounded-lg flex items-center justify-between font-mono text-xs font-bold text-white transition-all hover:-translate-y-0.5"
            >
              <span>CREATE TRACKED LINK</span>
              <Link2 className="w-4 h-4 text-indigo-400" />
            </Link>

            <Link
              href="/dashboard/rules"
              className="border border-[#1a1f2e] bg-[#0d1117]/35 hover:bg-[#161b22]/40 p-4 rounded-lg flex items-center justify-between font-mono text-xs font-bold text-white transition-all hover:-translate-y-0.5"
            >
              <span>ADD ROUTING RULE</span>
              <PlusCircle className="w-4 h-4 text-indigo-400" />
            </Link>

            <button
              onClick={handleRunScout}
              disabled={runningScout}
              className="border border-[#1a1f2e] bg-[#0d1117]/35 hover:bg-[#161b22]/40 p-4 rounded-lg flex items-center justify-between font-mono text-xs font-bold text-white transition-all hover:-translate-y-0.5 disabled:opacity-50 text-left"
            >
              <span>{runningScout ? 'RUNNING...' : 'RUN SCOUT ANALYSIS'}</span>
              <RefreshCw className={`w-4 h-4 text-indigo-400 ${runningScout ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
