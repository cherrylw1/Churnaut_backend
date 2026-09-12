export function ProgressBar({ value, label, tone = 'accent' }: { value: number; label?: string; tone?: 'accent' | 'success' | 'warning' }) {
  const clamped = Math.max(0, Math.min(100, value));
  return <div className="dashboard-progress-wrap">{label ? <div className="dashboard-progress-label"><span>{label}</span><span>{Math.round(clamped)}%</span></div> : null}<div className="dashboard-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped} aria-label={label}><span className={`dashboard-progress-fill dashboard-progress-${tone}`} style={{ width: `${clamped}%` }} /></div></div>;
}
