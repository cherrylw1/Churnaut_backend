'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="border border-[var(--red)]/30 bg-[var(--red)]/10 rounded-lg p-6 max-w-md mx-auto text-center font-sans space-y-4 shadow-lg">
      <div className="flex justify-center">
        <div className="p-3 bg-[var(--red)]/10 border border-[var(--red)]/30 rounded-full text-[var(--red)]">
          <AlertTriangle className="w-6 h-6" />
        </div>
      </div>
      <div className="space-y-1.5">
        <h3 className="text-xs font-bold text-[var(--red)] uppercase tracking-widest font-mono">
          DATA SYNC FAILURE
        </h3>
        <p className="text-xs text-[var(--text-secondary)] leading-normal font-mono">
          {message}
        </p>
      </div>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 border border-[var(--red)]/30 hover:bg-[var(--red)]/10 text-[var(--red)] text-xs py-1.5 px-3 rounded-[6px] transition-all active:scale-[0.98] font-mono font-semibold"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        TRY AGAIN
      </button>
    </div>
  );
}
