'use client';

import React from 'react';

export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-wider font-mono uppercase">INTEGRATIONS</h1>
          <p className="text-xs font-mono text-gray-400 mt-1">Connect your tools. Set up once, run forever.</p>
        </div>
      </div>

      {/* Section Label */}
      <div className="flex items-center pt-2">
        <span className="text-[10px] font-mono text-[#6366f1] tracking-widest uppercase bg-[var(--border-subtle)]/40 py-1 px-2.5 rounded border border-[var(--border-subtle)]">
          CRM & OUTREACH
        </span>
      </div>

      {/* Grid of Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* HubSpot (CONNECTED) */}
        <div className="border border-green-900/30 bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">HubSpot</h3>
              <div className="flex items-center gap-1.5 text-green-400 text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                Connected
              </div>
            </div>
            <p className="font-mono text-xs text-gray-400 leading-relaxed">
              CRM sync — deals, owners, pipeline stages, and contact enrichment.
            </p>
          </div>
          <div>
            <button
              disabled
              className="w-full py-2 px-3 border border-[var(--border-subtle)] text-gray-500 font-mono text-xs rounded cursor-not-allowed text-center transition-all"
            >
              MANAGE →
            </button>
          </div>
        </div>

        {/* Instantly */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4 opacity-80">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Instantly</h3>
              <div className="flex items-center gap-1.5 text-gray-500 text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                Coming Soon
              </div>
            </div>
            <p className="font-mono text-xs text-gray-400 leading-relaxed">
              Auto-enrich sessions from active Instantly campaigns and sequences.
            </p>
          </div>
          <div>
            <button
              disabled
              className="w-full py-2 px-3 border border-[var(--border-subtle)] text-gray-500 font-mono text-xs rounded opacity-40 cursor-not-allowed text-center"
            >
              CONNECT →
            </button>
          </div>
        </div>

        {/* Smartlead */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4 opacity-80">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Smartlead</h3>
              <div className="flex items-center gap-1.5 text-gray-500 text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                Coming Soon
              </div>
            </div>
            <p className="font-mono text-xs text-gray-400 leading-relaxed">
              Pull prospect data from Smartlead campaigns into tracked link sessions.
            </p>
          </div>
          <div>
            <button
              disabled
              className="w-full py-2 px-3 border border-[var(--border-subtle)] text-gray-500 font-mono text-xs rounded opacity-40 cursor-not-allowed text-center"
            >
              CONNECT →
            </button>
          </div>
        </div>

        {/* Apollo */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4 opacity-80">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Apollo</h3>
              <div className="flex items-center gap-1.5 text-gray-500 text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                Coming Soon
              </div>
            </div>
            <p className="font-mono text-xs text-gray-400 leading-relaxed">
              Sync Apollo sequence activity and contact data for real-time personalization.
            </p>
          </div>
          <div>
            <button
              disabled
              className="w-full py-2 px-3 border border-[var(--border-subtle)] text-gray-500 font-mono text-xs rounded opacity-40 cursor-not-allowed text-center"
            >
              CONNECT →
            </button>
          </div>
        </div>

        {/* Calendly */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4 opacity-80">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Calendly</h3>
              <div className="flex items-center gap-1.5 text-gray-500 text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                Coming Soon
              </div>
            </div>
            <p className="font-mono text-xs text-gray-400 leading-relaxed">
              OAuth-based calendar embed — route visitors to the right rep&apos;s booking page.
            </p>
          </div>
          <div>
            <button
              disabled
              className="w-full py-2 px-3 border border-[var(--border-subtle)] text-gray-500 font-mono text-xs rounded opacity-40 cursor-not-allowed text-center"
            >
              CONNECT →
            </button>
          </div>
        </div>

        {/* Zapier */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4 opacity-80">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Zapier</h3>
              <div className="flex items-center gap-1.5 text-gray-500 text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                Coming Soon
              </div>
            </div>
            <p className="font-mono text-xs text-gray-400 leading-relaxed">
              Connect Churnaut to 5,000+ tools via Zapier webhooks and triggers.
            </p>
          </div>
          <div>
            <button
              disabled
              className="w-full py-2 px-3 border border-[var(--border-subtle)] text-gray-500 font-mono text-xs rounded opacity-40 cursor-not-allowed text-center"
            >
              CONNECT →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
