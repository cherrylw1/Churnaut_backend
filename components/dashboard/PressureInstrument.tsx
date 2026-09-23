'use client';

import React, { type ReactNode } from 'react';
import { Surface } from './Surface';
import { StatusBadge } from './StatusBadge';

type PressureStatus = 'HEALTHY' | 'NEEDS ATTENTION' | 'AT RISK';

const toneForStatus = (status: PressureStatus) => (
  status === 'HEALTHY' ? 'success' : status === 'AT RISK' ? 'danger' : 'warning'
);

export function PressureInstrument({
  score,
  status,
  value,
  title = 'Project Progress',
  label = 'Project Ended',
}: {
  score: number;
  status: PressureStatus;
  value?: ReactNode;
  title?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  // Semi-circle arc calculations: radius 75, cx 100, cy 100
  // Perimeter of semi-circle = PI * r = 3.14159 * 75 = 235.6
  const arcLength = Math.PI * 75;
  const strokeDashoffset = arcLength * (1 - clamped / 100);

  const strokeColor = status === 'HEALTHY' 
    ? '#165B40' 
    : status === 'AT RISK' 
    ? '#EF4444' 
    : '#F59E0B';

  return (
    <Surface
      className="dashboard-pressure-instrument dashboard-surface relative flex flex-col justify-between p-6 transition-all duration-300 hover:shadow-md"
      aria-label={`${title} ${score}%, ${status}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-sans text-base font-bold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">Real-time pipeline & deal resolution</p>
        </div>
        <StatusBadge tone={toneForStatus(status)}>{status}</StatusBadge>
      </div>

      {/* Donezo-style Semi-Circular Progress Arc with Diagonal Hatched Remaining Track */}
      <div className="relative my-4 flex flex-col items-center justify-center">
        <svg viewBox="0 0 200 115" className="w-56 max-w-full overflow-visible">
          <defs>
            <pattern
              id="arcDiagonalHatch"
              width="6"
              height="6"
              patternTransform="rotate(45 0 0)"
              patternUnits="userSpaceOnUse"
            >
              <line x1="0" y1="0" x2="0" y2="6" stroke="#94A3B8" strokeWidth="2.5" />
            </pattern>
          </defs>

          {/* Underlay Base Track */}
          <path
            d="M 25 100 A 75 75 0 0 1 175 100"
            fill="none"
            stroke="#F1F5F9"
            strokeWidth="18"
            strokeLinecap="round"
          />

          {/* Hatched Remaining Track (Pending Arc) */}
          <path
            d="M 25 100 A 75 75 0 0 1 175 100"
            fill="none"
            stroke="url(#arcDiagonalHatch)"
            strokeWidth="18"
            strokeLinecap="round"
          />

          {/* Filled Foreground Arc (Active Progress) */}
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
          <span className="font-sans text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 tabular-nums">
            {value ?? `${clamped}%`}
          </span>
          <span className="mt-0.5 text-xs font-semibold text-slate-400">
            {label}
          </span>
        </div>
      </div>

      {/* Donezo-style 3-Dot Legend */}
      <div className="flex items-center justify-center gap-5 pt-3 text-xs text-slate-600 font-medium border-t border-slate-100">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#165B40]" />
          <span>In Progress</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full border border-slate-400/80"
            style={{
              background:
                'repeating-linear-gradient(135deg, #94a3b8, #94a3b8 1.5px, transparent 1.5px, transparent 4px)',
            }}
          />
          <span>Pending</span>
        </div>
      </div>
    </Surface>
  );
}
