import { Activity } from 'lucide-react';

export interface SignalFeedEvent {
  event_type: string;
  signal_type: string | null;
  created_at: string;
}

export function SignalFeed({ events, formatRelativeTime }: { events: SignalFeedEvent[]; formatRelativeTime: (value: string) => string }) {
  if (events.length === 0) {
    return <div className="py-8 text-center text-xs text-[var(--text-muted)] font-mono">No recent activities recorded.</div>;
  }

  return (
    <div className="mt-4 space-y-1" aria-label="Recent activity feed">
      {events.map((event, index) => (
        <div key={`${event.created_at}-${index}`} className="group flex items-start gap-3 rounded-[8px] border border-transparent px-3 py-3 transition-colors hover:border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)]">
          <span className="mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/8 text-[var(--accent)]" aria-hidden="true">
            <Activity className="h-3 w-3" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--text-primary)]">{event.event_type}</p>
            <p className="mt-1 text-[11px] font-mono uppercase tracking-[0.06em] text-[var(--text-muted)]">{event.signal_type || 'N/A'}</p>
          </div>
          <time className="flex-shrink-0 pt-0.5 text-[11px] font-mono text-[var(--text-muted)]" dateTime={event.created_at}>{formatRelativeTime(event.created_at)}</time>
        </div>
      ))}
    </div>
  );
}
