import type { ReactNode } from 'react';
import { Surface } from './Surface';
import { StatusBadge } from './StatusBadge';

type PressureStatus = 'HEALTHY' | 'NEEDS ATTENTION' | 'AT RISK';

const toneForStatus = (status: PressureStatus) => (
  status === 'HEALTHY' ? 'success' : status === 'AT RISK' ? 'danger' : 'warning'
);

export function PressureInstrument({ score, status, value }: { score: number; status: PressureStatus; value?: ReactNode }) {
  const clamped = Math.max(0, Math.min(100, score));
  // Semi-circle arc calculations: radius 70, cx 100, cy 95
  // Perimeter of semi-circle = PI * r = 3.14159 * 70 = 219.9
  const arcLength = Math.PI * 70;
  const strokeDashoffset = arcLength * (1 - clamped / 100);

  const strokeColor = status === 'HEALTHY' 
    ? '#165B40' 
    : status === 'AT RISK' 
    ? '#EF4444' 
    : '#F59E0B';

  return (
    <Surface className="dashboard-pressure-instrument dashboard-surface relative flex flex-col justify-between p-6" aria-label={`Pipeline pressure ${score}, ${status}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">Pipeline Pressure</h3>
          <p className="mt-0.5 text-xs text-slate-500">Revenue risk across signals Churnaut detects</p>
        </div>
        <StatusBadge tone={toneForStatus(status)}>{status}</StatusBadge>
      </div>

      {/* Donezo-style Semi-Circular Progress Arc */}
      <div className="relative my-4 flex flex-col items-center justify-center">
        <svg viewBox="0 0 200 115" className="w-52 max-w-full overflow-visible">
          {/* Background Track Arc */}
          <path
            d="M 25 100 A 75 75 0 0 1 175 100"
            fill="none"
            stroke="#E2E8F0"
            strokeWidth="18"
            strokeLinecap="round"
          />
          {/* Filled Foreground Arc */}
          <path
            d="M 25 100 A 75 75 0 0 1 175 100"
            fill="none"
            stroke={strokeColor}
            strokeWidth="18"
            strokeDasharray={arcLength}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        {/* Center Readout Text */}
        <div className="absolute bottom-2 flex flex-col items-center text-center">
          <span className="font-sans text-4xl font-bold tracking-tight text-slate-900 tabular-nums">
            {value ?? `${clamped}%`}
          </span>
          <span className="mt-0.5 text-[11px] font-medium text-slate-400">
            Signal Pressure
          </span>
        </div>
      </div>

      {/* Legend Dots */}
      <div className="flex items-center justify-center gap-4 pt-1 text-xs text-slate-500 font-medium border-t border-slate-100">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#165B40]" />
          <span>Healthy (0-40)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
          <span>Attention (41-70)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
          <span>At Risk (71+)</span>
        </div>
      </div>
    </Surface>
  );
}
