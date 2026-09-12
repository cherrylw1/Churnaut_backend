'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ArrowRight, X } from 'lucide-react';

interface CommandItem { label: string; href: string; group: string; }

export function CommandPalette({ open, onClose, items }: { open: boolean; onClose: () => void; items: CommandItem[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? items.filter((item) => `${item.label} ${item.group}`.toLowerCase().includes(normalized)) : items;
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setQuery('');
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    const getFocusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') ?? []);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  const go = (href: string) => { onClose(); router.push(href); };
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/30 p-4 pt-[12vh]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl" role="dialog" aria-modal="true" aria-label="Search workspace">
        <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4">
          <Search className="h-5 w-5 text-[var(--text-muted)]" aria-hidden="true" />
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && filtered[0]) go(filtered[0].href); }} placeholder="Search workspace…" aria-label="Search workspace" className="h-14 flex-1 border-0 bg-transparent text-base text-[var(--text-primary)] outline-none" />
          <button type="button" onClick={onClose} aria-label="Close search" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[min(60vh,440px)] overflow-y-auto p-2">
          {filtered.length === 0 ? <p className="px-3 py-10 text-center text-sm text-[var(--text-muted)]">No matching workspace pages.</p> : filtered.map((item) => (
            <button key={item.href} type="button" onClick={() => go(item.href)} className="flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]">
              <span><span className="font-semibold text-[var(--text-primary)]">{item.label}</span><span className="ml-2 text-xs text-[var(--text-muted)]">{item.group}</span></span><ArrowRight className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="border-t border-[var(--border-subtle)] px-4 py-2 text-[11px] text-[var(--text-muted)]">Press <kbd className="rounded border border-[var(--border-default)] px-1.5 py-0.5">Esc</kbd> to close · <kbd className="rounded border border-[var(--border-default)] px-1.5 py-0.5">Enter</kbd> to open</div>
      </div>
    </div>
  );
}
