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
    <div className="dashboard-empty-panel flex flex-col items-center justify-center text-center py-16 px-6 max-w-md mx-auto font-sans">
      <div className="dashboard-empty-icon mb-4">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">
        {title}
      </h3>
      <p className="text-sm text-[var(--text-secondary)] max-w-xs leading-normal mb-6">
        {description}
      </p>
      {ctaLabel && (
        <>
          {ctaHref ? (
            <Link
              href={ctaHref}
              className="min-h-10 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-sans text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              {ctaLabel}
            </Link>
          ) : onClick ? (
            <button
              onClick={onClick}
              className="min-h-10 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-sans text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              {ctaLabel}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
