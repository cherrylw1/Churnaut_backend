'use client';
import React from 'react';
import { Lock } from 'lucide-react';

interface UpgradeGateProps {
  feature: string;
  description: string;
  requiredPlan: 'growth' | 'pro';
}

export default function UpgradeGate({ feature, description, requiredPlan }: UpgradeGateProps) {
  const planLabel = requiredPlan === 'growth' ? 'Growth' : 'Pro';
  const planColor = requiredPlan === 'growth' ? 'text-[#6366f1]' : 'text-amber-400';
  const borderColor = requiredPlan === 'growth' ? 'border-[#6366f1]/20' : 'border-amber-400/20';
  const bgColor = requiredPlan === 'growth' ? 'bg-[#6366f1]/5' : 'bg-amber-400/5';

  return (
    <div className={`flex flex-col items-center justify-center min-h-[400px] border ${borderColor} ${bgColor} rounded-[12px] p-12 text-center space-y-6`}>
      <div className={`w-14 h-14 rounded-full border ${borderColor} flex items-center justify-center`}>
        <Lock className={`w-6 h-6 ${planColor}`} />
      </div>
      <div className="space-y-2 max-w-sm">
        <h2 className="text-lg font-bold text-[var(--text-primary)] font-sans">{feature}</h2>
        <p className="text-sm text-[var(--text-secondary)] font-sans leading-relaxed">{description}</p>
      </div>
      <div className="space-y-3">
        <p className="text-xs text-[var(--text-muted)] font-sans">
          Available on the <span className={`font-bold ${planColor}`}>{planLabel}</span> plan
        </p>
        <a
          href="/dashboard/billing"
          className="inline-block bg-[#6366f1] hover:bg-[#5053e1] text-white font-sans text-sm font-semibold py-2.5 px-6 rounded-[8px] transition-all active:scale-[0.98]"
        >
          Upgrade to {planLabel} &rarr;
        </a>
      </div>
    </div>
  );
}
