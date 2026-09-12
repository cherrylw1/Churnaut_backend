import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Surface } from './Surface';

interface MetricCardProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  trend?: number | null;
  icon?: ReactNode;
  emphasis?: 'default' | 'primary';
}

export function MetricCard({ label, value, detail, trend, icon, emphasis = 'default' }: MetricCardProps) {
  const trendLabel = typeof trend === 'number' ? `${Math.abs(trend)}% vs prior period` : undefined;
  return (
    <Surface className={emphasis === 'primary' ? 'dashboard-metric dashboard-metric-primary' : 'dashboard-metric'}>
      <div className="flex items-start justify-between gap-3">
        <span className="dashboard-metric-label">{label}</span>
        {icon ? <span className="dashboard-metric-icon" aria-hidden="true">{icon}</span> : null}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <span className="dashboard-metric-value">{value}</span>
        {typeof trend === 'number' ? (
          <span className={trend > 0 ? 'dashboard-trend dashboard-trend-positive' : trend < 0 ? 'dashboard-trend dashboard-trend-negative' : 'dashboard-trend'} aria-label={trendLabel}>
            {trend > 0 ? <ArrowUpRight aria-hidden="true" /> : trend < 0 ? <ArrowDownRight aria-hidden="true" /> : <Minus aria-hidden="true" />}
            {Math.abs(trend)}%
          </span>
        ) : null}
      </div>
      {detail ? <p className="dashboard-metric-detail">{detail}</p> : null}
    </Surface>
  );
}
