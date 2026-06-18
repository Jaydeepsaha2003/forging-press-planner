import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Warehouse,
  Search,
  Filter,
  Upload,
  Download,
  Building2,
  Truck,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Plus,
} from 'lucide-react';
import { AddStockEntryModal } from './AddStockEntryModal';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../store';
import { fp } from '../lib/fp';
import type {
  ImportResult,
  PartPressStockEntry,
  PartStockRow,
  Tonnage,
} from '../../shared/types';
import { cn, fmtNum } from '../lib/cn';

const TONNAGES: Tonnage[] = [400, 600, 1000, 1600, 2500];

export function Stock() {
  const { month } = useApp();
  const [rows, setRows] = useState<PartStockRow[]>([]);
  const [q, setQ] = useState('');
  const [tonFilter, setTonFilter] = useState<number | 0>(0);
  const [importing, setImporting] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [addOpen, setAddOpen] = useState(false);

  const toggleExpand = (partId: number) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(partId)) next.delete(partId);
      else next.add(partId);
      return next;
    });

  const refresh = () =>
    fp.invoke<PartStockRow[]>(fp.channels.PART_STOCK_LIST, month).then(setRows);

  useEffect(() => {
    refresh();
    const off = fp.on(fp.channels.EVT_PLAN_UPDATED, refresh);
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (tonFilter && r.required_tonnage !== tonFilter) return false;
      if (!needle) return true;
      return r.part_code.toLowerCase().includes(needle);
    });
  }, [rows, q, tonFilter]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => ({
          hil: acc.hil + r.hil_qty,
          outside: acc.outside + r.outside_qty,
          withStock: acc.withStock + (r.hil_qty + r.outside_qty > 0 ? 1 : 0),
        }),
        { hil: 0, outside: 0, withStock: 0 }
      ),
    [filtered]
  );

  const saveStock = async (
    row: PartStockRow,
    patch: Partial<Pick<PartStockRow, 'hil_qty' | 'outside_qty'>>
  ) => {
    const next = { ...row, ...patch };
    // optimistic update so typing feels instant
    setRows((rs) => rs.map((r) => (r.part_id === row.part_id ? next : r)));
    await fp.invoke(fp.channels.PART_STOCK_UPSERT, {
      part_id: row.part_id,
      month,
      hil_qty: next.hil_qty,
      outside_qty: next.outside_qty,
    });
  };

  const importStock = async () => {
    setImporting(true);
    const res = await fp.invoke<ImportResult>(fp.channels.PART_STOCK_IMPORT, { month });
    setImporting(false);
    if (res.ok) {
      toast.success(res.message);
      if (res.warnings.length > 0) {
        toast(`⚠ ${res.warnings.length} warning(s) — check console`, { duration: 5000 });
        console.warn('Stock import warnings:', res.warnings);
      }
      refresh();
    } else if (res.message !== 'Cancelled') {
      toast.error(res.message);
    }
  };

  const exportTemplate = async () => {
    const res = await fp.invoke<{ ok: boolean; message: string; path: string }>(
      fp.channels.PART_STOCK_EXPORT,
      { month }
    );
    if (res.ok) toast.success(`Exported · ${res.message}`);
  };

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Warehouse className="w-6 h-6 text-forge-600" /> Opening Stock
          </h1>
          <p className="text-sm text-steel-500 mt-1">
            {monthLabel(month)} · maintain HIL &amp; outside stock per part. The plan subtracts these
            automatically.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={exportTemplate} className="btn-secondary">
            <Download className="w-4 h-4" /> Template / export
          </button>
          <button onClick={importStock} disabled={importing} className="btn-secondary">
            <Upload className="w-4 h-4" />
            {importing ? 'Importing…' : 'Import stock (Excel)'}
          </button>
          <button onClick={() => setAddOpen(true)} className="btn-accent">
            <Plus className="w-4 h-4" /> Add stock entry
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat label="Parts with stock" value={fmtNum(totals.withStock)} icon={<CheckCircle2 className="w-4 h-4" />} />
        <Stat label="Total HIL stock" value={fmtNum(totals.hil)} icon={<Building2 className="w-4 h-4" />} tone="industrial" />
        <Stat label="Total outside stock" value={fmtNum(totals.outside)} icon={<Truck className="w-4 h-4" />} tone="forge" />
      </div>

      <div className="card p-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-steel-50 rounded-xl px-3 py-1.5 flex-1 min-w-[260px] max-w-md">
          <Search className="w-4 h-4 text-steel-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search part code..."
            className="bg-transparent text-sm flex-1 outline-none placeholder:text-steel-400"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-steel-400" />
          <button
            onClick={() => setTonFilter(0)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold',
              tonFilter === 0 ? 'bg-steel-900 text-white' : 'bg-steel-100 text-steel-600'
            )}
          >
            All tonnages
          </button>
          {TONNAGES.map((t) => (
            <button
              key={t}
              onClick={() => setTonFilter(t)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold',
                tonFilter === t ? 'bg-steel-900 text-white' : 'bg-steel-100 text-steel-600'
              )}
            >
              {t}T
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto max-h-[68vh]">
          <table className="w-full text-sm">
            <thead className="bg-steel-50 sticky top-0 z-10 text-[11px] uppercase tracking-wider text-steel-500">
              <tr className="border-b border-steel-200">
                <th className="text-left px-4 py-2.5 font-semibold w-10">{''}</th>
                <th className="text-left px-4 py-2.5 font-semibold">Part</th>
                <th className="text-left px-4 py-2.5 font-semibold w-24">Prod Type</th>
                <th className="text-center px-4 py-2.5 font-semibold w-16">T</th>
                <th className="text-right px-4 py-2.5 font-semibold w-40">HIL stock</th>
                <th className="text-right px-4 py-2.5 font-semibold w-40">Outside stock</th>
                <th className="text-right px-4 py-2.5 font-semibold w-28">Total</th>
                <th className="text-center px-4 py-2.5 font-semibold w-24">On plan</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-steel-500">
                    <div className="flex flex-col items-center gap-2">
                      <Warehouse className="w-10 h-10 text-steel-300" />
                      <div className="font-semibold">No parts</div>
                      <div className="text-xs">
                        Add parts in Settings → Parts, or import a stock sheet
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map((r) => {
                const isOpen = expanded.has(r.part_id);
                return (
                  <FragmentOnce key={r.part_id}>
                    <tr
                      className={cn(
                        'border-b border-steel-100 hover:bg-industrial-50/40 transition',
                        isOpen && 'bg-industrial-50/50'
                      )}
                    >
                      <td className="px-2 py-2 text-center">
                        <button
                          onClick={() => toggleExpand(r.part_id)}
                          className={cn(
                            'w-6 h-6 rounded-md transition flex items-center justify-center',
                            isOpen
                              ? 'bg-industrial-100 text-industrial-700'
                              : 'text-steel-400 hover:bg-steel-100'
                          )}
                          title={isOpen ? 'Collapse press breakdown' : 'Expand to enter stock per press'}
                        >
                          {isOpen ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs font-semibold whitespace-nowrap max-w-[260px] truncate">
                        {r.part_code}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <span className="chip bg-steel-100 text-steel-700">{r.material_type}</span>
                      </td>
                      <td className="px-4 py-2 text-center text-xs font-semibold text-steel-600">
                        {r.required_tonnage}T
                      </td>
                      <td className="px-4 py-2 text-right">
                        <StockInput
                          value={r.hil_qty}
                          onCommit={(v) => saveStock(r, { hil_qty: v })}
                          locked={isOpen}
                          lockedTitle="Editing per-press below"
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <StockInput
                          value={r.outside_qty}
                          onCommit={(v) => saveStock(r, { outside_qty: v })}
                          locked={isOpen}
                          lockedTitle="Editing per-press below"
                        />
                      </td>
                      <td className="px-4 py-2 text-right font-bold tabular-nums">
                        {fmtNum(r.hil_qty + r.outside_qty)}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {r.in_plan ? (
                          <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                            in plan
                          </span>
                        ) : (
                          <span className="text-steel-400 text-xs italic">—</span>
                        )}
                      </td>
                    </tr>
                    <AnimatePresence>
                      {isOpen && (
                        <tr>
                          <td colSpan={8} className="p-0 bg-industrial-50/30">
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <PerPressEditor
                                partId={r.part_id}
                                partCode={r.part_code}
                                month={month}
                                onSaved={refresh}
                              />
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </FragmentOnce>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AddStockEntryModal
        open={addOpen}
        month={month}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          refresh();
        }}
      />
    </div>
  );
}

/** Render children once at the JSX level — wrapper to satisfy table-row pairing. */
function FragmentOnce({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/** Number cell that commits on blur / Enter and keeps a local draft while typing. */
function StockInput({
  value,
  onCommit,
  locked,
  lockedTitle,
}: {
  value: number;
  onCommit: (v: number) => void;
  locked?: boolean;
  lockedTitle?: string;
}) {
  const [draft, setDraft] = useState<string>(String(value));
  useEffect(() => {
    setDraft(value ? String(value) : '');
  }, [value]);
  const commit = () => {
    const v = parseFloat(draft) || 0;
    if (v !== value) onCommit(v);
  };
  if (locked) {
    return (
      <div
        className="py-1 px-3 w-32 text-right text-sm tabular-nums bg-steel-100 text-steel-500 rounded-xl border border-steel-200 cursor-not-allowed ml-auto"
        title={lockedTitle}
      >
        {fmtNum(value)}
      </div>
    );
  }
  return (
    <input
      type="number"
      min={0}
      value={draft}
      placeholder="0"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className="input py-1 w-32 text-right text-sm tabular-nums"
    />
  );
}

function PerPressEditor({
  partId,
  partCode,
  month,
  onSaved,
}: {
  partId: number;
  partCode: string;
  month: string;
  onSaved: () => void;
}) {
  const [entries, setEntries] = useState<PartPressStockEntry[]>([]);
  const [interunitQty, setInterunitQty] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const reload = () => {
    Promise.all([
      fp.invoke<PartPressStockEntry[]>(fp.channels.PART_PRESS_STOCK_GET, {
        part_id: partId,
        month,
      }),
      fp.invoke<{ hil_qty: number; outside_qty: number; interunit_qty?: number }>(
        fp.channels.PART_STOCK_GET,
        { part_id: partId, month }
      ),
    ]).then(([list, agg]) => {
      setEntries(list);
      setInterunitQty(agg?.interunit_qty ?? 0);
      setDirty(false);
    });
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partId, month]);

  const inHouse = entries.filter((e) => e.is_in_house);
  const vendor = entries.filter((e) => !e.is_in_house);
  const totals = useMemo(
    () => ({
      hil: inHouse.reduce((s, e) => s + e.qty, 0),
      vendor: vendor.reduce((s, e) => s + e.qty, 0),
      interunit: interunitQty,
    }),
    [inHouse, vendor, interunitQty]
  );

  const setQty = (pressId: number, qty: number) => {
    setEntries((es) => es.map((e) => (e.press_id === pressId ? { ...e, qty } : e)));
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await fp.invoke(fp.channels.PART_PRESS_STOCK_SET, {
        part_id: partId,
        month,
        interunit_qty: interunitQty,
        entries: entries.map((e) => ({ press_id: e.press_id, qty: e.qty })),
      });
      toast.success(`Saved stock for ${partCode}`);
      setDirty(false);
      onSaved();
    } catch (e) {
      console.error(e);
      toast.error('Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-6 py-5 space-y-4 border-t border-industrial-200">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wider font-bold text-industrial-700">
            Per-press / per-vendor breakdown for {partCode}
          </div>
          <p className="text-[11px] text-steel-500 mt-0.5">
            Enter how many pieces sit at each press today. Totals auto-roll up to HIL / Outside.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-[11px] text-amber-600 font-semibold">Unsaved changes</span>
          )}
          <button
            onClick={save}
            disabled={!dirty || busy}
            className="btn-accent text-xs py-1.5 px-3"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {busy ? 'Saving…' : 'Save breakdown'}
          </button>
        </div>
      </div>

      <PressStockGroup
        label="In-house presses"
        icon={<Building2 className="w-3.5 h-3.5" />}
        tone="industrial"
        entries={inHouse}
        setQty={setQty}
        total={totals.hil}
      />
      <PressStockGroup
        label="Vendor presses (OSP)"
        icon={<Truck className="w-3.5 h-3.5" />}
        tone="forge"
        entries={vendor}
        setQty={setQty}
        total={totals.vendor}
        groupByVendor
      />

      <div className="bg-white rounded-xl border border-steel-200 p-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
          <Warehouse className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <div className="text-xs font-bold">Inter-unit / sister branches</div>
          <div className="text-[11px] text-steel-500">
            Stock held at HIL sister units — not tied to a specific press
          </div>
        </div>
        <input
          type="number"
          min={0}
          value={interunitQty || ''}
          placeholder="0"
          onChange={(e) => {
            setInterunitQty(Number(e.target.value) || 0);
            setDirty(true);
          }}
          className="input py-1.5 w-32 text-right text-sm tabular-nums"
        />
      </div>

      <div className="flex items-center justify-end gap-4 text-xs pt-2 border-t border-steel-200">
        <span className="text-steel-500">
          HIL: <span className="font-bold tabular-nums text-industrial-700">{fmtNum(totals.hil)}</span>
        </span>
        <span className="text-steel-500">
          Outside: <span className="font-bold tabular-nums text-forge-700">{fmtNum(totals.vendor)}</span>
        </span>
        <span className="text-steel-500">
          Inter-unit:{' '}
          <span className="font-bold tabular-nums text-emerald-700">{fmtNum(totals.interunit)}</span>
        </span>
        <span className="text-steel-700">
          Grand total:{' '}
          <span className="font-bold tabular-nums text-steel-900">
            {fmtNum(totals.hil + totals.vendor + totals.interunit)}
          </span>
        </span>
      </div>
    </div>
  );
}

function PressStockGroup({
  label,
  icon,
  tone,
  entries,
  setQty,
  total,
  groupByVendor,
}: {
  label: string;
  icon: React.ReactNode;
  tone: 'industrial' | 'forge';
  entries: PartPressStockEntry[];
  setQty: (pressId: number, qty: number) => void;
  total: number;
  groupByVendor?: boolean;
}) {
  if (entries.length === 0) return null;
  const grouped: Record<string, PartPressStockEntry[]> = groupByVendor
    ? entries.reduce((acc, e) => {
        const key = e.vendor_name ?? e.factory;
        acc[key] = acc[key] ?? [];
        acc[key].push(e);
        return acc;
      }, {} as Record<string, PartPressStockEntry[]>)
    : { _all: entries };

  return (
    <div className="bg-white rounded-xl border border-steel-200 p-3">
      <div className="flex items-center justify-between mb-3">
        <div
          className={cn(
            'inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider',
            tone === 'industrial' ? 'text-industrial-700' : 'text-forge-700'
          )}
        >
          {icon}
          {label} · {entries.length}
        </div>
        <div className="text-[11px] text-steel-500">
          Subtotal:{' '}
          <span
            className={cn(
              'font-bold tabular-nums',
              tone === 'industrial' ? 'text-industrial-700' : 'text-forge-700'
            )}
          >
            {fmtNum(total)}
          </span>
        </div>
      </div>
      {Object.entries(grouped).map(([groupLabel, list]) => (
        <div key={groupLabel} className="mb-2 last:mb-0">
          {groupByVendor && (
            <div className="text-[10px] uppercase tracking-wider font-semibold text-steel-400 mb-1.5 mt-2">
              {groupLabel}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {list.map((e) => (
              <PressStockCell key={e.press_id} entry={e} onChange={(v) => setQty(e.press_id, v)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PressStockCell({
  entry,
  onChange,
}: {
  entry: PartPressStockEntry;
  onChange: (v: number) => void;
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-2 bg-steel-50 rounded-lg px-2.5 py-1.5 border border-steel-200 hover:border-steel-300 transition cursor-text',
        entry.qty > 0 && 'bg-emerald-50/50 border-emerald-200'
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-bold leading-tight truncate">{entry.press_code}</div>
        <div className="text-[10px] text-steel-500 leading-tight">{entry.tonnage}T</div>
      </div>
      <input
        type="number"
        min={0}
        value={entry.qty || ''}
        placeholder="0"
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-16 bg-white border border-steel-200 rounded px-1.5 py-0.5 text-xs text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-industrial-400"
      />
    </label>
  );
}

function Stat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: 'industrial' | 'forge';
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between text-steel-500 text-[11px] uppercase tracking-wider font-semibold">
        {label}
        <span
          className={cn(
            'w-7 h-7 rounded-lg flex items-center justify-center',
            tone === 'industrial'
              ? 'bg-industrial-50 text-industrial-700'
              : tone === 'forge'
              ? 'bg-forge-50 text-forge-700'
              : 'bg-steel-100 text-steel-600'
          )}
        >
          {icon}
        </span>
      </div>
      <div className="text-2xl font-bold mt-2 tabular-nums">{value}</div>
    </div>
  );
}

function monthLabel(m: string): string {
  const [y, mm] = m.split('-').map(Number);
  return new Date(y, (mm ?? 1) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}
