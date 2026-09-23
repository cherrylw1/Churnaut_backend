'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Surface } from './Surface';

interface DayData {
  day: string;
  fullDay: string;
  pct: number;
  signals: number;
  status: 'inactive' | 'active' | 'completed';
}

const DEFAULT_DAYS: DayData[] = [
  { day: 'S', fullDay: 'Sunday', pct: 45, signals: 142, status: 'inactive' },
  { day: 'M', fullDay: 'Monday', pct: 60, signals: 284, status: 'inactive' },
  { day: 'T', fullDay: 'Tuesday', pct: 74, signals: 412, status: 'active' },
  { day: 'W', fullDay: 'Wednesday', pct: 88, signals: 520, status: 'completed' },
  { day: 'T', fullDay: 'Thursday', pct: 52, signals: 230, status: 'inactive' },
  { day: 'F', fullDay: 'Friday', pct: 68, signals: 340, status: 'inactive' },
  { day: 'S', fullDay: 'Saturday', pct: 40, signals: 118, status: 'inactive' },
];

export function CapsuleBarChart({
  title = 'Signal Analytics',
  subtitle = 'Weekly signal density & rule activations',
}: {
  title?: string;
  subtitle?: string;
}) {
  const [days, setDays] = useState<DayData[]>(DEFAULT_DAYS);
  const [hoveredIdx, setHoveredIdx] = useState<number>(2); // Tuesday active by default

  const activeDay = days[hoveredIdx] || days[2];

  return (
    <Surface className="dashboard-capsule-chart flex flex-col justify-between p-6 transition-all duration-300 hover:shadow-md">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-sans text-base font-bold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 border border-emerald-200/80">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Sync
          </span>
        </div>
      </div>

      {/* Capsule Bars Container */}
      <div className="relative mt-6 mb-2 flex h-52 items-end justify-between gap-2 sm:gap-3 px-1 sm:px-3">
        {days.map((item, idx) => {
          const isHovered = hoveredIdx === idx;
          const isSelected = item.status === 'active';
          const isCompleted = item.status === 'completed';

          // Bar height calculation (min 32% to max 90%)
          const barHeight = Math.max(30, Math.min(92, item.pct));

          return (
            <div
              key={`${item.day}-${idx}`}
              className="group relative flex flex-1 flex-col items-center h-full justify-end cursor-pointer select-none"
              onMouseEnter={() => setHoveredIdx(idx)}
              onClick={() => setHoveredIdx(idx)}
            >
              {/* Floating Tooltip Pin for the Active/Hovered Bar */}
              <AnimatePresence>
                {isHovered && (
                  <motion.div
                    layoutId="capsule-pin"
                    initial={{ opacity: 0, y: -6, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                    className="absolute -top-10 z-20 flex flex-col items-center pointer-events-none"
                  >
                    <div className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-slate-900 shadow-md border border-slate-200/90 whitespace-nowrap">
                      {item.pct}%
                    </div>
                    {/* Connecting Pin Line & Dot */}
                    <div className="h-2 w-0.5 bg-slate-300" />
                    <div className="h-1 w-1 rounded-full bg-slate-400" />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* The Capsule Bar Column */}
              <motion.div
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{
                  duration: 0.5,
                  delay: idx * 0.05,
                  ease: [0.16, 1, 0.3, 1],
                }}
                style={{
                  height: `${barHeight}%`,
                  transformOrigin: 'bottom',
                }}
                className={`relative w-full max-w-[42px] rounded-full transition-all duration-300 overflow-hidden ${
                  isHovered
                    ? 'ring-2 ring-[#165B40]/30 shadow-sm scale-[1.03]'
                    : ''
                }`}
              >
                {/* Variant 1: Completed / Peak Day (Solid Dark Forest Green) */}
                {isCompleted && !isHovered && (
                  <div className="h-full w-full rounded-full bg-[#165B40] transition-colors" />
                )}

                {/* Variant 2: Active / Highlight Day (Vibrant Mint Green) */}
                {((isSelected && !isCompleted) || (isHovered && !isCompleted)) && (
                  <div className="h-full w-full rounded-full bg-[#10B981] transition-colors" />
                )}

                {/* Variant 3: Inactive / Standard Day (Diagonal Hatched Stripes with Soft Border) */}
                {!isCompleted && !isSelected && !isHovered && (
                  <div
                    className="h-full w-full rounded-full border border-slate-300/80"
                    style={{
                      background:
                        'repeating-linear-gradient(135deg, rgba(203, 213, 225, 0.5), rgba(203, 213, 225, 0.5) 3px, transparent 3px, transparent 8px)',
                    }}
                  />
                )}

                {/* Hover overlay shine */}
                <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors pointer-events-none" />
              </motion.div>

              {/* Day Label Below Bar */}
              <span
                className={`mt-3 text-xs font-semibold tracking-wide transition-colors ${
                  isHovered
                    ? 'text-slate-900 font-bold'
                    : 'text-slate-400 group-hover:text-slate-700'
                }`}
              >
                {item.day}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer Info Readout */}
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-slate-800">{activeDay.fullDay}:</span>
          <span>{activeDay.signals} signals captured</span>
        </div>
        <span className="font-mono font-bold text-[#165B40]">{activeDay.pct}% peak load</span>
      </div>
    </Surface>
  );
}
