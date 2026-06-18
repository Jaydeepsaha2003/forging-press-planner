import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ClipboardList,
  Search,
  Upload,
  Download,
  Filter,
  Copy as CopyIcon,
  Plus,
  Pencil,
  Trash2,
  Wand2,
  Warehouse,
  FileSpreadsheet,
} from 'lucide-react';
import { AddPlanRowModal } from './AddPlanRowModal';
import { AutoDistributeModal } from './AutoDistributeModal';
import { useApp } from '../store';
import { fp } from '../lib/fp';
import type {
  Customer,
  ImportResult,
  Part,
  PlanRow,
  Tonnage,
} from '../../shared/types';
import { cn, fmtNum } from '../lib/cn';

const TONNAGES: Tonnage[] = [400, 600, 1000, 1600, 2500];

export function Plan() {
  const { month } = useApp();
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [q, setQ] = useState('');
  const [tonFilter, setTonFilter] = useState<number | 0>(0);
  const [importing, setImporting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);

  const refresh = () => fp.invoke<PlanRow[]>(fp.channels.PLAN_LIST, month).then(setRows);

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
      return (
        r.part_code.toLowerCase().includes(needle) ||
        r.customer_code.toLowerCase().includes(needle) ||
        (r.assigned_press_code ?? '').toLowerCase().includes(needle)
      );
    });
  }, [rows, q, tonFilter]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => ({
        demand: acc.demand + r.total_demand_qty,
        hil: acc.hil + r.hil_prod_qty,
        osp: acc.osp + r.osp_split_qty,
        days: acc.days + (r.required_machine_days ?? 0),
      }),
      { demand: 0, hil: 0, osp: 0, days: 0 }
    );
  }, [filtered]);

  const importExcel = async () => {
    setImporting(true);
    const res = await fp.invoke<ImportResult>(fp.channels.EXCEL_IMPORT, { month });
    setImporting(false);
    if (res.ok) {
      toast.success(res.message);
      if (res.warnings.length > 0) {
        toast(`⚠ ${res.warnings.length} warning(s) — check console`, { duration: 5000 });
        console.warn('Import warnings:', res.warnings);
      }
      refresh();
    } else if (res.message !== 'Cancelled') {
      toast.error(res.message);
    }
  };

  const importSchedules = async () => {
    setImporting(true);
    const res = await fp.invoke<ImportResult>(fp.channels.PLAN_IMPORT_SCHEDULES, { month });
    setImporting(false);
    if (res.ok) {
      toast.success(res.message);
      if (res.warnings.length > 0) {
        toast(`⚠ ${res.warnings.length} warning(s) — check console`, { duration: 5000 });
        console.warn('Schedule import warnings:', res.warnings);
      }
      refresh();
    } else if (res.message !== 'Cancelled') {
      toast.error(res.message);
    }
  };

  // Inline edit: set just the schedule / OSP — backend re-derives everything else.
  const commitField = async (
    planId: number,
    field: 'customer_schedule_qty' | 'osp_split_qty',
    value: number
  ) => {
    setRows((rs) => rs.map((r) => (r.id === planId ? { ...r, [field]: value } : r)));
    await fp.invoke(fp.channels.PLAN_SET_SCHEDULE, { plan_id: planId, [field]: value });
  };

  const exportExcel = async () => {
    const res = await fp.invoke<{ ok: boolean; message: string; path: string }>(
      fp.channels.EXCEL_EXPORT,
      { month }
    );
    if (res.ok) toast.success(`Exported · ${res.message}`);
  };

  const carryForward = async () => {
    const months = await fp.invoke<string[]>(fp.channels.PLAN_MONTHS);
    const prev = months.find((m) => m !== month);
    if (!prev) {
      toast.error('No previous month plan to copy from');
      return;
    }
    const count = await fp.invoke<number>(fp.channels.PLAN_CARRY_FORWARD, {
      fromMonth: prev,
      toMonth: month,
    });
    toast.success(`Copied ${count} rows from ${prev}`);
    refresh();
  };

  return (
    <div className="space-y-5 max-w-[1900px] mx-auto">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-industrial-700" /> Monthly Plan
          </h1>
          <p className="text-sm text-steel-500 mt-1">
            {monthLabel(month)} · {rows.length} parts
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={async () => {
              const r = await fp.invoke<{ rows: number }>(fp.channels.SEED_SAMPLE_DATA, {
                month,
              });
              if (r.rows === 0) {
                toast(
                  'Sample rows already exist — delete them first if you want to reseed.',
                  { duration: 4000 }
                );
              } else {
                toast.success(`Loaded ${r.rows} sample plan rows`);
              }
              refresh();
            }}
            className="btn-ghost"
          >
            <Wand2 className="w-4 h-4" /> Sample data
          </button>
          <button onClick={carryForward} className="btn-ghost">
            <CopyIcon className="w-4 h-4" /> Carry forward
          </button>
          <Link to="/stock" className="btn-ghost">
            <Warehouse className="w-4 h-4" /> Manage stock
          </Link>
          <button onClick={exportExcel} className="btn-secondary">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={importSchedules} disabled={importing} className="btn-secondary">
            <FileSpreadsheet className="w-4 h-4" />
            {importing ? 'Importing…' : 'Import schedules'}
          </button>
          <button onClick={importExcel} disabled={importing} className="btn-secondary">
            <Upload className="w-4 h-4" />
            {importing ? 'Importing…' : 'Import full plan'}
          </button>
          <button
            onClick={() => setAutoOpen(true)}
            className="btn-primary bg-gradient-to-br from-forge-500 to-forge-700 hover:from-forge-600 hover:to-forge-700"
            title="Distribute work to presses (in-house → inter-unit → vendor, FIFO)"
          >
            <Wand2 className="w-4 h-4" /> Auto-distribute
          </button>
          <button
            onClick={() => {
              setEditing(null);
              setAddOpen(true);
            }}
            className="btn-accent"
          >
            <Plus className="w-4 h-4" /> Add row
          </button>
        </div>
      </div>

      <QuickAddPlanRow month={month} onAdded={refresh} />

      <div className="card p-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-steel-50 rounded-xl px-3 py-1.5 flex-1 min-w-[260px] max-w-md">
          <Search className="w-4 h-4 text-steel-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search parts, customers, presses..."
            className="bg-transparent text-sm flex-1 outline-none placeholder:text-steel-400"
          />
        </div>
        <div className="flex items-center gap-1.5">
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
                <Th className="w-10 text-center">#</Th>
                <Th>Customer</Th>
                <Th>Part</Th>
                <Th>Loc</Th>
                <Th>Prod Type</Th>
                <Th>Category</Th>
                <Th align="right">Cust. Sch.</Th>
                <Th align="right">WIP Sft</Th>
                <Th align="right">FG Sft</Th>
                <Th align="right">Total</Th>
                <Th align="right">WIP+FG</Th>
                <Th align="right">Gill Chock</Th>
                <Th align="right">Net Plan</Th>
                <Th align="right">OSP</Th>
                <Th align="right">HIL Prod</Th>
                <Th align="center">T</Th>
                <Th>Press</Th>
                <Th align="right">M/c days</Th>
                <Th align="right" className="w-20">{''}</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={19} className="text-center py-16 text-steel-500">
                    <div className="flex flex-col items-center gap-3">
                      <ClipboardList className="w-10 h-10 text-steel-300" />
                      <div className="font-semibold">No plan rows yet</div>
                      <div className="text-xs">
                        Add rows manually with the dropdown wizard, or import an Excel sheet
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => setAddOpen(true)} className="btn-accent">
                          <Plus className="w-4 h-4" /> Add first row
                        </button>
                        <button onClick={importExcel} className="btn-secondary">
                          <Upload className="w-4 h-4" /> Import Excel
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map((r, i) => (
                <tr
                  key={r.id}
                  className="border-b border-steel-100 hover:bg-industrial-50/40 transition group"
                >
                  <td className="px-3 py-2 text-center text-steel-400 tabular-nums text-xs">
                    {i + 1}
                  </td>
                  <td className="px-3 py-2 font-semibold whitespace-nowrap text-steel-900">{r.customer_code}</td>
                  <td className="px-3 py-2 font-mono text-xs font-semibold text-steel-900 whitespace-nowrap">
                    {r.part_code}
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap text-steel-600">{r.supply_location}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    <span className="chip bg-steel-100 text-steel-700">{r.material_type}</span>
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    <span
                      className={cn(
                        'chip',
                        r.category === 'Fast Runner'
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                          : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                      )}
                    >
                      {r.category}
                    </span>
                  </td>
                  <Td align="right" className="!py-1">
                    <EditableCell
                      value={r.customer_schedule_qty}
                      onCommit={(v) => commitField(r.id, 'customer_schedule_qty', v)}
                    />
                  </Td>
                  <Td align="right">{fmtNum(r.wip_safety_stock_qty)}</Td>
                  <Td align="right">{fmtNum(r.fg_safety_stock_qty)}</Td>
                  <Td align="right" className="font-semibold">
                    {fmtNum(r.total_demand_qty)}
                  </Td>
                  <Td align="right" className="text-steel-500">
                    {fmtNum(r.opening_wip_fg_qty)}
                  </Td>
                  <Td align="right" className="text-steel-500">
                    {fmtNum(r.opening_gill_chock_qty)}
                  </Td>
                  <Td align="right">{fmtNum(r.net_prod_plan_qty)}</Td>
                  <Td align="right" className="text-forge-700 !py-1">
                    <EditableCell
                      value={r.osp_split_qty}
                      onCommit={(v) => commitField(r.id, 'osp_split_qty', v)}
                      className="text-forge-700"
                    />
                  </Td>
                  <Td align="right" className="font-bold text-industrial-700">
                    {fmtNum(r.hil_prod_qty)}
                  </Td>
                  <td className="px-3 py-2 text-center text-xs font-bold text-steel-700 whitespace-nowrap">
                    {r.required_tonnage}T
                  </td>
                  <td className="px-3 py-2 text-xs font-bold whitespace-nowrap">
                    {r.assigned_press_code ? (
                      <span className="chip bg-industrial-50 text-industrial-700 ring-1 ring-industrial-200">
                        {r.assigned_press_code}
                      </span>
                    ) : (
                      <span className="text-steel-400 italic font-normal">unassigned</span>
                    )}
                  </td>
                  <Td align="right" className="tabular-nums">
                    {r.required_machine_days.toFixed(1)}
                  </Td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => {
                          setEditing(r);
                          setAddOpen(true);
                        }}
                        className="p-1.5 rounded-lg hover:bg-industrial-100 text-industrial-700"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm(`Delete plan row for ${r.part_code}?`)) return;
                          await fp.invoke(fp.channels.PLAN_DELETE_ROW, r.id);
                          toast.success('Row deleted');
                          refresh();
                        }}
                        className="p-1.5 rounded-lg hover:bg-rose-100 text-rose-600"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="sticky bottom-0 z-10 bg-steel-50 font-bold text-xs uppercase tracking-wider border-t-2 border-steel-300">
                <tr>
                  <td colSpan={9} className="px-3 py-3 text-right text-steel-500">
                    Totals · {filtered.length} parts
                  </td>
                  <Td align="right">{fmtNum(totals.demand)}</Td>
                  <Td align="right" className="text-steel-400">
                    —
                  </Td>
                  <Td align="right" className="text-steel-400">
                    —
                  </Td>
                  <Td align="right" className="text-steel-400">
                    —
                  </Td>
                  <Td align="right" className="text-forge-700">
                    {fmtNum(totals.osp)}
                  </Td>
                  <Td align="right" className="text-industrial-700">
                    {fmtNum(totals.hil)}
                  </Td>
                  <td colSpan={2} />
                  <Td align="right">{totals.days.toFixed(1)}</Td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <AddPlanRowModal
        open={addOpen}
        editing={editing}
        onClose={() => {
          setAddOpen(false);
          setEditing(null);
        }}
        onSaved={() => {
          refresh();
        }}
      />

      <AutoDistributeModal
        open={autoOpen}
        month={month}
        onClose={() => setAutoOpen(false)}
        onApplied={refresh}
      />
    </div>
  );
}

