import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Activity, AlertOctagon, Pause, Wrench, History } from 'lucide-react';
import type { PlanRow, PressStatus, PressWithLoad } from '../../shared/types';
import { fp } from '../lib/fp';
import { useApp } from '../store';
import { cn, fmtNum, timeAgo } from '../lib/cn';
import { StatusPill } from '../components/StatusPill';
import { DowntimeModal } from './DowntimeModal';
import { MaintenanceModal } from './MaintenanceModal';
import { BreakdownImpactModal } from './BreakdownImpactModal';

const STATUSES: {
  value: PressStatus;
  label: string;
  hint: string;
  icon: typeof Activity;
  bg: string;
  text: string;
  ring: string;
}[] = [
  {
    value: 'Running',
    label: 'Running',
    hint: 'Machine is producing parts right now',
    icon: Activity,
    bg: 'bg-emerald-500 hover:bg-emerald-600',
    text: 'text-emerald-700',
    ring: 'ring-emerald-200 bg-emerald-50',
  },
  {
    value: 'Idle',
    label: 'Idle',
    hint: 'No active work — machine is free',
    icon: Pause,
    bg: 'bg-steel-500 hover:bg-steel-600',
    text: 'text-steel-700',
    ring: 'ring-steel-200 bg-steel-50',
  },
  {
    value: 'Maintenance',
    label: 'Prevention',
    hint: 'Planned servicing — won\'t run today',
    icon: Wrench,
    bg: 'bg-sky-500 hover:bg-sky-600',
    text: 'text-sky-700',
    ring: 'ring-sky-200 bg-sky-50',
  },
  {
    value: 'Down',
    label: 'Breakdown',
    hint: 'Unexpected failure — log a downtime',
    icon: AlertOctagon,
    bg: 'bg-rose-600 hover:bg-rose-700',
    text: 'text-rose-700',
    ring: 'ring-rose-200 bg-rose-50',
  },
];

