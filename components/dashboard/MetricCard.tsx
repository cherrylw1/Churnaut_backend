import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Surface } from './Surface';

interface MetricCardProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  trend?: number | null;
  icon?: ReactNode;
  emphasis?: 'default' | 'primary';
}

export function MetricCard({ label, value, detail, trend, icon, emphasis = 'default' }: MetricCardProps) {
  const isPrimary = emphasis === 'primary';
  const trendLabel = typeof trend === 'number' ? `${Math.abs(trend)}% vs prior period` : undefined;

  return (
    <Surface
      className={`dashboard-metric relative flex flex-col justify-between p-6 transition-all duration-200 ${
        isPrimary
          ? 'bg-[#165B40] text-white border-[#165B40] shadow-md hover:shadow-lg'
          : 'bg-white text-slate-900 border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-sm'
      }`}
    >
      {/* Top Header: Label & Circular Arrow/Icon */}
      <div className="flex items-center justify-between gap-3">
        <span
          className={`text-xs font-semibold tracking-wide ${
            isPrimary ? 'text-white/85' : 'text-slate-600'
          }`}
        >
          {label}
        </span>
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
            isPrimary
              ? 'bg-white/15 text-white border border-white/20 hover:bg-white/25'
              : 'border border-slate-200 text-slate-500 bg-white hover:bg-slate-50 hover:text-slate-800'
          }`}
          aria-hidden="true"
        >
          {icon || <ArrowUpRight className="w-4 h-4" />}
        </div>
      </div>

      {/* Middle Value */}
      <div className="my-3">
        <div
          className={`text-3xl sm:text-4xl font-bold tracking-tight font-sans ${
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
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
              isPrimary
                ? 'bg-white/20 text-white border border-white/25'
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
            <span>{Math.abs(trend)}%</span>
            <span className="font-normal opacity-85">
              {trend > 0 ? 'Increased' : trend < 0 ? 'Decreased' : 'Flat'}
            </span>
          </span>
        ) : null}
        {detail ? (
          <span
            className={`text-xs ${
              isPrimary ? 'text-white/80' : 'text-slate-400'
            }`}
          >
            {detail}
          </span>
        ) : null}
      </div>
    </Surface>
  );
}
