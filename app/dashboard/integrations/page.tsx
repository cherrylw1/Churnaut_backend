'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function IntegrationsPage() {
  const [crmStatus, setCrmStatus] = useState<{ connected: boolean; crm_type: string | null } | null>(null);

  useEffect(() => {
    fetch('/api/oauth/crm')
      .then(res => res.json())
      .then(data => setCrmStatus(data))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-wider font-mono uppercase">INTEGRATIONS</h1>
          <p className="text-xs font-mono text-gray-400 mt-1">Connect your tools. Set up once, run forever.</p>
        </div>
      </div>

      {/* Section 1 Label: CRM PLATFORMS */}
      <div className="flex items-center pt-2">
        <span className="text-[10px] font-mono text-[#6366f1] tracking-widest uppercase bg-[var(--border-subtle)]/40 py-1 px-2.5 rounded border border-[var(--border-subtle)]">
          CRM PLATFORMS
        </span>
      </div>

      {/* Grid of CRM Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* HubSpot */}
        <div className={`border bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4 ${crmStatus?.crm_type === 'hubspot' ? 'border-green-900/30' : 'border-[var(--border-subtle)]'}`}>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">HubSpot</h3>
              {crmStatus?.crm_type === 'hubspot' ? (
                <div className="flex items-center gap-1.5 text-green-400 text-xs font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                  Connected
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-gray-500 text-xs font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                  Disconnected
                </div>
              )}
            </div>
            <p className="font-mono text-xs text-gray-400 leading-relaxed">
              Sync deals, owners, pipeline stages, and contact enrichment.
            </p>
          </div>
          <div>
            <Link
              href="/dashboard/integrations/crm"
              className="block w-full py-2 px-3 border border-[var(--border-subtle)] hover:border-[#6366f1] hover:text-white text-gray-300 font-mono text-xs rounded text-center transition-all hover:bg-[#6366f1]/5 active:scale-[0.98]"
            >
              MANAGE →
            </Link>
          </div>
        </div>

        {/* Pipedrive */}
        <div className={`border bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4 ${crmStatus?.crm_type === 'pipedrive' ? 'border-green-900/30' : 'border-[var(--border-subtle)]'}`}>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Pipedrive</h3>
              {crmStatus?.crm_type === 'pipedrive' ? (
                <div className="flex items-center gap-1.5 text-green-400 text-xs font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                  Connected
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-gray-500 text-xs font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                  Disconnected
                </div>
              )}
            </div>
            <p className="font-mono text-xs text-gray-400 leading-relaxed">
              Sync deals, contacts, and pipeline stages from Pipedrive.
            </p>
          </div>
          <div>
            <Link
              href="/dashboard/integrations/crm"
              className="block w-full py-2 px-3 border border-[var(--border-subtle)] hover:border-[#6366f1] hover:text-white text-gray-300 font-mono text-xs rounded text-center transition-all hover:bg-[#6366f1]/5 active:scale-[0.98]"
            >
              MANAGE →
            </Link>
          </div>
        </div>

        {/* Zoho CRM */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4 opacity-80">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Zoho CRM</h3>
              <div className="flex items-center gap-1.5 text-gray-500 text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                Coming Soon
              </div>
            </div>
            <p className="font-mono text-xs text-gray-400 leading-relaxed">
              Sync Zoho CRM contacts, leads, and deal stages for real-time personalization.
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

        {/* Close */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4 opacity-80">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Close</h3>
              <div className="flex items-center gap-1.5 text-gray-500 text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                Coming Soon
              </div>
            </div>
            <p className="font-mono text-xs text-gray-400 leading-relaxed">
              Sync Close CRM leads, opportunities, and rep activity into personalization flows.
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

        {/* Salesforce */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4 opacity-80">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Salesforce</h3>
              <div className="flex items-center gap-1.5 text-gray-500 text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                Coming Soon
              </div>
            </div>
            <p className="font-mono text-xs text-gray-400 leading-relaxed">
              Connect Salesforce Sales Cloud to map opportunity objects and lifecycle stages.
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

        {/* Attio */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4 opacity-80">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Attio</h3>
              <div className="flex items-center gap-1.5 text-gray-500 text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                Coming Soon
              </div>
            </div>
            <p className="font-mono text-xs text-gray-400 leading-relaxed">
              Sync Attio workspace records, pipelines, and contact attributes in real time.
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

      {/* Section 2 Label: OUTREACH TOOLS */}
      <div className="flex items-center pt-4">
        <span className="text-[10px] font-mono text-[#6366f1] tracking-widest uppercase bg-[var(--border-subtle)]/40 py-1 px-2.5 rounded border border-[var(--border-subtle)]">
          OUTREACH TOOLS
        </span>
      </div>

      {/* Grid of Outreach Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

        {/* Lemlist */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4 opacity-80">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Lemlist</h3>
              <div className="flex items-center gap-1.5 text-gray-500 text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                Coming Soon
              </div>
            </div>
            <p className="font-mono text-xs text-gray-400 leading-relaxed">
              Enrich sessions from Lemlist campaigns with prospect and sequence context.
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

        {/* Make */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4 opacity-80">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Make</h3>
              <div className="flex items-center gap-1.5 text-gray-500 text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                Coming Soon
              </div>
            </div>
            <p className="font-mono text-xs text-gray-400 leading-relaxed">
              Automate personalization workflows across 1,500+ apps using Make scenarios.
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

      {/* Webhooks Section Label */}
      <div className="flex items-center pt-4">
        <span className="text-[10px] font-mono text-[#6366f1] tracking-widest uppercase bg-[var(--border-subtle)]/40 py-1 px-2.5 rounded border border-[var(--border-subtle)]">
          WEBHOOKS & AUTOMATION
        </span>
      </div>

      {/* Webhook Configuration Card */}
      <div className="grid grid-cols-1 gap-6">
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Webhook Configuration</h3>
              <div className="flex items-center gap-1.5 text-green-400 text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                Active
              </div>
            </div>
            <p className="font-mono text-xs text-gray-400 leading-relaxed max-w-2xl">
              Configure incoming field mappings, manage authorization tokens, and review webhook ingestion logs in real time.
            </p>
          </div>
          <div>
            <Link
              href="/dashboard/integrations/webhooks"
              className="block w-full sm:w-fit py-2 px-6 border border-[var(--border-subtle)] hover:border-[#6366f1] hover:text-white text-gray-300 font-mono text-xs rounded text-center transition-all hover:bg-[#6366f1]/5 active:scale-[0.98]"
            >
              CONFIGURE →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
