import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  ariaLabel?: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, ariaLabel, description, actions }: PageHeaderProps) {
  return (
    <div className="dashboard-page-header">
      <div className="min-w-0">
        {eyebrow ? <p className="dashboard-eyebrow">{eyebrow}</p> : null}
        <h1 className="dashboard-title" aria-label={ariaLabel}>{title}</h1>
        {description ? <p className="dashboard-description">{description}</p> : null}
      </div>
      {actions ? <div className="dashboard-page-actions">{actions}</div> : null}
    </div>
  );
}
