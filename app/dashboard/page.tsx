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
import { supabaseBrowser } from '@/lib/supabase';
import CountUp from '@/components/ui/CountUp';
import Skeleton from '@/components/ui/Skeleton';
import { motion } from 'framer-motion';

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
  const [firstName, setFirstName] = useState<string>('');

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
    if (status === 'HEALTHY') return 'text-[var(--green)]';
    if (status === 'NEEDS ATTENTION') return 'text-[var(--amber)]';
    return 'text-[var(--red)]';
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto text-[var(--text-secondary)] font-sans">
      {/* SECTION 1: HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-[28px] font-bold text-[var(--text-primary)] leading-tight">
            {getGreeting()}{firstName ? `, ${firstName}.` : '.'}
          </h1>
          <p className="text-[15px] text-[var(--text-secondary)] mt-1">
            {"Here's your pipeline and personalization summary."}
          </p>
        </div>
        {lastUpdated && (
          <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest">
            Last Updated: {lastUpdated}
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-8 animate-pulse">
          {/* Skeleton stats grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Skeleton variant="card" height={112} />
            <Skeleton variant="card" height={112} />
            <Skeleton variant="card" height={112} />
            <Skeleton variant="card" height={112} />
          </div>
          {/* Skeleton inbox */}
          <Skeleton variant="card" height={150} />
          {/* Skeleton activity */}
          <Skeleton variant="card" height={220} />
        </div>
      ) : (
        <div className="space-y-8">
          {/* SECTION 2: KEY STATS */}
          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Stat 1: Pipeline Pressure */}
              <div className="stat-card border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 py-5 rounded-[12px] flex flex-col justify-between h-28">
                <div className="text-[12px] text-[var(--text-muted)] uppercase font-semibold tracking-wider">
                  Pipeline Pressure
                </div>
                <div className="flex items-baseline justify-between mt-auto">
                  <span className="text-[32px] font-bold text-[var(--text-primary)] leading-none font-sans">
                    <CountUp value={summary.pressure_score} />
                  </span>
                  <span className={`text-[12px] font-bold uppercase ${getStatusColorClass(summary.pipeline_status)}`}>
                    {summary.pipeline_status}
                  </span>
                </div>
              </div>

              {/* Stat 2: Active Rules */}
              <div className="stat-card border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 py-5 rounded-[12px] flex flex-col justify-between h-28">
                <div className="text-[12px] text-[var(--text-muted)] uppercase font-semibold tracking-wider">
                  Active Rules
                </div>
                <div className="mt-auto">
                  <span className="text-[32px] font-bold text-[var(--text-primary)] leading-none font-sans">
                    <CountUp value={summary.active_rules_count} />
                  </span>
                </div>
              </div>

              {/* Stat 3: Tracked Links */}
              <div className="stat-card border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 py-5 rounded-[12px] flex flex-col justify-between h-28">
                <div className="text-[12px] text-[var(--text-muted)] uppercase font-semibold tracking-wider">
                  Tracked Links
                </div>
                <div className="mt-auto">
                  <span className="text-[32px] font-bold text-[var(--text-primary)] leading-none font-sans">
                    <CountUp value={summary.tracked_links_count} />
                  </span>
                </div>
              </div>

              {/* Stat 4: Sessions This Week */}
              <div className="stat-card border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 py-5 rounded-[12px] flex flex-col justify-between h-28">
                <div className="text-[12px] text-[var(--text-muted)] uppercase font-semibold tracking-wider">
                  Sessions This Week
                </div>
                <div className="mt-auto">
                  <span className="text-[32px] font-bold text-[var(--text-primary)] leading-none font-sans">
                    <CountUp value={summary.sessions_this_week} />
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: SCOUT INBOX */}
          {summary && (
            <div className="card border border-[var(--border-subtle)] border-l-[3px] border-l-[var(--amber)] bg-[var(--bg-elevated)] rounded-[12px] p-5">
              <div className="flex items-center gap-2 text-[var(--text-primary)] font-bold tracking-wider uppercase text-[12px]">
                <Zap className="text-[var(--amber)] w-4 h-4 fill-[var(--amber)]/20" />
                SCOUT INBOX — TODAY
              </div>

              <div className="mt-4 space-y-2 text-[14px] text-[var(--text-secondary)]">
                {!summary.scout_inbox.has_red_deals ? (
                  <p className="text-[var(--text-muted)] italic">No urgent items today.</p>
                ) : (
                  <>
                    {summary.scout_inbox.top_red_deal && (
                      <p className="flex items-start gap-2">
                        <span className="text-[var(--amber)]">•</span>
                        <span>
                          <strong className="text-[var(--text-primary)]">RED Deal Attention:</strong> {summary.scout_inbox.top_red_deal.deal_name} - {summary.scout_inbox.top_red_deal.next_action}
                        </span>
                      </p>
                    )}
                    {summary.scout_inbox.top_rep && (
                      <p className="flex items-start gap-2">
                        <span className="text-[var(--amber)]">•</span>
                        <span>
                          <strong className="text-[var(--text-primary)]">Sales Representative Alert:</strong> {summary.scout_inbox.top_rep.rep_name} has {summary.scout_inbox.top_rep.count} RED deals.
                        </span>
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="flex justify-end mt-4">
                <Link
                  href="/dashboard/scout"
                  className="text-[12px] text-[var(--accent)] hover:text-[var(--accent-hover)] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors font-mono"
                >
                  View full Scout analysis <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}

          {/* SECTION 4: RECENT ACTIVITY */}
          {summary && (
            <div className="card border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 rounded-[12px]">
              <div className="flex items-center gap-2 text-[var(--text-primary)] font-bold tracking-wider uppercase text-[12px] border-b border-[var(--border-subtle)] pb-3">
                <Activity className="text-[var(--accent)] w-4 h-4" />
                RECENT ACTIVITY
              </div>

              {summary.recent_activity.length === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--text-muted)] font-mono">
                  No recent activities recorded.
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase text-[9px] tracking-widest">
                        <th className="pb-2 font-medium">Event Type</th>
                        <th className="pb-2 font-medium">Signal</th>
                        <th className="pb-2 font-medium text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]/40">
                      {summary.recent_activity.map((event, idx) => (
                        <tr key={idx} className="hover:bg-[var(--bg-elevated)] transition-colors">
                          <td className="py-2.5 font-medium text-[var(--text-primary)] font-sans">{event.event_type}</td>
                          <td className="py-2.5 text-[var(--text-secondary)] font-mono">
                            {event.signal_type || 'N/A'}
                          </td>
                          <td className="py-2.5 text-right text-[var(--text-muted)] font-mono">
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
                  className="text-[12px] text-[var(--accent)] hover:text-[var(--accent-hover)] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors font-mono"
                >
                  View full analytics <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}

          {/* SECTION 5: QUICK ACTIONS */}
          <motion.div 
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
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
                className="card border border-[var(--border-default)] bg-transparent hover:bg-[var(--bg-elevated)] p-4.5 rounded-[8px] flex items-center justify-between font-sans text-[14px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all w-full h-full"
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
                className="card border border-[var(--border-default)] bg-transparent hover:bg-[var(--bg-elevated)] p-4.5 rounded-[8px] flex items-center justify-between font-sans text-[14px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all w-full h-full"
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
                className="card border border-[var(--border-default)] bg-transparent hover:bg-[var(--bg-elevated)] p-4.5 rounded-[8px] flex items-center justify-between font-sans text-[14px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all disabled:opacity-50 text-left w-full h-full"
              >
                <span>{runningScout ? 'RUNNING...' : 'RUN SCOUT ANALYSIS'}</span>
                <RefreshCw className={`w-4 h-4 text-[var(--accent)] ${runningScout ? 'animate-spin' : ''}`} />
              </button>
            </motion.div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
