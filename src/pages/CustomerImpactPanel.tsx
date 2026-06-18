import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  AlertOctagon,
  Wrench,
  ChevronDown,
  ChevronRight,
  Building2,
  Truck,
  IndianRupee,
  Package,
} from 'lucide-react';
import { fp } from '../lib/fp';
import { useApp } from '../store';
import { cn, fmtNum, fmtCurrency } from '../lib/cn';
import type { BreakdownImpactCustomer, PressStatus } from '../../shared/types';

const PRIORITY_META: Record<
  string,
  { label: string; ring: string; dot: string; cardRing: string }
> = {
  Critical: {
    label: 'Critical',
    ring: 'bg-rose-100 text-rose-700 ring-1 ring-rose-300',
    dot: 'bg-rose-500',
    cardRing: 'ring-rose-200/70 hover:ring-rose-300',
  },
  High: {
    label: 'High',
    ring: 'bg-amber-100 text-amber-700 ring-1 ring-amber-300',
    dot: 'bg-amber-500',
    cardRing: 'ring-amber-200/60 hover:ring-amber-300',
  },
  Medium: {
    label: 'Medium',
    ring: 'bg-steel-100 text-steel-700 ring-1 ring-steel-200',
    dot: 'bg-steel-400',
    cardRing: 'ring-steel-200 hover:ring-steel-300',
  },
  Low: {
    label: 'Low',
    ring: 'bg-steel-50 text-steel-600 ring-1 ring-steel-200',
    dot: 'bg-steel-300',
    cardRing: 'ring-steel-200 hover:ring-steel-300',
  },
};

const STATUS_META: Record<
  PressStatus,
  { label: string; chip: string; icon: typeof AlertOctagon }
