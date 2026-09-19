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

interface AnomalyAlert { id: string; alert_text: string; severity: 'info' | 'warning' | 'critical'; created_at: string }
interface WeeklyDigest { id: string; week_start: string; summary: string; top_signal: string; rep_spotlight: string; recommendation: string; created_at: string }

const severityTone = (severity: AnomalyAlert['severity']) => severity === 'critical' ? 'danger' : severity === 'warning' ? 'warning' : 'info';

export default function AiInsightsPage() {
  const [plan, setPlan] = useState<string>('starter');
  const [alerts, setAlerts] = useState<AnomalyAlert[]>([]);
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [loadingDigest, setLoadingDigest] = useState(true);
  const [runningDetection, setRunningDetection] = useState(false);
  const [generatingDigest, setGeneratingDigest] = useState(false);

  const fetchAlerts = async () => {
    try {
      setLoadingAlerts(true);
      const res = await fetch('/api/ai/anomaly');
      if (res.ok) { const data = await res.json(); setAlerts(data.alerts || []); }
    } catch (err) { console.error('Failed to load anomaly alerts:', err); }
    finally { setLoadingAlerts(false); }
  };

  const fetchDigest = async () => {
    try {
      setLoadingDigest(true);
      const res = await fetch('/api/ai/digest');
      if (res.ok) { const data = await res.json(); setDigest(data.digest || null); }
    } catch (err) { console.error('Failed to load weekly digest:', err); }
    finally { setLoadingDigest(false); }
  };

  useEffect(() => { fetchAlerts(); fetchDigest(); }, []);
  useEffect(() => {
    fetch('/api/client').then(res => res.json()).then(data => { if (data.client?.plan) setPlan(data.client.plan); }).catch(() => {});
  }, []);

  const handleRunDetection = async () => {
    if (runningDetection) return;
    setRunningDetection(true);
    try {
      const res = await fetch('/api/ai/anomaly', { method: 'POST' });
      if (res.ok) { const data = await res.json(); setAlerts(data.alerts || []); toast.success('Anomaly detection scan complete'); }
      else toast.error('Failed to execute anomaly detection.');
    } catch (err) { console.error('Error running detection:', err); toast.error('An error occurred during anomaly detection.'); }
    finally { setRunningDetection(false); }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      const res = await fetch('/api/ai/anomaly', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      if (res.ok) setAlerts(prev => prev.filter(alert => alert.id !== id));
    } catch (err) { console.error('Error marking alert as read:', err); }
  };

  const handleGenerateDigest = async () => {
    if (generatingDigest) return;
    setGeneratingDigest(true);
    try {
      const res = await fetch('/api/ai/digest', { method: 'POST' });
      if (res.ok) { const data = await res.json(); setDigest(data.digest || null); toast.success('Weekly digest generated successfully'); }
      else toast.error('Failed to generate weekly digest.');
    } catch (err) { console.error('Error generating digest:', err); toast.error('An error occurred while compiling digest.'); }
    finally { setGeneratingDigest(false); }
  };

  if (plan === 'starter') return <div className="p-6"><UpgradeGate feature="AI Revenue Insights" description="Weekly pipeline digests and anomaly detection — delivered automatically every Monday. Know what changed in your pipeline before your Monday standup." requiredPlan="growth" /></div>;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <PageHeader eyebrow="Signal Room · intelligence" title="AI revenue insights" description="A weekly revenue briefing with a live watch on the signals that need attention." />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <section className="lg:col-span-3 space-y-4" aria-labelledby="weekly-briefing-heading">
          <Surface tone="elevated">
            <SectionHeader title="Weekly briefing" headingId="weekly-briefing-heading" description="The clearest read on what changed in your pipeline." action={<button onClick={handleGenerateDigest} disabled={generatingDigest} className="min-h-10 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-mono text-[10px] font-bold py-2 px-3 rounded transition-colors">{generatingDigest ? 'COMPILING...' : 'GENERATE DIGEST'}</button>} />
            {digest ? <p className="mt-3 text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-widest">Week of {digest.week_start}</p> : null}
            {loadingDigest ? <div className="py-16 text-center text-[var(--text-muted)] font-mono text-xs">RETRIEVING BRIEFING...</div> : !digest ? <EmptyPanel icon={<Sparkles className="w-5 h-5" />} title="No briefing compiled" description="Generate a digest to see the latest pipeline story and the next best action." /> : (
              <div className="mt-6 space-y-4">
                <Surface tone="subtle" aria-label="This week summary"><p className="dashboard-eyebrow font-mono">THIS WEEK</p><p className="mt-2 text-sm leading-relaxed text-[var(--text-primary)]">{digest.summary}</p></Surface>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Surface tone="subtle"><p className="dashboard-eyebrow font-mono">TOP SIGNAL</p><p className="mt-2 text-sm leading-relaxed text-[var(--text-primary)]">{digest.top_signal}</p></Surface>
                  <Surface tone="subtle"><p className="dashboard-eyebrow font-mono">REP SPOTLIGHT</p><p className="mt-2 text-sm leading-relaxed text-[var(--text-primary)]">{digest.rep_spotlight}</p></Surface>
                </div>
                <Surface className="border-l-4 border-l-[var(--accent)]"><p className="dashboard-eyebrow font-mono">RECOMMENDED ACTION</p><p className="mt-2 text-sm leading-relaxed font-semibold text-[var(--text-primary)]">{digest.recommendation}</p></Surface>
              </div>
            )}
          </Surface>
        </section>

        <section className="lg:col-span-2 space-y-4" aria-labelledby="anomaly-watch-heading">
          <Surface tone="elevated">
            <SectionHeader title="Anomaly watch" headingId="anomaly-watch-heading" description="Unread deviations from your normal pattern." action={<button onClick={handleRunDetection} disabled={runningDetection} className="min-h-10 border border-[var(--red)]/40 hover:bg-[var(--red)]/10 disabled:opacity-50 text-[var(--red)] font-mono text-[10px] font-bold py-2 px-3 rounded transition-colors">{runningDetection ? 'SCANNING...' : 'RUN DETECTION'}</button>} />
            {loadingAlerts ? <div className="py-12 text-center text-[var(--text-muted)] font-mono text-xs">SCANNING ALERTS...</div> : alerts.length === 0 ? <EmptyPanel icon={<CheckCircle2 className="w-5 h-5" />} title="All systems operational" description="No unread anomalies detected in the last 7 days." /> : (
              <ul aria-label="Unread anomaly alerts" tabIndex={0} className="mt-5 space-y-3 max-h-[500px] overflow-y-auto pr-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
                {alerts.map(alert => <li key={alert.id} className="dashboard-surface dashboard-surface-subtle p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3"><StatusBadge tone={severityTone(alert.severity)}>{alert.severity}</StatusBadge><time className="text-[9px] font-mono text-[var(--text-muted)]" dateTime={alert.created_at}>{new Date(alert.created_at).toLocaleDateString()}</time></div>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{alert.alert_text}</p>
                  <button onClick={() => handleMarkAsRead(alert.id)} className="w-full min-h-9 border border-[var(--border-subtle)] hover:border-[var(--text-muted)] text-[10px] font-mono py-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Mark as Read</button>
                </li>)}
              </ul>
            )}
          </Surface>
          <div className="hidden lg:block dashboard-surface dashboard-surface-subtle p-4"><div className="flex items-start gap-3"><Radar aria-hidden="true" className="w-4 h-4 text-[var(--accent)] mt-0.5" /><p className="text-xs text-[var(--text-muted)] leading-relaxed">Detection watches for meaningful movement so the team can act before a quiet week becomes a missed quarter.</p></div></div>
        </section>
      </div>
    </div>
  );
}