export function PressDrawerContent({
  press,
  onMutate,
}: {
  press: PressWithLoad;
  onMutate: () => void;
}) {
  const { month } = useApp();
  const [parts, setParts] = useState<PlanRow[]>([]);
  const [history, setHistory] = useState<Array<{ id: number; reason: string; start_datetime: string; end_datetime: string | null }>>([]);
  const [downtimeOpen, setDowntimeOpen] = useState(false);
  const [impactOpen, setImpactOpen] = useState<null | 'breakdown' | 'prevention'>(null);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);

  const load = async () => {
    const planRows = await fp.invoke<PlanRow[]>(fp.channels.PLAN_LIST, month);
    setParts(planRows.filter((p) => p.assigned_press_id === press.id));
    const dt = await fp.invoke<Array<{ id: number; reason: string; start_datetime: string; end_datetime: string | null }>>(
      fp.channels.DOWNTIME_LIST,
      { pressId: press.id }
    );
    setHistory(dt.slice(0, 5));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [press.id, month]);

  const [pendingStatus, setPendingStatus] = useState<PressStatus | null>(null);

  const setStatus = async (s: PressStatus) => {
    console.log(`[status] click ${press.code} (id=${press.id}) ${press.current_status} → ${s}`);
    if (s === 'Down') {
      console.log('[status] opening downtime modal');
      setDowntimeOpen(true);
      return;
    }
    // Mark this button as pending so the UI reflects the click instantly
    setPendingStatus(s);
    try {
      if (press.current_status === 'Down') {
        console.log('[status] closing existing downtime');
        // closing an open downtime event
        const open = await fp.invoke<Array<{ id: number; end_datetime: string | null }>>(
          fp.channels.DOWNTIME_LIST,
          { pressId: press.id }
        );
        const lastOpen = open.find((o) => !o.end_datetime);
        if (lastOpen) {
          await fp.invoke(fp.channels.DOWNTIME_CLOSE, {
            id: lastOpen.id,
            bring_back_status: s,
          });
        } else {
          await fp.invoke(fp.channels.PRESS_SET_STATUS, press.id, s);
        }
      } else {
        console.log(`[status] invoking PRESS_SET_STATUS(${press.id}, ${s})`);
        const result = await fp.invoke(fp.channels.PRESS_SET_STATUS, press.id, s);
        console.log('[status] IPC returned:', result);
      }
      toast.success(`${press.code} → ${s}`);
      onMutate();
      await load();
      console.log(`[status] complete — refresh fired`);
    } catch (e) {
      console.error('[status] FAILED:', e);
      toast.error(`Couldn't change ${press.code} to ${s} — ${(e as Error).message ?? 'unknown'}`);
    } finally {
      setPendingStatus(null);
    }
  };

  // Visual status reflects pending click immediately, falls back to real state
  const visualStatus: PressStatus = pendingStatus ?? press.current_status;

  const total = parts.reduce((s, p) => s + (p.hil_prod_qty || 0), 0);
  const days = parts.reduce((s, p) => s + (p.required_machine_days || 0), 0);

  return (
    <div className="space-y-5">
      <div className="text-xs text-steel-500">
        Status changed {timeAgo(press.status_changed_at)}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MiniStat label="Load" value={`${press.load_pct.toFixed(0)}%`} />
        <MiniStat label="Req. days" value={fmtNum(days, 1)} />
        <MiniStat label="Avail." value={fmtNum(press.available_machine_days)} />
      </div>

      {/* Current status — clearly labelled */}
      {(() => {
        const current = STATUSES.find((s) => s.value === visualStatus) ?? STATUSES[1];
        const CurIcon = current.icon;
        return (
          <div
            className={cn(
              'rounded-2xl p-4 ring-1 flex items-center gap-3',
              current.ring
            )}
          >
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0', current.bg)}>
              <CurIcon className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-wider font-bold text-steel-500">
                Currently
              </div>
              <div className={cn('text-lg font-bold tracking-tight', current.text)}>
                {current.label}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Change-status action list — one big tappable row per option */}
      <div>
        <div className="field-label">Tap below to change status</div>
        <div className="space-y-2">
          {STATUSES.filter((s) => s.value !== visualStatus).map((s) => {
            const Icon = s.icon;
            const isPending = pendingStatus !== null;
            const isThisPending = pendingStatus === s.value;
            return (
              <button
                key={s.value}
                onClick={() => setStatus(s.value)}
                disabled={isPending}
                className={cn(
                  'relative w-full flex items-center gap-3 p-3 rounded-xl border-2 border-steel-200 bg-white hover:border-steel-400 transition text-left disabled:cursor-default',
                  isPending && !isThisPending && 'opacity-40'
                )}
              >
                <div
                  className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0',
                    s.bg
                  )}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-sm">Change to {s.label}</div>
                  <div className="text-[11px] text-steel-500">{s.hint}</div>
                </div>
                <div className="text-steel-300 text-xl shrink-0 pr-1">›</div>
                {isThisPending && (
                  <span className="absolute inset-0 rounded-xl bg-steel-900/5 animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {visualStatus === 'Down' && (
        <button
          onClick={() => setImpactOpen('breakdown')}
          className="w-full btn-accent"
        >
          Plan the shift · {parts.length} affected part{parts.length !== 1 ? 's' : ''}
        </button>
      )}
      {visualStatus === 'Maintenance' && parts.length > 0 && (
        <button
          onClick={() => setImpactOpen('prevention')}
          className="w-full btn-secondary"
        >
          Review prevention impact · {parts.length} part{parts.length !== 1 ? 's' : ''}
        </button>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="field-label !mb-0">Parts queued · {parts.length}</div>
          <div className="text-[11px] text-steel-500 tabular-nums">
            {fmtNum(total)} pcs · {fmtNum(days, 1)} days
          </div>
        </div>
        {parts.length === 0 ? (
          <div className="text-xs text-steel-500 italic py-3 bg-steel-50 rounded-xl text-center">
            No parts assigned this month
          </div>
        ) : (
          <ul className="space-y-1.5">
            {parts.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between px-3 py-2 bg-steel-50 rounded-xl border border-steel-100"
              >
                <div className="min-w-0">
                  <div className="font-mono text-sm font-semibold truncate">{p.part_code}</div>
                  <div className="text-[11px] text-steel-500 truncate">
                    {p.customer_code} · {p.category}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <div className="font-bold text-sm tabular-nums">{fmtNum(p.hil_prod_qty)}</div>
                  <div className="text-[11px] text-steel-500 tabular-nums">
                    {p.required_machine_days.toFixed(1)}d
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="field-label flex items-center gap-1.5">
          <History className="w-3.5 h-3.5" /> Recent downtime
        </div>
        {history.length === 0 ? (
          <div className="text-xs text-steel-500 italic py-3 bg-steel-50 rounded-xl text-center">
            Clean record — no breakdowns logged
          </div>
        ) : (
          <ul className="space-y-1.5">
            {history.map((h) => (
              <li key={h.id} className="px-3 py-2 bg-rose-50/50 rounded-xl border border-rose-100">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-rose-700">{h.reason}</span>
                  <span className="text-[11px] text-steel-500">{timeAgo(h.start_datetime)}</span>
                </div>
                <div className="text-[11px] text-steel-600 mt-0.5">
                  {h.end_datetime ? 'Restored' : 'Still down'}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-steel-200 pt-3">
        <button
          onClick={() => setMaintenanceOpen(true)}
          className="w-full btn-secondary justify-center"
        >
          <Wrench className="w-4 h-4" /> Scheduled maintenance
        </button>
        <p className="text-[11px] text-steel-500 mt-1.5 text-center">
          Plan downtime ahead — Dashboard warns 14 days early
        </p>
      </div>

      <DowntimeModal
        open={downtimeOpen}
        press={press}
        onClose={() => setDowntimeOpen(false)}
        onSaved={() => {
          setDowntimeOpen(false);
          onMutate();
          load();
          setTimeout(() => setImpactOpen('breakdown'), 250);
        }}
      />

      <MaintenanceModal
        open={maintenanceOpen}
        press={press}
        onClose={() => setMaintenanceOpen(false)}
        onSaved={() => {
          onMutate();
          load();
        }}
      />

      <BreakdownImpactModal
        open={impactOpen !== null}
        press={press}
        mode={impactOpen ?? 'breakdown'}
        onClose={() => setImpactOpen(null)}
        onApplied={() => {
          onMutate();
          load();
        }}
      />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-steel-50 rounded-xl p-3 border border-steel-100">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-steel-500">
        {label}
      </div>
      <div className="text-lg font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
