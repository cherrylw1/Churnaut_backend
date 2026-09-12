import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function DataTable({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <div className={cn('dashboard-table-wrap', className)} role={label ? 'region' : undefined} aria-label={label}>{children}</div>;
}
