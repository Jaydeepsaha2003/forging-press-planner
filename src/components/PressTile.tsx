import { motion } from 'framer-motion';
import type { PressWithLoad } from '../../shared/types';
import { cn } from '../lib/cn';

const STATUS_RING: Record<string, string> = {
  Running: 'border-emerald-200 bg-emerald-50/40',
  Setup: 'border-amber-200 bg-amber-50/30',
  Down: 'border-rose-300 bg-rose-50/60 shadow-glow-red ring-2 ring-rose-300/40',
  Maintenance: 'border-sky-300 bg-sky-50/50 shadow-glow-blue',
  Idle: 'border-steel-200 bg-white',
};

const STATUS_TOPBAR: Record<string, string> = {
  Running: 'bg-emerald-500',
  Setup: 'bg-amber-500',
  Down: 'bg-rose-500',
  Maintenance: 'bg-sky-500',
  Idle: 'bg-steel-300',
};

const STATUS_DOT: Record<string, string> = {
  Running: 'bg-emerald-500',
  Setup: 'bg-amber-500',
  Down: 'bg-rose-500',
  Maintenance: 'bg-sky-500',
  Idle: 'bg-steel-400',
};

/**
 * Compact press tile — code, tonnage, status dot, load %.
 * Everything else (factory, capacity, current part, history) is one click
 * away in the drawer.
 */
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
  const loadColor =
    press.load_pct > 95
      ? 'bg-rose-500'
      : press.load_pct > 80
      ? 'bg-amber-500'
      : 'bg-emerald-500';
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'relative rounded-xl p-3 text-left border transition-all duration-200 cursor-pointer overflow-hidden',
        STATUS_RING[press.current_status] ?? STATUS_RING.Idle,
        'hover:shadow-card-hover',
        selected && 'ring-2 ring-industrial-500 ring-offset-1'
      )}
    >
      <div className={cn('absolute inset-x-0 top-0 h-0.5', STATUS_TOPBAR[press.current_status])} />

      {/* Top row: code + animated dot for attention statuses */}
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0">
          <div className="font-bold text-sm text-steel-900 leading-none tracking-tight truncate">
            {press.code}
          </div>
          <div className="text-[10px] text-steel-500 mt-1 font-semibold tabular-nums">
            {press.tonnage}T
          </div>
        </div>
        <div className="relative shrink-0">
          {(press.current_status === 'Down' || press.current_status === 'Maintenance') && (
            <span
              className={cn(
                'absolute inset-0 rounded-full animate-ping opacity-60',
                STATUS_DOT[press.current_status]
              )}
            />
          )}
          <span
            className={cn(
              'relative block w-2.5 h-2.5 rounded-full',
              STATUS_DOT[press.current_status]
            )}
          />
        </div>
      </div>

      {/* Bottom row: tiny load bar */}
      <div className="mt-2.5">
        <div className="h-1 bg-steel-200/60 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', loadColor)}
            style={{ width: `${loadPct}%` }}
          />
        </div>
        <div className="flex items-baseline justify-between mt-1">
          <span className="text-[9px] uppercase tracking-wider font-semibold text-steel-400">
            Load
          </span>
          <span className="tabular-nums font-bold text-[10px] text-steel-700">
            {press.load_pct.toFixed(0)}%
          </span>
        </div>
      </div>
    </motion.button>
  );
}
