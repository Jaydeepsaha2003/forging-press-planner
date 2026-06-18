import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Sparkles,
  Building2,
  Warehouse,
  Truck,
  AlertOctagon,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { Modal } from '../components/Modal';
import { fp } from '../lib/fp';
import { cn, fmtNum } from '../lib/cn';
import type { AllocationPreview, PressTier } from '../../shared/types';

const TIER_META: Record<
  PressTier,
  { label: string; icon: typeof Building2; tone: string; ring: string }
> = {
  in_house: {
    label: 'In-house',
    icon: Building2,
    tone: 'text-industrial-700',
    ring: 'bg-industrial-50 text-industrial-700 ring-1 ring-industrial-200',
  },
  inter_unit: {
    label: 'Inter-unit',
    icon: Warehouse,
    tone: 'text-emerald-700',
    ring: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  },
  vendor: {
    label: 'Vendor',
    icon: Truck,
    tone: 'text-forge-700',
    ring: 'bg-forge-50 text-forge-700 ring-1 ring-forge-200',
  },
};

export function AutoDistributeModal({
  open,
  month,
  onClose,
  onApplied,
}: {
  open: boolean;
  month: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [preview, setPreview] = useState<AllocationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fp.invoke<AllocationPreview>(fp.channels.PLAN_AUTO_DISTRIBUTE_PREVIEW, month).then((p) => {
      setPreview(p);
      setLoading(false);
    });
  }, [open, month]);

  const apply = async () => {
    if (!preview) return;
    setApplying(true);
    try {
      await fp.invoke(fp.channels.PLAN_AUTO_DISTRIBUTE_APPLY, month);
      toast.success(
        `Auto-distributed ${preview.summary.parts_fully_allocated + preview.summary.parts_partial} parts across the month`
      );
      onApplied();
      onClose();
    } catch (e) {
      console.error(e);
      toast.error('Auto-distribute failed');
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Auto-distribute work to presses"
      subtitle="FIFO across in-house → inter-unit → vendor, respecting priority tier & die-locks"
      width={920}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={loading || applying || !preview || preview.rows.length === 0}
            className="btn-accent disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {applying ? 'Applying…' : 'Apply allocations'}
          </button>
        </>
      }
    >
      {loading || !preview ? (
        <div className="py-12 text-center text-steel-500 text-sm">Calculating allocation…</div>
      ) : preview.rows.length === 0 ? (
        <div className="py-12 text-center text-steel-500">
          <Sparkles className="w-10 h-10 mx-auto mb-3 text-steel-300" />
          <div className="font-semibold">Nothing to allocate</div>
          <div className="text-xs mt-1">
            No plan rows have HIL production quantity for {month}. Add schedules first.
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryStat
              label="Fully allocated"
              value={preview.summary.parts_fully_allocated}
              total={preview.summary.parts_total}
              tone="emerald"
            />
            <SummaryStat
              label="Partially allocated"
              value={preview.summary.parts_partial}
              total={preview.summary.parts_total}
              tone="amber"
            />
            <SummaryStat
              label="Unallocated"
              value={preview.summary.parts_unallocated}
              total={preview.summary.parts_total}
              tone={preview.summary.parts_unallocated > 0 ? 'rose' : 'steel'}
            />
            <SummaryStat
              label="Total qty"
              value={fmtNum(preview.summary.qty_total)}
              tone="steel"
            />
          </div>

          {/* Tier breakdown */}
          <div className="card bg-gradient-to-br from-steel-900 to-steel-700 text-white p-4">
            <div className="text-[10px] uppercase tracking-wider font-bold text-steel-300 mb-3">
              Allocation by tier
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
              <TierBar
                label="In-house"
                value={preview.summary.qty_in_house}
                total={preview.summary.qty_total}
                color="bg-industrial-500"
                icon={<Building2 className="w-3.5 h-3.5" />}
              />
              <TierBar
                label="Inter-unit"
                value={preview.summary.qty_inter_unit}
                total={preview.summary.qty_total}
                color="bg-emerald-500"
                icon={<Warehouse className="w-3.5 h-3.5" />}
              />
              <TierBar
                label="Vendor"
                value={preview.summary.qty_vendor}
                total={preview.summary.qty_total}
                color="bg-forge-500"
                icon={<Truck className="w-3.5 h-3.5" />}
              />
              <TierBar
                label="Unallocated"
                value={preview.summary.qty_unallocated}
                total={preview.summary.qty_total}
                color="bg-rose-500"
                icon={<AlertOctagon className="w-3.5 h-3.5" />}
              />
            </div>
          </div>

          {/* Per-part breakdown */}
          <div>
            <div className="text-[11px] uppercase tracking-wider font-bold text-steel-500 mb-2">
              Plan rows ({preview.rows.length}) · FIFO order
            </div>
            <div className="space-y-1.5 max-h-[420px] overflow-auto pr-1">
              {preview.rows.map((row) => (
                <PartRow key={row.plan_id} row={row} />
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function PartRow({ row }: { row: AllocationPreview['rows'][number] }) {
  const isUnalloc = row.unallocated_qty > 0.0001 && row.assignments.length === 0;
  const isPartial = row.unallocated_qty > 0.0001 && row.assignments.length > 0;
  const isFull = row.unallocated_qty <= 0.0001;

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-3 py-2 rounded-xl border',
        isUnalloc
          ? 'border-rose-200 bg-rose-50/60'
          : isPartial
          ? 'border-amber-200 bg-amber-50/40'
          : 'border-steel-200 bg-white'
      )}
    >
      <div className="shrink-0 mt-0.5">
        {isFull ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        ) : (
          <AlertOctagon
            className={cn('w-4 h-4', isUnalloc ? 'text-rose-600' : 'text-amber-600')}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-mono font-bold text-xs">{row.part_code}</span>
          <span className="chip bg-steel-100 text-steel-700 text-[10px]">{row.customer_code}</span>
          <PrioBadge tier={row.priority_tier} />
          <span className="text-[11px] text-steel-500 tabular-nums ml-auto">
            {fmtNum(row.hil_prod_qty)} pcs needed
          </span>
        </div>
        {row.assignments.length === 0 ? (
          <div className="text-[11px] text-rose-700 italic mt-1">
            No compatible press has free capacity (check die-lock or tonnage)
          </div>
        ) : (
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {row.assignments.map((a, i) => {
              const Icon = TIER_META[a.tier].icon;
              return (
                <span
                  key={i}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold',
                    TIER_META[a.tier].ring
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {a.press_code}
                  <span className="text-steel-500 font-normal">
                    {fmtNum(a.qty, 0)} pcs · {a.days.toFixed(1)}d
                  </span>
                </span>
              );
            })}
            {row.unallocated_qty > 0.0001 && (
              <span className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold bg-rose-100 text-rose-700 ring-1 ring-rose-200">
                <AlertOctagon className="w-3 h-3" />
                {fmtNum(row.unallocated_qty)} pcs unalloc.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number | string;
  total?: number;
  tone: 'emerald' | 'amber' | 'rose' | 'steel';
}) {
  const toneClass: Record<typeof tone, string> = {
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    rose: 'text-rose-700',
    steel: 'text-steel-900',
  };
  return (
    <div className="card p-3">
      <div className="text-[10px] uppercase tracking-wider font-bold text-steel-500">{label}</div>
      <div className={cn('text-2xl font-bold tabular-nums mt-0.5', toneClass[tone])}>
        {value}
        {total !== undefined && (
          <span className="text-steel-400 text-sm font-normal ml-1">/ {total}</span>
        )}
      </div>
    </div>
  );
}

function TierBar({
  label,
  value,
  total,
  color,
  icon,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  icon: React.ReactNode;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="inline-flex items-center gap-1.5 text-steel-300 text-[11px] font-semibold">
          {icon} {label}
        </span>
        <span className="tabular-nums text-white font-semibold">{fmtNum(value)}</span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[10px] text-steel-400 mt-1 tabular-nums">{pct.toFixed(1)}%</div>
    </div>
  );
}

function PrioBadge({ tier }: { tier: string }) {
  const map: Record<string, string> = {
    Critical: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200',
    High: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
    Medium: 'bg-steel-100 text-steel-700 ring-1 ring-steel-200',
    Low: 'bg-steel-50 text-steel-500 ring-1 ring-steel-200',
  };
  return (
    <span className={cn('chip text-[10px]', map[tier] ?? map.Medium)}>
      <ArrowRight className="w-2.5 h-2.5" />
      {tier}
    </span>
  );
}
