'use client';

import React, { useState, useEffect } from 'react';
import { toast } from '@/hooks/useToast';
import UpgradeGate from '@/components/UpgradeGate';


interface AnomalyAlert {
  id: string;
  alert_text: string;
  severity: 'info' | 'warning' | 'critical';
  created_at: string;
}

interface WeeklyDigest {
  id: string;
  week_start: string;
  summary: string;
  top_signal: string;
  rep_spotlight: string;
  recommendation: string;
  created_at: string;
}

export default function AiInsightsPage() {
  const [plan, setPlan] = useState<string>('starter');
  const [alerts, setAlerts] = useState<AnomalyAlert[]>([]);
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [loadingDigest, setLoadingDigest] = useState(true);
  const [runningDetection, setRunningDetection] = useState(false);
  const [generatingDigest, setGeneratingDigest] = useState(false);

  // Fetch unread alerts
  const fetchAlerts = async () => {
    try {
      setLoadingAlerts(true);
      const res = await fetch('/api/ai/anomaly');
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
      }
    } catch (err) {
      console.error('Failed to load anomaly alerts:', err);
    } finally {
      setLoadingAlerts(false);
    }
  };

  // Fetch latest weekly digest
  const fetchDigest = async () => {
    try {
      setLoadingDigest(true);
      const res = await fetch('/api/ai/digest');
      if (res.ok) {
        const data = await res.json();
        setDigest(data.digest || null);
      }
    } catch (err) {
      console.error('Failed to load weekly digest:', err);
    } finally {
      setLoadingDigest(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    fetchDigest();
  }, []);

  useEffect(() => {
    fetch('/api/client')
      .then(res => res.json())
      .then(data => { if (data.client?.plan) setPlan(data.client.plan); })
      .catch(() => {});
  }, []);

  // Run Anomaly Detection
  const handleRunDetection = async () => {
    if (runningDetection) return;
    setRunningDetection(true);
    try {
      const res = await fetch('/api/ai/anomaly?run=true');
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
        toast.success('Anomaly detection scan complete');
      } else {
        toast.error('Failed to execute anomaly detection.');
      }
    } catch (err) {
      console.error('Error running detection:', err);
      toast.error('An error occurred during anomaly detection.');
    } finally {
      setRunningDetection(false);
    }
  };

  // Mark alert as read
  const handleMarkAsRead = async (id: string) => {
    try {
      const res = await fetch('/api/ai/anomaly', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        // Remove from list
        setAlerts((prev) => prev.filter((a) => a.id !== id));
      }
    } catch (err) {
      console.error('Error marking alert as read:', err);
    }
  };

  // Generate Weekly Digest
  const handleGenerateDigest = async () => {
    if (generatingDigest) return;
    setGeneratingDigest(true);
    try {
      const res = await fetch('/api/ai/digest', {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setDigest(data.digest || null);
        toast.success('Weekly digest generated successfully');
      } else {
        toast.error('Failed to generate weekly digest.');
      }
    } catch (err) {
      console.error('Error generating digest:', err);
      toast.error('An error occurred while compiling digest.');
    } finally {
      setGeneratingDigest(false);
    }
  };

  // Helper for severity color mapping
  const getSeverityStyles = (severity: string) => {
    if (severity === 'critical') {
      return 'text-red-400 bg-red-950/20 border-red-900/50';
    }
    if (severity === 'warning') {
      return 'text-yellow-400 bg-yellow-950/20 border-yellow-900/50';
    }
    return 'text-blue-400 bg-blue-950/20 border-blue-900/50';
  };

  if (plan === 'starter') {
    return (
      <div className="p-6">
        <UpgradeGate
          feature="AI Revenue Insights"
          description="Weekly pipeline digests and anomaly detection — delivered automatically every Monday. Know what changed in your pipeline before your Monday standup."
          requiredPlan="growth"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header Brand */}
      <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-wider font-mono">AI REVENUE INSIGHTS</h1>
          <p className="text-xs font-mono text-gray-400 mt-1">Autonomous performance digests and routing rule anomaly detection</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left / Middle: Weekly Digest Panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-4">
              <div className="space-y-1">
                <h2 className="text-sm font-bold tracking-wider font-mono text-[#6366f1] uppercase">WEEKLY INSIGHTS DIGEST</h2>
                {digest && (
                  <p className="text-[10px] font-mono text-gray-500">WEEK START: {digest.week_start}</p>
                )}
              </div>
              <button
                onClick={handleGenerateDigest}
                disabled={generatingDigest}
                className="bg-[#6366f1] hover:bg-[#5053e1] disabled:opacity-50 text-white font-mono text-xs py-2 px-4 rounded transition-all active:scale-[0.98]"
              >
                {generatingDigest ? 'COMPILING DIGEST...' : 'GENERATE DIGEST'}
              </button>
            </div>

            {loadingDigest ? (
              <div className="text-center py-16 text-gray-500 font-mono text-sm">RETRIEVING DIGEST...</div>
            ) : !digest ? (
              <div className="text-center py-16 border border-dashed border-[var(--border-subtle)] rounded-lg bg-[#080B0F]/30">
                <p className="text-sm font-mono text-gray-400">No digest compiled for this period.</p>
                <p className="text-xs font-mono text-gray-500 mt-1">Click the button above to run AI digest analysis.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Summary Card (Full span) */}
                <div className="md:col-span-2 border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 rounded-lg space-y-2">
                  <span className="text-[9px] font-mono text-[#6366f1] uppercase tracking-widest font-bold">THIS WEEK SUMMARY</span>
                  <p className="text-xs font-mono leading-relaxed text-[var(--text-primary)]">{digest.summary}</p>
                </div>

                {/* 2. Top Signal Card */}
                <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 rounded-lg space-y-2">
                  <span className="text-[9px] font-mono text-indigo-400 uppercase tracking-widest font-bold">TOP SIGNAL</span>
                  <p className="text-xs font-mono leading-relaxed text-[var(--text-primary)]">{digest.top_signal}</p>
                </div>

                {/* 3. Rep Spotlight Card */}
                <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 rounded-lg space-y-2">
                  <span className="text-[9px] font-mono text-green-400 uppercase tracking-widest font-bold">REP SPOTLIGHT</span>
                  <p className="text-xs font-mono leading-relaxed text-[var(--text-primary)]">{digest.rep_spotlight}</p>
                </div>

                {/* 4. Recommendation Card (Full span) */}
                <div className="md:col-span-2 border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 rounded-lg space-y-2">
                  <span className="text-[9px] font-mono text-indigo-400 uppercase tracking-widest font-bold">ACTIONABLE RECOMMENDATION</span>
                  <p className="text-xs font-mono leading-relaxed text-[var(--text-primary)]">{digest.recommendation}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Anomaly Alerts Panel */}
        <div className="space-y-4">
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-4">
              <h2 className="text-sm font-bold tracking-wider font-mono text-red-500 uppercase">ANOMALY ALERTS</h2>
              <button
                onClick={handleRunDetection}
                disabled={runningDetection}
                className="bg-red-950/20 border border-red-900/50 hover:bg-red-950/40 disabled:opacity-50 text-red-400 font-mono text-[10px] py-1.5 px-3 rounded transition-all"
              >
                {runningDetection ? 'SCANNING...' : 'RUN DETECTION'}
              </button>
            </div>

            {loadingAlerts ? (
              <div className="text-center py-12 text-gray-500 font-mono text-xs">SCANNING ALERTS...</div>
            ) : alerts.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-[var(--border-subtle)] rounded-lg bg-[#080B0F]/30">
                <p className="text-xs font-mono text-gray-400">All systems operational.</p>
                <p className="text-[10px] font-mono text-gray-500 mt-1">No anomalies detected in the last 7 days.</p>
              </div>
            ) : (
              <div className="space-y-3.5 max-h-[500px] overflow-y-auto pr-1">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="border border-[var(--border-subtle)] bg-[#080B0F]/50 p-4 rounded-lg space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 border rounded ${getSeverityStyles(alert.severity)}`}>
                          {alert.severity}
                        </span>
                        <span className="text-[8px] font-mono text-gray-500">
                          {new Date(alert.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-gray-300 leading-normal">{alert.alert_text}</p>
                    </div>

                    <button
                      onClick={() => handleMarkAsRead(alert.id)}
                      className="w-full border border-[var(--border-subtle)] hover:border-gray-500 text-[10px] font-mono py-1 rounded text-gray-400 hover:text-white transition-colors"
                    >
                      Mark as Read
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
