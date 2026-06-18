import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Sparkles, Plus, Calculator, AlertCircle, Wand2 } from 'lucide-react';
import { Modal } from '../components/Modal';
import { fp } from '../lib/fp';
import { useApp } from '../store';
import { cn, fmtNum } from '../lib/cn';
import { computeSafety, workingDaysInMonth } from '../lib/workingDays';
import type {
  Customer,
  MaterialType,
  PartCategory,
  PlanRow,
  Tonnage,
} from '../../shared/types';

interface PartLite {
  id: number;
  part_code: string;
  material_type: MaterialType;
  category: PartCategory;
  required_tonnage: Tonnage;
  wip_safety_days: number | null;
  fg_safety_days: number | null;
}

const TONNAGES: Tonnage[] = [400, 600, 1000, 1600, 2500];

/**
 * Add Part to Plan — radically simplified.
 *
 * Just three inputs: Customer, Part, Required Qty. Everything else flows
 * automatically:
 *   · WIP/FG safety stocks → from part override or global Settings defaults
 *   · Opening stock → from the Stock page
 *   · Press assignment → set later via "Auto-distribute" (FIFO across tiers)
 *
 * The live preview on the right shows what the planner will get without
 * needing to touch a single derived field.
 */
export function AddPlanRowModal({
  open,
  onClose,
  onSaved,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing?: PlanRow | null;
}) {
  const { month, settings } = useApp();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [parts, setParts] = useState<PartLite[]>([]);

  const [customerId, setCustomerId] = useState<number | null>(null);
  const [partId, setPartId] = useState<number | null>(null);
  const [partFilter, setPartFilter] = useState<Tonnage | 0>(0);
  const [creatingPart, setCreatingPart] = useState(false);
  const [newPartCode, setNewPartCode] = useState('');
  const [newPartTonnage, setNewPartTonnage] = useState<Tonnage>(600);
  // Keep the qty as a raw string so the browser <input> can never be
  // "rejected" by a controlled-component round-trip. We parse it on demand.
  const [qtyInput, setQtyInput] = useState<string>('');
  const qty = useMemo(() => {
    const n = parseFloat(qtyInput);
    return isNaN(n) ? 0 : n;
  }, [qtyInput]);
  const [openingStock, setOpeningStock] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      fp.invoke<Customer[]>(fp.channels.CUSTOMERS_LIST),
      fp.invoke<PartLite[]>(fp.channels.PARTS_LIST),
    ]).then(([c, p]) => {
      setCustomers(c);
      setParts(p);

      if (editing) {
        const editingCustomerId = ((editing as unknown) as { customer_id?: number | null })
          .customer_id;
        setCustomerId(
          editingCustomerId ?? c.find((x) => x.code === editing.customer_code)?.id ?? null
        );
        setPartId(editing.part_id);
        setQtyInput(String(editing.customer_schedule_qty || ''));
        setCreatingPart(false);
      } else {
        reset();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  // Pull opening stock for the selected part so the planner can see it
  useEffect(() => {
    if (!open || !partId || creatingPart) {
      setOpeningStock(0);
      return;
    }
    fp.invoke<{ hil_qty: number; outside_qty: number; interunit_qty?: number }>(
      fp.channels.PART_STOCK_GET,
      { part_id: partId, month }
    ).then((s) => {
      setOpeningStock((s?.hil_qty ?? 0) + (s?.outside_qty ?? 0) + (s?.interunit_qty ?? 0));
    });
  }, [open, partId, creatingPart, month]);

  const reset = () => {
    setCustomerId(null);
    setPartId(null);
    setPartFilter(0);
    setCreatingPart(false);
    setNewPartCode('');
    setNewPartTonnage(600);
    setQtyInput('');
    setOpeningStock(0);
  };

  const filteredParts = useMemo(
    () => (partFilter ? parts.filter((p) => p.required_tonnage === partFilter) : parts),
    [parts, partFilter]
  );

  const selectedPart = parts.find((p) => p.id === partId);

  // Effective safety days: per-part override → global default
  const wipDays = creatingPart
    ? settings?.wip_safety_days ?? 2
    : selectedPart?.wip_safety_days ?? settings?.wip_safety_days ?? 2;
  const fgDays = creatingPart
    ? settings?.fg_safety_days ?? 2
    : selectedPart?.fg_safety_days ?? settings?.fg_safety_days ?? 2;
  const excludeSundays = settings?.exclude_sundays !== 0;
  const extraHolidays = settings?.extra_holidays_per_month ?? 0;

  const workingDaysInfo = useMemo(
    () => workingDaysInMonth(month, { excludeSundays, extraHolidays }),
    [month, excludeSundays, extraHolidays]
  );

  const calc = useMemo(() => {
    const safety = computeSafety(qty, month, {
      wipDays,
      fgDays,
      excludeSundays,
      extraHolidays,
    });
    const totalDemand = qty + safety.wip + safety.fg;
    const netPlan = Math.max(0, totalDemand - openingStock);
    const hil = netPlan;
    return {
      wip: safety.wip,
      fg: safety.fg,
      dailyConsumption: safety.dailyConsumption,
      totalDemand,
      netPlan,
      hil,
    };
  }, [qty, month, wipDays, fgDays, excludeSundays, extraHolidays, openingStock]);

  const canSave =
    customerId !== null &&
    qty > 0 &&
    ((partId !== null && !creatingPart) ||
      (creatingPart && newPartCode.trim().length > 0));

  const save = async () => {
    if (!canSave || !customerId) return;
    setBusy(true);
    try {
      let finalPartId = partId;
      if (creatingPart) {
        finalPartId = (await fp.invoke<number>(fp.channels.PART_UPSERT, {
          part_code: newPartCode.trim(),
          material_type: 'HW',
          category: 'Fast Runner',
          required_tonnage: newPartTonnage,
        })) as number;
      }
      if (!finalPartId) throw new Error('Part not resolved');

      await fp.invoke(fp.channels.PLAN_UPSERT_ROW, {
        month,
        part_id: finalPartId,
        customer_id: customerId,
        customer_schedule_qty: qty,
        osp_split_qty: 0,
        // supply_location and all derived fields are filled in by
        // recomputePlanDerived (triggered downstream by the upsert handler).
      });

      const part = parts.find((p) => p.id === finalPartId);
      const customer = customers.find((c) => c.id === customerId);
      toast.success(
        `Added ${fmtNum(qty)} of ${part?.part_code ?? newPartCode} for ${customer?.code ?? ''}`
      );
      onSaved();
      onClose();
      reset();
    } catch (e) {
      console.error(e);
      toast.error('Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit plan row' : 'Add part to plan'}
      subtitle={`${monthLabel(month)} · press will be assigned later via Auto-distribute`}
      width={560}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={save} disabled={!canSave || busy} className="btn-accent">
            <Sparkles className="w-4 h-4" />
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add to plan'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4">
        {/* Single-column layout — compact */}
        <section className="space-y-4">
          <Field label="Customer" required hint="Who placed this order">
            <select
              className="select text-base py-2.5"
              value={customerId ?? ''}
              onChange={(e) => setCustomerId(Number(e.target.value) || null)}
            >
              <option value="">— Select customer —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                  {c.full_name ? ` · ${c.full_name}` : ''}
                </option>
              ))}
            </select>
          </Field>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-steel-500">
                Part <span className="text-rose-500">*</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-steel-400 mr-1">
                  Filter:
                </span>
                <button
                  type="button"
                  onClick={() => setPartFilter(0)}
                  className={cn(
                    'px-2 py-0.5 rounded-md text-[11px] font-semibold',
                    partFilter === 0
                      ? 'bg-steel-900 text-white'
                      : 'bg-steel-100 text-steel-600'
                  )}
                >
                  All
                </button>
                {TONNAGES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPartFilter(t)}
                    className={cn(
                      'px-2 py-0.5 rounded-md text-[11px] font-semibold',
                      partFilter === t
                        ? 'bg-steel-900 text-white'
                        : 'bg-steel-100 text-steel-600'
                    )}
                  >
                    {t}T
                  </button>
                ))}
              </div>
            </div>
            <select
              className="select text-base py-2.5"
              value={creatingPart ? '__new' : partId ?? ''}
              onChange={(e) => {
                if (e.target.value === '__new') {
                  setCreatingPart(true);
                  setPartId(null);
                } else {
                  setCreatingPart(false);
                  setPartId(Number(e.target.value) || null);
                }
              }}
            >
              <option value="">— Select part ({filteredParts.length} avail.) —</option>
              {filteredParts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.part_code} · {p.required_tonnage}T · {p.material_type}
                </option>
              ))}
              <option value="__new">＋ Create new part…</option>
            </select>

            {creatingPart && (
              <div className="border-l-4 border-forge-500 pl-4 py-2 mt-2 bg-forge-50/40 rounded-r-xl space-y-2 animate-fade-in">
                <div className="flex items-center gap-2 text-forge-700 text-xs font-semibold">
                  <Plus className="w-3.5 h-3.5" /> New part — minimal details
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="input font-mono"
                    placeholder="Part code (e.g. 5KBL10031)"
                    value={newPartCode}
                    onChange={(e) => setNewPartCode(e.target.value)}
                  />
                  <select
                    className="select"
                    value={newPartTonnage}
                    onChange={(e) => setNewPartTonnage(Number(e.target.value) as Tonnage)}
                  >
                    {TONNAGES.map((t) => (
                      <option key={t} value={t}>
                        {t}T
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[10px] text-steel-500">
                  Defaults: HW · Fast Runner. Edit other details later in Settings → Parts.
                </p>
              </div>
            )}

            {selectedPart && !creatingPart && (
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <span className="chip bg-steel-100 text-steel-700">
                  {selectedPart.required_tonnage}T
                </span>
                <span className="chip bg-steel-100 text-steel-700">
                  {selectedPart.material_type}
                </span>
                <span
                  className={cn(
                    'chip',
                    selectedPart.category === 'Fast Runner'
                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                      : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                  )}
                >
                  {selectedPart.category}
                </span>
                {(selectedPart.wip_safety_days !== null || selectedPart.fg_safety_days !== null) && (
                  <span className="chip bg-industrial-50 text-industrial-700 ring-1 ring-industrial-200">
                    Custom safety · W {wipDays}d / F {fgDays}d
                  </span>
                )}
                {openingStock > 0 && (
                  <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                    Opening stock: {fmtNum(openingStock)} pcs
                  </span>
                )}
              </div>
            )}
          </div>

          <Field
            label="Required qty"
            required
            hint="Monthly customer schedule in pieces"
          >
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="input text-xl font-bold tabular-nums py-3 pr-14"
                value={qtyInput}
                onChange={(e) => {
                  // Accept only digits and one decimal point; strip everything else
                  const cleaned = e.target.value.replace(/[^\d.]/g, '');
                  // Prevent multiple dots
                  const firstDot = cleaned.indexOf('.');
                  const sanitized =
                    firstDot === -1
                      ? cleaned
                      : cleaned.slice(0, firstDot + 1) +
                        cleaned.slice(firstDot + 1).replace(/\./g, '');
                  setQtyInput(sanitized);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSave && !busy) save();
                }}
                placeholder="0"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-steel-400 pointer-events-none">
                pcs
              </span>
            </div>
          </Field>

          <div className="bg-industrial-50/60 border border-industrial-200/60 rounded-xl px-3 py-2 text-[11px] text-industrial-800 leading-relaxed flex items-start gap-2">
            <Wand2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-industrial-600" />
            <span>
              <span className="font-bold">{workingDaysInfo.working} working days</span> in{' '}
              {monthLabel(month)} · auto-distribute will assign the press.
            </span>
          </div>

          {/* Compact live calc strip */}
          {qty > 0 && (
            <div className="bg-gradient-to-br from-steel-900 to-steel-700 text-white rounded-2xl p-4 shadow-card">
              <div className="flex items-center gap-2 text-steel-300 text-[10px] uppercase tracking-wider font-bold mb-2">
                <Calculator className="w-3 h-3" />
                Live calculation
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <CalcRow label="Required" value={fmtNum(qty)} />
                <CalcRow label={`WIP (${wipDays}d)`} value={fmtNum(calc.wip, 0)} muted />
                <CalcRow label="− Opening" value={fmtNum(openingStock)} muted minus />
                <CalcRow label={`FG (${fgDays}d)`} value={fmtNum(calc.fg, 0)} muted />
                <CalcRow label="Total demand" value={fmtNum(calc.totalDemand, 0)} highlight />
                <CalcRow label="Net plan" value={fmtNum(calc.netPlan, 0)} highlight />
              </div>
              <div className="mt-2 pt-2 border-t border-white/10 flex items-baseline justify-between">
                <span className="text-steel-300 text-[11px] uppercase tracking-wider font-bold">
                  HIL prod
                </span>
                <span className="text-2xl font-bold tabular-nums">
                  {fmtNum(calc.hil, 0)}
                </span>
              </div>
            </div>
          )}

          {!canSave && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[12px] text-amber-800 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Fill in {!customerId && 'customer, '}
                {customerId && !partId && !creatingPart && 'part, '}
                {creatingPart && !newPartCode.trim() && 'part code, '}
                {qty <= 0 && 'required qty'} to save.
              </span>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

function CalcRow({
  label,
  value,
  muted,
  highlight,
  minus,
}: {
  label: string;
  value: string;
  muted?: boolean;
  highlight?: boolean;
  minus?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className={cn('text-[11px]', muted ? 'text-steel-400' : 'text-steel-200')}>
        {label}
      </span>
      <span
        className={cn(
          'tabular-nums font-semibold',
          highlight ? 'text-base text-white' : 'text-xs',
          muted && !highlight && 'text-steel-300',
          minus && 'text-rose-300'
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-steel-500 mb-1.5 flex items-center justify-between">
        <span>
          {label}
          {required && <span className="text-rose-500 ml-0.5">*</span>}
        </span>
        {hint && (
          <span className="text-[10px] text-steel-400 normal-case tracking-normal font-normal">
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function monthLabel(m: string): string {
  const [y, mm] = m.split('-').map(Number);
  return new Date(y, (mm ?? 1) - 1, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}
