'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

const VISIT_LIMITS: Record<string, number> = { starter: 500, growth: 5000, pro: Infinity };
const PLAN_LABELS: Record<string, string> = { starter: 'Starter', growth: 'Growth', pro: 'Pro' };

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [plan, setPlan] = useState('starter');
  const [monthlyVisits, setMonthlyVisits] = useState(0);
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
            setPlan(data.client.plan || 'starter');
            setMonthlyVisits(data.client.monthly_visits || 0);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({ type: 'success', text: 'Domain updated successfully.' });
        setDomain(data.domain);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update domain.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error occurred.' });
    } finally {
      setSaving(false);
    }
  };

  const visitLimit = VISIT_LIMITS[plan] ?? 500;
  const visitPct = visitLimit === Infinity ? 0 : Math.min((monthlyVisits / visitLimit) * 100, 100);
  const barColor = visitPct >= 90 ? '#ef4444' : visitPct >= 70 ? '#f59e0b' : '#C2683D';

  return (
    <div className="space-y-8 max-w-4xl font-sans">

      {/* Page header */}
      <div>
        <h1 className="text-[24px] font-bold text-[var(--text-primary)]">Settings</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Manage your account, workspace, and plan.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Card 1: Account */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-[12px] p-6 flex flex-col gap-5">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-muted)] mb-3">Account</p>
            <h2 className="text-[15px] font-bold text-[var(--text-primary)]">Workspace</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-1">Your company profile and tracked domain.</p>
          </div>

          {loading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-8 bg-[var(--border-subtle)] rounded" />
              <div className="h-8 bg-[var(--border-subtle)] rounded" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Company name — read only */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                  Company Name
                </label>
                <div className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[var(--text-muted)] text-xs font-mono px-3 py-2.5 rounded-[6px] opacity-60 cursor-not-allowed">
                  {companyName || '—'}
                </div>
              </div>

              {/* Domain — editable */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                  Tracked Domain
                </label>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="https://yourwebsite.com"
                  className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] focus:border-[#C2683D] text-[var(--text-primary)] text-xs font-mono px-3 py-2.5 rounded-[6px] outline-none transition-colors"
                />
              </div>

              {message && (
                <p className={`text-[11px] font-mono ${message.type === 'success' ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                  {message.text}
                </p>
              )}

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-[#C2683D] hover:bg-[#A8552F] disabled:opacity-50 text-white text-xs font-semibold font-sans py-2.5 rounded-[8px] transition-all active:scale-[0.98]"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>

        {/* Card 2: Plan & Usage */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-[12px] p-6 flex flex-col gap-5">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-muted)] mb-3">Subscription</p>
            <h2 className="text-[15px] font-bold text-[var(--text-primary)]">Plan & Usage</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-1">{"Your current plan and this month's visit usage."}</p>
          </div>

          {loading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-6 bg-[var(--border-subtle)] rounded w-1/3" />
              <div className="h-2 bg-[var(--border-subtle)] rounded" />
            </div>
          ) : (
            <div className="space-y-5">
              {/* Plan badge */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-muted)]">Current plan</span>
                <span className="text-[11px] font-mono font-bold text-[#C2683D] border border-[#C2683D]/30 bg-[#C2683D]/10 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  {PLAN_LABELS[plan] || 'Starter'}
                </span>
              </div>

              {/* Usage bar */}
              {visitLimit !== Infinity ? (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">Tracked visits this month</span>
                    <span className={`text-[10px] font-mono font-bold ${visitPct >= 90 ? 'text-[var(--red)]' : visitPct >= 70 ? 'text-[var(--amber)]' : 'text-[var(--text-muted)]'}`}>
                      {monthlyVisits.toLocaleString()} / {visitLimit.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[var(--border-subtle)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${visitPct}%`, backgroundColor: barColor }} />
                  </div>
                  <p className="text-[9px] font-mono text-[var(--text-muted)]">Resets on the 1st of each month.</p>
                </div>
              ) : (
                <p className="text-xs font-mono text-[var(--green)]">Unlimited tracked visits</p>
              )}

              <Link
                href="/dashboard/billing"
                className="block w-full text-center border border-[#C2683D]/30 hover:border-[#C2683D] hover:bg-[#C2683D]/5 text-[#C2683D] hover:text-white text-xs font-semibold font-sans py-2.5 rounded-[8px] transition-all"
              >
                Manage Billing &rarr;
              </Link>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
