import type { ReactNode } from 'react';

export function SectionHeader({ title, description, action, headingId }: { title: string; description?: string; action?: ReactNode; headingId?: string }) {
  return (
    <div className="dashboard-section-header">
      <div className="min-w-0"><h2 id={headingId} className="dashboard-section-title">{title}</h2>{description ? <p className="dashboard-section-description">{description}</p> : null}</div>
      {action ? <div className="min-w-0">{action}</div> : null}
    </div>
  );
}
