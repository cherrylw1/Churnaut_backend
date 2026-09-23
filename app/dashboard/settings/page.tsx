'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Surface } from '@/components/dashboard/Surface';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { ProgressBar } from '@/components/dashboard/ProgressBar';
import { FormField } from '@/components/dashboard/FormField';

import { GeometricIcon } from '@/components/dashboard/ActiveCampaignsCard';

const VISIT_LIMITS: Record<string, number> = { starter: 500, growth: 5000, pro: Infinity };
const PLAN_LABELS: Record<string, string> = { starter: 'Starter', growth: 'Growth', pro: 'Pro' };
const DOMAIN_LIMITS: Record<string, number> = { starter: 1, growth: 3, pro: 10 };
type ClientDomain = { id: string; origin: string | null; domain: string; is_primary: boolean; active: boolean };

export default function SettingsPage() {
  const [profileState, setProfileState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [domainState, setDomainState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [domain, setDomain] = useState('');
  const [persistedDomain, setPersistedDomain] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [plan, setPlan] = useState<string | null>(null);
  const [monthlyVisits, setMonthlyVisits] = useState(0);
  const [domains, setDomains] = useState<ClientDomain[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [mutation, setMutation] = useState<'idle' | 'saving' | 'adding' | 'removing'>('idle');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadProfile = async () => { setProfileState('loading'); try { const res = await fetch('/api/client'); if (!res.ok) throw new Error(); const data = await res.json(); if (!data.client) throw new Error(); const nextDomain = data.client.domain || ''; setDomain(nextDomain); setPersistedDomain(nextDomain); setCompanyName(data.client.company_name || ''); setPlan(data.client.plan || null); setMonthlyVisits(data.client.monthly_visits || 0); setProfileState('ready'); } catch { setProfileState('error'); } };
  const loadDomains = async () => { setDomainState('loading'); try { const res = await fetch('/api/client/domains'); if (!res.ok) throw new Error(); const data = await res.json(); setDomains(data.domains || []); setDomainState('ready'); } catch { setDomainState('error'); } };
  useEffect(() => { void loadProfile(); void loadDomains(); }, []);

  const handleSave = async () => { setMutation('saving'); setMessage(null); try { const res = await fetch('/api/client', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain }) }); const data = await res.json(); if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update domain.'); const next = data.domain || domain; setDomain(next); setPersistedDomain(next); setMessage({ type: 'success', text: 'Primary domain updated successfully.' }); } catch (error) { setDomain(persistedDomain); setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Network error occurred.' }); } finally { setMutation('idle'); } };
  const handleAddDomain = async () => { if (!newDomain.trim()) return; setMutation('adding'); setMessage(null); try { const res = await fetch('/api/client/domains', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain: newDomain }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Failed to add domain'); setNewDomain(''); await loadDomains(); setMessage({ type: 'success', text: 'Domain added.' }); } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to add domain.' }); } finally { setMutation('idle'); } };
  const handleRemoveDomain = async (id: string) => { setMutation('removing'); setRemovingId(id); setMessage(null); try { const res = await fetch(`/api/client/domains?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Failed to remove domain'); await loadDomains(); setMessage({ type: 'success', text: 'Domain removed.' }); } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to remove domain.' }); } finally { setMutation('idle'); setRemovingId(null); } };

  const activeDomains = domains.filter((item) => item.active).length;
  const visitLimit = plan ? VISIT_LIMITS[plan] : null;
  const visitPct = visitLimit && visitLimit !== Infinity ? Math.min((monthlyVisits / visitLimit) * 100, 100) : 0;
  const tone: 'danger' | 'warning' | 'accent' = visitPct >= 90 ? 'danger' : visitPct >= 70 ? 'warning' : 'accent';
  const busy = mutation !== 'idle';

  return (
    <div className="dashboard-settings max-w-5xl space-y-8">
      <PageHeader eyebrow="Signal Field · Workspace controls" title="Settings" description="Manage your workspace, domains, and usage." />
      {message && (
        <div role={message.type === 'success' ? 'status' : 'alert'} aria-live="polite" className={`rounded-2xl border p-4 text-xs font-medium ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
          {message.text}
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Workspace Identity Bento */}
        <Surface className="rounded-3xl border border-slate-200/90 bg-white p-6 md:p-8 space-y-6 shadow-xs hover:shadow-md transition-all duration-300">
          <div className="flex items-center gap-3">
            <GeometricIcon type="stripes" bg="bg-blue-600" />
            <div>
              <p className="dashboard-eyebrow text-[10px] font-mono text-slate-400">Workspace identity</p>
              <h2 className="text-base font-bold text-slate-900 font-sans tracking-tight">Your workspace</h2>
            </div>
          </div>
          {profileState === 'loading' ? (
            <div role="status" aria-busy="true" aria-label="Loading workspace profile" className="space-y-3 motion-safe:animate-pulse">
              <div className="h-10 rounded-2xl bg-slate-100" />
              <div className="h-10 rounded-2xl bg-slate-100" />
            </div>
          ) : profileState === 'error' ? (
            <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              Workspace profile unavailable. <button type="button" onClick={loadProfile} className="font-semibold underline">TRY AGAIN</button>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="dashboard-field-label text-[10px] font-mono text-slate-500 uppercase tracking-wider">Company name</p>
                <div className="mt-1.5 rounded-2xl border border-slate-200/90 bg-slate-50/70 px-4 py-3 text-sm text-slate-700" aria-readonly="true">
                  {companyName || '—'}
                </div>
              </div>
              <fieldset className="space-y-2">
                <legend className="dashboard-field-label text-[10px] font-mono text-slate-500 uppercase tracking-wider">Registered domains</legend>
                {domainState === 'loading' ? (
                  <div role="status" aria-busy="true" className="text-xs text-slate-400 font-mono">Loading domains…</div>
                ) : domainState === 'error' ? (
                  <p role="alert" className="text-xs text-rose-600">Domain registry unavailable. <button type="button" onClick={loadDomains} className="font-semibold underline">TRY AGAIN</button></p>
                ) : domains.length === 0 ? (
                  <p className="text-xs text-slate-400">No domains registered yet.</p>
                ) : (
                  domains.map((item) => {
                    const value = item.origin || item.domain;
                    return (
                      <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3.5 hover:border-slate-300 hover:bg-white transition-all shadow-2xs">
                        <input
                          type="radio"
                          id={`primary-${item.id}`}
                          name="primary-domain"
                          checked={domain === value}
                          onChange={() => setDomain(value)}
                          aria-label={`Make ${value} primary`}
                          className="accent-[#165B40]"
                        />
                        <label htmlFor={`primary-${item.id}`} className="min-w-0 flex-1 truncate text-xs font-mono text-slate-800 cursor-pointer">
                          {value}
                        </label>
                        {activeDomains > 1 && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleRemoveDomain(item.id)}
                            className="text-xs text-rose-600 font-semibold hover:underline disabled:opacity-50"
                          >
                            {mutation === 'removing' && removingId === item.id ? 'REMOVING…' : 'Remove'}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
                <p className="text-[11px] font-mono text-slate-400 pt-1">
                  {activeDomains} / {plan ? (DOMAIN_LIMITS[plan] || 1) : '—'} domains used
                </p>
              </fieldset>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <FormField id="new-domain" label="Add a domain">
                    <input
                      id="new-domain"
                      type="url"
                      value={newDomain}
                      onChange={(event) => setNewDomain(event.target.value)}
                      placeholder="https://yourwebsite.com"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-900 outline-none focus:border-[#165B40] transition-colors"
                    />
                  </FormField>
                </div>
                <button
                  type="button"
                  disabled={busy || !newDomain.trim() || !plan || activeDomains >= (DOMAIN_LIMITS[plan] || 1)}
                  onClick={() => void handleAddDomain()}
                  className="dashboard-button-secondary rounded-full !py-2.5 !px-4 text-xs font-semibold shadow-xs disabled:opacity-40 shrink-0"
                >
                  {mutation === 'adding' ? 'ADDING…' : 'Add'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={busy || domain === persistedDomain}
                className="w-full dashboard-button-primary rounded-full !py-2.5 text-xs font-semibold shadow-xs disabled:opacity-50"
              >
                {mutation === 'saving' ? 'SAVING…' : 'Save Primary Domain'}
              </button>
            </div>
          )}
        </Surface>

        {/* Capacity Bento */}
        <Surface className="rounded-3xl border border-slate-200/90 bg-white p-6 md:p-8 space-y-6 shadow-xs hover:shadow-md transition-all duration-300">
          <div className="flex items-center gap-3">
            <GeometricIcon type="rings" bg="bg-emerald-600" />
            <div>
              <p className="dashboard-eyebrow text-[10px] font-mono text-slate-400">Capacity</p>
              <h2 className="text-base font-bold text-slate-900 font-sans tracking-tight">Your capacity</h2>
            </div>
          </div>
          {profileState === 'loading' ? (
            <div role="status" aria-busy="true" aria-label="Loading workspace capacity" className="space-y-3 motion-safe:animate-pulse">
              <div className="h-8 w-1/3 rounded-2xl bg-slate-100" />
              <div className="h-3 rounded-full bg-slate-100" />
            </div>
          ) : profileState === 'error' ? (
            <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              Capacity unavailable. <button type="button" onClick={loadProfile} className="font-semibold underline">TRY AGAIN</button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50">
                <span className="text-xs font-semibold text-slate-600 font-sans">Current plan tier</span>
                <StatusBadge tone="info">{PLAN_LABELS[plan || ''] || plan || 'Unknown'}</StatusBadge>
              </div>
              {visitLimit === Infinity ? (
                <div className="p-4 rounded-2xl border border-emerald-200/70 bg-emerald-50/40 text-xs font-semibold text-emerald-800">
                  Unlimited tracked visits enabled
                </div>
              ) : visitLimit ? (
                <div className="space-y-2">
                  <ProgressBar value={visitPct} tone={tone} label={`Tracked visits this month · ${monthlyVisits.toLocaleString()} / ${visitLimit.toLocaleString()}`} />
                </div>
              ) : (
                <p className="text-xs text-slate-400">Visit capacity unavailable.</p>
              )}
              <p className="text-[11px] font-mono text-slate-400">
                Usage telemetry resets on the 1st of each calendar month.
              </p>
              <Link href="/dashboard/billing" className="dashboard-button-secondary rounded-full block w-full text-center !py-2.5 text-xs font-semibold shadow-xs">
                Manage Billing →
              </Link>
            </div>
          )}
        </Surface>
      </div>
    </div>
  );
}
