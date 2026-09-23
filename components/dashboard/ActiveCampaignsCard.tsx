'use client';

import React from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Surface } from './Surface';

interface ProjectItem {
  id: string;
  name: string;
  dueDate: string;
  category: string;
  iconBg: string;
  iconType: 'stripes' | 'rings' | 'flower' | 'slice' | 'cluster';
}

const PROJECTS: ProjectItem[] = [
  {
    id: '1',
    name: 'Enterprise Personalization',
    dueDate: 'Nov 26, 2026',
    category: 'Active Rule',
    iconBg: 'bg-blue-50 text-blue-600',
    iconType: 'stripes',
  },
  {
    id: '2',
    name: 'Onboarding Demo Funnel',
    dueDate: 'Nov 28, 2026',
    category: 'Funnel Flow',
    iconBg: 'bg-teal-50 text-teal-600',
    iconType: 'rings',
  },
  {
    id: '3',
    name: 'Pricing Page Dynamic Hero',
    dueDate: 'Nov 30, 2026',
    category: 'High Intent',
    iconBg: 'bg-emerald-50 text-emerald-600',
    iconType: 'flower',
  },
  {
    id: '4',
    name: 'Outbound ABM Lead Sequence',
    dueDate: 'Dec 5, 2026',
    category: 'Outreach',
    iconBg: 'bg-amber-50 text-amber-600',
    iconType: 'slice',
  },
  {
    id: '5',
    name: 'Calendly Rep Routing',
    dueDate: 'Dec 6, 2026',
    category: 'Scheduling',
    iconBg: 'bg-purple-50 text-purple-600',
    iconType: 'cluster',
  },
];

function GeometricIcon({ type }: { type: ProjectItem['iconType'] }) {
  switch (type) {
    case 'stripes':
      return (
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
          <rect x="3" y="4" width="4" height="16" rx="2" transform="rotate(-25 5 12)" />
          <rect x="11" y="4" width="4" height="16" rx="2" transform="rotate(-25 13 12)" />
        </svg>
      );
    case 'rings':
      return (
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current" strokeWidth="2.5">
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4" fill="currentColor" />
        </svg>
      );
    case 'flower':
      return (
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
          <circle cx="8" cy="8" r="4" fill="#3B82F6" />
          <circle cx="16" cy="8" r="4" fill="#10B981" />
          <circle cx="8" cy="16" r="4" fill="#F59E0B" />
          <circle cx="16" cy="16" r="4" fill="#EC4899" />
        </svg>
      );
    case 'slice':
      return (
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-amber-500">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
        </svg>
      );
    case 'cluster':
      return (
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-purple-600">
          <circle cx="6" cy="12" r="3.5" />
          <circle cx="18" cy="12" r="3.5" />
          <circle cx="12" cy="6" r="3.5" />
          <circle cx="12" cy="18" r="3.5" />
        </svg>
      );
    default:
      return null;
  }
}

export function ActiveCampaignsCard() {
  return (
    <Surface className="dashboard-project-card flex flex-col justify-between p-6 transition-all duration-300 hover:shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="font-sans text-base font-bold text-slate-900">Project</h3>
        <Link
          href="/dashboard/rules"
          className="inline-flex items-center gap-1 rounded-full border border-slate-300/80 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 transition-colors shadow-2xs"
        >
          <Plus className="h-3 w-3" />
          <span>New</span>
        </Link>
      </div>

      {/* Project Item List */}
      <div className="space-y-3.5 flex-1">
        {PROJECTS.map((item) => (
          <Link
            key={item.id}
            href="/dashboard/rules"
            className="group flex items-center justify-between gap-3 rounded-2xl p-2 -mx-2 hover:bg-slate-50/80 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              {/* Geometric Icon Chip */}
              <div
                className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 ${item.iconBg} transition-transform group-hover:scale-105`}
              >
                <GeometricIcon type={item.iconType} />
              </div>

              {/* Title & Due Date */}
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-slate-900 group-hover:text-[#165B40] transition-colors">
                  {item.name}
                </p>
                <p className="text-[11px] text-slate-400">
                  Due date: {item.dueDate}
                </p>
              </div>
            </div>

            <span className="text-[11px] font-semibold text-slate-300 group-hover:text-[#165B40] group-hover:translate-x-0.5 transition-all">
              →
            </span>
          </Link>
        ))}
      </div>
    </Surface>
  );
}
