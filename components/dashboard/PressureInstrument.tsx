import type { ReactNode } from 'react';
import { Activity } from 'lucide-react';
import { Surface } from './Surface';
import { StatusBadge } from './StatusBadge';

type PressureStatus = 'HEALTHY' | 'NEEDS ATTENTION' | 'AT RISK';

const toneForStatus = (status: PressureStatus) => (
  status === 'HEALTHY' ? 'success' : status === 'AT RISK' ? 'danger' : 'warning'
);

const fillForStatus = (status: PressureStatus) => (
  status === 'HEALTHY' ? 'bg-[var(--signal-positive)]' : status === 'AT RISK' ? 'bg-[var(--signal-critical)]' : 'bg-[var(--signal-warning)]'
);

export function PressureInstrument({ score, status, value }: { score: number; status: PressureStatus; value?: ReactNode }) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <Surface className="dashboard-pressure-instrument dashboard-instrument relative overflow-hidden p-5 md:p-6" aria-label={`Pipeline pressure ${score}, ${status}`}>
      <div className="absolute inset-x-0 top-0 h-px bg-[var(--accent)]/70" aria-hidden="true" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="dashboard-metric-label">Pipeline pressure</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Revenue risk across the signals Churnaut can see.</p>
        </div>
        <span className="dashboard-metric-icon" aria-hidden="true"><Activity className="h-4 w-4" /></span>
      </div>
      <div className="mt-8 flex items-end gap-4">
        <span className="dashboard-instrument-score font-mono text-5xl font-semibold leading-none tracking-[-0.08em] tabular-nums">{value ?? score}</span>
        <div className="pb-1">
          <StatusBadge tone={toneForStatus(status)}>{status}</StatusBadge>
          <p className="dashboard-instrument-muted mt-2 flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.08em]">
            Current readout
          </p>
        </div>
      </div>
      <div className="mt-6" role="img" aria-label={`${score} out of 100 pipeline pressure`}>
        <div className="dashboard-instrument-track h-2 overflow-hidden rounded-full">
          <span className={`block h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none ${fillForStatus(status)}`} style={{ width: `${clamped}%` }} />
        </div>
        <div className="dashboard-instrument-muted mt-2 flex justify-between text-[10px] font-mono uppercase tracking-[0.08em]" aria-hidden="true">
          <span>Stable</span><span>Pressure</span>
        </div>
      </div>
    </Surface>
  );
}
