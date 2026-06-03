'use client';

import React from 'react';
import { Plug, CheckCircle2 } from 'lucide-react';

export default function IntegrationsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center space-y-6">
      <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-full flex items-center justify-center text-[var(--accent)] shadow-lg">
        <Plug className="w-8 h-8" />
      </div>

      <div className="space-y-2 max-w-md">
        <h1 className="text-[28px] font-bold text-[var(--text-primary)] leading-tight tracking-tight font-sans">
          Integrations
        </h1>
        <p className="text-[15px] font-medium text-[var(--text-secondary)] font-sans">
          Connect your tools. Set up once, run forever.
        </p>
      </div>

      <div className="max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[12px] p-5 space-y-4 shadow-sm text-left">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-[var(--green)] flex-shrink-0" />
          <div>
            <div className="text-xs font-mono text-[var(--text-primary)] uppercase tracking-wider font-bold">
              HubSpot Connected
            </div>
            <div className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
              Live bi-directional pipeline & owner synchronization is active.
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--border-subtle)] pt-4">
          <p className="text-xs font-mono text-[var(--text-muted)] leading-relaxed">
            HubSpot is connected. Instantly, Smartlead, Apollo, Calendly, and Zapier integrations are coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}
