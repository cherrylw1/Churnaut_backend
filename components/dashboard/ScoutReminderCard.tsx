'use client';

import React from 'react';
import Link from 'next/link';
import { Video, ArrowRight } from 'lucide-react';
import { Surface } from './Surface';

export function ScoutReminderCard({
  dealName,
  action,
  time = 'Time : 02.00 pm - 04.00 pm',
  onRunScout,
}: {
  dealName?: string | null;
  action?: string | null;
  time?: string;
  onRunScout?: () => void;
}) {
  return (
    <Surface className="dashboard-reminders-card flex flex-col justify-between p-6 transition-all duration-300 hover:shadow-md">
      {/* Top Header */}
      <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-sans text-base font-bold text-slate-900">Reminders</h3>
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
        </div>

        {/* Meeting / Deal Headline */}
        <div className="mt-5">
          <h4 className="font-sans text-lg font-bold text-[#165B40] leading-snug">
            {dealName ? `Meeting with ${dealName}` : 'Meeting with Arc Company'}
          </h4>
          <p className="mt-1 text-xs text-slate-400">
            {action || time}
          </p>
        </div>
      </div>

      {/* Start Meeting Forest Green Pill Button */}
      <div className="mt-6">
        <Link
          href="/dashboard/scout"
          className="group flex w-full items-center justify-center gap-2 rounded-full bg-[#165B40] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#114933] hover:shadow-md transition-all active:scale-[0.98]"
        >
          <Video className="h-4 w-4 fill-white/20 group-hover:scale-110 transition-transform" />
          <span>Start Meeting</span>
        </Link>
      </div>
    </Surface>
  );
}
