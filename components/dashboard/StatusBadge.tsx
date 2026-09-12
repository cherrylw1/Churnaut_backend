import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export function StatusBadge({ tone = 'neutral', children, className }: { tone?: StatusTone; children: ReactNode; className?: string }) {
  return <span className={cn('dashboard-status', `dashboard-status-${tone}`, className)}><span className="dashboard-status-dot" aria-hidden="true" />{children}</span>;
}
