'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Target, Lock, RefreshCw, ArrowRight, CheckCircle2 } from 'lucide-react';

interface JobTitleFreq {
  title: string;
  count: number;
}

interface DealStageFreq {
  sequence: string;
  count: number;
}

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
  const [building, setBuilding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rulesCreated, setRulesCreated] = useState<number | null>(null);

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/icp');
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      }
    } catch (err) {
      console.error('Failed to load ICP profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleBuildIcp = async () => {
    if (building) return;
    setBuilding(true);
    setErrorMsg(null);
    setRulesCreated(null);
    try {
      const res = await fetch('/api/icp', {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to analyze wins and generate ICP profile.');
      } else {
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

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const hasNotEnoughDeals = errorMsg?.includes('at least 3') || (profile === null && !loading);

  return (
    <div className="space-y-8 max-w-4xl mx-auto text-gray-300">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-wider font-mono text-white flex items-center gap-2.5">
            <Target className="text-indigo-400 w-6 h-6" />
            ICP BUILDER
          </h1>
          <p className="text-xs font-mono text-gray-400 mt-1">
            Built from your closed-won deals in HubSpot
          </p>
        </div>

        <button
          onClick={handleBuildIcp}
          disabled={building}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold py-2.5 px-4.5 rounded uppercase tracking-wider flex items-center gap-2 transition-all disabled:opacity-50 active:scale-[0.98]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${building ? 'animate-spin' : ''}`} />
          {building ? 'ANALYZING...' : 'BUILD MY ICP'}
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-950/20 border border-red-900/50 rounded-lg text-red-400 text-xs font-mono">
          {errorMsg}
        </div>
      )}

      {rulesCreated !== null && (
        <div className="p-4 bg-green-950/20 border border-green-900/50 rounded-lg text-green-400 text-xs font-mono flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
          <span>
            Success! ICP profile generated and <strong className="text-white">{rulesCreated}</strong> new routing rules created.
          </span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-gray-500 font-mono text-sm tracking-wider">
          RETRIEVING ICP DATA PROFILE...
        </div>
      ) : profile ? (
        <div className="space-y-8">
          {/* YOUR ICP CARD */}
          <div className="border border-[#1a1f2e] border-l-4 border-l-amber-500 bg-[#0d1117]/40 rounded-lg p-5 font-mono">
            <div className="flex items-center gap-2 text-white font-bold tracking-wider uppercase text-xs">
              <Target className="text-amber-500 w-4 h-4" />
              YOUR ICP SUMMARY
            </div>
            <p className="mt-4 text-sm text-gray-300 leading-relaxed font-sans">
              {profile.icp_summary}
            </p>
          </div>

          {/* WIN PATTERNS */}
          <div className="space-y-3">
            <div className="border-b border-[#1a1f2e] pb-1.5">
              <h2 className="text-xs font-bold font-mono tracking-wider text-indigo-400 uppercase">
                WIN PATTERNS
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {/* Stat 1: Win Count */}
              <div className="border border-[#1a1f2e] bg-[#0d1117]/30 p-5 rounded-lg flex flex-col justify-between h-24 font-mono">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                  Win Count
                </div>
                <div className="mt-auto">
                  <span className="text-3xl font-extrabold text-white">
                    {profile.win_count}
                  </span>
                </div>
              </div>

              {/* Stat 2: Avg Deal Value */}
              <div className="border border-[#1a1f2e] bg-[#0d1117]/30 p-5 rounded-lg flex flex-col justify-between h-24 font-mono">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                  Avg Deal Value
                </div>
                <div className="mt-auto">
                  <span className="text-3xl font-extrabold text-white">
                    {formatCurrency(profile.avg_deal_value)}
                  </span>
                </div>
              </div>

              {/* Stat 3: Avg Days to Close */}
              <div className="border border-[#1a1f2e] bg-[#0d1117]/30 p-5 rounded-lg flex flex-col justify-between h-24 font-mono">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                  Avg Days to Close
                </div>
                <div className="mt-auto">
                  <span className="text-3xl font-extrabold text-white">
                    {profile.avg_days_to_close}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* TOP JOB TITLES */}
          <div className="space-y-3">
            <div className="border-b border-[#1a1f2e] pb-1.5">
              <h2 className="text-xs font-bold font-mono tracking-wider text-indigo-400 uppercase">
                TOP JOB TITLES
              </h2>
            </div>
            {profile.top_job_titles && profile.top_job_titles.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {profile.top_job_titles.map((jt, idx) => (
                  <div
                    key={idx}
                    className="border border-[#1a1f2e] bg-[#080B0F]/60 p-4 rounded-lg flex justify-between items-center font-mono hover:border-indigo-900/40 transition-colors"
                  >
                    <span className="text-sm font-bold text-white">{jt.title}</span>
                    <span className="text-xs text-gray-500 uppercase font-bold">
                      {jt.count} {jt.count === 1 ? 'WIN' : 'WINS'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center border border-dashed border-[#1a1f2e] rounded bg-[#080B0F]/30 text-xs font-mono text-gray-500">
                No job titles recorded in closed-won contact profiles.
              </div>
            )}
          </div>

          {/* AUTO-GENERATED RULES */}
          <div className="border border-[#1a1f2e] bg-[#0d1117]/15 rounded-lg p-5 font-mono flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                AUTO-GENERATED RULES
              </h3>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Rules swap custom copy based on target job titles when prospects visit.
              </p>
            </div>
            <Link
              href="/dashboard/rules"
              className="text-xs text-[#6366f1] hover:text-[#5053e1] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors"
            >
              View routing rules <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="py-16 text-center border border-dashed border-[#1a1f2e] rounded-lg bg-[#080B0F]/30 flex flex-col items-center justify-center p-6 space-y-4">
          <div className="w-10 h-10 rounded-full bg-indigo-950/40 border border-indigo-900/40 flex items-center justify-center text-indigo-400">
            <Lock className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
              ICP BUILDER LOCKED
            </h3>
            <p className="text-xs font-mono text-gray-500 max-w-sm mx-auto leading-relaxed">
              {hasNotEnoughDeals
                ? "Connect HubSpot and close at least 3 deals to unlock your ICP."
                : "Connect HubSpot and run your first win analysis to build your ICP."}
            </p>
          </div>
          <button
            onClick={handleBuildIcp}
            disabled={building}
            className="border border-indigo-900/60 bg-indigo-950/20 hover:bg-indigo-900/30 text-indigo-400 hover:text-indigo-300 font-mono text-xs font-bold py-2 px-4 rounded uppercase tracking-wider flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${building ? 'animate-spin' : ''}`} />
            {building ? 'GENERATING...' : 'GENERATE ICP PROFILE'}
          </button>
        </div>
      )}
    </div>
  );
}
