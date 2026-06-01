'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface CrmStatus {
  connected: boolean;
  crm_type: string | null;
  connected_at: string | null;
}

export default function CrmSettingsPage() {
  const [status, setStatus] = useState<CrmStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
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
      } else if (error) {
        let errorText = 'Failed to connect to CRM.';
        if (error === 'token_exchange_failed') {
          errorText = 'Token exchange with HubSpot failed. Please check your credentials.';
        } else if (error === 'client_not_found') {
          errorText = 'Active client profile was not found. Please log in again.';
        } else if (error === 'missing_parameters') {
          errorText = 'Authentication callback was missing required fields.';
        } else if (error === 'server_configuration_error') {
          errorText = 'HubSpot client secret or client ID is not configured on the server.';
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

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect HubSpot CRM? This will remove all synchronization tokens.')) {
      return;
    }
    setDisconnecting(true);
    try {
      const res = await fetch('/api/oauth/crm', {
        method: 'DELETE',
      });
      if (res.ok) {
        setStatus({ connected: false, crm_type: null, connected_at: null });
        setMessage({ type: 'success', text: 'CRM connection successfully removed.' });
        // Clear search parameters from URL
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } else {
        setMessage({ type: 'error', text: 'Failed to disconnect CRM. Please try again.' });
      }
    } catch (err) {
      console.error('[CRM Disconnect Error] Failed to process disconnection:', err);
      setMessage({ type: 'error', text: 'An unexpected error occurred during disconnection.' });
    } finally {
      setDisconnecting(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500 font-mono text-sm uppercase tracking-widest bg-[var(--bg-base)] text-[var(--text-primary)] min-h-screen">
        RETRIEVING CRM INTEGRATION STATUS...
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl bg-[var(--bg-base)] text-[var(--text-primary)] min-h-screen">
      {/* Page Header */}
      <div className="border-b border-[var(--border-subtle)] pb-5 flex justify-between items-end">
        <div>
          <div className="flex items-center space-x-2 text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-1.5">
            <Link href="/dashboard/settings" className="hover:text-white transition-colors">
              SETTINGS
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

      {/* CRM Providers Section */}
      <div className="space-y-6">
        <h2 className="text-xs font-mono font-bold text-[#6366f1] uppercase tracking-widest bg-[var(--border-subtle)]/40 py-1.5 px-3 rounded border border-[var(--border-subtle)] inline-block">
          Supported CRM Suites
        </h2>

        <div className="grid grid-cols-1 gap-6">
          {/* HubSpot Card */}
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-lg p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center space-x-3">
                  <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                    HubSpot CRM
                  </h3>
                  {status?.connected && status.crm_type === 'hubspot' ? (
                    <div className="flex items-center space-x-2 border border-green-900/40 bg-green-950/20 text-[#10b981] px-2.5 py-0.5 rounded font-mono text-[9px] font-bold">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#10b981]"></span>
                      </span>
                      <span>CONNECTED</span>
                    </div>
                  ) : (
                    <span className="text-[9px] font-mono font-bold bg-[var(--border-subtle)] text-gray-500 border border-[var(--border-subtle)] px-2.5 py-0.5 rounded uppercase">
                      DISCONNECTED
                    </span>
                  )}
                </div>
                <p className="text-xs font-mono text-gray-400 leading-relaxed max-w-xl">
                  Sync leads, assign sales reps, track deal stage changes, and personalize user experience routes according to HubSpot lifecycle events.
                </p>
              </div>

              <div>
                {status?.connected && status.crm_type === 'hubspot' ? (
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="w-full sm:w-auto bg-red-950/20 hover:bg-red-950/40 border border-red-900/40 hover:border-red-800/80 text-red-400 font-mono text-xs py-2.5 px-6 rounded transition-all active:scale-[0.98] disabled:opacity-55"
                  >
                    {disconnecting ? 'DISCONNECTING...' : 'DISCONNECT HUBSPOT'}
                  </button>
                ) : (
                  <a
                    href="/api/oauth/hubspot"
                    className="inline-block text-center w-full sm:w-auto bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-xs py-2.5 px-6 rounded transition-all active:scale-[0.98]"
                  >
                    CONNECT HUBSPOT
                  </a>
                )}
              </div>
            </div>

            {/* If connected, show connection metadata panel */}
            {status?.connected && status.crm_type === 'hubspot' && (
              <div className="border border-[var(--border-subtle)]/60 bg-[#080B0F] rounded p-4 font-mono text-xs text-gray-400 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 leading-relaxed">
                  <div>
                    <span className="text-gray-500 uppercase tracking-tight">CRM Provider:</span>{' '}
                    <span className="text-white uppercase">HUBSPOT</span>
                  </div>
                  <div>
                    <span className="text-gray-500 uppercase tracking-tight">Connection Date:</span>{' '}
                    <span className="text-white">{formatDate(status.connected_at)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 uppercase tracking-tight">Active Scopes:</span>{' '}
                    <span className="text-indigo-400 text-[10px] leading-tight">
                      contacts.read, deals.read, companies.read, owners.read
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 uppercase tracking-tight">Sync Status:</span>{' '}
                    <span className="text-green-400 font-bold">ACTIVE & SYNCED</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Salesforce Card Placeholder */}
          <div className="border border-[var(--border-subtle)]/60 bg-[var(--bg-elevated)]/30 rounded-lg p-6 opacity-60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center space-x-3">
                <h3 className="text-sm font-mono font-bold text-gray-400 uppercase tracking-wider">
                  Salesforce CRM
                </h3>
                <span className="text-[9px] font-mono font-bold bg-[var(--border-subtle)] text-gray-600 border border-[var(--border-subtle)]/60 px-2 py-0.5 rounded uppercase">
                  COMING SOON
                </span>
              </div>
              <p className="text-xs font-mono text-gray-500 leading-relaxed max-w-xl">
                Direct integration with Salesforce Sales Cloud to map standard opportunity objects.
              </p>
            </div>
            <div>
              <button
                disabled
                className="w-full sm:w-auto bg-[var(--border-subtle)]/40 text-gray-600 font-mono text-xs py-2 px-5 rounded cursor-not-allowed border border-[var(--border-subtle)]/60"
              >
                UNAVAILABLE
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
