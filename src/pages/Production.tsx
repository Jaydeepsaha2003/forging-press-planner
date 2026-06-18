import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Hammer,
  Plus,
  Search,
  Trash2,
  CheckCircle2,
  Clock,
  AlertOctagon,
  Wrench,
  History,
  Download,
  Upload,
  FileSpreadsheet,
} from 'lucide-react';
import type { ImportResult } from '../../shared/types';
import { useApp } from '../store';
import { fp } from '../lib/fp';
import { Modal } from '../components/Modal';
import { cn, fmtNum, timeAgo } from '../lib/cn';
import type {
  AlternatePress,
  Part,
  Press,
  PressStatus,
  ProductionBalance,
  ProductionLog,
} from '../../shared/types';

export function Production() {
  const { month } = useApp();
  const [rows, setRows] = useState<ProductionBalance[]>([]);
  const [logs, setLogs] = useState<ProductionLog[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [presses, setPresses] = useState<Press[]>([]);
  const [q, setQ] = useState('');
  const [logOpen, setLogOpen] = useState(false);
  const [showAlt, setShowAlt] = useState<ProductionBalance | null>(null);

  const refresh = () =>
    Promise.all([
      fp.invoke<ProductionBalance[]>(fp.channels.PRODUCTION_BALANCE, month),
      fp.invoke<ProductionLog[]>(fp.channels.PRODUCTION_LIST, { month }),
      fp.invoke<Part[]>(fp.channels.PARTS_LIST),
      fp.invoke<Press[]>(fp.channels.PRESSES_LIST),
    ]).then(([b, l, p, pr]) => {
      setRows(b);
      setLogs(l);
      setParts(p);
      setPresses(pr);
    });

  useEffect(() => {
    refresh();
    const off1 = fp.on(fp.channels.EVT_PLAN_UPDATED, refresh);
    const off2 = fp.on(fp.channels.EVT_PRESS_STATUS_CHANGED, refresh);
    return () => {
      off1();
      off2();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.part_code.toLowerCase().includes(needle) ||
        r.customer_code.toLowerCase().includes(needle) ||
        (r.assigned_press_code ?? '').toLowerCase().includes(needle)
    );
  }, [rows, q]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        plan: acc.plan + r.hil_plan,
        produced: acc.produced + r.produced,
        balance: acc.balance + r.balance,
        complete: acc.complete + (r.balance <= 0 && r.hil_plan > 0 ? 1 : 0),
        atRisk: acc.atRisk + (r.assigned_press_status === 'Down' && r.balance > 0 ? 1 : 0),
      }),
      { plan: 0, produced: 0, balance: 0, complete: 0, atRisk: 0 }
    );
  }, [rows]);

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Hammer className="w-6 h-6 text-forge-600" /> Production Log
            <span className="text-[11px] font-semibold uppercase tracking-wider text-steel-500 bg-steel-100 rounded px-2 py-0.5 ml-1">
              Step 3 of 3
            </span>
          </h1>
          <p className="text-sm text-steel-500 mt-1">
            Record daily output · balance decrements as you log · alternate machines surface
            when assigned press goes down
          </p>
        </div>
        <button onClick={() => setLogOpen(true)} className="btn-accent">
          <Plus className="w-4 h-4" /> Log production
        </button>
      </div>

      <DailyTemplateCard onImported={refresh} />


      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Mini label="HIL plan" value={fmtNum(totals.plan)} tone="steel" />
        <Mini label="Produced" value={fmtNum(totals.produced)} tone="emerald" />
        <Mini label="Balance" value={fmtNum(totals.balance)} tone="industrial" />
        <Mini label="Complete" value={`${totals.complete}/${rows.length}`} tone="emerald" />
        <Mini label="On down press" value={fmtNum(totals.atRisk)} tone={totals.atRisk > 0 ? 'rose' : 'steel'} />
      </div>

      <div className="card p-3">
        <div className="flex items-center gap-2 bg-steel-50 rounded-xl px-3 py-1.5 max-w-md">
          <Search className="w-4 h-4 text-steel-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by part, customer, or press..."
            className="bg-transparent text-sm flex-1 outline-none placeholder:text-steel-400"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto max-h-[60vh]">
          <table className="w-full text-sm">
            <thead className="bg-steel-50 sticky top-0 z-10 border-b border-steel-200 text-[11px] uppercase tracking-wider text-steel-500">
              <tr>
                <th className="text-left px-3 py-2.5 font-semibold">Part</th>
                <th className="text-left px-3 py-2.5 font-semibold w-24">Customer</th>
                <th className="text-left px-3 py-2.5 font-semibold w-24">Press</th>
                <th className="text-right px-3 py-2.5 font-semibold">HIL Plan</th>
                <th className="text-right px-3 py-2.5 font-semibold">Produced</th>
                <th className="text-right px-3 py-2.5 font-semibold">Balance</th>
                <th className="text-left px-3 py-2.5 font-semibold w-40">Progress</th>
                <th className="text-right px-3 py-2.5 font-semibold w-20">Days left</th>
                <th className="text-right px-3 py-2.5 font-semibold w-32">{''}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-steel-500">
                    <Hammer className="w-10 h-10 mx-auto mb-3 text-steel-300" />
                    <div className="font-semibold">No plan rows for {month}</div>
                    <div className="text-xs mt-1">
                      Set up customer schedules on the Plan page first
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map((r) => {
                const isDown =
                  r.assigned_press_status === 'Down' || r.assigned_press_status === 'Maintenance';
                const complete = r.balance <= 0 && r.hil_plan > 0;
                return (
                  <tr
                    key={r.part_id}
                    className={cn(
                      'border-b border-steel-100 hover:bg-steel-50/60 transition',
                      isDown && r.balance > 0 && 'bg-rose-50/40'
                    )}
                  >
                    <td className="px-3 py-2 font-mono text-xs font-semibold">
                      {r.part_code}
                      <span className="ml-1.5 text-[10px] text-steel-400 font-sans">
                        {r.required_tonnage}T
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.customer_code}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.assigned_press_code ? (
                        <span
                          className={cn(
                            'chip',
                            isDown
                              ? 'bg-rose-100 text-rose-700 ring-1 ring-rose-200'
                              : 'bg-industrial-50 text-industrial-700 ring-1 ring-industrial-200'
                          )}
                        >
                          {isDown && <AlertOctagon className="w-3 h-3" />}
                          {r.assigned_press_code}
                        </span>
                      ) : (
                        <span className="text-steel-400 italic text-[11px]">unassigned</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {fmtNum(r.hil_plan)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-semibold">
                      {fmtNum(r.produced)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">
                      {complete ? (
                        <span className="text-emerald-600 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> done
                        </span>
                      ) : (
                        fmtNum(r.balance)
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-steel-200 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              complete
                                ? 'bg-emerald-500'
                                : isDown
                                ? 'bg-rose-500'
                                : r.pct_complete >= 50
                                ? 'bg-industrial-500'
                                : 'bg-amber-500'
                            )}
                            style={{ width: `${Math.min(100, r.pct_complete)}%` }}
                          />
                        </div>
                        <span className="text-[11px] tabular-nums text-steel-500 w-9 text-right">
                          {r.pct_complete.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[11px]">
                      {isDown ? (
                        <span className="text-rose-600 font-semibold">press down</span>
                      ) : r.days_remaining !== null ? (
                        <span className="text-steel-700">
                          {r.days_remaining.toFixed(1)}d
                        </span>
                      ) : (
                        <span className="text-steel-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setShowAlt(r)}
                        className={cn(
                          'text-[11px] font-semibold rounded-lg px-2 py-1 transition',
                          isDown
                            ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                            : 'text-industrial-700 hover:bg-industrial-50'
                        )}
                      >
                        {isDown ? (
                          <span className="inline-flex items-center gap-1">
                            <Wrench className="w-3 h-3" /> Alternates
                          </span>
                        ) : (
                          'Alternates'
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-bold text-base mb-1 flex items-center gap-2">
          <History className="w-4 h-4 text-steel-500" /> Recent entries
        </h2>
        <p className="text-xs text-steel-500 mb-3">Last 20 production logs this month</p>
        {logs.length === 0 ? (
          <div className="text-sm text-steel-500 italic py-6 text-center bg-steel-50 rounded-xl">
            No production logged yet for {month}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-steel-500 border-b border-steel-200">
                <tr>
                  <th className="text-left px-2 py-2 font-semibold">Date</th>
                  <th className="text-left px-2 py-2 font-semibold">Part</th>
                  <th className="text-left px-2 py-2 font-semibold">Press</th>
                  <th className="text-right px-2 py-2 font-semibold">Qty</th>
                  <th className="text-left px-2 py-2 font-semibold">Notes</th>
                  <th className="text-right px-2 py-2 font-semibold w-12">{''}</th>
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 20).map((l) => (
                  <tr key={l.id} className="border-b border-steel-100 last:border-0">
                    <td className="px-2 py-2 text-steel-600">
                      <div className="text-xs">{l.logged_date}</div>
                      <div className="text-[10px] text-steel-400">{timeAgo(l.created_at)}</div>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs font-semibold">{l.part_code}</td>
                    <td className="px-2 py-2 text-xs">
                      {l.press_code ? (
                        <span className="chip bg-industrial-50 text-industrial-700 ring-1 ring-industrial-200">
                          {l.press_code}
                        </span>
                      ) : (
                        <span className="text-steel-400 italic text-[11px]">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold">
                      {fmtNum(l.qty_produced)}
                    </td>
                    <td className="px-2 py-2 text-xs text-steel-600 max-w-[280px] truncate">
                      {l.notes || <span className="text-steel-400 italic">no notes</span>}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        onClick={async () => {
                          if (!confirm('Delete this production entry?')) return;
                          await fp.invoke(fp.channels.PRODUCTION_DELETE, l.id);
                          toast.success('Entry deleted');
                          refresh();
                        }}
                        className="text-rose-600 hover:bg-rose-50 p-1 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ProductionLogModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        onSaved={() => {
          setLogOpen(false);
          refresh();
        }}
        rows={rows}
        parts={parts}
        presses={presses}
        month={month}
      />

      <AlternatesModal
        balance={showAlt}
        onClose={() => setShowAlt(null)}
        month={month}
      />
    </div>
  );
}

/**
 * Daily template — the planner's shop-floor handoff.
 *
 *  ① pick a date (defaults to today)
 *  ② Download template → Excel with every part assigned to every press,
 *      blank Day/Night actual columns for the operator to fill
 *  ③ paper or filled file goes back to the planner
 *  ④ Upload filled template → production_logs created automatically →
 *      balance + dashboard reflect the day's work
 */
function DailyTemplateCard({ onImported }: { onImported: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  const exportTemplate = async () => {
    setBusy('export');
    const r = await fp.invoke<{ ok: boolean; rows: number; path: string; message: string }>(
      fp.channels.DAILY_TEMPLATE_EXPORT,
      { date }
    );
    setBusy(null);
    if (r.ok) toast.success(r.message);
    else if (r.message !== 'Cancelled') toast.error(r.message);
  };

  const importActuals = async () => {
    setBusy('import');
    const r = await fp.invoke<ImportResult>(fp.channels.DAILY_TEMPLATE_IMPORT, { date });
    setBusy(null);
    if (r.ok && r.imported_rows > 0) {
      toast.success(r.message);
      if (r.warnings.length > 0) {
        toast(`⚠ ${r.warnings.length} warning(s)`, { duration: 4000 });
        console.warn('Daily import warnings:', r.warnings);
      }
      onImported();
    } else if (r.message !== 'Cancelled') {
      toast.error(r.message);
      if (r.warnings.length > 0) console.warn('Daily import warnings:', r.warnings);
    }
  };

  return (
    <div className="card overflow-hidden border-industrial-200 bg-gradient-to-br from-industrial-50/50 to-white">
      <div className="px-5 py-4 flex items-start gap-4 flex-wrap">
        <div className="w-11 h-11 rounded-2xl bg-industrial-100 text-industrial-700 flex items-center justify-center shrink-0">
          <FileSpreadsheet className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h2 className="font-bold text-base tracking-tight">Daily production template</h2>
          <p className="text-xs text-steel-600 mt-0.5 leading-relaxed">
            Print the template → operators fill the day &amp; night actuals → upload back to
            sync. Every non-zero quantity becomes a production log entry automatically.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-steel-500 mb-1">
              Date
            </div>
            <input
              type="date"
              className="input py-1.5 text-sm w-36"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <button
            onClick={exportTemplate}
            disabled={busy !== null}
            className="btn-secondary"
            title="Save an Excel sheet to print"
          >
            <Download className="w-4 h-4" />
            {busy === 'export' ? 'Saving…' : 'Download template'}
          </button>
          <button
            onClick={importActuals}
            disabled={busy !== null}
            className="btn-accent"
            title="Read the filled Excel back into the production log"
          >
            <Upload className="w-4 h-4" />
            {busy === 'import' ? 'Importing…' : 'Upload filled'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'steel' | 'emerald' | 'industrial' | 'rose';
}) {
  const map: Record<typeof tone, string> = {
    steel: 'text-steel-900',
    emerald: 'text-emerald-600',
    industrial: 'text-industrial-700',
    rose: 'text-rose-600',
  };
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-wider font-bold text-steel-500">
        {label}
      </div>
      <div className={cn('text-2xl font-bold tabular-nums mt-1', map[tone])}>{value}</div>
    </div>
  );
}

function ProductionLogModal({
  open,
  onClose,
  onSaved,
  rows,
  parts,
  presses,
  month,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  rows: ProductionBalance[];
  parts: Part[];
  presses: Press[];
  month: string;
}) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayIso);
  const [partId, setPartId] = useState<number | null>(null);
  const [qty, setQty] = useState(0);
  const [pressId, setPressId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(todayIso);
      setPartId(null);
      setQty(0);
      setPressId(null);
      setNotes('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedBalance = rows.find((r) => r.part_id === partId);
  const canSave = partId !== null && qty > 0;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await fp.invoke(fp.channels.PRODUCTION_CREATE, {
        part_id: partId,
        month,
        logged_date: date,
        qty_produced: qty,
        press_id: pressId,
        notes: notes.trim() || null,
      });
      toast.success(`Logged ${fmtNum(qty)} pcs of ${selectedBalance?.part_code ?? ''}`);
      onSaved();
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
      title="Log production"
      subtitle={`Record output for ${month} — balance auto-decrements`}
      width={620}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={save} disabled={!canSave || busy} className="btn-accent">
            {busy ? 'Saving…' : 'Save entry'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="field-label">Date</div>
            <input
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <div className="field-label">Press (optional)</div>
            <select
              className="select"
              value={pressId ?? ''}
              onChange={(e) => setPressId(Number(e.target.value) || null)}
            >
              <option value="">— Not tracked —</option>
              {presses.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.tonnage}T
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="field-label">Part (in plan for {month})</div>
          <select
            className="select"
            value={partId ?? ''}
            onChange={(e) => setPartId(Number(e.target.value) || null)}
          >
            <option value="">— Select part —</option>
            <optgroup label="In current month plan">
              {rows.map((r) => (
                <option key={r.part_id} value={r.part_id}>
                  {r.part_code} · {r.customer_code} · balance {fmtNum(r.balance)}
                </option>
              ))}
            </optgroup>
            {parts.length > rows.length && (
              <optgroup label="Other parts (not in plan)">
                {parts
                  .filter((p) => !rows.some((r) => r.part_id === p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.part_code} · {p.required_tonnage}T
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
          {selectedBalance && (
            <div className="mt-2 bg-steel-50 rounded-xl p-3 text-xs text-steel-700 flex items-center gap-4">
              <span>
                Plan: <span className="font-bold tabular-nums">{fmtNum(selectedBalance.hil_plan)}</span>
              </span>
              <span>
                Already produced:{' '}
                <span className="font-bold tabular-nums text-emerald-700">
                  {fmtNum(selectedBalance.produced)}
                </span>
              </span>
              <span>
                Balance:{' '}
                <span className="font-bold tabular-nums text-industrial-700">
                  {fmtNum(selectedBalance.balance)}
                </span>
              </span>
            </div>
          )}
        </div>

        <div>
          <div className="field-label">Quantity produced</div>
          <input
            type="number"
            min={0}
            className="input"
            value={qty || ''}
            onChange={(e) => setQty(Number(e.target.value) || 0)}
            placeholder="pieces"
          />
        </div>

        <div>
          <div className="field-label">Notes (optional)</div>
          <textarea
            className="input min-h-[60px] resize-y"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Operator name, shift, quality flag…"
          />
        </div>
      </div>
    </Modal>
  );
}

function AlternatesModal({
  balance,
  onClose,
  month,
}: {
  balance: ProductionBalance | null;
  onClose: () => void;
  month: string;
}) {
  const [alternates, setAlternates] = useState<AlternatePress[]>([]);

  useEffect(() => {
    if (!balance) return;
    fp.invoke<AlternatePress[]>(fp.channels.PRODUCTION_ALTERNATES, {
      part_id: balance.part_id,
      month,
      exclude_press_id: undefined,
    }).then(setAlternates);
  }, [balance, month]);

  if (!balance) return null;

  const inHouse = alternates.filter((a) => a.is_in_house);
  const vendor = alternates.filter((a) => !a.is_in_house);
  const isDown =
    balance.assigned_press_status === 'Down' || balance.assigned_press_status === 'Maintenance';

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`Where can ${balance.part_code} run?`}
      subtitle={`${balance.required_tonnage}T compatible presses · sorted by free machine-days · ${alternates.length} options`}
      width={640}
      footer={
        <button onClick={onClose} className="btn-primary">
          Close
        </button>
      }
    >
      <div className="space-y-4">
        {isDown && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm text-rose-900 flex items-start gap-2">
            <AlertOctagon className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              Currently assigned to <span className="font-bold">{balance.assigned_press_code}</span>{' '}
              which is <span className="font-bold">{balance.assigned_press_status}</span>. Pick an
              alternate below and use the Relocation Wizard on the Press Board to move the work.
            </div>
          </div>
        )}

        {alternates.length === 0 && (
          <div className="text-center py-8 text-steel-500">
            <AlertOctagon className="w-8 h-8 mx-auto mb-2 text-rose-400" />
            <div className="font-semibold">No compatible press</div>
            <div className="text-xs mt-1">This part is die-locked or no press supports the tonnage</div>
          </div>
        )}

        <AltGroup label="In-house" presses={inHouse} balance={balance} />
        <AltGroup label="Vendor / OSP" presses={vendor} balance={balance} />
      </div>
    </Modal>
  );
}

function AltGroup({
  label,
  presses,
  balance,
}: {
  label: string;
  presses: AlternatePress[];
  balance: ProductionBalance;
}) {
  if (presses.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-bold text-steel-500 mb-2">
        {label} · {presses.length}
      </div>
      <div className="space-y-1.5">
        {presses.map((p) => {
          const isExactTonnage = p.tonnage === balance.required_tonnage;
          const cap = p.capacity_per_day ?? 0;
          const daysToFinish = cap > 0 ? balance.balance / (cap * 0.85) : null;
          return (
            <div
              key={p.id}
              className="flex items-center gap-3 px-3 py-2.5 bg-steel-50 rounded-xl border border-steel-100"
            >
              <PressStatusDot status={p.current_status} />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-sm flex items-center gap-2 flex-wrap">
                  {p.code}
                  <span className="chip bg-white text-steel-700 ring-1 ring-steel-200 text-[10px]">
                    {p.tonnage}T {isExactTonnage && '✓'}
                  </span>
                  <span className="text-[11px] text-steel-500 font-normal">
                    {p.factory}
                    {p.vendor_name && ` · ${p.vendor_name}`}
                  </span>
                </div>
                <div className="text-[11px] text-steel-500 tabular-nums mt-0.5">
                  Cap: {fmtNum(p.capacity_per_day)} pcs/day · {fmtNum(p.free_days, 1)} days free
                  {daysToFinish !== null && (
                    <>
                      {' · '}
                      <span className="font-bold text-industrial-700">
                        {daysToFinish.toFixed(1)}d
                      </span>{' '}
                      to finish balance
                    </>
                  )}
                </div>
              </div>
              <span
                className={cn(
                  'chip text-[10px] font-semibold',
                  STATUS_TONE[p.current_status] ?? STATUS_TONE.Idle
                )}
              >
                {p.current_status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  Running: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  Setup: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  Down: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  Maintenance: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  Idle: 'bg-steel-100 text-steel-600 ring-1 ring-steel-200',
};

function PressStatusDot({ status }: { status: PressStatus }) {
  const tone: Record<PressStatus, string> = {
    Running: 'bg-emerald-500',
    Setup: 'bg-amber-500',
    Down: 'bg-rose-500 animate-pulse',
    Maintenance: 'bg-sky-500',
    Idle: 'bg-steel-400',
  };
  return <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', tone[status])} />;
}
