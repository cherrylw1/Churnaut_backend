import Link from 'next/link';
import { cn } from '@/lib/utils';

type ChurnautMarkProps = {
  href?: string;
  compact?: boolean;
  className?: string;
  label?: string;
  onClick?: () => void;
};

/**
 * The single brand primitive used by marketing, auth, and the workspace shell.
 * The mark is intentionally geometric and quiet: it reads as a signal node,
 * not as decorative product chrome.
 */
export function ChurnautMark({ href, compact = false, className, label = 'Churnaut', onClick }: ChurnautMarkProps) {
  const content = (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <span
        className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-[var(--signal-primary)]/35 bg-[var(--signal-primary-soft)]"
        aria-hidden="true"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--signal-primary)] shadow-[0_0_18px_var(--signal-glow)]" />
        <span className="absolute inset-[6px] rounded-[7px] border border-[var(--signal-primary)]/45" />
        <span className="absolute -right-0.5 top-2 h-1.5 w-1.5 rounded-full bg-[var(--signal-positive)]" />
      </span>
      {!compact ? (
        <span className="flex min-w-0 flex-col leading-none">
          <span className="truncate text-[15px] font-semibold tracking-[0.16em] text-[var(--text-primary)]">{label.toUpperCase()}</span>
          <span className="mt-1 font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Signal Field</span>
        </span>
      ) : null}
    </span>
  );

  return href ? <Link href={href} aria-label={label} onClick={onClick}>{content}</Link> : content;
}
