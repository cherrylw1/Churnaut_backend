'use client';

import React, { type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Surface } from './Surface';

interface MetricCardProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  trend?: number | null;
  trendText?: string;
  icon?: ReactNode;
  emphasis?: 'default' | 'primary';
  onClick?: () => void;
}

export function MetricCard({
  label,
  value,
  detail,
  trend,
  trendText,
  icon,
  emphasis = 'default',
  onClick,
}: MetricCardProps) {
  const isPrimary = emphasis === 'primary';
  const trendLabel = typeof trend === 'number' ? `${Math.abs(trend)}% vs prior period` : undefined;

  return (
    <Surface
      onClick={onClick}
      className={`dashboard-metric group relative flex flex-col justify-between p-6 transition-all duration-300 hover:-translate-y-1 select-none cursor-pointer ${
        isPrimary
          ? 'bg-[#165B40] text-white border-[#165B40] shadow-md hover:shadow-xl hover:shadow-[#165B40]/20'
          : 'bg-white text-slate-900 border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-lg'
      }`}
    >
      {/* Top Header: Label & Circular Arrow Button */}
      <div className="flex items-center justify-between gap-3">
        <span
          className={`text-xs font-semibold tracking-wide ${
            isPrimary ? 'text-white/85' : 'text-slate-600'
          }`}
        >
          {label}
        </span>
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 group-hover:rotate-45 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${
            isPrimary
              ? 'bg-white/15 text-white border border-white/20 group-hover:bg-white group-hover:text-[#165B40] group-hover:shadow-xs'
              : 'border border-slate-200 text-slate-500 bg-white group-hover:bg-[#165B40] group-hover:text-white group-hover:border-[#165B40] group-hover:shadow-xs'
          }`}
          aria-hidden="true"
        >
          {icon || <ArrowUpRight className="w-4 h-4" />}
        </div>
      </div>

      {/* Middle Value Readout */}
      <div className="my-3">
        <div
          className={`text-3xl sm:text-4xl font-extrabold tracking-tight font-sans ${
            isPrimary ? 'text-white' : 'text-slate-900'
          }`}
        >
          {value}
        </div>
      </div>

      {/* Bottom Trend or Detail Pill */}
      <div className="flex items-center gap-2 flex-wrap">
        {typeof trend === 'number' ? (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
              isPrimary
                ? 'bg-white/15 text-white border border-white/25 group-hover:bg-white/20'
                : trend > 0
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                : trend < 0
                ? 'bg-red-50 text-red-700 border border-red-200/80'
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}
            aria-label={trendLabel}
          >
            {trend > 0 ? (
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            ) : trend < 0 ? (
              <ArrowDownRight className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <Minus className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{trendText || (trend > 0 ? 'Increased from last month' : trend < 0 ? 'Decreased from last month' : 'Unchanged')}</span>
          </span>
        ) : detail ? (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
              isPrimary
                ? 'bg-white/15 text-white border-white/25'
                : 'bg-slate-50 text-slate-600 border-slate-200/90'
            }`}
          >
            {detail}
          </span>
        ) : null}
      </div>
    </Surface>
  );
}