> = {
  Running: { label: 'Running', chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', icon: AlertOctagon },
  Idle: { label: 'Idle', chip: 'bg-steel-100 text-steel-600 ring-1 ring-steel-200', icon: AlertOctagon },
  Setup: { label: 'Setup', chip: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200', icon: AlertOctagon },
  Maintenance: { label: 'Prevention', chip: 'bg-sky-100 text-sky-700 ring-1 ring-sky-300', icon: Wrench },
  Down: { label: 'Breakdown', chip: 'bg-rose-100 text-rose-700 ring-1 ring-rose-300', icon: AlertOctagon },
};

/**
 * Shows customer-level impact when any in-house / vendor press is in
 * Breakdown or Prevention status. Each customer card expands to reveal
 * the affected parts with press status + alternates.
 */
export function CustomerImpactPanel() {
  const { month } = useApp();
  const [data, setData] = useState<BreakdownImpactCustomer[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = () =>
    fp.invoke<BreakdownImpactCustomer[]>(fp.channels.CUSTOMER_BREAKDOWN_IMPACT, month).then(
      (d) => {
        setData(d);
        // Auto-expand all Critical cards by default
        setExpanded(new Set(d.filter((c) => c.priority_tier === 'Critical').map((c) => c.customer_id)));
      }
    );

  useEffect(() => {
    load();
    const off1 = fp.on(fp.channels.EVT_PRESS_STATUS_CHANGED, load);
    const off2 = fp.on(fp.channels.EVT_PLAN_UPDATED, load);
    return () => {
      off1();
      off2();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  if (data.length === 0) return null;

  const totalPcs = data.reduce((s, c) => s + c.total_qty_at_risk, 0);
  const totalValue = data.reduce((s, c) => s + c.total_value_at_risk, 0);
  const critical = data.filter((c) => c.priority_tier === 'Critical');
  const highOrAbove = data.filter(
    (c) => c.priority_tier === 'Critical' || c.priority_tier === 'High'
  );

  const toggle = (id: number) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card overflow-hidden"
    >
      {/* Hero header */}
      <div className="relative bg-gradient-to-br from-rose-50 via-white to-amber-50/40 border-b border-rose-200/60 px-5 py-4">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-glow-red shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-rose-900 tracking-tight">
              Customer impact · {data.length} customer{data.length === 1 ? '' : 's'} affected
            </h2>
            <p className="text-xs text-rose-700/80 mt-0.5">
              Live view of who's at risk because of Breakdown / Prevention presses
            </p>
          </div>
          <div className="hidden md:grid grid-cols-3 gap-3 text-right">
            <Mini label="Customers" value={fmtNum(data.length)} tone="rose" />
            <Mini label="Pcs at risk" value={fmtNum(totalPcs)} tone="amber" />
            <Mini
              label="Revenue"
              value={fmtCurrency(totalValue)}
              tone="rose"
              tooltip={`₹${Math.round(totalValue).toLocaleString('en-IN')}`}
            />
          </div>
        </div>

        {(critical.length > 0 || highOrAbove.length > critical.length) && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {critical.length > 0 && (
              <span className="chip bg-rose-600 text-white ring-1 ring-rose-700">
                {critical.length} critical · {critical.map((c) => c.customer_code).join(', ')}
              </span>
            )}
            {highOrAbove.length > critical.length && (
              <span className="chip bg-amber-100 text-amber-800 ring-1 ring-amber-300">
                {highOrAbove.length - critical.length} high tier
              </span>
            )}
          </div>
        )}
      </div>

      {/* Customer cards */}
      <div className="p-4 space-y-2">
        <AnimatePresence>
          {data.map((c) => (
            <CustomerCard
              key={c.customer_id}
              customer={c}
              expanded={expanded.has(c.customer_id)}
              onToggle={() => toggle(c.customer_id)}
            />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function CustomerCard({
  customer,
  expanded,
  onToggle,
}: {
  customer: BreakdownImpactCustomer;
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = PRIORITY_META[customer.priority_tier] ?? PRIORITY_META.Medium;
  return (
    <div
      className={cn(
        'rounded-2xl bg-white ring-1 transition-all duration-200',
        meta.cardRing,
        expanded && 'shadow-card'
      )}
    >
      {/* Card header — always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        <div className="relative shrink-0">
          <span className={cn('w-2.5 h-2.5 rounded-full block', meta.dot)} />
          {customer.priority_tier === 'Critical' && (
            <span className={cn('absolute inset-0 rounded-full animate-ping', meta.dot, 'opacity-50')} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-bold text-sm">{customer.customer_code}</span>
            {customer.customer_name && (
              <span className="text-xs text-steel-500 truncate">{customer.customer_name}</span>
            )}
            <span className={cn('chip text-[10px]', meta.ring)}>{meta.label}</span>
          </div>
          <div className="text-[11px] text-steel-500 mt-0.5">
            {customer.affected_parts.length} part{customer.affected_parts.length === 1 ? '' : 's'} on Down / Prevention presses
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-right pr-1">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-steel-400">
              Pcs
            </div>
            <div className="font-bold tabular-nums text-sm text-steel-900">
              {fmtNum(customer.total_qty_at_risk)}
            </div>
          </div>
          {customer.total_value_at_risk > 0 && (
            <div title={`₹${Math.round(customer.total_value_at_risk).toLocaleString('en-IN')}`}>
              <div className="text-[10px] uppercase tracking-wider font-bold text-steel-400">
                ₹ at risk
              </div>
              <div className="font-bold tabular-nums text-sm text-rose-700 inline-flex items-center gap-0.5">
                <IndianRupee className="w-3 h-3" />
                {fmtCurrency(customer.total_value_at_risk).replace('₹', '')}
              </div>
            </div>
          )}
        </div>
        <div className="text-steel-400 shrink-0">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded body — affected parts */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="border-t border-steel-100 p-3 space-y-2 bg-steel-50/40">
              {customer.affected_parts.map((p) => (
                <PartImpactRow key={p.part_id} part={p} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PartImpactRow({ part }: { part: import('../../shared/types').BreakdownImpactPart }) {
  const statusMeta = STATUS_META[part.press_status] ?? STATUS_META.Idle;
  const StatusIcon = statusMeta.icon;
  const completePct = part.planned > 0 ? Math.min(100, (part.produced / part.planned) * 100) : 0;

  return (
    <div className="bg-white rounded-xl ring-1 ring-steel-200 px-3 py-2.5">
      <div className="flex items-start gap-3 mb-2 flex-wrap">
        <div className="w-7 h-7 rounded-lg bg-steel-100 text-steel-700 flex items-center justify-center shrink-0">
          <Package className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-mono font-bold text-xs">{part.part_code}</span>
            <span className="chip bg-steel-100 text-steel-700 text-[10px]">
              {part.required_tonnage}T
            </span>
            <span
              className={cn(
                'chip text-[10px] inline-flex items-center gap-1',
                statusMeta.chip
              )}
            >
              <StatusIcon className="w-3 h-3" />
              {part.press_code} · {statusMeta.label}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-steel-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${completePct}%` }}
              />
            </div>
            <span className="text-[11px] text-steel-600 tabular-nums whitespace-nowrap">
              <span className="font-bold text-emerald-700">{fmtNum(part.produced)}</span> /{' '}
              {fmtNum(part.planned)} done
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wider font-bold text-steel-400">
            At risk
          </div>
          <div className="font-bold tabular-nums text-sm text-rose-700">
            {fmtNum(part.qty_at_risk)} pcs
          </div>
          {part.value_at_risk > 0 && (
            <div
              className="text-[11px] text-steel-500 tabular-nums"
              title={`₹${Math.round(part.value_at_risk).toLocaleString('en-IN')}`}
            >
              {fmtCurrency(part.value_at_risk)}
            </div>
          )}
        </div>
      </div>

      {/* Alternates */}
      {part.alternates.length === 0 ? (
        <div className="text-[11px] text-rose-700 italic bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1.5">
          <AlertOctagon className="w-3 h-3" />
          No compatible press has free capacity right now
        </div>
      ) : (
        <div className="flex items-start gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider font-bold text-steel-500 self-center">
            Can move to →
          </span>
          {part.alternates.slice(0, 3).map((a) => (
            <span
              key={a.press_code}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold ring-1',
                a.is_in_house
                  ? 'bg-industrial-50 text-industrial-700 ring-industrial-200'
                  : 'bg-forge-50 text-forge-700 ring-forge-200'
              )}
            >
              {a.is_in_house ? (
                <Building2 className="w-3 h-3" />
              ) : (
                <Truck className="w-3 h-3" />
              )}
              {a.press_code}
              <span className="opacity-70 font-normal">
                {a.tonnage}T · {a.free_days.toFixed(1)}d free
              </span>
            </span>
          ))}
          {part.alternates.length > 3 && (
            <span className="text-[10px] text-steel-500 self-center">
              +{part.alternates.length - 3} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Mini({
  label,
  value,
  tone,
  tooltip,
}: {
  label: string;
  value: string;
  tone: 'rose' | 'amber';
  tooltip?: string;
}) {
  const toneClass = tone === 'rose' ? 'text-rose-700' : 'text-amber-700';
  return (
    <div title={tooltip}>
      <div className="text-[10px] uppercase tracking-wider font-bold text-steel-500">
        {label}
      </div>
      <div className={cn('text-lg font-bold tabular-nums', toneClass)}>{value}</div>
    </div>
  );
}
