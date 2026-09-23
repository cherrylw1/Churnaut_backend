'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Surface } from '@/components/dashboard/Surface';
import { StatusBadge } from '@/components/dashboard/StatusBadge';

export default function CloseCRMSettingsPage() {
  return <div className="dashboard-integrations dashboard-crm-detail space-y-6">
    <PageHeader eyebrow="Signal Field · CRM capability" title="Close CRM" description="Bring Close events into Churnaut through secure webhook intake. Native Scout pipeline synchronization is not available yet." actions={<Link href="/dashboard/integrations/crm" className="dashboard-button-secondary">← CRM DIRECTORY</Link>} />
    <Surface className="p-6 md:p-8"><div className="flex flex-col gap-5"><div className="flex flex-wrap items-center gap-3"><StatusBadge tone="warning">WEBHOOK ONLY</StatusBadge><span className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">Native adapter pending</span></div><h2 className="text-xl font-semibold text-[var(--text-primary)]">Use event intake today</h2><p className="max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">Churnaut can receive Close events and map them into personalization signals. It cannot read or score the Close pipeline natively, so this page intentionally has no OAuth connection or fake sync status.</p><div className="flex flex-wrap gap-3"><Link href="/dashboard/integrations/webhooks" className="dashboard-button-primary">CONFIGURE WEBHOOKS →</Link><Link href="/dashboard/integrations/crm" className="dashboard-button-secondary">BACK TO CRM DIRECTORY</Link></div></div></Surface>
  </div>;
}