/**
 * Compact inline quick-add: pick a customer + a part + the required quantity.
 * Hits PLAN_UPSERT_ROW with just the schedule — recompute fills in the rest.
 * For anything more (supply location, OSP split, press) the user opens the
 * full Add Row modal.
 */
function QuickAddPlanRow({ month, onAdded }: { month: string; onAdded: () => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [partId, setPartId] = useState<number | null>(null);
  const [qty, setQty] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      fp.invoke<Customer[]>(fp.channels.CUSTOMERS_LIST),
      fp.invoke<Part[]>(fp.channels.PARTS_LIST),
    ]).then(([c, p]) => {
      setCustomers(c);
      setParts(p);
    });
  }, []);

  const canAdd = customerId !== null && partId !== null && qty > 0;

  const submit = async () => {
    if (!canAdd) return;
    setBusy(true);
    try {
      await fp.invoke(fp.channels.PLAN_UPSERT_ROW, {
        month,
        part_id: partId,
        customer_id: customerId,
        customer_schedule_qty: qty,
        osp_split_qty: 0,
      });
      const selected = customers.find((c) => c.id === customerId);
      const selectedPart = parts.find((p) => p.id === partId);
      toast.success(`Added ${fmtNum(qty)} of ${selectedPart?.part_code ?? 'part'} for ${selected?.code ?? ''}`);
      setQty(0);
      setPartId(null);
      onAdded();
    } catch (e) {
      console.error(e);
      toast.error('Could not add row');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-3 flex items-center gap-3 flex-wrap bg-gradient-to-r from-industrial-50/40 to-white">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-bold text-industrial-700 shrink-0">
        <Plus className="w-3.5 h-3.5" /> Quick add
      </div>
      <select
        className="select py-1.5 text-sm flex-1 min-w-[160px] max-w-[220px]"
        value={customerId ?? ''}
        onChange={(e) => setCustomerId(Number(e.target.value) || null)}
      >
        <option value="">Customer…</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code}
            {c.full_name ? ` · ${c.full_name}` : ''}
          </option>
        ))}
      </select>
      <select
        className="select py-1.5 text-sm flex-1 min-w-[200px] max-w-[320px]"
        value={partId ?? ''}
        onChange={(e) => setPartId(Number(e.target.value) || null)}
      >
        <option value="">Part…</option>
        {parts.map((p) => (
          <option key={p.id} value={p.id}>
            {p.part_code} · {p.required_tonnage}T · {p.material_type}
          </option>
        ))}
      </select>
      <input
        type="number"
        min={0}
        className="input py-1.5 w-32 text-right tabular-nums"
        placeholder="Quantity"
        value={qty || ''}
        onChange={(e) => setQty(Number(e.target.value) || 0)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canAdd && !busy) submit();
        }}
      />
      <button
        onClick={submit}
        disabled={!canAdd || busy}
        className="btn-primary text-sm py-1.5 disabled:opacity-50"
      >
        {busy ? 'Adding…' : 'Add to plan'}
      </button>
      <div className="text-[11px] text-steel-500 hidden lg:inline">
        WIP / FG safety, opening stock &amp; press assignment fill in automatically
      </div>
    </div>
  );
}

