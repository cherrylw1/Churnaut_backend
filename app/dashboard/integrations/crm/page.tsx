'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface CrmStatus {
  connected: boolean;
  crm_type: string | null;
  connected_at: string | null;
}

export default function CrmIndexPage() {
  const [status, setStatus] = useState<CrmStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/oauth/crm');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      } else {
        console.error('Failed to load CRM status');
      }
    } catch (err) {
      console.error('Error fetching CRM status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Check query params in window.location.search (SSR-safe approach)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const connected = params.get('connected');
      const error = params.get('error');
      const details = params.get('details');

      if (connected === 'hubspot') {
        setMessage({ type: 'success', text: 'Successfully connected to HubSpot CRM!' });
      } else if (connected === 'pipedrive') {
        setMessage({ type: 'success', text: 'Successfully connected to Pipedrive CRM!' });
      } else if (connected === 'zoho') {
        setMessage({ type: 'success', text: 'Successfully connected to Zoho CRM!' });
      } else if (connected === 'close') {
        setMessage({ type: 'success', text: 'Successfully connected to Close CRM!' });
      } else if (error) {
        let errorText = 'Failed to connect to CRM.';
        if (error === 'token_exchange_failed') {
          errorText = 'Token exchange with HubSpot/Pipedrive/Zoho failed. Please check your credentials.';
        } else if (error === 'client_not_found') {
          errorText = 'Active client profile was not found. Please log in again.';
        } else if (error === 'missing_parameters') {
          errorText = 'Authentication callback was missing required fields.';
        } else if (error === 'server_configuration_error') {
          errorText = 'CRM client secret or client ID is not configured on the server.';
        }
        if (details) {
          try {
            const parsed = JSON.parse(decodeURIComponent(details));
            errorText += ` Details: ${parsed.error_description || parsed.message || JSON.stringify(parsed)}`;
          } catch {
            errorText += ` Details: ${decodeURIComponent(details)}`;
          }
        }
        setMessage({ type: 'error', text: errorText });
      }
    }
  }, []);

  const crmType = status?.crm_type;

  const getStatusBadge = (crmName: string) => {
    if (loading) return <span className="text-[9px] font-mono text-gray-600">...</span>;
    return crmType === crmName ? (
      <div className="flex items-center gap-1.5 text-green-400 text-xs font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
        Connected
      </div>
    ) : (
      <div className="flex items-center gap-1.5 text-gray-500 text-xs font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
        Disconnected
      </div>
    );
  };

  return (
    <div className="space-y-8 max-w-6xl bg-[var(--bg-base)] text-[var(--text-primary)] min-h-screen">
      {/* Page Header */}
      <div className="border-b border-[var(--border-subtle)] pb-5 flex justify-between items-end">
        <div>
          <div className="flex items-center space-x-2 text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-1.5">
            <Link href="/dashboard/integrations" className="hover:text-white transition-colors">
              INTEGRATIONS
            </Link>
            <span>/</span>
            <span className="text-gray-300">CRM INTEGRATIONS</span>
          </div>
          <h1 className="text-xl font-bold tracking-wider font-mono uppercase text-white">
            CRM INTEGRATIONS
          </h1>
          <p className="text-xs font-mono text-gray-400 mt-1">
            Connect your customer relationship management platforms to sync lead stages and representative assignments.
          </p>
        </div>
      </div>

      {/* Notifications Alert Banner */}
      {message && (
        <div
          className={`border font-mono text-xs p-4 rounded-lg flex items-start justify-between ${
            message.type === 'success'
              ? 'border-green-900/40 bg-green-950/20 text-[#10b981]'
              : 'border-red-900/40 bg-red-950/20 text-red-400'
          }`}
        >
          <div className="space-y-1">
            <span className="font-bold block uppercase">
              {message.type === 'success' ? 'SYSTEM CONFIRMATION' : 'INTEGRATION ERROR'}
            </span>
            <p className="leading-relaxed">{message.text}</p>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="text-gray-400 hover:text-white transition-colors font-bold text-xs px-2"
          >
            [X]
          </button>
        </div>
      )}

      {/* CRM Providers Grid */}
      <div className="space-y-6">
        <h2 className="text-xs font-mono font-bold text-[#6366f1] uppercase tracking-widest bg-[var(--border-subtle)]/40 py-1.5 px-3 rounded border border-[var(--border-subtle)] inline-block">
          Supported CRM Suites
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* HubSpot */}
          <div className={`border bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4 ${crmType === 'hubspot' ? 'border-green-900/30' : 'border-[var(--border-subtle)]'}`}>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">HubSpot</h3>
                {getStatusBadge('hubspot')}
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
          <div className={`border bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4 ${crmType === 'pipedrive' ? 'border-green-900/30' : 'border-[var(--border-subtle)]'}`}>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Pipedrive</h3>
                {getStatusBadge('pipedrive')}
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
          <div className={`border bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4 ${crmType === 'zoho' ? 'border-green-900/30' : 'border-[var(--border-subtle)]'}`}>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Zoho CRM</h3>
                {getStatusBadge('zoho')}
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
          <div className={`border bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col justify-between gap-4 ${crmType === 'close' ? 'border-green-900/30' : 'border-[var(--border-subtle)]'}`}>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-mono font-bold uppercase text-sm text-[var(--text-primary)]">Close</h3>
                {getStatusBadge('close')}
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
      </div>
    </div>
  );
}
