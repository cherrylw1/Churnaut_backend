import type { ReactNode } from 'react';
import { Surface } from './Surface';

export function EmptyPanel({ title, description, action, icon }: { title: string; description: string; action?: ReactNode; icon?: ReactNode }) {
  return <Surface tone="subtle" className="dashboard-empty-panel"><div className="dashboard-empty-icon" aria-hidden="true">{icon}</div><h3>{title}</h3><p>{description}</p>{action ? <div className="mt-4">{action}</div> : null}</Surface>;
}
