'use client';

import React, { useState, useEffect } from 'react';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    async function loadClient() {
      try {
        const res = await fetch('/api/client');
        if (res.ok) {
          const data = await res.json();
          if (data.client) {
            setDomain(data.client.domain || '');
            setCompanyName(data.client.company_name || '');
          }
        }
      } catch (err) {
        console.error('Failed to load client profile:', err);
      } finally {
        setLoading(false);
      }
    }
    loadClient();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/client', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ domain }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({ type: 'success', text: 'Domain updated successfully.' });
        setDomain(data.domain);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update domain.' });
      }
    } catch (err) {
      console.error('Error updating domain:', err);
      setMessage({ type: 'error', text: 'Network error occurred.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl bg-[var(--bg-base)] text-[var(--text-primary)] min-h-screen">
      {/* Page Header */}
      <div className="border-b border-[var(--border-subtle)] pb-5">
        <h1 className="text-xl font-bold tracking-wider font-mono uppercase text-white">
          SETTINGS
        </h1>
        <p className="text-xs font-mono text-gray-400 mt-1">
          Manage your account, security, and billing preferences.
        </p>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Card 1: Account */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-lg p-6 flex flex-col justify-between hover:border-[#6366f1]/30 hover:bg-[var(--bg-elevated)]/30 transition-all group">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold bg-green-950/20 text-green-400 border border-green-900/40 px-2 py-0.5 rounded uppercase">
                ACTIVE
              </span>
              <span className="text-xs font-mono text-gray-500">Profile</span>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-sm font-mono font-bold text-white uppercase group-hover:text-[#6366f1] transition-colors">
                Account
              </h2>
              <p className="text-xs font-mono text-gray-400 leading-relaxed">
                Update your display name, email address, and workspace preferences.
              </p>
            </div>

            {loading ? (
              <div className="text-xs font-mono text-gray-500 pt-4">Loading client details...</div>
            ) : (
              isExpanded && (
                <div className="space-y-4 pt-4 border-t border-[var(--border-subtle)]">
                  {/* Website Domain Input */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-gray-400 uppercase block">
                      Website Domain
                    </label>
                    <input
                      type="text"
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      placeholder="https://yourwebsite.com"
                      className="w-full bg-[#080B0F] border border-[var(--border-subtle)] text-white text-xs font-mono px-3 py-2 rounded focus:outline-none focus:border-[#6366f1] transition-all"
                    />
                  </div>

                  {/* Company Name Input (Display Only) */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-gray-400 uppercase block">
                      Company Name
                    </label>
                    <input
                      type="text"
                      value={companyName}
                      readOnly
                      className="w-full bg-[#080B0F] border border-[var(--border-subtle)] text-gray-500 text-xs font-mono px-3 py-2 rounded cursor-not-allowed outline-none opacity-60"
                    />
                  </div>

                  {message && (
                    <div className={`text-[11px] font-mono ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                      {message.text}
                    </div>
                  )}
                </div>
              )
            )}
          </div>
          
          <div className="pt-6 flex gap-2">
            {!loading && (
              isExpanded ? (
                <>
                  <button
                    onClick={() => {
                      setIsExpanded(false);
                      setMessage(null);
                    }}
                    className="flex-1 py-2 px-3 border border-[var(--border-subtle)] text-white font-mono text-xs rounded hover:bg-white/5 transition-all text-center"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 py-2 px-3 bg-[#6366f1] text-white font-mono text-xs rounded hover:bg-[#4f46e5] disabled:opacity-50 transition-all text-center"
                  >
                    {saving ? 'SAVING...' : 'SAVE'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsExpanded(true)}
                  className="w-full py-2 px-3 border border-[var(--border-subtle)] text-white font-mono text-xs rounded hover:border-[#6366f1]/50 hover:bg-white/5 text-center transition-all"
                >
                  MANAGE &rarr;
                </button>
              )
            )}
          </div>
        </div>

        {/* Card 2: Billing */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-lg p-6 flex flex-col justify-between opacity-80 transition-all">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold bg-yellow-950/20 text-yellow-500 border border-yellow-900/40 px-2 py-0.5 rounded uppercase">
                PENDING
              </span>
              <span className="text-xs font-mono text-gray-500">Lemon Squeezy</span>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-sm font-mono font-bold text-white uppercase">
                Billing
              </h2>
              <p className="text-xs font-mono text-gray-400 leading-relaxed">
                Manage your subscription, view invoices, and update payment details. Powered by Lemon Squeezy.
              </p>
            </div>
          </div>
          
          <div className="pt-6">
            <button
              disabled
              className="w-full py-2 px-3 border border-[var(--border-subtle)] text-gray-500 font-mono text-xs rounded opacity-40 cursor-not-allowed text-center"
            >
              COMING SOON
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