function Th({
  children,
  align,
  className,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}) {
  return (
    <th
      className={cn(
        'px-3 py-2.5 font-semibold whitespace-nowrap',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        !align && 'text-left',
        className
      )}
    >
      {children}
    </th>
  );
}

// (Th defined earlier already adds whitespace-nowrap)

function Td({
  children,
  align,
  className,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}) {
  return (
    <td
      className={cn(
        'px-3 py-2 tabular-nums whitespace-nowrap',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
    >
      {children}
    </td>
  );
}

/** Inline-editable number cell — commits on blur / Enter, keeps a draft while typing. */
function EditableCell({
  value,
  onCommit,
  className,
}: {
  value: number;
  onCommit: (v: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value ? String(value) : '');
  useEffect(() => {
    setDraft(value ? String(value) : '');
  }, [value]);
  return (
    <input
      type="number"
      min={0}
      value={draft}
      placeholder="0"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const v = parseFloat(draft) || 0;
        if (v !== value) onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={cn(
        'w-24 text-right text-sm tabular-nums bg-transparent rounded px-2 py-1 outline-none',
        'border border-transparent hover:border-steel-200 focus:border-industrial-400 focus:bg-white',
        className
      )}
    />
  );
}

function monthLabel(m: string): string {
  const [y, mm] = m.split('-').map(Number);
  return new Date(y, (mm ?? 1) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}
