import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Building2, Truck, Warehouse, Plus, Sparkles } from 'lucide-react';
import { Modal } from '../components/Modal';
import { fp } from '../lib/fp';
import { cn, fmtNum } from '../lib/cn';
import type { Part, Press } from '../../shared/types';

type LocationKind = 'in_house' | 'vendor' | 'inter_unit';

const KIND_OPTIONS: Array<{
  value: LocationKind;
  label: string;
  hint: string;
  icon: typeof Building2;
  ring: string;
}> = [
  {
    value: 'in_house',
    label: 'In-house press',
    hint: 'Specific HIL machine (FS1 / FS2)',
    icon: Building2,
    ring: 'bg-industrial-50 text-industrial-700 ring-1 ring-industrial-200',
  },
  {
    value: 'inter_unit',
    label: 'Inter-unit / branch',
    hint: 'Sister branch — not tied to a specific press',
    icon: Warehouse,
    ring: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  },
  {
    value: 'vendor',
    label: 'Vendor press',
    hint: 'OSP / external partner machine',
    icon: Truck,
    ring: 'bg-forge-50 text-forge-700 ring-1 ring-forge-200',
  },
];

/**
 * "Add stock entry" — one-at-a-time stock input. Pick a part, pick a location
 * (in-house press, vendor press, or inter-unit), type the qty, save.
 * "Save & add another" keeps the part selected so you can rip through stock
 * at multiple presses for the same part without re-picking it.
 */
