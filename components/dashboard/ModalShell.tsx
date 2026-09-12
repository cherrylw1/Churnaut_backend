'use client';

import React, { useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/utils';

type ModalShellProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  closeLabel?: string;
  closeOnBackdrop?: boolean;
};

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function ModalShell({
  open,
  onClose,
  title,
  children,
  className,
  contentClassName,
  closeLabel = 'Close dialog',
  closeOnBackdrop = true,
}: ModalShellProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusInitial = () => {
      const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first || dialogRef.current)?.focus();
    };
    const frame = window.requestAnimationFrame(focusInitial);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!nodes.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-modal-shell>
      <div
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onMouseDown={() => closeOnBackdrop && onClose()}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn('relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl', className)}
      >
        <div className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-4">
          <h2 id={titleId} className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="rounded-md px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]">
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className={cn('max-h-[calc(90vh-65px)] overflow-y-auto', contentClassName)}>{children}</div>
      </div>
    </div>
  );
}
