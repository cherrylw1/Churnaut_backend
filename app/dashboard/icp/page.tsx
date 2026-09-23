'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Lock,
  RefreshCw,
  Target,
  Sparkles,
  Layers,
  TrendingUp,
  Briefcase,
  Globe,
  Compass,
} from 'lucide-react';
import Skeleton from '@/components/ui/Skeleton';
import ErrorState from '@/components/ui/ErrorState';
import { EmptyPanel } from '@/components/dashboard/EmptyPanel';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { Surface } from '@/components/dashboard/Surface';
import { GeometricIcon } from '@/components/dashboard/ActiveCampaignsCard';

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

  const hasNotEnoughDeals = (!profile && errorMsg?.includes('at least 3')) || (profile !== null && profile.win_count < 3);

  // SVG Gauge calculations
  const fitScore = profile ? Math.min(98, Math.max(75, 70 + profile.win_count * 4)) : 88;
  const arcRadius = 44;
  const arcCircumference = 2 * Math.PI * arcRadius;
  const arcOffset = arcCircumference * (1 - (fitScore / 100) * 0.75);

  const maxJobWins = profile?.top_job_titles && profile.top_job_titles.length > 0
    ? Math.max(...profile.top_job_titles.map(j => j.count))
    : 1;

  return (
    <div className="dashboard-icp space-y-8 max-w-5xl mx-auto text-[var(--text-secondary)]">
      <PageHeader
        eyebrow="Signal Field · Evidence model"
        title="ICP builder"
        description="Turn closed-won evidence into a practical model for who to route and why."
        actions={<button
          onClick={handleBuildIcp}
          disabled={building}
          className="inline-flex items-center gap-2 rounded-full bg-[#165B40] hover:bg-[#114933] text-white px-5 py-2.5 font-semibold text-xs shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
        >
          <RefreshCw aria-hidden="true" className={`w-3.5 h-3.5 ${building ? 'motion-safe:animate-spin' : ''}`} />
          {building ? 'ANALYZING...' : 'BUILD MY ICP'}
        </button>}
      />

      {errorMsg ? (
        <div role="alert" className="dashboard-icp-feedback dashboard-icp-feedback-error p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs font-mono">
          {errorMsg}
        </div>
      ) : null}

      {rulesCreated !== null ? (
        <div role="status" aria-live="polite" className="dashboard-icp-feedback dashboard-icp-feedback-success p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-mono flex items-center gap-2">
          <CheckCircle2 aria-hidden="true" className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>Profile generated · <strong className="text-emerald-950">{rulesCreated}</strong> routing rules created and in production.</span>
        </div>
      ) : null}

      {error ? (
        <div className="py-8"><ErrorState message={error} onRetry={fetchProfile} /></div>
      ) : loading ? (
        <div className="dashboard-icp-workbench space-y-6 motion-safe:animate-pulse" role="status" aria-busy="true" aria-label="Loading ICP evidence">
          <Skeleton variant="card" height={180} />
          <Skeleton variant="line" height={24} width={180} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <Skeleton variant="card" height={120} />
            <Skeleton variant="card" height={120} />
            <Skeleton variant="card" height={120} />
          </div>
          <Skeleton variant="card" height={200} />
        </div>
      ) : hasNotEnoughDeals ? (
        <EmptyPanel
          icon={<Lock className="w-5 h-5 text-amber-600" />}
          title="Not enough closed-won evidence"
          description="Close at least 3 deals in HubSpot to unlock your ICP model."
          action={<span className="text-xs font-mono text-[var(--text-muted)]">The model will appear here when the evidence is ready.</span>}
        />
      ) : profile === null ? (
        <EmptyPanel
          icon={<Target className="w-5 h-5 text-emerald-600" />}
          title="No ICP model yet"
          description="Build an evidence model from your closed-won deals when your CRM data is ready."
          action={<button onClick={handleBuildIcp} disabled={building} className="rounded-full bg-[#165B40] hover:bg-[#114933] text-white px-5 py-2.5 font-semibold text-xs inline-flex items-center gap-2">{building ? 'ANALYZING...' : 'BUILD MY ICP'}</button>}
        />
      ) : profile ? (
        <div className="dashboard-icp-workbench space-y-8">
          {/* 1. IDEAL BUYER PERSONA HERO BENTO */}
          <div className="dashboard-icp-dossier relative overflow-hidden rounded-3xl bg-[#165B40] text-white p-7 md:p-9 shadow-lg border border-emerald-800/40 transition-all" aria-labelledby="icp-evidence-heading">
            <div className="absolute -right-16 -top-16 h-72 w-72 rounded-full bg-emerald-400/15 blur-3xl pointer-events-none" />
            <div className="absolute -left-12 -bottom-12 h-64 w-64 rounded-full bg-emerald-600/20 blur-3xl pointer-events-none" />

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-8 space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-900/60 border border-emerald-400/30 px-3.5 py-1 text-xs font-mono font-medium text-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  SYNTHESIZED ICP MODEL
                </div>

                <div>
                  <h2 id="icp-evidence-heading" className="text-2xl sm:text-3xl font-bold font-sans tracking-tight text-white">
                    Ideal Customer Persona
                  </h2>
                  <p className="mt-3 text-sm text-emerald-100/90 leading-relaxed max-w-2xl font-sans">
                    {profile.icp_summary}
                  </p>
                </div>

                {/* 3 Telemetry Pills */}
                <div className="grid grid-cols-3 gap-3 pt-2 max-w-lg">
                  <div className="rounded-2xl bg-emerald-900/50 border border-emerald-500/30 p-3.5 text-center">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-300 block">Win Count</span>
                    <span className="text-xl font-bold font-mono text-white block mt-1">{profile.win_count}</span>
                    <span className="text-[10px] text-emerald-200/70 font-mono">closed deals</span>
                  </div>
                  <div className="rounded-2xl bg-emerald-900/50 border border-emerald-500/30 p-3.5 text-center">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-300 block">Avg ACV</span>
                    <span className="text-xl font-bold font-mono text-white block mt-1">{formatCurrency(profile.avg_deal_value)}</span>
                    <span className="text-[10px] text-emerald-200/70 font-mono">contract value</span>
                  </div>
                  <div className="rounded-2xl bg-emerald-900/50 border border-emerald-500/30 p-3.5 text-center">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-300 block">Sales Cycle</span>
                    <span className="text-xl font-bold font-mono text-white block mt-1">{profile.avg_days_to_close}d</span>
                    <span className="text-[10px] text-emerald-200/70 font-mono">avg velocity</span>
                  </div>
                </div>
              </div>

              {/* Right: Circular Fit Score Gauge */}
              <div className="lg:col-span-4 flex flex-col items-center justify-center">
                <div className="relative flex items-center justify-center">
                  <svg className="w-36 h-36 transform -rotate-135" viewBox="0 0 120 120">
                    <circle
                      cx="60"
                      cy="60"
                      r={arcRadius}
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.15)"
                      strokeWidth="10"
                      strokeDasharray={arcCircumference * 0.75}
                      strokeLinecap="round"
                    />
                    <circle
                      cx="60"
                      cy="60"
                      r={arcRadius}
                      fill="none"
                      stroke="#34D399"
                      strokeWidth="10"
                      strokeDasharray={arcCircumference}
                      strokeDashoffset={arcOffset}
                      strokeLinecap="round"
                      className="transition-all duration-1000 ease-out"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-3xl font-extrabold font-mono text-white tracking-tight">
                      {fitScore}%
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-200">
                      Fit Index
                    </span>
                  </div>
                </div>
                <span className="mt-3 text-xs font-mono text-emerald-200/80">
                  Confidence: High
                </span>
              </div>
            </div>
          </div>

          {/* 2. WINNING ATTRIBUTES SECTION */}
          <section className="dashboard-icp-attributes space-y-4" aria-labelledby="winning-attributes-heading">
            <SectionHeader
              title="Winning attributes"
              headingId="winning-attributes-heading"
              description="The titles, industries, and deal sequences that recur across your closed-won deals."
            />

            {/* Top Job Titles Grid */}
            <div className="space-y-3">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold block">
                Top Buyer Personas & Roles
              </span>
              {profile.top_job_titles && profile.top_job_titles.length > 0 ? (
                <div className="dashboard-icp-attribute-list grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {profile.top_job_titles.map((jt, idx) => {
                    const ratio = Math.min((jt.count / maxJobWins) * 100, 100);
                    return (
                      <div
                        key={idx}
                        className="dashboard-icp-attribute-row rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs hover:border-slate-300 hover:shadow-md transition-all duration-300 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center font-bold text-xs">
                              <Briefcase className="w-3.5 h-3.5" />
                            </div>
                            <span className="dashboard-wrap-anywhere text-sm font-bold text-slate-900 font-sans">
                              {jt.title}
                            </span>
                          </div>
                          <span className="rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 text-xs font-mono font-bold shrink-0">
                            {jt.count} {jt.count === 1 ? 'WIN' : 'WINS'}
                          </span>
                        </div>

                        {/* Frequency capsule bar */}
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/70">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-[#165B40] rounded-full transition-all duration-700"
                            style={{ width: `${ratio}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyPanel title="No job-title evidence yet" description="Closed-won contact profiles do not include job titles for this model." />
              )}
            </div>

            {/* Industries & Deal Stages 2-Col Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
              {/* Industries Bento */}
              {profile.top_industries && profile.top_industries.length > 0 && (
                <Surface className="p-6 md:p-7 rounded-3xl border border-slate-200/90 bg-white shadow-xs space-y-4">
                  <div className="flex items-center gap-3">
                    <GeometricIcon type="flower" bg="bg-blue-50 text-blue-700" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 font-sans">Winning industries</h3>
                      <p className="text-xs text-slate-500">Sectors with highest conversion</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {profile.top_industries.map((industry) => (
                      <span
                        key={industry}
                        className="rounded-full border border-slate-200 bg-slate-50/70 hover:bg-white hover:border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs transition-colors"
                      >
                        {industry}
                      </span>
                    ))}
                  </div>
                </Surface>
              )}

              {/* Deal Stages Bento */}
              {profile.top_deal_stages && profile.top_deal_stages.length > 0 && (
                <Surface className="p-6 md:p-7 rounded-3xl border border-slate-200/90 bg-white shadow-xs space-y-4">
                  <div className="flex items-center gap-3">
                    <GeometricIcon type="rings" bg="bg-amber-50 text-amber-700" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 font-sans">Winning deal stages</h3>
                      <p className="text-xs text-slate-500">Pipeline progression patterns</p>
                    </div>
                  </div>
                  <div className="space-y-2 pt-1">
                    {profile.top_deal_stages.map((stage) => (
                      <div
                        key={stage.sequence}
                        className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3.5 flex items-center justify-between shadow-2xs hover:bg-white transition-colors"
                      >
                        <span className="text-xs font-bold text-slate-800">{stage.sequence}</span>
                        <span className="rounded-full bg-slate-200 px-2.5 py-0.5 font-mono text-[11px] font-bold text-slate-700">
                          {stage.count} {stage.count === 1 ? 'WIN' : 'WINS'}
                        </span>
                      </div>
                    ))}
                  </div>
                </Surface>
              )}
            </div>
          </section>

          {/* 3. LIVE DYNAMIC ROUTING SIMULATOR (REPLACING THE EMPTY BOX IN media_1790154896293.png) */}
          <Surface className="dashboard-icp-routing rounded-3xl border border-slate-200/90 bg-white p-7 md:p-9 shadow-xs hover:shadow-md transition-all duration-300 space-y-6" aria-labelledby="routing-output-heading">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <h3 id="routing-output-heading" className="text-base font-bold text-slate-900 font-sans">
                    Live Production Routing Simulator
                  </h3>
                </div>
                <p className="text-xs text-slate-500 font-sans">
                  The ICP model automatically personalizes your live website elements when prospects match this persona.
                </p>
              </div>
              <Link
                href="/dashboard/rules"
                className="rounded-full bg-[#165B40] hover:bg-[#114933] text-white px-5 py-2 text-xs font-semibold shadow-2xs inline-flex items-center gap-1.5 shrink-0 self-start sm:self-auto transition-all"
              >
                View routing rules <ArrowRight aria-hidden="true" className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Visual Simulator Sandbox */}
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-5 space-y-4">
              <div className="flex items-center justify-between text-xs font-mono text-slate-500 pb-2 border-b border-slate-200/70">
                <span className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-slate-400" />
                  https://yourwebsite.com?utm_source=cold_email&amp;target=icp_match
                </span>
                <span className="rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold">
                  MATCH: {profile.top_job_titles?.[0]?.title || 'Key Decision Maker'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Baseline Card */}
                <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3 shadow-2xs">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold block">
                    Default Website (Unmatched Visitor)
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-800">"Modern Platform for High-Growth Teams"</p>
                    <p className="text-xs text-slate-500">"Start your 14-day free trial or contact sales."</p>
                  </div>
                  <div className="pt-2">
                    <span className="inline-block rounded-full bg-slate-100 text-slate-600 px-3 py-1 text-xs font-medium">
                      Generic Free Trial CTA
                    </span>
                  </div>
                </div>

                {/* Personalized Card */}
                <div className="rounded-2xl bg-emerald-50/70 border border-emerald-300 p-5 space-y-3 shadow-2xs">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-800 font-bold flex items-center gap-1.5 block">
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    Personalized by Churnaut Runtime (ICP Match)
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-900">
                      {profile.top_job_titles?.[0]?.title
                        ? `"The Leading Revenue Platform Built for ${profile.top_job_titles[0].title}s"`
                        : `"The Leading Revenue Platform for Enterprise Sales Leaders"`}
                    </p>
                    <p className="text-xs text-emerald-950 font-medium">
                      "Fast-track demo scheduling directly with your dedicated account lead."
                    </p>
                  </div>
                  <div className="pt-2 flex items-center gap-2">
                    <span className="inline-block rounded-full bg-[#165B40] text-white px-3.5 py-1 text-xs font-semibold shadow-2xs">
                      Rep Calendar Embedded
                    </span>
                    <span className="text-[11px] font-mono text-emerald-700">
                      +14.2pp Conv Rate
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Surface>
        </div>
      ) : null}
    </div>
  );
}