export function AddStockEntryModal({
  open,
  month,
  onClose,
  onSaved,
}: {
  open: boolean;
  month: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [parts, setParts] = useState<Part[]>([]);
  const [presses, setPresses] = useState<Press[]>([]);
  const [partId, setPartId] = useState<number | null>(null);
  const [kind, setKind] = useState<LocationKind>('in_house');
  const [pressId, setPressId] = useState<number | null>(null);
  const [qty, setQty] = useState<number>(0);
  const [existing, setExisting] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      fp.invoke<Part[]>(fp.channels.PARTS_LIST),
      fp.invoke<Press[]>(fp.channels.PRESSES_LIST),
    ]).then(([p, pr]) => {
      setParts(p);
      setPresses(pr);
    });
  }, [open]);

  useEffect(() => {
    if (!open) {
      // Reset everything when the modal closes
      setPartId(null);
      setKind('in_house');
      setPressId(null);
      setQty(0);
      setExisting(0);
    }
  }, [open]);

  // When kind changes, clear press selection (since press list filters)
  useEffect(() => {
    setPressId(null);
  }, [kind]);

  // When part + press changes, look up existing stock so the user sees what's there
  useEffect(() => {
    if (!partId) {
      setExisting(0);
      return;
    }
    if (kind === 'inter_unit') {
      fp.invoke<{ hil_qty: number; outside_qty: number; interunit_qty?: number }>(
        fp.channels.PART_STOCK_GET,
        { part_id: partId, month }
      ).then((s) => setExisting(s?.interunit_qty ?? 0));
      return;
    }
    if (!pressId) {
      setExisting(0);
      return;
    }
    fp.invoke<Array<{ press_id: number; qty: number }>>(fp.channels.PART_PRESS_STOCK_GET, {
      part_id: partId,
      month,
    }).then((list) => {
      const found = list.find((e) => e.press_id === pressId);
      setExisting(found?.qty ?? 0);
    });
  }, [partId, pressId, kind, month]);

  const filteredPresses = useMemo(() => {
    if (kind === 'in_house') return presses.filter((p) => p.is_in_house && p.factory !== 'InterUnit');
    if (kind === 'vendor') return presses.filter((p) => !p.is_in_house);
    return [];
  }, [presses, kind]);

  // Group vendor presses by vendor for the dropdown
  const groupedVendorPresses = useMemo(() => {
    if (kind !== 'vendor') return {};
    const map: Record<string, Press[]> = {};
    for (const p of filteredPresses) {
      const key = p.factory;
      map[key] = map[key] ?? [];
      map[key].push(p);
    }
    return map;
  }, [filteredPresses, kind]);

  const canSave =
    partId !== null &&
    qty > 0 &&
    (kind === 'inter_unit' || pressId !== null);

  const selectedPart = parts.find((p) => p.id === partId);
  const selectedPress = presses.find((p) => p.id === pressId);

  const save = async (keepPart: boolean) => {
    if (!canSave || !partId) return;
    setBusy(true);
    try {
      if (kind === 'inter_unit') {
        await fp.invoke(fp.channels.PART_INTERUNIT_STOCK_UPSERT, {
          part_id: partId,
          month,
          qty,
        });
      } else {
        await fp.invoke(fp.channels.PART_PRESS_STOCK_UPSERT_ONE, {
          part_id: partId,
          press_id: pressId!,
          month,
          qty,
        });
      }
      const where =
        kind === 'inter_unit' ? 'Inter-unit' : selectedPress?.code ?? '';
      toast.success(`Saved ${fmtNum(qty)} pcs of ${selectedPart?.part_code ?? ''} @ ${where}`);
      onSaved();
      if (keepPart) {
        // Keep the part selected, reset the rest
        setPressId(null);
        setQty(0);
        setExisting(0);
      } else {
        onClose();
      }
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
      title="Add stock entry"
      subtitle={`One at a time · ${month}`}
      width={620}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => save(true)}
            disabled={!canSave || busy}
            className="btn-secondary"
            title="Save and immediately add another entry for the same part"
          >
            <Plus className="w-4 h-4" /> Save &amp; add another
          </button>
          <button onClick={() => save(false)} disabled={!canSave || busy} className="btn-accent">
            <Sparkles className="w-4 h-4" />
            {busy ? 'Saving…' : 'Save & close'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="field-label">
            Part <span className="text-rose-500">*</span>
          </div>
          <select
            autoFocus
            className="select"
            value={partId ?? ''}
            onChange={(e) => setPartId(Number(e.target.value) || null)}
          >
            <option value="">— Select part ({parts.length}) —</option>
            {parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.part_code} · {p.required_tonnage}T · {p.material_type}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="field-label">
            Where is the stock?
          </div>
          <div className="grid grid-cols-3 gap-2">
            {KIND_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = kind === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setKind(opt.value)}
                  className={cn(
                    'rounded-xl border-2 p-3 text-left transition',
                    active
                      ? 'border-steel-900 bg-steel-50'
                      : 'border-steel-200 bg-white hover:border-steel-300'
                  )}
                >
                  <div
                    className={cn(
                      'inline-flex items-center justify-center w-7 h-7 rounded-lg mb-1.5',
                      opt.ring
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="font-semibold text-xs leading-tight">{opt.label}</div>
                  <div className="text-[10px] text-steel-500 mt-0.5 leading-tight">{opt.hint}</div>
                </button>
              );
            })}
          </div>
        </div>

        {kind !== 'inter_unit' && (
          <div>
            <div className="field-label">
              {kind === 'in_house' ? 'In-house press' : 'Vendor press'}{' '}
              <span className="text-rose-500">*</span>
            </div>
            <select
              className="select"
              value={pressId ?? ''}
              onChange={(e) => setPressId(Number(e.target.value) || null)}
            >
              <option value="">— Select press —</option>
              {kind === 'in_house' &&
                filteredPresses.map((p) => (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={
                      selectedPart ? p.tonnage < selectedPart.required_tonnage : false
                    }
                  >
                    {p.code} · {p.tonnage}T · {p.factory}
                    {selectedPart && p.tonnage < selectedPart.required_tonnage
                      ? ' (under-tonnage)'
                      : ''}
                  </option>
                ))}
              {kind === 'vendor' &&
                Object.entries(groupedVendorPresses).map(([factory, list]) => (
                  <optgroup key={factory} label={factory}>
                    {list.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {p.tonnage}T
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
            {selectedPart && selectedPress && selectedPress.tonnage < selectedPart.required_tonnage && (
              <div className="text-[11px] text-amber-700 mt-1">
                ⚠ {selectedPress.code} is {selectedPress.tonnage}T but {selectedPart.part_code}{' '}
                needs {selectedPart.required_tonnage}T. Save anyway if this is leftover stock.
              </div>
            )}
          </div>
        )}

        <div>
          <div className="field-label flex items-center justify-between">
            <span>
              Quantity <span className="text-rose-500">*</span>
            </span>
            {existing > 0 && (
              <span className="text-[10px] normal-case tracking-normal font-normal text-amber-700">
                ⚠ Existing entry: {fmtNum(existing)} pcs — saving will overwrite
              </span>
            )}
          </div>
          <div className="relative">
            <input
              type="number"
              min={0}
              value={qty || ''}
              onChange={(e) => setQty(Number(e.target.value) || 0)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSave && !busy) save(false);
              }}
              placeholder="0"
              className="input pr-12 tabular-nums text-right text-base font-semibold"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-steel-400 pointer-events-none">
              pcs
            </span>
          </div>
        </div>

        {selectedPart && (
          <div className="bg-steel-50 rounded-xl p-3 text-xs text-steel-700 flex items-center gap-3 flex-wrap">
            <span className="font-bold">{selectedPart.part_code}</span>
            <span className="text-steel-400">·</span>
            <span>
              {selectedPart.required_tonnage}T · {selectedPart.material_type}
            </span>
            {kind !== 'inter_unit' && selectedPress && (
              <>
                <span className="text-steel-400">→</span>
                <span className="font-bold">{selectedPress.code}</span>
                <span className="text-steel-400">·</span>
                <span>
                  {selectedPress.tonnage}T · {selectedPress.factory}
                </span>
              </>
            )}
            {kind === 'inter_unit' && (
              <>
                <span className="text-steel-400">→</span>
                <span className="font-bold">Inter-unit / sister branch</span>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
