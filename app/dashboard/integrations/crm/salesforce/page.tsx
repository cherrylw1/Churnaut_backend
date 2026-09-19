'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Surface } from '@/components/dashboard/Surface';
import { StatusBadge } from '@/components/dashboard/StatusBadge';

export default function SalesforceSettingsPage() {
  return <div className="space-y-6"><PageHeader eyebrow="Signal Room · CRM connections" title="Salesforce CRM" description="Salesforce Sales Cloud OAuth integration is coming soon. Map standard opportunity objects and lifecycle stages." actions={<Link href="/dashboard/integrations/crm" className="dashboard-button-secondary">← CRM DIRECTORY</Link>} /><Surface><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-3"><h2 className="font-mono text-sm font-semibold">Salesforce CRM connection</h2><StatusBadge tone="neutral">Coming Soon</StatusBadge></div><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">This adapter is not yet operational. We will keep the connection disabled until the full OAuth and sync path is ready.</p></div><button type="button" disabled aria-disabled="true" className="dashboard-button-secondary shrink-0 opacity-50 cursor-not-allowed">CONNECT SALESFORCE CRM →</button></div></Surface></div>;
}
