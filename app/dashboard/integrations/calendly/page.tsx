'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface CalendlyStatus {
  connected: boolean;
  connected_at: string | null;
}

export default function CalendlySettingsPage() {
  const [status, setStatus] = useState<CalendlyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/oauth/calendly/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      } else {
        console.error('Failed to load Calendly status');
      }
    } catch (err) {
      console.error('Error fetching Calendly status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Safely parse URL query parameters on the client
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'true') {
      setMessage({ type: 'success', text: 'Calendly integration successfully connected!' });
    } else if (params.get('error')) {
      const err = params.get('error');
      setMessage({ type: 'error', text: `Failed to connect to Calendly: ${err}` });
    }
  }, []);

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Calendly? This will remove all synchronization tokens.')) {
      return;
    }
    setDisconnecting(true);
    try {
      const res = await fetch('/api/oauth/calendly/status', {
        method: 'DELETE',
      });
      if (res.ok) {
        setStatus({ connected: false, connected_at: null });
        setMessage({ type: 'success', text: 'Calendly connection successfully removed.' });
      } else {
        setMessage({ type: 'error', text: 'Failed to disconnect Calendly. Please try again.' });
      }
    } catch (err) {
      console.error('[Calendly Disconnect Error] Failed to process disconnection:', err);
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
      <div className="text-center py-12 text-[var(--text-muted)] font-mono text-sm uppercase tracking-widest bg-[var(--bg-base)] text-[var(--text-primary)] min-h-screen">
        RETRIEVING CALENDLY STATUS...
      </div>
    );
  }

  const isConnected = !!status?.connected;

  return (
    <div className="space-y-8 max-w-4xl bg-[var(--bg-base)] text-[var(--text-primary)] min-h-screen">
      {/* Page Header */}
      <div className="border-b border-[var(--border-subtle)] pb-5 flex justify-between items-end">
        <div>
          <div className="flex items-center space-x-2 text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest mb-1.5">
            <Link href="/dashboard/integrations" className="hover:text-white transition-colors">
              INTEGRATIONS
            </Link>
            <span>/</span>
            <span className="text-[var(--text-secondary)]">CALENDLY</span>
          </div>
          <h1 className="text-xl font-bold tracking-wider font-mono uppercase text-white">
            CALENDLY
          </h1>
          <p className="text-xs font-mono text-[var(--text-secondary)] mt-1">
            OAuth-based calendar embed — route visitors to the right rep&apos;s booking page.
          </p>
        </div>
        <div>
          <Link
            href="/dashboard/integrations"
            className="text-xs font-mono text-[var(--text-secondary)] hover:text-white border border-[var(--border-subtle)] px-4 py-2 rounded transition-colors"
          >
            ← BACK TO INTEGRATIONS
          </Link>
        </div>
      </div>

      {/* Notifications Alert Banner */}
      {message && (
        <div
          className={`border font-mono text-xs p-4 rounded-lg flex items-start justify-between ${
            message.type === 'success'
              ? 'border-[var(--green)]/30 bg-[var(--green)]/10 text-[var(--green)]'
              : 'border-[var(--red)]/30 bg-[var(--red)]/10 text-[var(--red)]'
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
            className="text-[var(--text-secondary)] hover:text-white transition-colors font-bold text-xs px-2"
          >
            [X]
          </button>
        </div>
      )}

      {/* Calendly Integration Card */}
      <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                Calendly Integration Status
              </h3>
              {isConnected ? (
                <div className="flex items-center space-x-2 border border-[var(--green)]/30 bg-[var(--green)]/10 text-[var(--green)] px-2.5 py-0.5 rounded font-mono text-[9px] font-bold">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--green)] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[var(--green)]"></span>
                  </span>
                  <span>CONNECTED</span>
                </div>
              ) : (
                <span className="text-[9px] font-mono font-bold bg-[var(--border-subtle)] text-[var(--text-muted)] border border-[var(--border-subtle)] px-2.5 py-0.5 rounded uppercase">
                  DISCONNECTED
                </span>
              )}
            </div>
            <p className="text-xs font-mono text-[var(--text-secondary)] leading-relaxed max-w-xl">
              Authenticate Calendly via OAuth to resolve team schedules and route visitors to the appropriate rep booking page automatically.
            </p>
          </div>

          <div>
            {isConnected ? (
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="w-full sm:w-auto bg-[var(--red)]/10 hover:bg-[var(--red)]/10 border border-[var(--red)]/30 hover:border-red-800/80 text-[var(--red)] font-mono text-xs py-2.5 px-6 rounded transition-all active:scale-[0.98] disabled:opacity-55"
              >
                {disconnecting ? 'DISCONNECTING...' : 'DISCONNECT CALENDLY'}
              </button>
            ) : (
              <a
                href="/api/oauth/calendly"
                className="inline-block text-center w-full sm:w-auto bg-[#C2683D] hover:bg-[#A8552F] text-white font-mono text-xs py-2.5 px-6 rounded transition-all active:scale-[0.98]"
              >
                CONNECT CALENDLY
              </a>
            )}
          </div>
        </div>

        {/* Connection Connection Metadata Panel */}
        {isConnected && (
          <div className="border border-[var(--border-subtle)]/60 bg-[#080B0F] rounded p-4 font-mono text-xs text-[var(--text-secondary)] space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 leading-relaxed">
              <div>
                <span className="text-[var(--text-muted)] uppercase tracking-tight">Integration:</span>{' '}
                <span className="text-white uppercase font-bold">Calendly</span>
              </div>
              <div>
                <span className="text-[var(--text-muted)] uppercase tracking-tight">Connection Date:</span>{' '}
                <span className="text-white">{formatDate(status.connected_at)}</span>
              </div>
              <div>
                <span className="text-[var(--text-muted)] uppercase tracking-tight">Status:</span>{' '}
                <span className="text-[var(--green)] font-bold">ACTIVE</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
