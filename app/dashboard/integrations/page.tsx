'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface ClientProfile {
  id: string;
  company_name: string;
  domain: string;
  snippet_key: string;
  webhook_secret?: string;
  crm_type?: string;
  active: boolean;
}

export default function IntegrationsPage() {
  const [crmStatus, setCrmStatus] = useState<{ connected: boolean; crm_type: string | null } | null>(null);
  const [calendlyStatus, setCalendlyStatus] = useState<{ connected: boolean; connected_at: string | null } | null>(null);
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [openExpectedFields, setOpenExpectedFields] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch('/api/oauth/crm')
      .then(res => res.json())
      .then(data => setCrmStatus(data))
      .catch(() => {});

    fetch('/api/oauth/calendly/status')
      .then(res => res.json())
      .then(data => setCalendlyStatus(data))
      .catch(() => {});

    fetch('/api/client')
      .then(res => res.json())
      .then(data => setClient(data.client))
      .catch(() => {});
  }, []);

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const toggleExpectedFields = (platform: string) => {
    setOpenExpectedFields(prev => ({
      ...prev,
      [platform]: !prev[platform]
    }));
  };

  const webhookUrl = client ? `${window.location.origin}/api/webhook?client_key=${client.webhook_secret || client.snippet_key}` : '';

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
              href="/dashboard/integrations/crm/hubspot"
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
              href="/dashboard/integrations/crm/pipedrive"
              className="block w-full py-2 px-3 border border-[var(--border-subtle)] hover:border-[#6366f1] hover:text-white text-gray-300 font-mono text-xs rounded text-center transition-all hover:bg-[#6366f1]/5 active:scale-[0.98]"
            >
              MANAGE →
            </Link>
          </div>
        </div>

        {/* Zoho CRM */}
        <div className={`border bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4 ${crmStatus?.crm_type === 'zoho' ? 'border-green-900/30' : 'border-[var(--border-subtle)]'}`}>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Zoho CRM</h3>
              {crmStatus?.crm_type === 'zoho' ? (
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
              Sync Zoho CRM contacts, leads, and deal stages for real-time personalization.
            </p>
          </div>
          <div>
            <Link
              href="/dashboard/integrations/crm/zoho"
              className="block w-full py-2 px-3 border border-[var(--border-subtle)] hover:border-[#6366f1] hover:text-white text-gray-300 font-mono text-xs rounded text-center transition-all hover:bg-[#6366f1]/5 active:scale-[0.98]"
            >
              MANAGE →
            </Link>
          </div>
        </div>

        {/* Close */}
        <div className={`border bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4 ${crmStatus?.crm_type === 'close' ? 'border-green-900/30' : 'border-[var(--border-subtle)]'}`}>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Close</h3>
              {crmStatus?.crm_type === 'close' ? (
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
              Sync Close CRM leads, opportunities, and rep activity into personalization flows.
            </p>
          </div>
          <div>
            <Link
              href="/dashboard/integrations/crm/close"
              className="block w-full py-2 px-3 border border-[var(--border-subtle)] hover:border-[#6366f1] hover:text-white text-gray-300 font-mono text-xs rounded text-center transition-all hover:bg-[#6366f1]/5 active:scale-[0.98]"
            >
              MANAGE →
            </Link>
          </div>
        </div>

        {/* Salesforce */}
        <div className={`border bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4 ${crmStatus?.crm_type === 'salesforce' ? 'border-green-900/30' : 'border-[var(--border-subtle)]'}`}>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Salesforce</h3>
              {crmStatus?.crm_type === 'salesforce' ? (
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
              Connect Salesforce Sales Cloud to map opportunity objects and lifecycle stages.
            </p>
          </div>
          <div>
            <Link
              href="/dashboard/integrations/crm/salesforce"
              className="block w-full py-2 px-3 border border-[var(--border-subtle)] hover:border-[#6366f1] hover:text-white text-gray-300 font-mono text-xs rounded text-center transition-all hover:bg-[#6366f1]/5 active:scale-[0.98]"
            >
              MANAGE →
            </Link>
          </div>
        </div>

        {/* Attio */}
        <div className={`border bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4 ${crmStatus?.crm_type === 'attio' ? 'border-green-900/30' : 'border-[var(--border-subtle)]'}`}>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Attio</h3>
              {crmStatus?.crm_type === 'attio' ? (
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
              Sync Attio workspace records, pipelines, and contact attributes in real time.
            </p>
          </div>
          <div>
            <Link
              href="/dashboard/integrations/crm/attio"
              className="block w-full py-2 px-3 border border-[var(--border-subtle)] hover:border-[#6366f1] hover:text-white text-gray-300 font-mono text-xs rounded text-center transition-all hover:bg-[#6366f1]/5 active:scale-[0.98]"
            >
              MANAGE →
            </Link>
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
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Instantly</h3>
              <div className="flex items-center gap-1.5 text-green-400 text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                Ready
              </div>
            </div>
            <p className="font-mono text-xs text-gray-400 leading-relaxed">
              Auto-enrich sessions from active Instantly campaigns and sequences.
            </p>

            {/* Webhook URL Copy Area */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block">Webhook URL</label>
              <div className="relative flex items-center border border-[var(--border-subtle)] bg-[#080B0F]/60 rounded p-2 font-mono text-[11px] overflow-hidden select-all text-gray-300">
                <span className="truncate pr-16">{webhookUrl || 'Loading Webhook URL...'}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(webhookUrl, 'instantly')}
                  disabled={!webhookUrl}
                  className="absolute right-1 top-1 bottom-1 px-3 bg-[#6366f1] hover:bg-[#5053e1] disabled:bg-gray-700 text-white font-mono text-[10px] rounded transition-all active:scale-[0.98]"
                >
                  {copiedKey === 'instantly' ? 'COPIED!' : 'COPY'}
                </button>
              </div>
            </div>

            {/* Setup Instructions */}
            <div className="text-[11px] font-mono text-gray-400 space-y-1 bg-[#080B0F]/20 p-2.5 rounded border border-[var(--border-subtle)]/40">
              <span className="text-[10px] text-gray-300 font-bold uppercase tracking-wider block mb-1">Setup Instructions:</span>
              <p>1. Go to Campaign &gt; Integrations in Instantly.</p>
              <p>2. Add a new webhook triggered on <span className="text-[#6366f1]">Email Sent</span>.</p>
              <p>3. Paste the Webhook URL above.</p>
              <p>4. Use <code className="text-green-400 font-bold font-mono text-[11px] select-all bg-gray-950 px-1 py-0.5 rounded">{"{{churnaut_link}}"}</code> as a custom variable in templates.</p>
            </div>

            {/* Expected Fields Collapsible */}
            <div className="border border-[var(--border-subtle)]/60 bg-[#080B0F]/10 rounded overflow-hidden">
              <button
                type="button"
                onClick={() => toggleExpectedFields('instantly')}
                className="w-full text-left p-2.5 font-mono text-[10px] font-bold text-gray-400 hover:text-white uppercase hover:bg-[var(--border-subtle)]/20 transition-all flex justify-between items-center"
              >
                <span>Expected Payload Fields</span>
                <span>{openExpectedFields['instantly'] ? '[-]' : '[+]'}</span>
              </button>
              {openExpectedFields['instantly'] && (
                <div className="p-3 border-t border-[var(--border-subtle)]/60 text-[10px] font-mono text-gray-400 space-y-2 leading-relaxed bg-[#080B0F]/25">
                  <p className="text-gray-300 font-semibold">JSON Fields:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><code className="text-indigo-400">prospect_name</code> (string)</li>
                    <li><code className="text-indigo-400">prospect_email</code> (string)</li>
                    <li><code className="text-indigo-400">company_name</code> (string)</li>
                    <li><code className="text-indigo-400">job_title</code> (string)</li>
                    <li><code className="text-indigo-400">assigned_rep</code> (string)</li>
                    <li>
                      <code className="text-indigo-400">signal_type</code> (string) — 
                      <span className="text-yellow-400/90 font-semibold"> Must be &quot;Instantly&quot;</span>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Smartlead */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Smartlead</h3>
              <div className="flex items-center gap-1.5 text-green-400 text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                Ready
              </div>
            </div>
            <p className="font-mono text-xs text-gray-400 leading-relaxed">
              Pull prospect data from Smartlead campaigns into tracked link sessions.
            </p>

            {/* Webhook URL Copy Area */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block">Webhook URL</label>
              <div className="relative flex items-center border border-[var(--border-subtle)] bg-[#080B0F]/60 rounded p-2 font-mono text-[11px] overflow-hidden select-all text-gray-300">
                <span className="truncate pr-16">{webhookUrl || 'Loading Webhook URL...'}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(webhookUrl, 'smartlead')}
                  disabled={!webhookUrl}
                  className="absolute right-1 top-1 bottom-1 px-3 bg-[#6366f1] hover:bg-[#5053e1] disabled:bg-gray-700 text-white font-mono text-[10px] rounded transition-all active:scale-[0.98]"
                >
                  {copiedKey === 'smartlead' ? 'COPIED!' : 'COPY'}
                </button>
              </div>
            </div>

            {/* Setup Instructions */}
            <div className="text-[11px] font-mono text-gray-400 space-y-1 bg-[#080B0F]/20 p-2.5 rounded border border-[var(--border-subtle)]/40">
              <span className="text-[10px] text-gray-300 font-bold uppercase tracking-wider block mb-1">Setup Instructions:</span>
              <p>1. Go to Settings &gt; Webhooks in Smartlead.</p>
              <p>2. Create a webhook for the event <span className="text-[#6366f1]">Email Sent</span>.</p>
              <p>3. Paste the Webhook URL above.</p>
              <p>4. Reference <code className="text-green-400 font-bold font-mono text-[11px] select-all bg-gray-950 px-1 py-0.5 rounded">{"{{churnaut_link}}"}</code> in sequences.</p>
            </div>

            {/* Expected Fields Collapsible */}
            <div className="border border-[var(--border-subtle)]/60 bg-[#080B0F]/10 rounded overflow-hidden">
              <button
                type="button"
                onClick={() => toggleExpectedFields('smartlead')}
                className="w-full text-left p-2.5 font-mono text-[10px] font-bold text-gray-400 hover:text-white uppercase hover:bg-[var(--border-subtle)]/20 transition-all flex justify-between items-center"
              >
                <span>Expected Payload Fields</span>
                <span>{openExpectedFields['smartlead'] ? '[-]' : '[+]'}</span>
              </button>
              {openExpectedFields['smartlead'] && (
                <div className="p-3 border-t border-[var(--border-subtle)]/60 text-[10px] font-mono text-gray-400 space-y-2 leading-relaxed bg-[#080B0F]/25">
                  <p className="text-gray-300 font-semibold">JSON Fields:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><code className="text-indigo-400">prospect_name</code> (string)</li>
                    <li><code className="text-indigo-400">prospect_email</code> (string)</li>
                    <li><code className="text-indigo-400">company_name</code> (string)</li>
                    <li><code className="text-indigo-400">job_title</code> (string)</li>
                    <li><code className="text-indigo-400">assigned_rep</code> (string)</li>
                    <li>
                      <code className="text-indigo-400">signal_type</code> (string) — 
                      <span className="text-yellow-400/90 font-semibold"> Must be &quot;Smartlead&quot;</span>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Apollo */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Apollo</h3>
              <div className="flex items-center gap-1.5 text-green-400 text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                Ready
              </div>
            </div>
            <p className="font-mono text-xs text-gray-400 leading-relaxed">
              Sync Apollo sequence activity and contact data for real-time personalization.
            </p>

            {/* Webhook URL Copy Area */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block">Webhook URL</label>
              <div className="relative flex items-center border border-[var(--border-subtle)] bg-[#080B0F]/60 rounded p-2 font-mono text-[11px] overflow-hidden select-all text-gray-300">
                <span className="truncate pr-16">{webhookUrl || 'Loading Webhook URL...'}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(webhookUrl, 'apollo')}
                  disabled={!webhookUrl}
                  className="absolute right-1 top-1 bottom-1 px-3 bg-[#6366f1] hover:bg-[#5053e1] disabled:bg-gray-700 text-white font-mono text-[10px] rounded transition-all active:scale-[0.98]"
                >
                  {copiedKey === 'apollo' ? 'COPIED!' : 'COPY'}
                </button>
              </div>
            </div>

            {/* Setup Instructions */}
            <div className="text-[11px] font-mono text-gray-400 space-y-1 bg-[#080B0F]/20 p-2.5 rounded border border-[var(--border-subtle)]/40">
              <span className="text-[10px] text-gray-300 font-bold uppercase tracking-wider block mb-1">Setup Instructions:</span>
              <p>1. Go to Integrations &gt; Webhooks in Apollo settings.</p>
              <p>2. Create a webhook targeting active sequence events.</p>
              <p>3. Paste the Webhook URL above.</p>
              <p>4. Use the custom field <code className="text-green-400 font-bold font-mono text-[11px] select-all bg-gray-950 px-1 py-0.5 rounded">{"{{churnaut_link}}"}</code> in templates.</p>
            </div>

            {/* Expected Fields Collapsible */}
            <div className="border border-[var(--border-subtle)]/60 bg-[#080B0F]/10 rounded overflow-hidden">
              <button
                type="button"
                onClick={() => toggleExpectedFields('apollo')}
                className="w-full text-left p-2.5 font-mono text-[10px] font-bold text-gray-400 hover:text-white uppercase hover:bg-[var(--border-subtle)]/20 transition-all flex justify-between items-center"
              >
                <span>Expected Payload Fields</span>
                <span>{openExpectedFields['apollo'] ? '[-]' : '[+]'}</span>
              </button>
              {openExpectedFields['apollo'] && (
                <div className="p-3 border-t border-[var(--border-subtle)]/60 text-[10px] font-mono text-gray-400 space-y-2 leading-relaxed bg-[#080B0F]/25">
                  <p className="text-gray-300 font-semibold">JSON Fields:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><code className="text-indigo-400">prospect_name</code> (string)</li>
                    <li><code className="text-indigo-400">prospect_email</code> (string)</li>
                    <li><code className="text-indigo-400">company_name</code> (string)</li>
                    <li><code className="text-indigo-400">job_title</code> (string)</li>
                    <li><code className="text-indigo-400">assigned_rep</code> (string)</li>
                    <li>
                      <code className="text-indigo-400">signal_type</code> (string) — 
                      <span className="text-yellow-400/90 font-semibold"> Must be &quot;Apollo&quot;</span>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Lemlist */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Lemlist</h3>
              <div className="flex items-center gap-1.5 text-green-400 text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                Ready
              </div>
            </div>
            <p className="font-mono text-xs text-gray-400 leading-relaxed">
              Enrich sessions from Lemlist campaigns with prospect and sequence context.
            </p>

            {/* Webhook URL Copy Area */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block">Webhook URL</label>
              <div className="relative flex items-center border border-[var(--border-subtle)] bg-[#080B0F]/60 rounded p-2 font-mono text-[11px] overflow-hidden select-all text-gray-300">
                <span className="truncate pr-16">{webhookUrl || 'Loading Webhook URL...'}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(webhookUrl, 'lemlist')}
                  disabled={!webhookUrl}
                  className="absolute right-1 top-1 bottom-1 px-3 bg-[#6366f1] hover:bg-[#5053e1] disabled:bg-gray-700 text-white font-mono text-[10px] rounded transition-all active:scale-[0.98]"
                >
                  {copiedKey === 'lemlist' ? 'COPIED!' : 'COPY'}
                </button>
              </div>
            </div>

            {/* Setup Instructions */}
            <div className="text-[11px] font-mono text-gray-400 space-y-1 bg-[#080B0F]/20 p-2.5 rounded border border-[var(--border-subtle)]/40">
              <span className="text-[10px] text-gray-300 font-bold uppercase tracking-wider block mb-1">Setup Instructions:</span>
              <p>1. Add a Webhook/API node in Lemlist Campaign workflow.</p>
              <p>2. Set method to POST, targeting the URL above.</p>
              <p>3. Paste the Webhook URL above.</p>
              <p>4. Reference the variable <code className="text-green-400 font-bold font-mono text-[11px] select-all bg-gray-950 px-1 py-0.5 rounded">{"{{churnaut_link}}"}</code> in templates.</p>
            </div>

            {/* Expected Fields Collapsible */}
            <div className="border border-[var(--border-subtle)]/60 bg-[#080B0F]/10 rounded overflow-hidden">
              <button
                type="button"
                onClick={() => toggleExpectedFields('lemlist')}
                className="w-full text-left p-2.5 font-mono text-[10px] font-bold text-gray-400 hover:text-white uppercase hover:bg-[var(--border-subtle)]/20 transition-all flex justify-between items-center"
              >
                <span>Expected Payload Fields</span>
                <span>{openExpectedFields['lemlist'] ? '[-]' : '[+]'}</span>
              </button>
              {openExpectedFields['lemlist'] && (
                <div className="p-3 border-t border-[var(--border-subtle)]/60 text-[10px] font-mono text-gray-400 space-y-2 leading-relaxed bg-[#080B0F]/25">
                  <p className="text-gray-300 font-semibold">JSON Fields:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><code className="text-indigo-400">prospect_name</code> (string)</li>
                    <li><code className="text-indigo-400">prospect_email</code> (string)</li>
                    <li><code className="text-indigo-400">company_name</code> (string)</li>
                    <li><code className="text-indigo-400">job_title</code> (string)</li>
                    <li><code className="text-indigo-400">assigned_rep</code> (string)</li>
                    <li>
                      <code className="text-indigo-400">signal_type</code> (string) — 
                      <span className="text-yellow-400/90 font-semibold"> Must be &quot;Lemlist&quot;</span>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Calendly */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Calendly</h3>
              {calendlyStatus?.connected ? (
                <div className="flex items-center gap-1.5 text-green-400 text-xs font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                  Active
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-gray-500 text-xs font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                  Disconnected
                </div>
              )}
            </div>
            <p className="font-mono text-xs text-gray-400 leading-relaxed">
              OAuth-based calendar embed — route visitors to the right rep&apos;s booking page.
            </p>
          </div>
          <div>
            <Link
              href="/dashboard/integrations/calendly"
              className="block w-full py-2 px-3 border border-[var(--border-subtle)] hover:border-[#6366f1] hover:text-white text-gray-300 font-mono text-xs rounded text-center transition-all hover:bg-[#6366f1]/5 active:scale-[0.98]"
            >
              MANAGE →
            </Link>
          </div>
        </div>

        {/* Zapier */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Zapier</h3>
              <div className="flex items-center gap-1.5 text-green-400 text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                Active
              </div>
            </div>
            <p className="font-mono text-xs text-gray-400 leading-relaxed">
              Send prospect data from any Zap directly to Churnaut and generate a personalized tracked link automatically.
            </p>

            {/* Webhook URL Copy Area */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block">Webhook URL</label>
              <div className="relative flex items-center border border-[var(--border-subtle)] bg-[#080B0F]/60 rounded p-2 font-mono text-[11px] overflow-hidden select-all text-gray-300">
                <span className="truncate pr-16">{webhookUrl || 'Loading Webhook URL...'}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(webhookUrl, 'zapier')}
                  disabled={!webhookUrl}
                  className="absolute right-1 top-1 bottom-1 px-3 bg-[#6366f1] hover:bg-[#5053e1] disabled:bg-gray-700 text-white font-mono text-[10px] rounded transition-all active:scale-[0.98]"
                >
                  {copiedKey === 'zapier' ? 'COPIED!' : 'COPY'}
                </button>
              </div>
            </div>

            {/* Setup Instructions */}
            <div className="text-[11px] font-mono text-gray-400 space-y-1 bg-[#080B0F]/20 p-2.5 rounded border border-[var(--border-subtle)]/40">
              <span className="text-[10px] text-gray-300 font-bold uppercase tracking-wider block mb-1">Setup Instructions:</span>
              <p>1. In Zapier, create a new Zap and choose your trigger app (e.g. Google Sheets, HubSpot, Instantly)</p>
              <p>2. Add a Webhooks by Zapier action &rarr; POST</p>
              <p>3. Paste your Churnaut webhook URL above as the endpoint</p>
              <p>4. Map fields in the payload: prospect_name, prospect_email, company_name, job_title, assigned_rep, signal_type</p>
              <p>5. Set signal_type to &quot;Zapier&quot; to correctly attribute traffic in analytics</p>
              <p>6. Add <code className="text-green-400 font-bold font-mono text-[11px] select-all bg-gray-950 px-1 py-0.5 rounded">{"{{churnaut_link}}"}</code> as a custom variable in your email template</p>
            </div>

            {/* Expected Fields Collapsible */}
            <div className="border border-[var(--border-subtle)]/60 bg-[#080B0F]/10 rounded overflow-hidden">
              <button
                type="button"
                onClick={() => toggleExpectedFields('zapier')}
                className="w-full text-left p-2.5 font-mono text-[10px] font-bold text-gray-400 hover:text-white uppercase hover:bg-[var(--border-subtle)]/20 transition-all flex justify-between items-center"
              >
                <span>Expected Payload Fields</span>
                <span>{openExpectedFields['zapier'] ? '[-]' : '[+]'}</span>
              </button>
              {openExpectedFields['zapier'] && (
                <div className="p-3 border-t border-[var(--border-subtle)]/60 text-[10px] font-mono text-gray-400 space-y-2 leading-relaxed bg-[#080B0F]/25">
                  <p className="text-gray-300 font-semibold">JSON Fields:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><code className="text-indigo-400">prospect_name</code> (string)</li>
                    <li><code className="text-indigo-400">prospect_email</code> (string)</li>
                    <li><code className="text-indigo-400">company_name</code> (string)</li>
                    <li><code className="text-indigo-400">job_title</code> (string)</li>
                    <li><code className="text-indigo-400">assigned_rep</code> (string)</li>
                    <li>
                      <code className="text-indigo-400">signal_type</code> (string) — 
                      <span className="text-yellow-400/90 font-semibold"> Must be &quot;Zapier&quot;</span>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Make */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Make</h3>
              <div className="flex items-center gap-1.5 text-green-400 text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                Active
              </div>
            </div>
            <p className="font-mono text-xs text-gray-400 leading-relaxed">
              Connect any Make scenario to Churnaut via webhook and auto-generate tracked links for every prospect in your automation.
            </p>

            {/* Webhook URL Copy Area */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block">Webhook URL</label>
              <div className="relative flex items-center border border-[var(--border-subtle)] bg-[#080B0F]/60 rounded p-2 font-mono text-[11px] overflow-hidden select-all text-gray-300">
                <span className="truncate pr-16">{webhookUrl || 'Loading Webhook URL...'}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(webhookUrl, 'make')}
                  disabled={!webhookUrl}
                  className="absolute right-1 top-1 bottom-1 px-3 bg-[#6366f1] hover:bg-[#5053e1] disabled:bg-gray-700 text-white font-mono text-[10px] rounded transition-all active:scale-[0.98]"
                >
                  {copiedKey === 'make' ? 'COPIED!' : 'COPY'}
                </button>
              </div>
            </div>

            {/* Setup Instructions */}
            <div className="text-[11px] font-mono text-gray-400 space-y-1 bg-[#080B0F]/20 p-2.5 rounded border border-[var(--border-subtle)]/40">
              <span className="text-[10px] text-gray-300 font-bold uppercase tracking-wider block mb-1">Setup Instructions:</span>
              <p>1. In Make, open your scenario and add an HTTP module &rarr; Make a request</p>
              <p>2. Set method to POST and paste your Churnaut webhook URL above</p>
              <p>3. Set Content-Type header to application/json</p>
              <p>4. Map your prospect fields in the request body: prospect_name, prospect_email, company_name, job_title, assigned_rep, signal_type</p>
              <p>5. Set signal_type to &quot;Make&quot; for correct analytics attribution</p>
              <p>6. Use the churnaut_link value from the response in your downstream email or CRM module</p>
            </div>

            {/* Expected Fields Collapsible */}
            <div className="border border-[var(--border-subtle)]/60 bg-[#080B0F]/10 rounded overflow-hidden">
              <button
                type="button"
                onClick={() => toggleExpectedFields('make')}
                className="w-full text-left p-2.5 font-mono text-[10px] font-bold text-gray-400 hover:text-white uppercase hover:bg-[var(--border-subtle)]/20 transition-all flex justify-between items-center"
              >
                <span>Expected Payload Fields</span>
                <span>{openExpectedFields['make'] ? '[-]' : '[+]'}</span>
              </button>
              {openExpectedFields['make'] && (
                <div className="p-3 border-t border-[var(--border-subtle)]/60 text-[10px] font-mono text-gray-400 space-y-2 leading-relaxed bg-[#080B0F]/25">
                  <p className="text-gray-300 font-semibold">JSON Fields:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><code className="text-indigo-400">prospect_name</code> (string)</li>
                    <li><code className="text-indigo-400">prospect_email</code> (string)</li>
                    <li><code className="text-indigo-400">company_name</code> (string)</li>
                    <li><code className="text-indigo-400">job_title</code> (string)</li>
                    <li><code className="text-indigo-400">assigned_rep</code> (string)</li>
                    <li>
                      <code className="text-indigo-400">signal_type</code> (string) — 
                      <span className="text-yellow-400/90 font-semibold"> Must be &quot;Make&quot;</span>
                    </li>
                  </ul>
                </div>
              )}
            </div>
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
