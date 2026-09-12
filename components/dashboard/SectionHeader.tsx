import type { ReactNode } from 'react';

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="dashboard-section-header">
      <div><h2 className="dashboard-section-title">{title}</h2>{description ? <p className="dashboard-section-description">{description}</p> : null}</div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
