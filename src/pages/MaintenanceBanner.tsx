import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wrench, Calendar, ArrowRight, Building2, Truck } from 'lucide-react';
import { fp } from '../lib/fp';
import { useApp } from '../store';
import { cn, fmtNum } from '../lib/cn';
import type { UpcomingMaintenance } from '../../shared/types';

/**
 * Dashboard banner that shows scheduled maintenance approaching in the next
 * 14 days. Each item lists affected parts + top alternate presses for
 * proactive relocation planning.
 */
export function MaintenanceBanner() {
  const { month } = useApp();
  const [items, setItems] = useState<UpcomingMaintenance[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fp
        .invoke<UpcomingMaintenance[]>(fp.channels.MAINTENANCE_UPCOMING, {
          month,
          withinDays: 14,
        })
        .then((d) => !cancelled && setItems(d));
    load();
    const off = fp.on(fp.channels.EVT_PRESS_STATUS_CHANGED, load);
    return () => {
      cancelled = true;
      off();
    };
  }, [month]);

  if (items.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card overflow-hidden border-amber-200 bg-gradient-to-r from-amber-50/60 via-white to-amber-50/40"
    >
      <div className="px-5 py-4 flex items-center gap-4">
        <div className="w-11 h-11 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
          <Wrench className="w-5 h-5 text-amber-700" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-bold text-amber-900 tracking-tight">
            {items.length} scheduled maintenance{items.length === 1 ? '' : 's'} in the next 14 days
          </h2>
          <p className="text-sm text-amber-700/80 mt-0.5">
            Plan ahead — review the affected parts and pre-allocate to alternates below
          </p>
        </div>
      </div>
      <div className="px-5 pb-4 space-y-2">
        <AnimatePresence>
          {items.map((it) => (
            <motion.div
              key={it.maintenance.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="border border-amber-200/60 rounded-xl bg-white/70 p-3"
            >
              <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm">
                    {it.maintenance.press_code}
                  </span>
                  <span className="chip bg-amber-100 text-amber-700 ring-1 ring-amber-200">
                    {it.maintenance.reason ?? 'Maintenance'}
                  </span>
                  <span className="chip bg-white text-steel-700 ring-1 ring-steel-200 inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {it.maintenance.starts_on}
                    {it.maintenance.ends_on && ` → ${it.maintenance.ends_on}`}
                  </span>
                  <span
                    className={cn(
                      'chip',
                      it.days_until <= 3
                        ? 'bg-rose-100 text-rose-700 ring-1 ring-rose-200'
                        : it.days_until <= 7
                        ? 'bg-amber-200 text-amber-900'
                        : 'bg-steel-100 text-steel-600'
                    )}
                  >
                    in {it.days_until} day{it.days_until === 1 ? '' : 's'}
                  </span>
                </div>
              </div>

              {it.affected_parts.length === 0 ? (
                <div className="text-[11px] text-steel-500 italic">
                  No parts currently assigned to this press for {month} — nothing to relocate.
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="text-[11px] uppercase tracking-wider font-bold text-steel-500">
                    {it.affected_parts.length} part{it.affected_parts.length === 1 ? '' : 's'} ·{' '}
                    {fmtNum(
                      it.affected_parts.reduce((s, p) => s + p.qty_at_risk, 0)
                    )}{' '}
                    pcs to relocate
                  </div>
                  {it.affected_parts.slice(0, 5).map((p) => (
                    <div
                      key={p.part_id}
                      className="flex items-center gap-2 text-[12px] flex-wrap py-1"
                    >
                      <span className="font-mono font-bold">{p.part_code}</span>
                      <span className="chip bg-steel-100 text-steel-700 text-[10px]">
                        {p.customer_code}
                      </span>
                      <span className="chip bg-steel-100 text-steel-700 text-[10px]">
                        {p.required_tonnage}T
                      </span>
                      <span className="text-steel-500 tabular-nums">
                        {fmtNum(p.qty_at_risk)} pcs
                      </span>
                      <ArrowRight className="w-3 h-3 text-steel-400" />
                      <div className="flex items-center gap-1 flex-wrap">
                        {p.alternates.slice(0, 3).map((a) => (
                          <span
                            key={a.press_code}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] font-semibold',
                              a.is_in_house
                                ? 'bg-industrial-50 text-industrial-700 ring-1 ring-industrial-200'
                                : 'bg-forge-50 text-forge-700 ring-1 ring-forge-200'
                            )}
                          >
                            {a.is_in_house ? (
                              <Building2 className="w-2.5 h-2.5" />
                            ) : (
                              <Truck className="w-2.5 h-2.5" />
                            )}
                            {a.press_code}
                            <span className="opacity-70 font-normal">
                              {a.free_days.toFixed(0)}d
                            </span>
                          </span>
                        ))}
                        {p.alternates.length === 0 && (
                          <span className="text-rose-600 text-[10px] italic">
                            No alternate available
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {it.affected_parts.length > 5 && (
                    <div className="text-[11px] text-steel-500 italic">
                      + {it.affected_parts.length - 5} more part(s)
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
