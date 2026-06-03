'use client';

import React from 'react';
import Link from 'next/link';

export default function AttioSettingsPage() {
  return (
    <div className="space-y-8 max-w-4xl bg-[var(--bg-base)] text-[var(--text-primary)] min-h-screen">
      {/* Page Header */}
      <div className="border-b border-[var(--border-subtle)] pb-5 flex justify-between items-end">
        <div>
          <div className="flex items-center space-x-2 text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-1.5">
            <Link href="/dashboard/integrations" className="hover:text-white transition-colors">
              INTEGRATIONS
            </Link>
            <span>/</span>
            <Link href="/dashboard/integrations/crm" className="hover:text-white transition-colors">
              CRM INTEGRATIONS
            </Link>
            <span>/</span>
            <span className="text-gray-300">ATTIO</span>
          </div>
          <h1 className="text-xl font-bold tracking-wider font-mono uppercase text-white">
            ATTIO CRM
          </h1>
          <p className="text-xs font-mono text-gray-400 mt-1">
            Connect Attio workspace records, pipelines, and custom contact attributes to build real-time personalization rules.
          </p>
        </div>
        <div>
          <Link
            href="/dashboard/integrations/crm"
            className="text-xs font-mono text-gray-400 hover:text-white border border-[var(--border-subtle)] px-4 py-2 rounded transition-colors"
          >
            ← BACK TO CRMS
          </Link>
        </div>
      </div>

      {/* Attio Integration Coming Soon Card */}
      <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-lg p-6 space-y-6 opacity-80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                Attio CRM Connection
              </h3>
              <span className="text-[9px] font-mono font-bold bg-[var(--border-subtle)] text-gray-500 border border-[var(--border-subtle)] px-2.5 py-0.5 rounded uppercase">
                COMING SOON
              </span>
            </div>
            <p className="text-xs font-mono text-gray-400 leading-relaxed max-w-xl">
              Sync Attio workspace records, pipelines, and contact attributes in real time.
            </p>
          </div>

          <div>
            <button
              disabled
              className="w-full sm:w-auto border border-[var(--border-subtle)] text-gray-500 font-mono text-xs py-2.5 px-6 rounded opacity-40 cursor-not-allowed text-center"
            >
              CONNECT ATTIO →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
