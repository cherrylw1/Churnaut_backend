'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { SectionHeader as BaseSectionHeader } from '@/components/dashboard/SectionHeader';
function SectionHeader({ title, description }: { title: string; description?: string; eyebrow?: string }) { return <BaseSectionHeader title={title} description={description} />; }
import { Surface } from '@/components/dashboard/Surface';
import { StatusBadge } from '@/components/dashboard/StatusBadge';

interface CrmStatus { connected: boolean; crm_type: string | null; connected_at: string | null }

const providers = [
  { key: 'hubspot', name: 'HubSpot', description: 'Sync deals, owners, pipeline stages, and contact enrichment.', href: '/dashboard/integrations/crm/hubspot', kind: 'native' },
  { key: 'pipedrive', name: 'Pipedrive', description: 'Webhook intake is available; native Scout pipeline sync is not yet available.', kind: 'webhook' },
  { key: 'zoho', name: 'Zoho CRM', description: 'Webhook intake is available; native Scout pipeline sync is not yet available.', kind: 'webhook' },
  { key: 'close', name: 'Close', description: 'Webhook intake is available; native Scout pipeline sync is not yet available.', kind: 'webhook' },
  { key: 'salesforce', name: 'Salesforce', description: 'Connect Salesforce Sales Cloud to map opportunity objects and lifecycle stages.', href: '/dashboard/integrations/crm/salesforce', kind: 'soon' },
  { key: 'attio', name: 'Attio', description: 'Sync Attio workspace records, pipelines, and contact attributes in real time.', href: '/dashboard/integrations/crm/attio', kind: 'soon' },
] as const;

export default function CrmIndexPage() {
  const [status, setStatus] = useState<CrmStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/oauth/crm').then((res) => res.ok ? res.json() : null).then(setStatus).catch(() => {}).finally(() => setLoading(false));
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const error = params.get('error');
    const details = params.get('details');
    if (connected && ['hubspot', 'pipedrive', 'zoho', 'close'].includes(connected)) setMessage({ type: 'success', text: `Successfully connected to ${connected[0].toUpperCase()}${connected.slice(1)} CRM!` });
    if (error) {
      let errorText = 'Failed to connect to CRM.';
      if (error === 'token_exchange_failed') errorText = 'Token exchange with the CRM failed. Please check your credentials.';
      if (error === 'client_not_found') errorText = 'Active client profile was not found. Please log in again.';
      if (error === 'missing_parameters') errorText = 'Authentication callback was missing required fields.';
      if (error === 'server_configuration_error') errorText = 'CRM client secret or client ID is not configured on the server.';
      if (details) { try { const parsed = JSON.parse(decodeURIComponent(details)); errorText += ` Details: ${parsed.error_description || parsed.message || JSON.stringify(parsed)}`; } catch { errorText += ` Details: ${decodeURIComponent(details)}`; } }
      setMessage({ type: 'error', text: errorText });
    }
  }, []);

  return <div className="space-y-6">
    <PageHeader eyebrow="Signal Room · CRM connections" title="CRM integrations" description="Connect the systems that turn account signals into useful routing context." actions={<Link href="/dashboard/integrations" className="dashboard-button-secondary">← CONNECTION MAP</Link>} />
    {message && <div role={message.type === 'error' ? 'alert' : 'status'} aria-live="polite" className={`dashboard-surface px-4 py-3 flex items-start justify-between gap-4 ${message.type === 'error' ? 'border-[var(--red)]/40' : 'border-[var(--green)]/40'}`}><p className="text-sm text-[var(--text-secondary)]">{message.text}</p><button type="button" aria-label="Dismiss integration message" onClick={() => setMessage(null)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">DISMISS</button></div>}
    <Surface>
      <SectionHeader title="CRM connections" description="Native Scout sync, webhook-only intake, and future adapters are deliberately labelled." />
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {providers.map((provider) => {
          const connected = status?.connected && status.crm_type === provider.key;
          const href = 'href' in provider ? provider.href : undefined;
          const body = <div className="h-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/55 p-5 flex flex-col gap-5 transition-colors hover:border-[var(--border-strong)]"><div className="flex items-start justify-between gap-3"><h2 className="font-mono text-sm font-semibold text-[var(--text-primary)]">{provider.name}</h2><StatusBadge tone={connected ? 'success' : provider.kind === 'soon' ? 'neutral' : provider.kind === 'webhook' ? 'warning' : 'neutral'}>{connected ? 'Connected' : provider.kind === 'soon' ? 'Coming Soon' : provider.kind === 'webhook' ? 'Webhook Only' : loading ? 'Loading' : 'Disconnected'}</StatusBadge></div><p className="text-sm leading-6 text-[var(--text-secondary)] flex-1">{provider.description}</p>{provider.kind === 'native' && href ? <Link href={href} className="dashboard-button-secondary w-full justify-center">MANAGE →</Link> : provider.kind === 'soon' ? <div className="grid gap-2 sm:grid-cols-2"><button type="button" disabled aria-disabled="true" className="dashboard-button-secondary w-full justify-center opacity-50 cursor-not-allowed">CONNECT →</button>{href && <Link href={href} className="dashboard-button-secondary w-full justify-center">VIEW DETAILS →</Link>}</div> : <span className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-3 py-2 text-center text-[10px] font-mono uppercase tracking-wide text-[var(--text-muted)]">WEBHOOK ONLY — ADAPTER PENDING</span>}</div>;
          return <div key={provider.key}>{body}</div>;
        })}
      </div>
    </Surface>
  </div>;
}
