'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface CrmStatus {
  connected: boolean;
  crm_type: string | null;
  connected_at: string | null;
}

export default function CloseSettingsPage() {
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
  }, []);

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Close CRM? This will remove all synchronization tokens.')) {
      return;
    }
    setDisconnecting(true);
    try {
      const res = await fetch('/api/oauth/crm', {
        method: 'DELETE',
      });
      if (res.ok) {
        setStatus({ connected: false, crm_type: null, connected_at: null });
        setMessage({ type: 'success', text: 'Close CRM connection successfully removed.' });
      } else {
        setMessage({ type: 'error', text: 'Failed to disconnect Close CRM. Please try again.' });
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
        RETRIEVING CLOSE CRM STATUS...
      </div>
    );
  }

  const isConnected = status?.connected && status.crm_type === 'close';

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
            <span className="text-gray-300">CLOSE</span>
          </div>
          <h1 className="text-xl font-bold tracking-wider font-mono uppercase text-white">
            CLOSE CRM
          </h1>
          <p className="text-xs font-mono text-gray-400 mt-1">
            Map Close CRM leads, opportunities, and activities to build real-time personalization rules.
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

      {/* Close Integration Card */}
      <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-lg p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                Close CRM Connection
              </h3>
              {isConnected ? (
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
              Sync Close CRM leads, opportunities, and rep activity into personalization flows.
            </p>
          </div>

          <div>
            {isConnected ? (
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="w-full sm:w-auto bg-red-950/20 hover:bg-red-950/40 border border-red-900/40 hover:border-red-800/80 text-red-400 font-mono text-xs py-2.5 px-6 rounded transition-all active:scale-[0.98] disabled:opacity-55"
              >
                {disconnecting ? 'DISCONNECTING...' : 'DISCONNECT CLOSE'}
              </button>
            ) : (
              <a
                href="/api/oauth/close"
                className="inline-block text-center w-full sm:w-auto bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-xs py-2.5 px-6 rounded transition-all active:scale-[0.98]"
              >
                CONNECT CLOSE
              </a>
            )}
          </div>
        </div>

        {/* Connection Metadata Panel */}
        {isConnected && (
          <div className="border border-[var(--border-subtle)]/60 bg-[#080B0F] rounded p-4 font-mono text-xs text-gray-400 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 leading-relaxed">
              <div>
                <span className="text-gray-500 uppercase tracking-tight">CRM Provider:</span>{' '}
                <span className="text-white uppercase">CLOSE</span>
              </div>
              <div>
                <span className="text-gray-500 uppercase tracking-tight">Connection Date:</span>{' '}
                <span className="text-white">{formatDate(status.connected_at)}</span>
              </div>
              <div>
                <span className="text-gray-500 uppercase tracking-tight">Active Scopes:</span>{' '}
                <span className="text-indigo-400 text-[10px] leading-tight">
                  leads.read, contacts.read, opportunities.read, users.read
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
    </div>
  );
}
