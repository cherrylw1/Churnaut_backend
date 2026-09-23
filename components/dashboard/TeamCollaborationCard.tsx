'use client';

import React from 'react';
import Link from 'next/link';
import { Plus, Users } from 'lucide-react';
import { Surface } from './Surface';

export interface ActivityEvent {
  event_type: string;
  signal_type: string | null;
  created_at: string;
}

interface TeamMember {
  id: string;
  name: string;
  task: string;
  status: 'Completed' | 'In Progress' | 'Pending';
  avatarBg: string;
  initials: string;
}

const DEFAULT_MEMBERS: TeamMember[] = [
  {
    id: '1',
    name: 'Alexandra Deff',
    task: 'Working on Github Project Repository',
    status: 'Completed',
    avatarBg: 'bg-rose-100 text-rose-700',
    initials: 'AD',
  },
  {
    id: '2',
    name: 'Edwin Adenike',
    task: 'Working on Integrate User Authentication System',
    status: 'In Progress',
    avatarBg: 'bg-emerald-100 text-emerald-800',
    initials: 'EA',
  },
  {
    id: '3',
    name: 'Isaac Oluwatemilorun',
    task: 'Working on Develop Search and Filter Functionality',
    status: 'Pending',
    avatarBg: 'bg-indigo-100 text-indigo-700',
    initials: 'IO',
  },
  {
    id: '4',
    name: 'David Oshodi',
    task: 'Working on Responsive Layout for Homepage',
    status: 'In Progress',
    avatarBg: 'bg-amber-100 text-amber-800',
    initials: 'DO',
  },
];

const statusStyles = {
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200/90',
  'In Progress': 'bg-amber-50 text-amber-700 border-amber-200/90',
  Pending: 'bg-rose-50 text-rose-700 border-rose-200/90',
};

const avatarColors = [
  'bg-rose-100 text-rose-700',
  'bg-emerald-100 text-emerald-800',
  'bg-indigo-100 text-indigo-700',
  'bg-amber-100 text-amber-800',
  'bg-purple-100 text-purple-700',
];

export function TeamCollaborationCard({
  events,
  formatRelativeTime,
}: {
  events?: ActivityEvent[];
  formatRelativeTime?: (dateString: string) => string;
}) {
  const hasEvents = events && events.length > 0;

  return (
    <Surface className="dashboard-team-card flex flex-col justify-between p-6 transition-all duration-300 hover:shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="font-sans text-base font-bold text-slate-900">
          {hasEvents ? 'Signal Collaboration' : 'Team Collaboration'}
        </h3>
        <Link
          href="/dashboard/analytics"
          className="inline-flex items-center gap-1 rounded-full border border-slate-300/80 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 transition-colors shadow-2xs"
        >
          <Plus className="h-3 w-3" />
          <span>{hasEvents ? 'View All' : 'Add Member'}</span>
        </Link>
      </div>

      {/* List */}
      <div className="space-y-3.5 flex-1">
        {hasEvents
          ? events.slice(0, 4).map((evt, idx) => {
              const colorClass = avatarColors[idx % avatarColors.length];
              const relative = formatRelativeTime ? formatRelativeTime(evt.created_at) : 'recently';
              const isMatch = evt.event_type.includes('match') || evt.event_type.includes('rule');
              const isConvert = evt.event_type.includes('convert') || evt.event_type.includes('click');
              const status: 'Completed' | 'In Progress' | 'Pending' = isConvert ? 'Completed' : isMatch ? 'In Progress' : 'Pending';
              const title = evt.signal_type ? `${evt.signal_type.toUpperCase()} Signal` : evt.event_type.replace(/_/g, ' ');
              const initials = evt.signal_type ? evt.signal_type.slice(0, 2).toUpperCase() : 'SG';

              return (
                <div
                  key={`${evt.created_at}-${idx}`}
                  className="group flex items-center justify-between gap-3 rounded-2xl p-1.5 -mx-1.5 hover:bg-slate-50/80 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${colorClass} shadow-2xs group-hover:scale-105 transition-transform`}
                    >
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-900 capitalize">
                        {title}
                      </p>
                      <p className="truncate text-[11px] text-slate-400">
                        Detected {relative}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold flex-shrink-0 ${statusStyles[status]}`}
                  >
                    {status}
                  </span>
                </div>
              );
            })
          : DEFAULT_MEMBERS.map((member) => (
              <div
                key={member.id}
                className="group flex items-center justify-between gap-3 rounded-2xl p-1.5 -mx-1.5 hover:bg-slate-50/80 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${member.avatarBg} shadow-2xs group-hover:scale-105 transition-transform`}
                  >
                    {member.initials}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-900">
                      {member.name}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">
                      {member.task}
                    </p>
                  </div>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold flex-shrink-0 ${statusStyles[member.status]}`}
                >
                  {member.status}
                </span>
              </div>
            ))}
      </div>
    </Surface>
  );
}
