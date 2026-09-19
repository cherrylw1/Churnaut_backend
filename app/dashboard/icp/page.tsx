'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Lock, RefreshCw, Target } from 'lucide-react';
import Skeleton from '@/components/ui/Skeleton';
import ErrorState from '@/components/ui/ErrorState';
import { EmptyPanel } from '@/components/dashboard/EmptyPanel';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { Surface } from '@/components/dashboard/Surface';

interface JobTitleFreq { title: string; count: number }
interface DealStageFreq { sequence: string; count: number }
interface IcpProfile {
  id: string;
  client_id: string;
  top_job_titles: JobTitleFreq[] | null;
  top_industries: string[] | null;
  avg_deal_value: number;
  avg_days_to_close: number;
  top_deal_stages: DealStageFreq[] | null;
  win_count: number;
  icp_summary: string;
  generated_at: string;
}

export default function IcpBuilderPage() {
  const [profile, setProfile] = useState<IcpProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rulesCreated, setRulesCreated] = useState<number | null>(null);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/icp');
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to retrieve ICP profile.');
      }
    } catch (err) {
      console.error('Failed to load ICP profile:', err);
      setError('A network error occurred while loading your ICP profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProfile(); }, []);

  const handleBuildIcp = async () => {
    if (building) return;
    setBuilding(true);
    setErrorMsg(null);
    setRulesCreated(null);
    try {
      const res = await fetch('/api/icp', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) setErrorMsg(data.error || 'Failed to analyze wins and generate ICP profile.');
      else {
        setProfile(data.icp_profile);
        setRulesCreated(data.rules_created);
      }
    } catch (err) {
      console.error('Error generating ICP profile:', err);
      setErrorMsg('An unexpected error occurred during ICP analysis.');
    } finally {
      setBuilding(false);
    }
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(val);

  const hasNotEnoughDeals = errorMsg?.includes('at least 3') || (profile === null && !loading) || (profile !== null && profile.win_count < 3);

  return (
    <div className="space-y-8 max-w-5xl mx-auto text-[var(--text-secondary)]">
      <PageHeader
        eyebrow="Signal Room · ICP model"
        title="ICP builder"
        description="Turn closed-won evidence into a practical model for who to route and why."
        actions={<button onClick={handleBuildIcp} disabled={building} className="min-h-10 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-sans text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50">
          <RefreshCw aria-hidden="true" className={`w-3.5 h-3.5 ${building ? 'animate-spin' : ''}`} />
          {building ? 'ANALYZING...' : 'BUILD MY ICP'}
        </button>}
      />

      {errorMsg ? <div role="alert" className="p-4 bg-[var(--red)]/10 border border-[var(--red)]/30 rounded-lg text-[var(--red)] text-xs font-mono">{errorMsg}</div> : null}
      {rulesCreated !== null ? <div role="status" aria-live="polite" className="p-4 bg-[var(--green)]/10 border border-[var(--green)]/30 rounded-lg text-[var(--green)] text-xs font-mono flex items-center gap-2">
        <CheckCircle2 aria-hidden="true" className="w-4 h-4 flex-shrink-0" />
        <span>Profile generated · <strong className="text-[var(--text-primary)]">{rulesCreated}</strong> routing rules created.</span>
      </div> : null}

      {error ? <div className="py-8"><ErrorState message={error} onRetry={fetchProfile} /></div> : loading ? (
        <div className="space-y-6 animate-pulse" aria-label="Loading ICP evidence">
          <Skeleton variant="card" height={150} />
          <Skeleton variant="line" height={20} width={150} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><Skeleton variant="card" height={112} /><Skeleton variant="card" height={112} /><Skeleton variant="card" height={112} /></div>
          <Skeleton variant="card" height={120} />
        </div>
      ) : hasNotEnoughDeals ? (
        <EmptyPanel icon={<Lock className="w-5 h-5" />} title="Not enough closed-won evidence" description="Close at least 3 deals in HubSpot to unlock your ICP model." action={<span className="text-xs font-mono text-[var(--text-muted)]">The model will appear here when the evidence is ready.</span>} />
      ) : profile ? (
        <div className="space-y-8">
          <Surface tone="elevated" className="border-l-4 border-l-[var(--amber)]" aria-labelledby="icp-evidence-heading">
            <div className="flex items-start gap-3">
              <div className="dashboard-empty-icon shrink-0"><Target aria-hidden="true" className="w-5 h-5" /></div>
              <div className="min-w-0">
                <p className="dashboard-eyebrow font-mono">MODEL OUTPUT</p>
                <h2 id="icp-evidence-heading" className="text-lg font-semibold text-[var(--text-primary)]">ICP evidence</h2>
                <p className="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed">{profile.icp_summary}</p>
              </div>
            </div>
          </Surface>

          <section aria-labelledby="evidence-profile-heading">
            <SectionHeader title="Evidence profile" headingId="evidence-profile-heading" description="The closed-won signals behind the current model." />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <MetricCard label="Win count" value={profile.win_count} detail="Closed-won deals" emphasis="primary" />
              <MetricCard label="Avg deal value" value={formatCurrency(profile.avg_deal_value)} detail="Average contract value" />
              <MetricCard label="Avg days to close" value={profile.avg_days_to_close} detail="Average sales cycle" />
            </div>
          </section>

          <section aria-labelledby="winning-attributes-heading">
            <SectionHeader title="Winning attributes" headingId="winning-attributes-heading" description="Job titles appearing most often in your wins." />
            {profile.top_job_titles && profile.top_job_titles.length > 0 ? <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              {profile.top_job_titles.map((jt, idx) => <div key={idx} className="dashboard-surface dashboard-surface-subtle p-4 flex justify-between items-center gap-3">
                <span className="text-sm font-semibold text-[var(--text-primary)]">{jt.title}</span>
                <span className="text-xs text-[var(--text-muted)] uppercase font-mono">{jt.count} {jt.count === 1 ? 'WIN' : 'WINS'}</span>
              </div>)}
            </div> : <EmptyPanel title="No job-title evidence yet" description="Closed-won contact profiles do not include job titles for this model." />}
          </section>

          <Surface tone="subtle" aria-labelledby="routing-output-heading">
            <SectionHeader title="Routing output" headingId="routing-output-heading" description="The model can turn these patterns into live website decisions." action={<Link href="/dashboard/rules" className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] font-semibold uppercase tracking-wider inline-flex items-center gap-1">View routing rules <ArrowRight aria-hidden="true" className="w-3.5 h-3.5" /></Link>} />
            <p className="mt-4 text-sm text-[var(--text-secondary)] leading-relaxed">ICP generation creates routing rules that can swap custom copy for high-fit prospects.</p>
          </Surface>
        </div>
      ) : null}
    </div>
  );
}
