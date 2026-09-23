'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { SectionHeader as BaseSectionHeader } from '@/components/dashboard/SectionHeader';
function SectionHeader({ title, description, eyebrow }: { title: string; description?: string; eyebrow?: string }) { return <div>{eyebrow && <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">{eyebrow}</p>}<BaseSectionHeader title={title} description={description} /></div>; }
import { Surface } from '@/components/dashboard/Surface';
import { StatusBadge } from '@/components/dashboard/StatusBadge';

import { GeometricIcon } from '@/components/dashboard/ActiveCampaignsCard';

interface ClientProfile { id: string; company_name: string; snippet_key: string }
interface VerificationStatus { active: boolean; lastPing?: string }
const guides = {
  custom: { title: 'Custom HTML Layouts', body: 'Paste the script tags directly inside the head block, after other third-party dependencies.' },
  webflow: { title: 'Webflow Setup', body: 'Go to Project Settings → Custom Code, paste the script block into Head Code, then save and publish.' },
  wordpress: { title: 'WordPress Setup', body: 'Use a header injection plugin, paste the script tag in the Scripts in Header area, and save.' },
  shopify: { title: 'Shopify Setup', body: 'Open Online Store → Themes → Edit Code, add the snippet above the closing head tag in theme.liquid, and save.' },
} as const;

export default function SnippetPage() {
  const [client, setClient] = useState<ClientProfile | null>(null); const [status, setStatus] = useState<VerificationStatus | null>(null); const [checking, setChecking] = useState(false); const [loading, setLoading] = useState(true); const [clientError, setClientError] = useState(false); const [statusError, setStatusError] = useState(false); const [copied, setCopied] = useState(false); const [openGuide, setOpenGuide] = useState<string | null>('custom');
  const loadClient = () => { setLoading(true); setClientError(false); fetch('/api/client').then((res) => res.ok ? res.json() : Promise.reject(new Error('client'))).then((data) => setClient(data?.client || null)).catch(() => setClientError(true)).finally(() => setLoading(false)); };
  useEffect(() => { loadClient(); }, []);
  const getSnippetCode = () => { if (!client?.snippet_key) return ''; const apiOrigin = typeof window !== 'undefined' && window.location.origin !== 'https://app.churnaut.com' ? window.location.origin : ''; return `${apiOrigin ? `<script>window.SR_API_ORIGIN = '${apiOrigin}';</script>\n` : ''}<script>window.SR_CLIENT_ID = '${client.snippet_key}';</script>\n<script src="https://cdn.churnaut.com/snippet.js" async defer></script>`; };
  const copyCode = async (text: string) => { if (!text) return; await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 2000); };
  const checkStatus = async () => { setChecking(true); setStatusError(false); try { const res = await fetch('/api/snippet-status'); if (!res.ok) throw new Error('status'); setStatus(await res.json()); } catch (error) { console.error('Failed to query snippet status:', error); setStatusError(true); } finally { setChecking(false); } };
  const toggleGuide = (name: string) => setOpenGuide((prev) => prev === name ? null : name);
  return (
    <div className="dashboard-snippet max-w-5xl space-y-8">
      <PageHeader
        eyebrow="Signal Field · Deployment"
        title="Snippet installation"
        description="Connect your website to Churnaut and verify the first live signal."
      />
      {loading ? (
        <div role="status" aria-busy="true" className="dashboard-surface p-8 text-sm text-[var(--text-muted)]">
          RETRIEVING SNIPPET CONFIGURATION…
        </div>
      ) : clientError ? (
        <div role="alert" className="dashboard-surface p-8 text-sm text-[var(--red)]">
          Snippet configuration unavailable. <button type="button" onClick={loadClient} className="font-semibold underline">TRY AGAIN</button>
        </div>
      ) : !client?.snippet_key ? (
        <div role="alert" className="dashboard-surface p-8 text-sm text-[var(--red)]">
          No website client key is available yet. Complete onboarding before installing the runtime.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Step 1: Install Runtime Bento */}
          <Surface className="rounded-3xl border border-slate-200/90 bg-white p-6 md:p-8 space-y-6 shadow-xs hover:shadow-md transition-all duration-300">
            <div className="flex items-center gap-3">
              <GeometricIcon type="slices" bg="bg-blue-600" />
              <div>
                <p className="dashboard-eyebrow text-[10px] font-mono text-slate-400">Step 1 · Runtime</p>
                <h2 className="text-base font-bold text-slate-900 font-sans tracking-tight">Your installation code</h2>
                <p className="text-xs text-slate-500 mt-0.5">Paste this script block in the head of every page you want to personalize.</p>
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-slate-100 shadow-inner">
              <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-2.5 bg-slate-900/90">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                  <span className="ml-2 font-mono text-[11px] text-slate-400">snippet.html</span>
                </div>
                <button
                  type="button"
                  onClick={() => copyCode(getSnippetCode())}
                  className="rounded-full bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1 text-xs font-semibold shadow-2xs transition-all"
                >
                  {copied ? 'COPIED!' : 'COPY CODE'}
                </button>
              </div>
              <div className="overflow-x-auto p-5">
                <pre className="select-all font-mono text-xs leading-6 text-emerald-300">{getSnippetCode()}</pre>
              </div>
            </div>
          </Surface>

          {/* Step 2: Mark Target Elements Bento */}
          <Surface className="rounded-3xl border border-slate-200/90 bg-white p-6 md:p-8 space-y-6 shadow-xs hover:shadow-md transition-all duration-300">
            <div className="flex items-center gap-3">
              <GeometricIcon type="flower" bg="bg-emerald-600" />
              <div>
                <p className="dashboard-eyebrow text-[10px] font-mono text-slate-400">Step 2 · Selectors</p>
                <h2 className="text-base font-bold text-slate-900 font-sans tracking-tight">Choose what to personalize</h2>
                <p className="text-xs text-slate-500 mt-0.5">Add the sr-target class to headings, descriptions, buttons, or calendar wrappers where content swaps should happen.</p>
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-slate-100 shadow-inner">
              <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-2.5 bg-slate-900/90">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                  <span className="ml-2 font-mono text-[11px] text-slate-400">target-elements.html</span>
                </div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">sr-target class</span>
              </div>
              <div className="overflow-x-auto p-5 font-mono text-xs leading-6 select-all">
                <pre className="text-emerald-300">{`<!-- Swap a headline copy -->
<h1 class="sr-target font-bold">Welcome to Churnaut</h1>

<!-- Swap a direct scheduling button -->
<div class="sr-target">
  <a href="/pricing">View Plans</a>
</div>`}</pre>
              </div>
            </div>
          </Surface>

          {/* Step 3: Verify Connection Bento */}
          <Surface className="rounded-3xl border border-slate-200/90 bg-white p-6 md:p-8 space-y-6 shadow-xs hover:shadow-md transition-all duration-300">
            <div className="flex items-center gap-3">
              <GeometricIcon type="rings" bg="bg-amber-500" />
              <div>
                <p className="dashboard-eyebrow text-[10px] font-mono text-slate-400">Step 3 · Telemetry</p>
                <h2 className="text-base font-bold text-slate-900 font-sans tracking-tight">Check the first live ping</h2>
                <p className="text-xs text-slate-500 mt-0.5">Verification is user-triggered so you always know when a status request was made.</p>
              </div>
            </div>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between pt-1">
              <button
                type="button"
                onClick={checkStatus}
                disabled={checking}
                className="rounded-full bg-[#165B40] hover:bg-[#114933] text-white py-2.5 px-6 text-xs font-semibold shadow-2xs transition-all shrink-0 disabled:opacity-50"
              >
                {checking ? 'VERIFYING…' : 'CHECK STATUS'}
              </button>
              <div className="flex flex-col gap-3 flex-1 sm:max-w-xl">
                {statusError && (
                  <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-700">
                    Status unavailable. Your last verified state is preserved.
                  </div>
                )}
                {status && (status.active ? (
                  <div role="status" aria-live="polite" className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <div className="flex items-center gap-3">
                      <StatusBadge tone="success">CONNECTION CONFIRMED</StatusBadge>
                      <span className="text-xs font-medium text-emerald-900">Live signal received.</span>
                    </div>
                    <p className="mt-2 text-[11px] font-mono text-emerald-700">
                      Last ping detected: {status.lastPing ? new Date(status.lastPing).toLocaleString() : 'Not available'}
                    </p>
                  </div>
                ) : (
                  <div role="status" aria-live="polite" className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                    <StatusBadge tone="warning">WAITING FOR PINGS</StatusBadge>
                    <p className="mt-2 text-xs leading-5 text-amber-900">
                      Ensure the script is before the closing head tag, visit your site with a tracking parameter, and reload after clearing cache.
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Surface>

          {/* Step 4: Platform Guides Bento */}
          <Surface className="rounded-3xl border border-slate-200/90 bg-white p-6 md:p-8 space-y-6 shadow-xs hover:shadow-md transition-all duration-300">
            <div className="flex items-center gap-3">
              <GeometricIcon type="clusters" bg="bg-indigo-600" />
              <div>
                <p className="dashboard-eyebrow text-[10px] font-mono text-slate-400">Step 4 · Guides</p>
                <h2 className="text-base font-bold text-slate-900 font-sans tracking-tight">Platform installation guides</h2>
                <p className="text-xs text-slate-500 mt-0.5">Choose the platform that hosts your website.</p>
              </div>
            </div>
            <div className="space-y-3 pt-1">
              {Object.entries(guides).map(([key, guide]) => {
                const open = openGuide === key;
                const trigger = `snippet-guide-trigger-${key}`;
                const panel = `snippet-guide-${key}`;
                return (
                  <div key={key} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:border-slate-300 transition-all">
                    <button
                      id={trigger}
                      type="button"
                      aria-expanded={open}
                      aria-controls={panel}
                      onClick={() => toggleGuide(key)}
                      className="flex w-full items-center justify-between p-4 text-left text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100/60 transition-colors"
                    >
                      <span className="font-sans">{guide.title}</span>
                      <span className="h-6 w-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-500" aria-hidden="true">
                        {open ? '−' : '+'}
                      </span>
                    </button>
                    {open && (
                      <div id={panel} role="region" aria-labelledby={trigger} className="border-t border-slate-200/80 bg-white p-5 text-xs leading-6 text-slate-600">
                        <p>{guide.body}</p>
                        {key === 'custom' && (
                          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200/80 bg-slate-900 p-4 font-mono text-[11px] leading-5 text-emerald-300 select-all">
                            {getSnippetCode()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Surface>
        </div>
      )}
    </div>
  );
}
