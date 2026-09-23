'use client';

import React, { useState, useEffect } from 'react';
import { Play, Pause, Square } from 'lucide-react';
import { Surface } from './Surface';

export function TimeTrackerCard({
  title = 'Time Tracker',
  subtitle = 'Live Session Telemetry',
}: {
  title?: string;
  subtitle?: string;
}) {
  const [seconds, setSeconds] = useState(5048); // Initial 01:24:08
  const [isRunning, setIsRunning] = useState(true);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const formatTime = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleReset = () => {
    setSeconds(0);
    setIsRunning(false);
  };

  return (
    <Surface className="dashboard-time-tracker relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B2A1E] via-[#071F16] to-[#04120C] p-6 text-white shadow-md h-full flex flex-col justify-between min-h-[220px]">
      {/* 3D Wavy Silk Ribbons Background Graphic */}
      <div className="absolute inset-0 pointer-events-none opacity-40 overflow-hidden" aria-hidden="true">
        <svg
          viewBox="0 0 400 300"
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          <defs>
            <linearGradient id="ribbonGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#047857" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#064E3B" stopOpacity="0.1" />
            </linearGradient>
            <linearGradient id="ribbonGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#34D399" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#065F46" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          <path
            d="M -50,220 C 80,140 180,310 320,190 C 390,130 450,200 480,260 L 480,350 L -50,350 Z"
            fill="url(#ribbonGrad1)"
          />
          <path
            d="M -30,260 C 100,190 220,320 340,210 C 400,160 450,220 480,290"
            fill="none"
            stroke="url(#ribbonGrad2)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            d="M 0,280 C 120,210 240,330 360,230 C 410,185 450,235 480,300"
            fill="none"
            stroke="#10B981"
            strokeWidth="2"
            strokeDasharray="4 8"
            strokeOpacity="0.5"
          />
        </svg>
      </div>

      {/* Header Info */}
      <div className="relative z-10 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-sans text-sm font-semibold tracking-wide text-emerald-100/90">{title}</h3>
          <p className="text-[11px] text-emerald-300/70">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-emerald-950/60 px-2.5 py-1 border border-emerald-500/20 backdrop-blur-xs">
          <span className="relative flex h-2 w-2">
            {isRunning && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isRunning ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          </span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-300 font-semibold">
            {isRunning ? 'Active' : 'Paused'}
          </span>
        </div>
      </div>

      {/* Big Digital Clock Display */}
      <div className="relative z-10 my-4 text-center">
        <div className="font-sans text-4xl sm:text-5xl font-extrabold tracking-tight text-white tabular-nums drop-shadow-[0_2px_10px_rgba(16,185,129,0.25)]">
          {formatTime(seconds)}
        </div>
        <p className="mt-1 text-[11px] font-medium text-emerald-200/70">
          Telemetry active · Auto-capturing signals
        </p>
      </div>

      {/* Interactive Media Control Buttons */}
      <div className="relative z-10 flex items-center justify-center gap-4 pt-1">
        {/* Play/Pause Button (White Circle) */}
        <button
          type="button"
          onClick={() => setIsRunning((prev) => !prev)}
          className="group flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-950 shadow-md hover:bg-emerald-50 hover:scale-105 active:scale-95 transition-all cursor-pointer"
          title={isRunning ? 'Pause Telemetry' : 'Resume Telemetry'}
          aria-label={isRunning ? 'Pause Telemetry' : 'Resume Telemetry'}
        >
          {isRunning ? (
            <Pause className="h-4 w-4 fill-slate-950 text-slate-950 group-hover:scale-110 transition-transform" />
          ) : (
            <Play className="h-4 w-4 fill-slate-950 text-slate-950 ml-0.5 group-hover:scale-110 transition-transform" />
          )}
        </button>

        {/* Stop/Reset Button (Red Circle) */}
        <button
          type="button"
          onClick={handleReset}
          className="group flex h-11 w-11 items-center justify-center rounded-full bg-[#E53E3E] text-white shadow-md hover:bg-red-600 hover:scale-105 active:scale-95 transition-all cursor-pointer"
          title="Reset Telemetry Session"
          aria-label="Reset Telemetry Session"
        >
          <Square className="h-3.5 w-3.5 fill-white text-white group-hover:scale-110 transition-transform" />
        </button>
      </div>
    </Surface>
  );
}
