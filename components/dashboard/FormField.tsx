import type { ReactNode } from 'react';

export function FormField({ id, label, hint, error, required, children }: { id?: string; label: string; hint?: string; error?: string; required?: boolean; children: ReactNode }) {
  return <div className="dashboard-field"><label htmlFor={id} className="dashboard-field-label">{label}{required ? <span aria-hidden="true"> *</span> : null}</label>{hint ? <p className="dashboard-field-hint">{hint}</p> : null}{children}{error ? <p className="dashboard-field-error" role="alert">{error}</p> : null}</div>;
}
