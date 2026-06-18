import { motion } from 'framer-motion';
import type { PressWithLoad } from '../../shared/types';
import { cn } from '../lib/cn';
import { StatusPill } from './StatusPill';

const STATUS_BORDER: Record<string, string> = {
  Running: 'border-emerald-200 bg-emerald-50/50',
  Setup: 'border-amber-200 bg-amber-50/40',
  Down: 'border-rose-400 bg-rose-50/70 shadow-glow-red ring-2 ring-rose-300/40',
  Maintenance: 'border-sky-300 bg-sky-50/60 shadow-glow-blue',
  Idle: 'border-steel-200 bg-white',
};

const STATUS_TOPBAR: Record<string, string> = {
  Running: 'bg-emerald-500',
  Setup: 'bg-amber-500',
  Down: 'bg-rose-500',
  Maintenance: 'bg-sky-500',
  Idle: 'bg-steel-300',
};

export function PressTile({
  press,
  onClick,
  selected,
}: {
  press: PressWithLoad;
  onClick: () => void;
  selected?: boolean;
}) {
  const loadPct = Math.min(100, press.load_pct);
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        'press-tile text-left',
        STATUS_BORDER[press.current_status] ?? STATUS_BORDER.Idle,
        selected && 'ring-2 ring-industrial-500 ring-offset-2'
      )}
    >
      <div className={cn('absolute inset-x-0 top-0 h-1', STATUS_TOPBAR[press.current_status])} />
      {(press.current_status === 'Down' || press.current_status === 'Maintenance') && (
        <span
          className={cn(
            'absolute top-3 right-3 w-2.5 h-2.5 rounded-full animate-ping',
            press.current_status === 'Down' ? 'bg-rose-500' : 'bg-sky-500'
          )}
        />
      )}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="font-bold text-base text-steel-900 leading-none tracking-tight">
            {press.code}
          </div>
          <div className="text-[11px] text-steel-500 mt-1 font-medium">
            {press.tonnage}T · {press.factory}
          </div>
        </div>
        <StatusPill status={press.current_status} />
      </div>

      {press.capacity_per_day > 0 && (
        <div className="text-[10px] text-steel-500 -mt-1 mb-2 font-medium flex items-center gap-1">
          <span className="tabular-nums">{press.capacity_per_day.toLocaleString('en-IN')}</span>
          <span className="text-steel-400">pcs/day</span>
          <span className="ml-auto chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 text-[9px] py-0 px-1.5">
            @85% = {Math.round(press.capacity_per_day * 0.85).toLocaleString('en-IN')}
          </span>
        </div>
      )}

      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] text-steel-500 mb-1">
          <span className="font-semibold">Load</span>
          <span className="tabular-nums font-bold text-steel-700">
            {press.load_pct.toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 bg-steel-200/70 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              press.load_pct > 95
                ? 'bg-rose-500'
                : press.load_pct > 80
                ? 'bg-amber-500'
                : 'bg-emerald-500'
            )}
            style={{ width: `${loadPct}%` }}
          />
        </div>
        {press.current_part_code && (
          <div className="mt-2.5 text-[11px] text-steel-600 truncate font-mono">
            ▸ {press.current_part_code}
          </div>
        )}
      </div>
    </motion.button>
  );
}
