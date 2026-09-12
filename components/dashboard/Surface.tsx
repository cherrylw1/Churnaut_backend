import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  tone?: 'default' | 'subtle' | 'elevated';
}

export function Surface({ children, className, tone = 'default', ...props }: SurfaceProps) {
  return <div className={cn('dashboard-surface', `dashboard-surface-${tone}`, className)} {...props}>{children}</div>;
}
