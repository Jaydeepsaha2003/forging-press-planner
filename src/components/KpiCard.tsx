import { ReactNode } from 'react';
import { cn } from '../lib/cn';

export function KpiCard({
  label,
  value,
  delta,
  accent = 'steel',
  icon,
  hint,
}: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  accent?: 'steel' | 'industrial' | 'forge' | 'emerald' | 'rose';
  icon?: ReactNode;
  hint?: string;
}) {
  const ring: Record<string, string> = {
    steel: 'from-steel-900 to-steel-700',
    industrial: 'from-industrial-700 to-industrial-900',
    forge: 'from-forge-500 to-forge-700',
    emerald: 'from-emerald-500 to-emerald-700',
    rose: 'from-rose-500 to-rose-700',
  };
  return (
    <div className="card p-5 card-hover">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-steel-500">{label}</div>
          <div className="stat-num mt-2">{value}</div>
          {delta && <div className="mt-2 text-sm text-steel-500">{delta}</div>}
          {hint && <div className="mt-2 text-[11px] text-steel-400">{hint}</div>}
        </div>
        {icon && (
          <div
            className={cn(
              'w-11 h-11 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shrink-0',
              ring[accent]
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
