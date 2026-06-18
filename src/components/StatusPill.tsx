import { cn } from '../lib/cn';
import type { PressStatus } from '../../shared/types';
import { Activity, AlertOctagon, Pause, Wrench, Settings2 } from 'lucide-react';

const MAP: Record<PressStatus, { label: string; cls: string; dot: string; icon: typeof Activity }> = {
  Running: {
    label: 'Running',
    cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70',
    dot: 'bg-emerald-500',
    icon: Activity,
  },
  // 'Setup' kept as a fallback for any legacy DB rows but no longer offered in the UI
  Setup: {
    label: 'Setup',
    cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/70',
    dot: 'bg-amber-500',
    icon: Settings2,
  },
  Down: {
    label: 'Breakdown',
    cls: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/70',
    dot: 'bg-rose-500',
    icon: AlertOctagon,
  },
  Maintenance: {
    label: 'Prevention',
    cls: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200/70',
    dot: 'bg-sky-500',
    icon: Wrench,
  },
  Idle: {
    label: 'Idle',
    cls: 'bg-steel-100 text-steel-700 ring-1 ring-steel-200',
    dot: 'bg-steel-400',
    icon: Pause,
  },
};

export function StatusPill({ status, withIcon = false }: { status: PressStatus; withIcon?: boolean }) {
  const cfg = MAP[status];
  const Icon = cfg.icon;
  return (
    <span className={cn('chip', cfg.cls)}>
      {withIcon ? (
        <Icon className="w-3 h-3" />
      ) : (
        <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      )}
      {cfg.label}
    </span>
  );
}

export function statusColor(status: PressStatus): string {
  return MAP[status].dot;
}
