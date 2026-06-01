'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="border border-red-900/40 bg-red-950/10 rounded-lg p-6 max-w-md mx-auto text-center font-sans space-y-4 shadow-lg">
      <div className="flex justify-center">
        <div className="p-3 bg-red-950/20 border border-red-900/50 rounded-full text-red-500">
          <AlertTriangle className="w-6 h-6" />
        </div>
      </div>
      <div className="space-y-1.5">
        <h3 className="text-xs font-bold text-red-400 uppercase tracking-widest font-mono">
          DATA SYNC FAILURE
        </h3>
        <p className="text-xs text-gray-300 leading-normal font-mono">
          {message}
        </p>
      </div>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 border border-red-900/50 hover:bg-red-950/20 text-red-400 text-xs py-1.5 px-3 rounded-[6px] transition-all active:scale-[0.98] font-mono font-semibold"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        TRY AGAIN
      </button>
    </div>
  );
}
