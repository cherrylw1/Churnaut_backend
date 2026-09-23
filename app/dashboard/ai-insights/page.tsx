'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Radar, Sparkles } from 'lucide-react';
import { toast } from '@/hooks/useToast';
import UpgradeGate from '@/components/UpgradeGate';
import { EmptyPanel } from '@/components/dashboard/EmptyPanel';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Surface } from '@/components/dashboard/Surface';

import { GeometricIcon } from '@/components/dashboard/ActiveCampaignsCard';

interface AnomalyAlert { id: string; alert_text: string; severity: 'info' | 'warning' | 'critical'; created_at: string }
interface WeeklyDigest { id: string; week_start: string; summary: string; top_signal: string; rep_spotlight: string; recommendation: string; created_at: string }

const severityTone = (severity: AnomalyAlert['severity']) => severity === 'critical' ? 'danger' : severity === 'warning' ? 'warning' : 'info';

export default function AiInsightsPage() {
  const [plan, setPlan] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [alerts, setAlerts] = useState<AnomalyAlert[]>([]);
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [loadingDigest, setLoadingDigest] = useState(true);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [digestError, setDigestError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [runningDetection, setRunningDetection] = useState(false);
  const [generatingDigest, setGeneratingDigest] = useState(false);

  const fetchAlerts = async () => {
    try {
      setLoadingAlerts(true);
      setAlertsError(null);
      const res = await fetch('/api/ai/anomaly');
      if (res.ok) { const data = await res.json(); setAlerts(data.alerts || []); }
      else { const data = await res.json().catch(() => ({})); setAlertsError(data.error || 'Unable to load anomaly alerts.'); }
    } catch (err) { console.error('Failed to load anomaly alerts:', err); setAlertsError('A network error occurred while loading anomaly alerts.'); }
    finally { setLoadingAlerts(false); }
  };

  const fetchDigest = async () => {
    try {
      setLoadingDigest(true);
      setDigestError(null);
      const res = await fetch('/api/ai/digest');
      if (res.ok) { const data = await res.json(); setDigest(data.digest || null); }
      else { const data = await res.json().catch(() => ({})); setDigestError(data.error || 'Unable to load the weekly briefing.'); }
    } catch (err) { console.error('Failed to load weekly digest:', err); setDigestError('A network error occurred while loading the weekly briefing.'); }
    finally { setLoadingDigest(false); }
  };

  useEffect(() => { fetchAlerts(); fetchDigest(); }, []);
  useEffect(() => {
    fetch('/api/client').then(res => res.json()).then(data => { setPlan(data.client?.plan || 'starter'); }).catch(() => { setPlan('starter'); }).finally(() => setPlanLoading(false));
  }, []);

  const handleRunDetection = async () => {
    if (runningDetection) return;
    setRunningDetection(true);
    setActionError(null);
    try {
      const res = await fetch('/api/ai/anomaly', { method: 'POST' });
      if (res.ok) { const data = await res.json(); setAlerts(data.alerts || []); toast.success('Anomaly detection scan complete'); }
      else { const data = await res.json().catch(() => ({})); setActionError(data.error || 'Failed to execute anomaly detection.'); toast.error('Failed to execute anomaly detection.'); }
    } catch (err) { console.error('Error running detection:', err); setActionError('An error occurred during anomaly detection.'); toast.error('An error occurred during anomaly detection.'); }
    finally { setRunningDetection(false); }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      const res = await fetch('/api/ai/anomaly', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      if (res.ok) setAlerts(prev => prev.filter(alert => alert.id !== id));
      else { setActionError('Unable to mark that alert as read.'); }
    } catch (err) { console.error('Error marking alert as read:', err); setActionError('Unable to mark that alert as read.'); }
  };

  const handleGenerateDigest = async () => {
    if (generatingDigest) return;
    setGeneratingDigest(true);
    setActionError(null);
    try {
      const res = await fetch('/api/ai/digest', { method: 'POST' });
      if (res.ok) { const data = await res.json(); setDigest(data.digest || null); toast.success('Weekly digest generated successfully'); }
      else { const data = await res.json().catch(() => ({})); setActionError(data.error || 'Failed to generate weekly digest.'); toast.error('Failed to generate weekly digest.'); }
    } catch (err) { console.error('Error generating digest:', err); setActionError('An error occurred while compiling digest.'); toast.error('An error occurred while compiling digest.'); }
    finally { setGeneratingDigest(false); }
  };

  if (planLoading) return <div className="dashboard-ai-insights dashboard-surface mx-auto flex min-h-48 max-w-6xl items-center justify-center text-sm uppercase tracking-[0.18em] text-[var(--text-muted)]" role="status" aria-busy="true">Loading workspace access...</div>;
  if (plan === 'starter') return <div className="dashboard-ai-insights p-6"><UpgradeGate feature="AI Revenue Insights" description="Weekly pipeline digests and anomaly detection — delivered automatically every Monday. Know what changed in your pipeline before your Monday standup." requiredPlan="growth" /></div>;

  return (
    <div className="dashboard-ai-insights space-y-8 max-w-6xl mx-auto">
      <PageHeader eyebrow="Signal Field · Intelligence brief" title="AI revenue insights" description="A weekly revenue briefing with a live watch on the signals that need attention." />

      {actionError ? <div role="alert" className="dashboard-ai-action-feedback rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{actionError}</div> : null}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* Weekly Briefing Bento Card */}
        <section className="dashboard-ai-briefing lg:col-span-3 space-y-4" aria-labelledby="weekly-briefing-heading">
          <Surface tone="elevated" className="dashboard-ai-briefing-canvas rounded-3xl border border-slate-200/90 bg-white p-6 md:p-8 space-y-6 shadow-xs hover:shadow-md transition-all duration-300">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <GeometricIcon type="flower" bg="bg-emerald-500" />
                <div>
                  <h2 id="weekly-briefing-heading" className="text-base font-bold text-slate-900 font-sans tracking-tight">Weekly briefing</h2>
                  <p className="text-xs text-slate-500 mt-0.5">The clearest read on what changed in your pipeline.</p>
                </div>
              </div>
              <button
                onClick={handleGenerateDigest}
                disabled={generatingDigest}
                className="dashboard-button-primary rounded-full !py-2 !px-4 text-xs font-semibold shadow-xs disabled:opacity-50 shrink-0"
              >
                {generatingDigest ? 'COMPILING...' : 'GENERATE DIGEST'}
              </button>
            </div>

            {digest ? <p className="text-[10px] text-slate-400 font-mono uppercase tracking-widest">Week of {digest.week_start}</p> : null}
            {loadingDigest ? (
              <div className="py-16 text-center text-slate-400 font-mono text-xs" role="status" aria-busy="true">Retrieving briefing...</div>
            ) : digestError ? (
              <div role="alert" className="mt-5 space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
                <p>{digestError}</p>
                <button type="button" onClick={fetchDigest} className="dashboard-button-secondary rounded-full !min-h-8 px-4 text-xs">TRY AGAIN</button>
              </div>
            ) : !digest ? (
              <EmptyPanel icon={<Sparkles className="w-5 h-5" />} title="No briefing compiled" description="Generate a digest to see the latest pipeline story and the next best action." />
            ) : (
              <div className="dashboard-ai-briefing-story mt-6 space-y-4">
                <div className="dashboard-ai-briefing-summary rounded-2xl border border-slate-200/80 bg-slate-50/70 p-5 md:p-6 hover:border-slate-300 transition-all" aria-label="This week summary">
                  <p className="dashboard-eyebrow font-mono text-[10px] text-slate-400 tracking-wider">THIS WEEK</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-800">{digest.summary}</p>
                </div>
                <div className="dashboard-ai-briefing-signals grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="dashboard-ai-briefing-signal rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs hover:border-slate-300 transition-all">
                    <p className="dashboard-eyebrow font-mono text-[10px] text-emerald-600 tracking-wider">TOP SIGNAL</p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-800">{digest.top_signal}</p>
                  </div>
                  <div className="dashboard-ai-briefing-signal rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs hover:border-slate-300 transition-all">
                    <p className="dashboard-eyebrow font-mono text-[10px] text-blue-600 tracking-wider">REP SPOTLIGHT</p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-800">{digest.rep_spotlight}</p>
                  </div>
                </div>
                <div className="dashboard-ai-briefing-recommendation rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-5 md:p-6 border-l-4 border-l-[#165B40]">
                  <p className="dashboard-eyebrow font-mono text-[10px] text-[#165B40] tracking-wider">RECOMMENDED ACTION</p>
                  <p className="mt-2 text-sm leading-relaxed font-semibold text-slate-900">{digest.recommendation}</p>
                </div>
              </div>
            )}
          </Surface>
        </section>

        {/* Anomaly Watch Bento Card */}
        <section className="dashboard-ai-anomaly lg:col-span-2 space-y-4" aria-labelledby="anomaly-watch-heading">
          <Surface tone="elevated" className="dashboard-ai-anomaly-canvas rounded-3xl border border-slate-200/90 bg-white p-6 md:p-8 space-y-6 shadow-xs hover:shadow-md transition-all duration-300">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <GeometricIcon type="rings" bg="bg-amber-500" />
                <div>
                  <h2 id="anomaly-watch-heading" className="text-base font-bold text-slate-900 font-sans tracking-tight">Anomaly watch</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Unread deviations from normal.</p>
                </div>
              </div>
              <button
                onClick={handleRunDetection}
                disabled={runningDetection}
                className="dashboard-button-secondary rounded-full !py-2 !px-3.5 text-xs font-semibold shadow-xs disabled:opacity-50 shrink-0"
              >
                {runningDetection ? 'SCANNING...' : 'RUN DETECTION'}
              </button>
            </div>

            {loadingAlerts ? (
              <div className="py-12 text-center text-slate-400 font-mono text-xs" role="status" aria-busy="true">Scanning alerts...</div>
            ) : alertsError ? (
              <div role="alert" className="mt-5 space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
                <p>{alertsError}</p>
                <button type="button" onClick={fetchAlerts} className="dashboard-button-secondary rounded-full !min-h-8 px-4 text-xs">TRY AGAIN</button>
              </div>
            ) : alerts.length === 0 ? (
              <EmptyPanel icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />} title="All systems operational" description="No unread anomalies detected in the last 7 days." />
            ) : (
              <ul aria-label="Unread anomaly alerts" tabIndex={0} className="dashboard-ai-anomaly-list space-y-3 max-h-[500px] overflow-y-auto pr-1 focus:outline-none">
                {alerts.map(alert => (
                  <li key={alert.id} className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4.5 space-y-3 shadow-2xs hover:border-slate-300 hover:bg-white transition-all duration-200">
                    <div className="flex items-center justify-between gap-3">
                      <StatusBadge tone={severityTone(alert.severity)}>{alert.severity}</StatusBadge>
                      <time className="text-[10px] font-mono text-slate-400" dateTime={alert.created_at}>{new Date(alert.created_at).toLocaleDateString()}</time>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed">{alert.alert_text}</p>
                    <button
                      onClick={() => handleMarkAsRead(alert.id)}
                      className="dashboard-button-secondary rounded-full w-full !min-h-8 text-xs font-semibold !py-1.5 shadow-xs"
                    >
                      Mark as Read
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Surface>
          <div className="dashboard-ai-anomaly-note hidden lg:block rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs">
            <div className="flex items-start gap-3">
              <Radar aria-hidden="true" className="w-4 h-4 text-[#165B40] mt-0.5 shrink-0" />
              <p className="text-xs text-slate-500 leading-relaxed">
                Detection watches for meaningful movement so the team can act before a quiet week becomes a missed quarter.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
