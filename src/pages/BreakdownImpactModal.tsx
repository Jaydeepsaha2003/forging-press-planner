import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  AlertOctagon,
  Wrench,
  Calculator,
  CheckCircle2,
  Building2,
  Warehouse,
  Truck,
  PhoneCall,
  Sparkles,
  ArrowRight,
  PackageCheck,
} from 'lucide-react';
import { Modal } from '../components/Modal';
import { fp } from '../lib/fp';
import { useApp } from '../store';
import { cn, fmtNum, fmtCurrency } from '../lib/cn';
import type {
  Part,
  PressWithLoad,
  RelocationSuggestion,
  Vendor,
} from '../../shared/types';

/**
 * Big, plain-language "what now?" view for when a press goes Breakdown or
 * has scheduled Prevention. Explains the math, lists affected parts, ranks
 * alternates by tier, and falls back to a contact-vendor card if nothing
 * is free.
 */
export function BreakdownImpactModal({
  open,
  press,
  mode,
  onClose,
  onApplied,
}: {
  open: boolean;
  press: PressWithLoad | null;
  mode: 'breakdown' | 'prevention';
  onClose: () => void;
  onApplied: () => void;
}) {
  const { month, settings } = useApp();
  const [suggestions, setSuggestions] = useState<RelocationSuggestion[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [chosen, setChosen] = useState<Record<number, number | null>>({});
  const [productionByPart, setProductionByPart] = useState<Record<number, number>>({});
  const [priceByPart, setPriceByPart] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !press) return;
    Promise.all([
      fp.invoke<RelocationSuggestion[]>(fp.channels.RELOCATION_SUGGEST, {
        fromPressId: press.id,
        month,
      }),
      fp.invoke<Vendor[]>(fp.channels.VENDORS_LIST),
      fp.invoke<Array<{ part_id: number; produced: number }>>(
        fp.channels.PRODUCTION_BALANCE,
        month
      ),
      fp.invoke<Part[]>(fp.channels.PARTS_LIST),
    ]).then(([sugg, ven, balance, parts]) => {
      setSuggestions(sugg);
      setVendors(ven);
      const prodMap: Record<number, number> = {};
      balance.forEach((b) => {
        prodMap[b.part_id] = b.produced;
      });
      setProductionByPart(prodMap);
      const priceMap: Record<number, number> = {};
      parts.forEach((p) => {
        priceMap[p.id] = p.price_per_piece ?? 0;
      });
      setPriceByPart(priceMap);
      const initial: Record<number, number | null> = {};
      sugg.forEach((s) => {
        initial[s.plan_row.id] = s.candidates[0]?.press.id ?? null;
      });
      setChosen(initial);
    });
  }, [open, press, month]);

  if (!open || !press) return null;

  // ── Capacity math ────────────────────────────────────────────────────
  const workingDays = Math.max(
    1,
    daysInMonth(month) -
      (settings?.exclude_sundays !== 0 ? sundaysInMonth(month) : 0) -
      (settings?.extra_holidays_per_month ?? 0)
  );
  const capPerDay = press.capacity_per_day || 0;
  const monthlyCap = capPerDay * workingDays;
  const effectiveCap = Math.round(monthlyCap * 0.85);

  const totalPlanned = suggestions.reduce((s, x) => s + x.plan_row.hil_prod_qty, 0);
  const totalProduced = suggestions.reduce(
    (s, x) => s + (productionByPart[x.plan_row.part_id] || 0),
    0
  );
  const totalRemaining = Math.max(0, totalPlanned - totalProduced);

  // ₹ value of work pending on this press
  const totalValueAtRisk = suggestions.reduce((sum, x) => {
    const remaining = Math.max(
      0,
      x.plan_row.hil_prod_qty - (productionByPart[x.plan_row.part_id] || 0)
    );
    return sum + remaining * (priceByPart[x.plan_row.part_id] || 0);
  }, 0);

  // Group suggestions by tier of #1 candidate
  const groupTiers: { inhouse: number; vendor: number; unsolved: number } = {
    inhouse: 0,
    vendor: 0,
    unsolved: 0,
  };
  for (const s of suggestions) {
    if (s.candidates.length === 0) groupTiers.unsolved++;
    else if (s.candidates[0].press.is_in_house) groupTiers.inhouse++;
    else groupTiers.vendor++;
  }

  const allSolved = groupTiers.unsolved === 0;
  const noAlternates = suggestions.length > 0 && groupTiers.inhouse + groupTiers.vendor === 0;

  const accent = mode === 'breakdown' ? 'rose' : 'sky';
  const Icon = mode === 'breakdown' ? AlertOctagon : Wrench;
  const headline =
    mode === 'breakdown'
      ? `${press.code} is down — here's the recovery plan`
      : `${press.code} has prevention scheduled — let's plan the shift`;

  const applyAll = async () => {
    setBusy(true);
    let moved = 0;
    for (const s of suggestions) {
      const toPressId = chosen[s.plan_row.id];
      if (!toPressId) continue;
      const remaining = Math.max(
        0,
        s.plan_row.hil_prod_qty - (productionByPart[s.plan_row.part_id] || 0)
      );
      await fp.invoke(fp.channels.RELOCATION_APPLY, {
        plan_id: s.plan_row.id,
        part_id: s.plan_row.part_id,
        from_press_id: press.id,
        to_press_id: toPressId,
        qty: remaining,
        required_machine_days:
          capPerDay > 0 ? remaining / (capPerDay * 0.85) : 0,
      });
      moved++;
    }
    setBusy(false);
    toast.success(`Moved ${moved} part${moved !== 1 ? 's' : ''} to alternate presses`);
    onApplied();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title=""
      width={760}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
          <button
            onClick={applyAll}
            disabled={busy || suggestions.length === 0 || noAlternates}
            className="btn-accent disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {busy ? 'Applying…' : 'Apply suggested moves'}
          </button>
        </>
      }
    >
      <div className="space-y-5 -mt-4">
        {/* HEADER */}
        <div
          className={cn(
            'rounded-2xl p-5 flex items-start gap-4',
            accent === 'rose'
              ? 'bg-gradient-to-br from-rose-50 to-white border border-rose-200'
              : 'bg-gradient-to-br from-sky-50 to-white border border-sky-200'
          )}
        >
          <div
            className={cn(
              'w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0',
              accent === 'rose' ? 'bg-rose-600 shadow-glow-red' : 'bg-sky-600 shadow-glow-blue'
            )}
          >
            <Icon className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold tracking-tight">{headline}</h2>
            <p className="text-sm text-steel-600 mt-1">
              {press.code} runs at <b>{capPerDay.toLocaleString('en-IN')} pcs/day</b>. We'll figure
              out where its work can go.
            </p>
          </div>
        </div>

        {/* THE MATH — child-friendly */}
        <div className="card p-5 border-2 border-industrial-100">
          <div className="flex items-center gap-2 mb-3 text-industrial-700">
            <Calculator className="w-4 h-4" />
            <span className="text-[11px] uppercase tracking-wider font-bold">
              How much work is at risk?
            </span>
          </div>

          <div className="space-y-2 text-sm">
            <Step
              left={
                <>
                  {press.code} makes <b>{capPerDay.toLocaleString('en-IN')} pcs/day</b>
                </>
              }
            />
            <Step
              op="×"
              left={
                <>
                  <b>{workingDays} working days</b> this month
                </>
              }
            />
            <Step
              op="="
              left={
                <>
                  <b>{monthlyCap.toLocaleString('en-IN')} pcs</b> max monthly capacity
                </>
              }
              tone="industrial"
            />
            <Step
              op="×"
              left={
                <>
                  <b>85% efficiency</b> = <b>{effectiveCap.toLocaleString('en-IN')} pcs</b> realistic
                </>
              }
              tone="industrial"
            />
          </div>

          <div className="mt-4 pt-4 border-t border-steel-200 grid grid-cols-3 gap-3 text-center">
            <BigStat label="Already produced" value={fmtNum(totalProduced)} tone="emerald" />
            <BigStat label="Planned this month" value={fmtNum(totalPlanned)} tone="steel" />
            <BigStat label="Still pending" value={fmtNum(totalRemaining)} tone={accent === 'rose' ? 'rose' : 'sky'} />
          </div>
          {totalValueAtRisk > 0 && (
            <div
              className={cn(
                'mt-3 rounded-xl px-3 py-2 flex items-center justify-between',
                accent === 'rose'
                  ? 'bg-rose-50 border border-rose-200'
                  : 'bg-sky-50 border border-sky-200'
              )}
            >
              <span className="text-[11px] uppercase tracking-wider font-bold text-steel-600">
                💰 Revenue at risk
              </span>
              <span
                className={cn(
                  'font-bold tabular-nums text-lg',
                  accent === 'rose' ? 'text-rose-700' : 'text-sky-700'
                )}
                title={`₹${Math.round(totalValueAtRisk).toLocaleString('en-IN')}`}
              >
                {fmtCurrency(totalValueAtRisk)}
              </span>
            </div>
          )}
        </div>

        {/* AFFECTED PARTS */}
        {suggestions.length === 0 ? (
          <div className="card p-5 bg-emerald-50 border-emerald-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span className="font-semibold text-emerald-900">
                No parts assigned to {press.code} this month — nothing to move.
              </span>
            </div>
          </div>
        ) : (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <PackageCheck className="w-4 h-4 text-steel-600" />
              <span className="text-[11px] uppercase tracking-wider font-bold text-steel-600">
                {suggestions.length} part{suggestions.length === 1 ? '' : 's'} need to move
              </span>
            </div>

            <div className="space-y-2.5">
              {suggestions.map((s) => {
                const produced = productionByPart[s.plan_row.part_id] || 0;
                const remaining = Math.max(0, s.plan_row.hil_prod_qty - produced);
                const chosenPressId = chosen[s.plan_row.id];
                return (
                  <PartCard
                    key={s.plan_row.id}
                    suggestion={s}
                    produced={produced}
                    remaining={remaining}
                    chosenPressId={chosenPressId}
                    onPick={(pid) =>
                      setChosen((c) => ({ ...c, [s.plan_row.id]: pid }))
                    }
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* CALL VENDOR FALLBACK */}
        {noAlternates && vendors.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-5 border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-white"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <PhoneCall className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-amber-900">No alternate press has free capacity</h3>
                <p className="text-sm text-amber-800/80 mt-0.5 mb-3">
                  All compatible in-house, inter-unit and vendor presses are already full. Call
                  a vendor and arrange overflow capacity:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {vendors.map((v) => (
                    <div
                      key={v.id}
                      className="bg-white rounded-xl border border-amber-200 px-3 py-2"
                    >
                      <div className="font-semibold text-sm">{v.name}</div>
                      <div className="text-[12px] text-steel-600 mt-0.5">
                        {v.contact_person || (
                          <span className="italic text-steel-400">no contact name</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[12px] mt-1 text-steel-700">
                        {v.phone && (
                          <a href={`tel:${v.phone}`} className="link inline-flex items-center gap-1">
                            <PhoneCall className="w-3 h-3" /> {v.phone}
                          </a>
                        )}
                        {v.email && <span className="text-steel-500">{v.email}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* BOTTOM SUMMARY */}
        {suggestions.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <TierStat
              icon={<Building2 className="w-3.5 h-3.5" />}
              label="In-house alternates"
              count={groupTiers.inhouse}
              tone="industrial"
            />
            <TierStat
              icon={<Truck className="w-3.5 h-3.5" />}
              label="Vendor fallback"
              count={groupTiers.vendor}
              tone="forge"
            />
            <TierStat
              icon={<AlertOctagon className="w-3.5 h-3.5" />}
              label="Unsolved"
              count={groupTiers.unsolved}
              tone={allSolved ? 'emerald' : 'rose'}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

function PartCard({
  suggestion,
  produced,
  remaining,
  chosenPressId,
  onPick,
}: {
  suggestion: RelocationSuggestion;
  produced: number;
  remaining: number;
  chosenPressId: number | null;
  onPick: (pressId: number) => void;
}) {
  const { plan_row, candidates } = suggestion;
  const pct =
    plan_row.hil_prod_qty > 0 ? Math.min(100, (produced / plan_row.hil_prod_qty) * 100) : 0;

  if (candidates.length === 0) {
    return (
      <div className="border border-rose-200 bg-rose-50/40 rounded-xl p-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-mono font-bold text-sm">{plan_row.part_code}</span>
          <span className="chip bg-white text-steel-700 ring-1 ring-steel-200">
            {plan_row.customer_code}
          </span>
          <span className="chip bg-white text-steel-600 ring-1 ring-steel-200">
            {plan_row.required_tonnage}T
          </span>
          <span className="ml-auto text-[11px] text-rose-700 font-semibold italic">
            No compatible press
          </span>
        </div>
        <div className="text-[11px] text-rose-700 mt-1">
          {remaining > 0 ? `${fmtNum(remaining)} pcs pending — die-locked or no tonnage match` : 'Already complete'}
        </div>
      </div>
    );
  }

  return (
    <div className="border border-steel-200 rounded-xl p-3 bg-white">
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <span className="font-mono font-bold text-sm">{plan_row.part_code}</span>
        <span className="chip bg-steel-100 text-steel-700 text-[10px]">
          {plan_row.customer_code}
        </span>
        <span className="chip bg-steel-100 text-steel-700 text-[10px]">
          {plan_row.required_tonnage}T
        </span>
        <div className="ml-auto text-[11px] text-steel-600 tabular-nums">
          <span className="text-emerald-700 font-bold">{fmtNum(produced)}</span> /{' '}
          {fmtNum(plan_row.hil_prod_qty)} done · <span className="font-bold">{fmtNum(remaining)} pending</span>
        </div>
      </div>

      <div className="h-1.5 bg-steel-100 rounded-full overflow-hidden mb-2.5">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
        {candidates.map((c) => {
          const chosen = chosenPressId === c.press.id;
          const tier = c.press.is_in_house ? 'in_house' : 'vendor';
          return (
            <button
              key={c.press.id}
              onClick={() => onPick(c.press.id)}
              className={cn(
                'text-left p-2 rounded-lg border-2 transition relative',
                chosen
                  ? tier === 'in_house'
                    ? 'border-industrial-500 bg-industrial-50'
                    : 'border-forge-500 bg-forge-50'
                  : 'border-steel-200 bg-white hover:border-steel-300'
              )}
            >
              {chosen && (
                <CheckCircle2 className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-emerald-600" />
              )}
              <div className="flex items-center gap-1.5 mb-0.5">
                {c.press.is_in_house ? (
                  <Building2 className="w-3 h-3 text-industrial-700" />
                ) : (
                  <Truck className="w-3 h-3 text-forge-700" />
                )}
                <span className="font-bold text-xs">{c.press.code}</span>
                <span className="text-[10px] text-steel-500">{c.press.tonnage}T</span>
              </div>
              <div className="text-[10px] text-steel-500 tabular-nums">
                <b>{c.free_days.toFixed(1)}d</b> free ·{' '}
                {c.press.is_in_house ? 'in-house' : c.press.vendor_name || 'vendor'}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Step({
  left,
  op,
  tone,
}: {
  left: React.ReactNode;
  op?: '×' | '=' | '−';
  tone?: 'industrial';
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 text-sm py-1',
        tone === 'industrial' && 'text-industrial-800'
      )}
    >
      <span
        className={cn(
          'w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0',
          op === '='
            ? 'bg-industrial-600 text-white'
            : op === '×'
            ? 'bg-steel-200 text-steel-700'
            : op === '−'
            ? 'bg-rose-100 text-rose-700'
            : 'bg-steel-100 text-steel-500'
        )}
      >
        {op ?? '•'}
      </span>
      <span>{left}</span>
    </div>
  );
}

function BigStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'emerald' | 'rose' | 'sky' | 'steel';
}) {
  const toneClass = {
    emerald: 'text-emerald-700',
    rose: 'text-rose-700',
    sky: 'text-sky-700',
    steel: 'text-steel-900',
  }[tone];
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-steel-500">{label}</div>
      <div className={cn('text-2xl font-bold tabular-nums mt-0.5', toneClass)}>{value}</div>
    </div>
  );
}

function TierStat({
  icon,
  label,
  count,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  tone: 'industrial' | 'forge' | 'emerald' | 'rose';
}) {
  const toneClass = {
    industrial: 'text-industrial-700 bg-industrial-50 ring-industrial-200',
    forge: 'text-forge-700 bg-forge-50 ring-forge-200',
    emerald: 'text-emerald-700 bg-emerald-50 ring-emerald-200',
    rose: 'text-rose-700 bg-rose-50 ring-rose-200',
  }[tone];
  return (
    <div className={cn('rounded-xl p-3 ring-1', toneClass)}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums mt-1">{count}</div>
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────
function daysInMonth(m: string): number {
  const [y, mm] = m.split('-').map(Number);
  if (!y || !mm) return 30;
  return new Date(y, mm, 0).getDate();
}
function sundaysInMonth(m: string): number {
  const [y, mm] = m.split('-').map(Number);
  if (!y || !mm) return 4;
  const total = new Date(y, mm, 0).getDate();
  let s = 0;
  for (let d = 1; d <= total; d++) if (new Date(y, mm - 1, d).getDay() === 0) s++;
  return s;
}
