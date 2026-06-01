'use client';

import React from 'react';
import Link from 'next/link';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
  onClick?: () => void;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  ctaLabel,
  ctaHref,
  onClick,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-surface)] max-w-md mx-auto font-sans shadow-[0_1px_4px_rgba(0,0,0,0.2)]">
      <div className="p-3.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-full text-[var(--text-muted)] mb-4">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider font-mono mb-2">
        {title}
      </h3>
      <p className="text-xs text-[var(--text-secondary)] max-w-xs leading-normal mb-6 font-mono">
        {description}
      </p>
      {ctaLabel && (
        <>
          {ctaHref ? (
            <Link
              href={ctaHref}
              className="bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-xs font-semibold py-2 px-4 rounded-[6px] transition-all active:scale-[0.98]"
            >
              {ctaLabel}
            </Link>
          ) : onClick ? (
            <button
              onClick={onClick}
              className="bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-xs font-semibold py-2 px-4 rounded-[6px] transition-all active:scale-[0.98]"
            >
              {ctaLabel}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
