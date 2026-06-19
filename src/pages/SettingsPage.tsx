import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Settings as SettingsIcon,
  Building2,
  Factory,
  Users as UsersIcon,
  Truck,
  Image as ImageIcon,
  Plus,
  Trash2,
  Pencil,
  Warehouse,
  FileDown,
  FileUp,
  Database,
  Download,
  Upload,
  RotateCcw,
  HardDrive,
  Package,
  Lock,
  Unlock,
  Search,
  Filter,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../store';
import { fp } from '../lib/fp';
import { Modal } from '../components/Modal';
// useApp imported above for live reload after preferences save
import type {
  Customer,
  PressStatus,
  Settings,
  Vendor,
  Press,
  Tonnage,
  StockLocation,
  StockLocationKind,
  MaterialType,
  PartCategory,
} from '../../shared/types';
import { cn } from '../lib/cn';
import { StatusPill } from '../components/StatusPill';

/**
 * Compact pair of buttons used in the header of every master-data tab:
 *   📥 Template — saves an empty Excel pre-formatted for that entity
 *   📤 Excel    — uploads a filled Excel and bulk-upserts the rows
 */
function ExcelBulkButtons({
  templateChannel,
  importChannel,
  onImported,
  label,
}: {
  templateChannel: string;
  importChannel: string;
  onImported: () => void;
  label: string;
}) {
  const [busy, setBusy] = useState<'template' | 'import' | null>(null);
  const handleTemplate = async () => {
    setBusy('template');
    const r = await fp.invoke<{ ok: boolean; message: string; path?: string }>(
      templateChannel
    );
    setBusy(null);
    if (r.ok) toast.success(`Template saved · open & fill, then Upload Excel`);
    else if (r.message !== 'Cancelled') toast.error(r.message ?? 'Failed');
  };
  const handleImport = async () => {
    setBusy('import');
    const r = await fp.invoke<{ ok: boolean; message: string; imported_rows: number; warnings: string[] }>(
      importChannel
    );
    setBusy(null);
    if (r.ok) {
      toast.success(r.message);
      if (r.warnings.length) {
        toast(`⚠ ${r.warnings.length} warning(s) — see console`, { duration: 4000 });
        console.warn('Excel import warnings:', r.warnings);
      }
      onImported();
    } else if (r.message !== 'Cancelled') {
      toast.error(r.message);
    }
  };
  return (
    <>
      <button
        onClick={handleTemplate}
        disabled={!!busy}
        title={`Download an empty Excel template for ${label}`}
        className="btn-ghost text-xs"
      >
        <FileDown className="w-4 h-4" /> Template
      </button>
      <button
        onClick={handleImport}
        disabled={!!busy}
        title={`Upload a filled Excel to bulk-add or update ${label}`}
        className="btn-secondary text-xs"
      >
        <FileUp className="w-4 h-4" />
        {busy === 'import' ? 'Importing…' : 'Upload Excel'}
      </button>
    </>
  );
}

type Tab =
  | 'company'
  | 'presses'
  | 'vendors'
  | 'customers'
  | 'parts'
  | 'locations'
  | 'preferences'
  | 'data';

const TABS: Array<{ id: Tab; label: string; icon: typeof SettingsIcon }> = [
  { id: 'company', label: 'Company', icon: Building2 },
  { id: 'presses', label: 'Presses', icon: Factory },
  { id: 'vendors', label: 'Vendors', icon: Truck },
  { id: 'customers', label: 'Customers', icon: UsersIcon },
  { id: 'parts', label: 'Parts', icon: Package },
  { id: 'locations', label: 'Stock Locations', icon: Warehouse },
  { id: 'preferences', label: 'Preferences', icon: SettingsIcon },
  { id: 'data', label: 'Database', icon: Database },
];

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('company');
  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-steel-700" /> Settings
        </h1>
        <p className="text-sm text-steel-500 mt-1">Master data, branding & defaults</p>
      </div>

      <div className="card p-1.5 inline-flex gap-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition',
                tab === t.id
                  ? 'bg-steel-900 text-white shadow-sm'
                  : 'text-steel-600 hover:bg-steel-100'
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'company' && <CompanyTab />}
      {tab === 'presses' && <PressesTab />}
      {tab === 'vendors' && <VendorsTab />}
      {tab === 'customers' && <CustomersTab />}
      {tab === 'parts' && <PartsTab />}
      {tab === 'locations' && <LocationsTab />}
      {tab === 'preferences' && <PreferencesTab />}
      {tab === 'data' && <DataTab />}
    </div>
  );
}

function CompanyTab() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const reload = () => fp.invoke<Settings>(fp.channels.SETTINGS_GET).then(setSettings);

  useEffect(() => {
    reload();
  }, []);

  const save = async () => {
    if (!settings) return;
    await fp.invoke(fp.channels.SETTINGS_UPDATE, settings);
    toast.success('Saved');
  };

  const pickLogo = async () => {
    const data = await fp.invoke<string | null>(fp.channels.PICK_LOGO);
    if (data) {
      setSettings((s) => (s ? { ...s, logo_data_url: data } : s));
    }
  };

  if (!settings) return null;
  return (
    <div className="card p-6 max-w-2xl space-y-5">
      <div>
        <div className="field-label">Company name</div>
        <input
          className="input"
          value={settings.company_name}
          onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
        />
      </div>
      <div>
        <div className="field-label">Logo</div>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-steel-100 flex items-center justify-center border border-steel-200 overflow-hidden">
            {settings.logo_data_url ? (
              <img src={settings.logo_data_url} alt="logo" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="w-8 h-8 text-steel-400" />
            )}
          </div>
          <div className="space-y-2">
            <button onClick={pickLogo} className="btn-secondary">
              <ImageIcon className="w-4 h-4" /> Choose image
            </button>
            {settings.logo_data_url && (
              <button
                onClick={() => setSettings({ ...settings, logo_data_url: null })}
                className="text-xs text-rose-600 hover:underline ml-2"
              >
                Remove
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-steel-500 mt-2">PNG, JPG, or SVG. Used in the sidebar and on splash screen.</p>
      </div>
      <div className="pt-3 border-t border-steel-200">
        <button onClick={save} className="btn-primary">
          Save changes
        </button>
      </div>
    </div>
  );
}

function PreferencesTab() {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    fp.invoke<Settings>(fp.channels.SETTINGS_GET).then(setSettings);
  }, []);

  if (!settings) return null;
  const save = async () => {
    await fp.invoke(fp.channels.SETTINGS_UPDATE, settings);
    toast.success('Preferences saved');
    useApp.getState().reload();
  };

  // Live preview using current month
  const [y, m] = (settings.current_month || new Date().toISOString().slice(0, 7))
    .split('-')
    .map(Number);
  const totalDays = new Date(y || 2026, m || 1, 0).getDate();
  let sundays = 0;
  for (let d = 1; d <= totalDays; d++) {
    if (new Date(y || 2026, (m || 1) - 1, d).getDay() === 0) sundays++;
  }
  const workingDays = Math.max(
    1,
    totalDays - (settings.exclude_sundays ? sundays : 0) - (settings.extra_holidays_per_month || 0)
  );

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="card p-6 space-y-5">
        <div>
          <h2 className="font-bold text-base">Safety stock formula</h2>
          <p className="text-xs text-steel-500 mt-1">
            WIP &amp; FG are auto-calculated when adding plan rows.
            <br />
            <span className="font-mono text-[11px] text-steel-700 bg-steel-100 px-1.5 py-0.5 rounded">
              safety = customer_schedule ÷ working_days × N_days
            </span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="field-label">WIP safety days</div>
            <div className="relative">
              <input
                type="number"
                min={0}
                step={0.5}
                className="input pr-12"
                value={settings.wip_safety_days}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    wip_safety_days: parseFloat(e.target.value) || 0,
                  })
                }
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400 text-xs font-semibold">
                days
              </span>
            </div>
            <p className="text-[11px] text-steel-500 mt-1.5">
              Buffer days of in-process inventory
            </p>
          </div>
          <div>
            <div className="field-label">FG safety days</div>
            <div className="relative">
              <input
                type="number"
                min={0}
                step={0.5}
                className="input pr-12"
                value={settings.fg_safety_days}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    fg_safety_days: parseFloat(e.target.value) || 0,
                  })
                }
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400 text-xs font-semibold">
                days
              </span>
            </div>
            <p className="text-[11px] text-steel-500 mt-1.5">
              Buffer days of finished-goods inventory
            </p>
          </div>
        </div>

        <div className="border-t border-steel-200 pt-5">
          <h3 className="font-bold text-sm mb-3">Working day calendar</h3>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-steel-200 hover:bg-steel-50">
              <input
                type="checkbox"
                checked={settings.exclude_sundays === 1}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    exclude_sundays: e.target.checked ? 1 : 0,
                  })
                }
                className="mt-0.5 w-4 h-4 accent-steel-900"
              />
              <div>
                <div className="font-semibold text-sm">Exclude Sundays</div>
                <div className="text-[11px] text-steel-500">
                  Default: yes (shop runs Mon–Sat)
                </div>
              </div>
            </label>
            <div>
              <div className="field-label">Extra holidays per month</div>
              <input
                type="number"
                min={0}
                className="input"
                value={settings.extra_holidays_per_month}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    extra_holidays_per_month: parseFloat(e.target.value) || 0,
                  })
                }
              />
              <p className="text-[11px] text-steel-500 mt-1.5">
                Non-Sunday holidays (festivals, shutdowns)
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-industrial-900 to-steel-900 text-white rounded-2xl p-4">
          <div className="text-[11px] uppercase tracking-wider font-bold text-steel-300 mb-2">
            Preview · {monthLabelLong(settings.current_month)}
          </div>
          <div className="grid grid-cols-4 gap-3 text-sm">
            <PreviewStat label="Total days" value={String(totalDays)} />
            <PreviewStat label="− Sundays" value={String(settings.exclude_sundays ? sundays : 0)} />
            <PreviewStat label="− Holidays" value={String(settings.extra_holidays_per_month)} />
            <PreviewStat label="= Working" value={String(workingDays)} highlight />
          </div>
          <div className="mt-3 pt-3 border-t border-white/10 text-[11px] text-steel-300">
            Example · for a 30,000 pcs schedule: daily ={' '}
            <span className="font-bold text-white tabular-nums">
              {(30000 / workingDays).toFixed(0)}
            </span>{' '}
            pcs/day → WIP ={' '}
            <span className="font-bold text-white tabular-nums">
              {((30000 / workingDays) * settings.wip_safety_days).toFixed(0)}
            </span>{' '}
            · FG ={' '}
            <span className="font-bold text-white tabular-nums">
              {((30000 / workingDays) * settings.fg_safety_days).toFixed(0)}
            </span>
          </div>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-bold text-base">Capacity defaults</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="field-label">Default efficiency %</div>
            <input
              type="number"
              className="input"
              value={settings.default_efficiency_pct}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  default_efficiency_pct: parseFloat(e.target.value) || 85,
                })
              }
            />
            <p className="text-[11px] text-steel-500 mt-1.5">
              Used for capacity / required machine-days calculations
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={save} className="btn-primary">
          Save preferences
        </button>
      </div>
    </div>
  );
}

function PreviewStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-steel-400 font-semibold">
        {label}
      </div>
      <div
        className={cn(
          'text-xl font-bold tabular-nums mt-0.5',
          highlight ? 'text-forge-400' : 'text-white'
        )}
      >
        {value}
      </div>
    </div>
  );
}

function monthLabelLong(m: string): string {
  if (!m) return '';
  const [y, mm] = m.split('-').map(Number);
  return new Date(y, (mm ?? 1) - 1, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function PressesTab() {
  const [presses, setPresses] = useState<Press[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Press | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const reload = () => fp.invoke<Press[]>(fp.channels.PRESSES_LIST).then(setPresses);
  useEffect(() => {
    reload();
  }, []);

  const toggleSelect = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectAll = () => setSelected(new Set(presses.map((p) => p.id)));
  const clearSelection = () => setSelected(new Set());

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} press${selected.size === 1 ? '' : 'es'}?`)) return;
    await fp.invoke(fp.channels.PRESS_DELETE_MANY, Array.from(selected));
    toast.success(`Deleted ${selected.size} press${selected.size === 1 ? '' : 'es'}`);
    clearSelection();
    reload();
  };

  const deleteAll = async () => {
    if (presses.length === 0) return;
    if (!confirm(`Delete ALL ${presses.length} presses? This cannot be undone.`)) return;
    await fp.invoke(
      fp.channels.PRESS_DELETE_MANY,
      presses.map((p) => p.id)
    );
    toast.success(`Deleted all presses`);
    clearSelection();
    reload();
  };

  const update = async (p: Press, patch: Partial<Press>) => {
    const next = { ...p, ...patch };
    await fp.invoke(fp.channels.PRESS_UPSERT, next);
    reload();
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this press?')) return;
    await fp.invoke(fp.channels.PRESS_DELETE, id);
    reload();
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-steel-200 flex items-center justify-between bg-steel-50">
        <div>
          <h2 className="font-bold text-base">Presses · {presses.length}</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExcelBulkButtons
            templateChannel={fp.channels.PRESSES_EXCEL_TEMPLATE}
            importChannel={fp.channels.PRESSES_EXCEL_IMPORT}
            onImported={reload}
            label="presses"
          />
          {presses.length > 0 && (
            <button
              onClick={deleteAll}
              className="btn-ghost text-rose-600 text-xs hover:bg-rose-50"
              title="Wipe every press in the table"
            >
              Delete all
            </button>
          )}
          <button onClick={() => setAddOpen(true)} className="btn-accent">
            <Plus className="w-4 h-4" /> Add press
          </button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="px-5 py-2.5 bg-rose-50 border-b border-rose-200 flex items-center justify-between">
          <span className="text-sm font-semibold text-rose-900">
            {selected.size} press{selected.size === 1 ? '' : 'es'} selected
          </span>
          <div className="flex items-center gap-2">
            <button onClick={clearSelection} className="text-xs text-rose-700 hover:underline">
              Cancel
            </button>
            <button onClick={deleteSelected} className="btn-danger text-xs py-1.5">
              <Trash2 className="w-3.5 h-3.5" /> Delete selected
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-steel-50 border-b border-steel-200 text-[11px] uppercase tracking-wider text-steel-500">
            <tr>
              <th className="px-3 py-2.5 w-10 text-center">
                <input
                  type="checkbox"
                  checked={presses.length > 0 && selected.size === presses.length}
                  onChange={(e) => (e.target.checked ? selectAll() : clearSelection())}
                  className="w-4 h-4 accent-steel-900"
                  title={selected.size === presses.length ? 'Deselect all' : 'Select all'}
                />
              </th>
              <th className="text-left px-3 py-2.5 font-semibold">Code</th>
              <th className="text-left px-3 py-2.5 font-semibold">Type</th>
              <th className="text-left px-3 py-2.5 font-semibold">Factory</th>
              <th className="text-right px-3 py-2.5 font-semibold">Tonnage</th>
              <th className="text-right px-3 py-2.5 font-semibold">☀ Day</th>
              <th className="text-right px-3 py-2.5 font-semibold">🌙 Night</th>
              <th className="text-right px-3 py-2.5 font-semibold">Total/day</th>
              <th className="text-right px-3 py-2.5 font-semibold">@ 85%</th>
              <th className="text-left px-3 py-2.5 font-semibold">Status</th>
              <th className="text-right px-3 py-2.5 font-semibold w-24">{''}</th>
            </tr>
          </thead>
          <tbody>
            {presses.length === 0 && (
              <tr>
                <td colSpan={11} className="text-center py-10 text-steel-500">
                  <Factory className="w-8 h-8 mx-auto mb-2 text-steel-300" />
                  <div className="font-semibold">No presses yet</div>
                  <div className="text-xs mt-1">Click "+ Add press" to add your first machine</div>
                </td>
              </tr>
            )}
            {presses.map((p) => {
              const isSelected = selected.has(p.id);
              const dayCap = p.day_capacity || 0;
              const nightCap = p.night_capacity || 0;
              const totalCap = p.capacity_per_day || dayCap + nightCap;
              return (
                <tr
                  key={p.id}
                  className={cn(
                    'border-b border-steel-100 hover:bg-steel-50/60 transition',
                    isSelected && 'bg-rose-50/40'
                  )}
                >
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(p.id)}
                      className="w-4 h-4 accent-rose-600"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono font-bold whitespace-nowrap">{p.code}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={cn(
                        'chip',
                        p.factory === 'InterUnit'
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                          : p.is_in_house
                          ? 'bg-industrial-50 text-industrial-700 ring-1 ring-industrial-200'
                          : 'bg-forge-50 text-forge-700 ring-1 ring-forge-200'
                      )}
                    >
                      {p.factory === 'InterUnit'
                        ? 'Inter Branch'
                        : p.is_in_house
                        ? 'In-house'
                        : 'Vendor'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-steel-700 whitespace-nowrap">{p.factory}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap">
                    {p.tonnage}T
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums whitespace-nowrap">
                    {dayCap > 0 ? dayCap.toLocaleString('en-IN') : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums whitespace-nowrap">
                    {nightCap > 0 ? nightCap.toLocaleString('en-IN') : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums whitespace-nowrap">
                    {totalCap.toLocaleString('en-IN')}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 tabular-nums">
                      {Math.round(totalCap * 0.85).toLocaleString('en-IN')}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="select py-1 text-xs w-32"
                      value={p.current_status}
                      onChange={(e) =>
                        fp
                          .invoke(fp.channels.PRESS_SET_STATUS, p.id, e.target.value as PressStatus)
                          .then(reload)
                      }
                    >
                      <option value="Running">Running</option>
                      <option value="Idle">Idle</option>
                      <option value="Maintenance">Prevention</option>
                      <option value="Down">Breakdown</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-0.5">
                      <button
                        onClick={() => setEditing(p)}
                        className="text-industrial-700 hover:bg-industrial-50 p-1.5 rounded-lg"
                        title="Edit press"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => remove(p.id)}
                        className="text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg"
                        title="Delete press"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AddPressModal
        open={addOpen || editing !== null}
        editing={editing}
        onClose={() => {
          setAddOpen(false);
          setEditing(null);
        }}
        onSaved={() => {
          setAddOpen(false);
          setEditing(null);
          reload();
        }}
      />
    </div>
  );
}

function VendorsTab() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const reload = () => fp.invoke<Vendor[]>(fp.channels.VENDORS_LIST).then(setVendors);
  useEffect(() => {
    reload();
  }, []);

  const toggleSelect = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectAll = () => setSelected(new Set(vendors.map((v) => v.id)));
  const clearSelection = () => setSelected(new Set());
  const deleteSelected = async () => {
    if (!confirm(`Delete ${selected.size} vendor${selected.size === 1 ? '' : 's'}?`)) return;
    await fp.invoke(fp.channels.VENDOR_DELETE_MANY, Array.from(selected));
    toast.success(`Deleted ${selected.size} vendor${selected.size === 1 ? '' : 's'}`);
    clearSelection();
    reload();
  };
  const deleteAll = async () => {
    if (vendors.length === 0) return;
    if (!confirm(`Delete ALL ${vendors.length} vendors? Cannot be undone.`)) return;
    await fp.invoke(fp.channels.VENDOR_DELETE_MANY, vendors.map((v) => v.id));
    toast.success('All vendors deleted');
    clearSelection();
    reload();
  };

  const update = (v: Vendor, patch: Partial<Vendor>) => {
    fp.invoke(fp.channels.VENDOR_UPSERT, { ...v, ...patch }).then(reload);
  };
  const remove = async (id: number) => {
    if (!confirm('Delete this vendor?')) return;
    await fp.invoke(fp.channels.VENDOR_DELETE, id);
    reload();
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-steel-200 flex items-center justify-between bg-steel-50">
        <div>
          <h2 className="font-bold text-base">Vendors · {vendors.length}</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExcelBulkButtons
            templateChannel={fp.channels.VENDORS_EXCEL_TEMPLATE}
            importChannel={fp.channels.VENDORS_EXCEL_IMPORT}
            onImported={reload}
            label="vendors"
          />
          {vendors.length > 0 && (
            <button
              onClick={deleteAll}
              className="btn-ghost text-rose-600 text-xs hover:bg-rose-50"
            >
              Delete all
            </button>
          )}
          <button onClick={() => setAddOpen(true)} className="btn-accent">
            <Plus className="w-4 h-4" /> Add vendor
          </button>
        </div>
      </div>
      {selected.size > 0 && (
        <div className="px-5 py-2.5 bg-rose-50 border-b border-rose-200 flex items-center justify-between">
          <span className="text-sm font-semibold text-rose-900">
            {selected.size} vendor{selected.size === 1 ? '' : 's'} selected
          </span>
          <div className="flex items-center gap-2">
            <button onClick={clearSelection} className="text-xs text-rose-700 hover:underline">
              Cancel
            </button>
            <button onClick={deleteSelected} className="btn-danger text-xs py-1.5">
              <Trash2 className="w-3.5 h-3.5" /> Delete selected
            </button>
          </div>
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="bg-steel-50 border-b border-steel-200 text-[11px] uppercase tracking-wider text-steel-500">
          <tr>
            <th className="px-3 py-2.5 w-10 text-center">
              <input
                type="checkbox"
                checked={vendors.length > 0 && selected.size === vendors.length}
                onChange={(e) => (e.target.checked ? selectAll() : clearSelection())}
                className="w-4 h-4 accent-steel-900"
              />
            </th>
            <th className="text-left px-4 py-2.5 font-semibold">Name</th>
            <th className="text-left px-4 py-2.5 font-semibold">Contact person</th>
            <th className="text-left px-4 py-2.5 font-semibold">Phone</th>
            <th className="text-left px-4 py-2.5 font-semibold">Email</th>
            <th className="text-right px-4 py-2.5 font-semibold">{''}</th>
          </tr>
        </thead>
        <tbody>
          {vendors.map((v) => (
            <tr
              key={v.id}
              className={cn(
                'border-b border-steel-100',
                selected.has(v.id) && 'bg-rose-50/40'
              )}
            >
              <td className="px-3 py-2 text-center">
                <input
                  type="checkbox"
                  checked={selected.has(v.id)}
                  onChange={() => toggleSelect(v.id)}
                  className="w-4 h-4 accent-rose-600"
                />
              </td>
              <td className="px-4 py-2">
                <input
                  className="input py-1 text-sm"
                  value={v.name}
                  onChange={(e) => update(v, { name: e.target.value })}
                />
              </td>
              <td className="px-4 py-2">
                <input
                  className="input py-1 text-sm"
                  value={v.contact_person ?? ''}
                  onChange={(e) => update(v, { contact_person: e.target.value })}
                />
              </td>
              <td className="px-4 py-2">
                <input
                  className="input py-1 text-sm"
                  value={v.phone ?? ''}
                  onChange={(e) => update(v, { phone: e.target.value })}
                />
              </td>
              <td className="px-4 py-2">
                <input
                  className="input py-1 text-sm"
                  value={v.email ?? ''}
                  onChange={(e) => update(v, { email: e.target.value })}
                />
              </td>
              <td className="px-4 py-2 text-right">
                <button
                  onClick={() => remove(v.id)}
                  className="text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <AddVendorModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false);
          reload();
        }}
      />
    </div>
  );
}

function CustomersTab() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const reload = () => fp.invoke<Customer[]>(fp.channels.CUSTOMERS_LIST).then(setCustomers);
  useEffect(() => {
    reload();
  }, []);
  const toggleSelect = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectAll = () => setSelected(new Set(customers.map((c) => c.id)));
  const clearSelection = () => setSelected(new Set());
  const deleteSelected = async () => {
    if (
      !confirm(
        `Delete ${selected.size} customer${selected.size === 1 ? '' : 's'} (and all their plan rows)?`
      )
    )
      return;
    await fp.invoke(fp.channels.CUSTOMER_DELETE_MANY, Array.from(selected));
    toast.success(`Deleted ${selected.size} customer${selected.size === 1 ? '' : 's'}`);
    clearSelection();
    reload();
  };
  const deleteAll = async () => {
    if (customers.length === 0) return;
    if (!confirm(`Delete ALL ${customers.length} customers? Cannot be undone.`)) return;
    await fp.invoke(fp.channels.CUSTOMER_DELETE_MANY, customers.map((c) => c.id));
    toast.success('All customers deleted');
    clearSelection();
    reload();
  };
  const update = (c: Customer, patch: Partial<Customer>) =>
    fp.invoke(fp.channels.CUSTOMER_UPSERT, { ...c, ...patch }).then(reload);
  const remove = async (id: number) => {
    if (!confirm('Delete this customer (and all their parts)?')) return;
    await fp.invoke(fp.channels.CUSTOMER_DELETE, id);
    reload();
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-steel-200 flex items-center justify-between bg-steel-50">
        <div>
          <h2 className="font-bold text-base">Customers · {customers.length}</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExcelBulkButtons
            templateChannel={fp.channels.CUSTOMERS_EXCEL_TEMPLATE}
            importChannel={fp.channels.CUSTOMERS_EXCEL_IMPORT}
            onImported={reload}
            label="customers"
          />
          {customers.length > 0 && (
            <button
              onClick={deleteAll}
              className="btn-ghost text-rose-600 text-xs hover:bg-rose-50"
            >
              Delete all
            </button>
          )}
          <button onClick={() => setAddOpen(true)} className="btn-accent">
            <Plus className="w-4 h-4" /> Add customer
          </button>
        </div>
      </div>
      {selected.size > 0 && (
        <div className="px-5 py-2.5 bg-rose-50 border-b border-rose-200 flex items-center justify-between">
          <span className="text-sm font-semibold text-rose-900">
            {selected.size} customer{selected.size === 1 ? '' : 's'} selected
          </span>
          <div className="flex items-center gap-2">
            <button onClick={clearSelection} className="text-xs text-rose-700 hover:underline">
              Cancel
            </button>
            <button onClick={deleteSelected} className="btn-danger text-xs py-1.5">
              <Trash2 className="w-3.5 h-3.5" /> Delete selected
            </button>
          </div>
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="bg-steel-50 border-b border-steel-200 text-[11px] uppercase tracking-wider text-steel-500">
          <tr>
            <th className="px-3 py-2.5 w-10 text-center">
              <input
                type="checkbox"
                checked={customers.length > 0 && selected.size === customers.length}
                onChange={(e) => (e.target.checked ? selectAll() : clearSelection())}
                className="w-4 h-4 accent-steel-900"
              />
            </th>
            <th className="text-left px-4 py-2.5 font-semibold">Code</th>
            <th className="text-left px-4 py-2.5 font-semibold">Full name</th>
            <th className="text-left px-4 py-2.5 font-semibold">Priority</th>
            <th className="text-right px-4 py-2.5 font-semibold">{''}</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr
              key={c.id}
              className={cn(
                'border-b border-steel-100',
                selected.has(c.id) && 'bg-rose-50/40'
              )}
            >
              <td className="px-3 py-2 text-center">
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggleSelect(c.id)}
                  className="w-4 h-4 accent-rose-600"
                />
              </td>
              <td className="px-4 py-2 font-semibold w-32">
                <input
                  className="input py-1 text-sm"
                  value={c.code}
                  onChange={(e) => update(c, { code: e.target.value })}
                />
              </td>
              <td className="px-4 py-2">
                <input
                  className="input py-1 text-sm"
                  value={c.full_name ?? ''}
                  onChange={(e) => update(c, { full_name: e.target.value })}
                  placeholder="Full company name"
                />
              </td>
              <td className="px-4 py-2 w-40">
                <select
                  className="select py-1 text-sm"
                  value={c.priority_tier}
                  onChange={(e) =>
                    update(c, { priority_tier: e.target.value as Customer['priority_tier'] })
                  }
                >
                  <option>Critical</option>
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
              </td>
              <td className="px-4 py-2 text-right">
                <button
                  onClick={() => remove(c.id)}
                  className="text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <AddCustomerModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false);
          reload();
        }}
      />
    </div>
  );
}

function LocationsTab() {
  const [locations, setLocations] = useState<Array<StockLocation & { vendor_name?: string | null }>>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const reload = () =>
    Promise.all([
      fp.invoke<Array<StockLocation & { vendor_name?: string | null }>>(
        fp.channels.STOCK_LOCATIONS_LIST
      ),
      fp.invoke<Vendor[]>(fp.channels.VENDORS_LIST),
    ]).then(([l, v]) => {
      setLocations(l);
      setVendors(v);
    });
  useEffect(() => {
    reload();
  }, []);

  const update = (loc: StockLocation, patch: Partial<StockLocation>) =>
    fp.invoke(fp.channels.STOCK_LOCATION_UPSERT, { ...loc, ...patch }).then(reload);

  const remove = async (id: number) => {
    if (!confirm('Delete this location? Plan rows referencing it will lose those stock entries.'))
      return;
    await fp.invoke(fp.channels.STOCK_LOCATION_DELETE, id);
    reload();
  };

  const KIND_TONE: Record<StockLocationKind, string> = {
    HIL: 'bg-industrial-50 text-industrial-700 ring-1 ring-industrial-200',
    External: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    Vendor: 'bg-forge-50 text-forge-700 ring-1 ring-forge-200',
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-steel-200 flex items-center justify-between bg-steel-50">
        <div>
          <h2 className="font-bold text-base">Stock locations · {locations.length}</h2>
          <p className="text-xs text-steel-500">
            Where opening stock can sit · HIL godowns, GILL CHOCK, vendor yards
          </p>
        </div>
        <button onClick={() => setAddOpen(true)} className="btn-accent">
          <Plus className="w-4 h-4" /> Add location
        </button>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-steel-50 border-b border-steel-200 text-[11px] uppercase tracking-wider text-steel-500">
          <tr>
            <th className="text-left px-4 py-2.5 font-semibold">Name</th>
            <th className="text-left px-4 py-2.5 font-semibold">Kind</th>
            <th className="text-left px-4 py-2.5 font-semibold">Linked vendor</th>
            <th className="text-right px-4 py-2.5 font-semibold"></th>
          </tr>
        </thead>
        <tbody>
          {locations.map((l) => (
            <tr key={l.id} className="border-b border-steel-100">
              <td className="px-4 py-2">
                <input
                  className="input py-1 text-sm"
                  value={l.name}
                  onChange={(e) => update(l, { name: e.target.value })}
                />
              </td>
              <td className="px-4 py-2 w-40">
                <select
                  className="select py-1 text-sm"
                  value={l.kind}
                  onChange={(e) =>
                    update(l, { kind: e.target.value as StockLocationKind })
                  }
                >
                  <option value="HIL">HIL</option>
                  <option value="External">External</option>
                  <option value="Vendor">Vendor</option>
                </select>
              </td>
              <td className="px-4 py-2 w-56">
                {l.kind === 'Vendor' ? (
                  <select
                    className="select py-1 text-sm"
                    value={l.vendor_id ?? ''}
                    onChange={(e) =>
                      update(l, { vendor_id: Number(e.target.value) || null })
                    }
                  >
                    <option value="">— None —</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={cn('chip', KIND_TONE[l.kind])}>{l.kind}</span>
                )}
              </td>
              <td className="px-4 py-2 text-right">
                <button
                  onClick={() => remove(l.id)}
                  className="text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <AddLocationModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        vendors={vendors}
        onSaved={() => {
          setAddOpen(false);
          reload();
        }}
      />
    </div>
  );
}

interface PartRow {
  id: number;
  part_code: string;
  material_type: MaterialType;
  category: PartCategory;
  required_tonnage: Tonnage;
  default_press_id: number | null;
  is_die_locked: 0 | 1;
  wip_safety_days: number | null;
  fg_safety_days: number | null;
  price_per_piece: number;
}

type PartDraft = Omit<PartRow, 'id'> & { id?: number };

function blankDraft(): PartDraft {
  return {
    part_code: '',
    material_type: 'HW',
    category: 'Fast Runner',
    required_tonnage: 600,
    default_press_id: null,
    is_die_locked: 0,
    wip_safety_days: null,
    fg_safety_days: null,
    price_per_piece: 0,
  };
}

const TONNAGE_VALUES: Tonnage[] = [400, 600, 1000, 1600, 2500];

const TONNAGE_CHIP: Record<number, string> = {
  400: 'bg-slate-100 text-slate-700 ring-1 ring-slate-300',
  600: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300',
  1000: 'bg-industrial-100 text-industrial-700 ring-1 ring-industrial-300',
  1600: 'bg-forge-100 text-forge-700 ring-1 ring-forge-300',
  2500: 'bg-rose-100 text-rose-700 ring-1 ring-rose-300',
};

function PartsTab() {
  const [parts, setParts] = useState<PartRow[]>([]);
  const [presses, setPresses] = useState<Press[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [q, setQ] = useState('');
  const [tonFilter, setTonFilter] = useState<number | 0>(0);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [formDraft, setFormDraft] = useState<PartDraft | null>(null); // null = closed
  const [editing, setEditing] = useState<Record<number, PartDraft>>({});

  const reload = () =>
    Promise.all([
      fp.invoke<PartRow[]>(fp.channels.PARTS_LIST),
      fp.invoke<Press[]>(fp.channels.PRESSES_LIST),
      fp.invoke<Settings>(fp.channels.SETTINGS_GET),
    ]).then(([p, pr, s]) => {
      setParts(p);
      setPresses(pr);
      setSettings(s);
    });

  useEffect(() => {
    reload();
  }, []);

  const remove = async (id: number) => {
    if (!confirm('Delete this part? Any plan rows referencing it will be removed too.')) return;
    await fp.invoke(fp.channels.PART_DELETE, id);
    reload();
  };

  const beginEdit = (p: PartRow) => {
    setEditing((m) => ({ ...m, [p.id]: { ...p } }));
  };
  const cancelEdit = (id: number) => {
    setEditing((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
  };
  const saveEdit = async (id: number) => {
    const d = editing[id];
    if (!d) return;
    if (!d.part_code.trim()) {
      toast.error('Part code is required');
      return;
    }
    await fp.invoke(fp.channels.PART_UPSERT, {
      id,
      part_code: d.part_code.trim(),
      material_type: d.material_type,
      category: d.category,
      required_tonnage: d.required_tonnage,
      default_press_id: d.default_press_id,
      is_die_locked: !!d.is_die_locked,
      wip_safety_days: d.wip_safety_days,
      fg_safety_days: d.fg_safety_days,
      price_per_piece: d.price_per_piece || 0,
    });
    cancelEdit(id);
    toast.success('Part updated');
    reload();
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return parts.filter((p) => {
      if (tonFilter && p.required_tonnage !== tonFilter) return false;
      if (!needle) return true;
      return p.part_code.toLowerCase().includes(needle);
    });
  }, [parts, q, tonFilter]);

  // Tonnage counts for the filter chips
  const tonCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of parts) map.set(p.required_tonnage, (map.get(p.required_tonnage) ?? 0) + 1);
    return map;
  }, [parts]);

  return (
    <div className="space-y-4">
      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-steel-50 rounded-xl px-3 py-1.5 flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-steel-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by part code..."
            className="bg-transparent text-sm flex-1 outline-none placeholder:text-steel-400"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-steel-400" />
          <button
            onClick={() => setTonFilter(0)}
            className={cn(
              'px-2.5 py-1 rounded-lg text-xs font-semibold',
              tonFilter === 0 ? 'bg-steel-900 text-white' : 'bg-steel-100 text-steel-600'
            )}
          >
            All T
          </button>
          {TONNAGE_VALUES.map((t) => (
            <button
              key={t}
              onClick={() => setTonFilter(t)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5',
                tonFilter === t ? 'bg-steel-900 text-white' : 'bg-steel-100 text-steel-600'
              )}
            >
              {t}T
              <span
                className={cn(
                  'tabular-nums text-[10px] px-1 rounded',
                  tonFilter === t
                    ? 'bg-white/20 text-white'
                    : 'bg-steel-200 text-steel-500'
                )}
              >
                {tonCounts.get(t) ?? 0}
              </span>
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setBulkOpen(true)} className="btn-secondary">
            <Sparkles className="w-4 h-4" /> Bulk add
          </button>
          <button onClick={() => setFormDraft(blankDraft())} className="btn-accent">
            <Plus className="w-4 h-4" /> Add part
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-steel-200 flex items-center justify-between bg-steel-50">
          <div>
            <h2 className="font-bold text-base">
              Parts master · {filtered.length}
              {filtered.length !== parts.length && (
                <span className="text-steel-500 font-normal">
                  {' '}
                  of {parts.length}
                </span>
              )}
            </h2>
            <p className="text-xs text-steel-500">
              Parts are global · any customer can order them · the customer link lives on the plan
              row. Pick the tonnage class &amp; lock the die when only one press fits.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-steel-50 border-b border-steel-200 text-[11px] uppercase tracking-wider text-steel-500">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Part code</th>
                <th className="text-left px-4 py-2.5 font-semibold w-24">Prod Type</th>
                <th className="text-left px-4 py-2.5 font-semibold w-32">Category</th>
                <th className="text-left px-4 py-2.5 font-semibold w-28">Tonnage</th>
                <th className="text-left px-4 py-2.5 font-semibold w-44">Default press</th>
                <th className="text-center px-4 py-2.5 font-semibold w-24">Die-locked</th>
                <th className="text-center px-4 py-2.5 font-semibold w-28">Safety days</th>
                <th className="text-right px-4 py-2.5 font-semibold w-28">₹ / piece</th>
                <th className="text-right px-4 py-2.5 font-semibold w-40">{''}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-steel-500">
                    <Package className="w-8 h-8 mx-auto mb-2 text-steel-300" />
                    <div className="font-semibold">No parts</div>
                    <div className="text-xs mt-0.5">
                      {parts.length === 0
                        ? 'Add your first part or use Bulk add to paste a list'
                        : 'Adjust filters above'}
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map((p) => {
                const draft = editing[p.id];
                const isEditing = !!draft;
                if (isEditing) {
                  const compatiblePresses = presses.filter(
                    (pr) => pr.tonnage >= draft.required_tonnage && pr.is_active
                  );
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-steel-100 bg-industrial-50/50 ring-1 ring-inset ring-industrial-200"
                    >
                      <td className="px-4 py-2">
                        <input
                          className="input py-1 text-sm font-mono"
                          value={draft.part_code}
                          onChange={(e) =>
                            setEditing((m) => ({
                              ...m,
                              [p.id]: { ...draft, part_code: e.target.value },
                            }))
                          }
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className="select py-1 text-xs"
                          value={draft.material_type}
                          onChange={(e) =>
                            setEditing((m) => ({
                              ...m,
                              [p.id]: { ...draft, material_type: e.target.value as MaterialType },
                            }))
                          }
                        >
                          <option value="HW">HW</option>
                          <option value="HWCB">HWCB</option>
                          <option value="OSP">OSP</option>
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className="select py-1 text-xs"
                          value={draft.category}
                          onChange={(e) =>
                            setEditing((m) => ({
                              ...m,
                              [p.id]: { ...draft, category: e.target.value as PartCategory },
                            }))
                          }
                        >
                          <option value="Fast Runner">Fast Runner</option>
                          <option value="Slow Runner">Slow Runner</option>
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className="select py-1 text-xs font-bold"
                          value={draft.required_tonnage}
                          onChange={(e) => {
                            const nextTonnage = Number(e.target.value) as Tonnage;
                            const defaultPressTonnage =
                              presses.find((pr) => pr.id === draft.default_press_id)?.tonnage ?? 0;
                            setEditing((m) => ({
                              ...m,
                              [p.id]: {
                                ...draft,
                                required_tonnage: nextTonnage,
                                default_press_id:
                                  defaultPressTonnage < nextTonnage
                                    ? null
                                    : draft.default_press_id,
                              },
                            }));
                          }}
                        >
                          {TONNAGE_VALUES.map((t) => (
                            <option key={t} value={t}>
                              {t}T
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className="select py-1 text-xs"
                          value={draft.default_press_id ?? ''}
                          onChange={(e) =>
                            setEditing((m) => ({
                              ...m,
                              [p.id]: {
                                ...draft,
                                default_press_id: Number(e.target.value) || null,
                              },
                            }))
                          }
                        >
                          <option value="">— None —</option>
                          {compatiblePresses.map((pr) => (
                            <option key={pr.id} value={pr.id}>
                              {pr.code} · {pr.tonnage}T · {pr.factory}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={() =>
                            setEditing((m) => ({
                              ...m,
                              [p.id]: { ...draft, is_die_locked: draft.is_die_locked ? 0 : 1 },
                            }))
                          }
                          disabled={!draft.default_press_id && !draft.is_die_locked}
                          className={cn(
                            'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition',
                            draft.is_die_locked
                              ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300'
                              : 'bg-steel-100 text-steel-500 ring-1 ring-steel-200 disabled:opacity-40 disabled:cursor-not-allowed'
                          )}
                        >
                          {draft.is_die_locked ? (
                            <>
                              <Lock className="w-3 h-3" /> Locked
                            </>
                          ) : (
                            <>
                              <Unlock className="w-3 h-3" /> Free
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          <SafetyDayInput
                            value={draft.wip_safety_days}
                            placeholder={settings?.wip_safety_days?.toString() ?? '2'}
                            onChange={(v) =>
                              setEditing((m) => ({
                                ...m,
                                [p.id]: { ...draft, wip_safety_days: v },
                              }))
                            }
                            label="W"
                          />
                          <SafetyDayInput
                            value={draft.fg_safety_days}
                            placeholder={settings?.fg_safety_days?.toString() ?? '2'}
                            onChange={(v) =>
                              setEditing((m) => ({
                                ...m,
                                [p.id]: { ...draft, fg_safety_days: v },
                              }))
                            }
                            label="F"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-steel-400 pointer-events-none">
                            ₹
                          </span>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={draft.price_per_piece || ''}
                            placeholder="0"
                            onChange={(e) =>
                              setEditing((m) => ({
                                ...m,
                                [p.id]: {
                                  ...draft,
                                  price_per_piece: parseFloat(e.target.value) || 0,
                                },
                              }))
                            }
                            className="input py-1 text-xs pl-5 pr-1 w-20 text-right tabular-nums"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => cancelEdit(p.id)}
                            className="btn-secondary text-[11px] py-1 px-2"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => saveEdit(p.id)}
                            className="btn-primary text-[11px] py-1 px-3"
                          >
                            Save
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }
                const compatible = presses.find((pr) => pr.id === p.default_press_id);
                return (
                  <tr
                    key={p.id}
                    className="border-b border-steel-100 hover:bg-steel-50/60 transition"
                  >
                    <td className="px-4 py-2 font-mono text-sm font-semibold">{p.part_code}</td>
                    <td className="px-4 py-2">
                      <span className="chip bg-steel-100 text-steel-700">{p.material_type}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          'chip',
                          p.category === 'Fast Runner'
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                            : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                        )}
                      >
                        {p.category}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn('chip text-[11px] font-bold', TONNAGE_CHIP[p.required_tonnage])}
                      >
                        {p.required_tonnage}T
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {compatible ? (
                        <span className="font-semibold">
                          {compatible.code}{' '}
                          <span className="text-steel-400 font-normal">
                            · {compatible.factory}
                          </span>
                        </span>
                      ) : (
                        <span className="text-steel-400 italic">— None —</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {p.is_die_locked ? (
                        <span className="chip bg-amber-100 text-amber-700 ring-1 ring-amber-300">
                          <Lock className="w-3 h-3" /> Locked
                        </span>
                      ) : (
                        <span className="chip bg-steel-100 text-steel-500">
                          <Unlock className="w-3 h-3" /> Free
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center text-[11px] tabular-nums">
                      <span className="text-steel-600">
                        W{' '}
                        <span className={p.wip_safety_days !== null ? 'font-bold text-industrial-700' : ''}>
                          {p.wip_safety_days ?? settings?.wip_safety_days ?? 2}
                        </span>
                        {p.wip_safety_days === null && (
                          <span className="text-steel-400 ml-0.5">·d</span>
                        )}
                      </span>
                      <span className="mx-1 text-steel-300">/</span>
                      <span className="text-steel-600">
                        F{' '}
                        <span className={p.fg_safety_days !== null ? 'font-bold text-industrial-700' : ''}>
                          {p.fg_safety_days ?? settings?.fg_safety_days ?? 2}
                        </span>
                        {p.fg_safety_days === null && (
                          <span className="text-steel-400 ml-0.5">·d</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-xs">
                      {p.price_per_piece > 0 ? (
                        <span className="font-bold text-steel-900">
                          ₹{p.price_per_piece.toLocaleString('en-IN')}
                        </span>
                      ) : (
                        <span className="text-steel-400 italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => beginEdit(p)}
                          className="text-industrial-700 hover:bg-industrial-50 p-1.5 rounded-lg"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => remove(p.id)}
                          className="text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <PartFormModal
        open={formDraft !== null}
        draft={formDraft}
        presses={presses}
        defaults={settings}
        onClose={() => setFormDraft(null)}
        onSaved={() => {
          setFormDraft(null);
          reload();
        }}
      />

      <BulkAddPartsModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onSaved={() => {
          setBulkOpen(false);
          reload();
        }}
      />
    </div>
  );
}

function SafetyDayInput({
  value,
  placeholder,
  onChange,
  label,
}: {
  value: number | null;
  placeholder: string;
  onChange: (v: number | null) => void;
  label: string;
}) {
  return (
    <div className="relative">
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-steel-400 pointer-events-none">
        {label}
      </span>
      <input
        type="number"
        min={0}
        step={0.5}
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '' ? null : parseFloat(v));
        }}
        placeholder={placeholder}
        title={`Override the default · leave blank to use ${placeholder} days from Settings`}
        className="input py-1 text-xs pl-5 pr-1 w-14 text-center tabular-nums"
      />
    </div>
  );
}

function PartFormModal({
  open,
  draft,
  presses,
  defaults,
  onClose,
  onSaved,
}: {
  open: boolean;
  draft: PartDraft | null;
  presses: Press[];
  defaults: Settings | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [working, setWorking] = useState<PartDraft>(draft ?? blankDraft());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setWorking(draft ?? blankDraft());
  }, [draft]);

  if (!open) return null;

  const compatiblePresses = presses.filter(
    (pr) => pr.tonnage >= working.required_tonnage && pr.is_active
  );

  const canSave = working.part_code.trim().length > 0;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await fp.invoke(fp.channels.PART_UPSERT, {
        part_code: working.part_code.trim(),
        material_type: working.material_type,
        category: working.category,
        required_tonnage: working.required_tonnage,
        default_press_id: working.default_press_id,
        is_die_locked: !!working.is_die_locked,
        wip_safety_days: working.wip_safety_days,
        fg_safety_days: working.fg_safety_days,
      });
      toast.success(`Saved ${working.part_code}`);
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
      title="Add new part"
      subtitle="Parts are global — any customer can order them on the plan"
      width={620}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={save} disabled={!canSave || busy} className="btn-primary">
            {busy ? 'Saving…' : 'Save part'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="field-label">
            Part code <span className="text-rose-500">*</span>
          </div>
          <input
            autoFocus
            className="input font-mono"
            placeholder="e.g. 5KBL10031-CRANK ARM"
            value={working.part_code}
            onChange={(e) => setWorking({ ...working, part_code: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSave && !busy) save();
            }}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="field-label">Prod Type</div>
            <select
              className="select"
              value={working.material_type}
              onChange={(e) =>
                setWorking({ ...working, material_type: e.target.value as MaterialType })
              }
            >
              <option value="HW">HW</option>
              <option value="HWCB">HWCB</option>
              <option value="OSP">OSP</option>
            </select>
          </div>
          <div>
            <div className="field-label">Category</div>
            <select
              className="select"
              value={working.category}
              onChange={(e) =>
                setWorking({ ...working, category: e.target.value as PartCategory })
              }
            >
              <option value="Fast Runner">Fast Runner</option>
              <option value="Slow Runner">Slow Runner</option>
            </select>
          </div>
          <div>
            <div className="field-label">Tonnage</div>
            <select
              className="select font-bold"
              value={working.required_tonnage}
              onChange={(e) => {
                const t = Number(e.target.value) as Tonnage;
                const cur = presses.find((pr) => pr.id === working.default_press_id);
                setWorking({
                  ...working,
                  required_tonnage: t,
                  default_press_id: cur && cur.tonnage < t ? null : working.default_press_id,
                });
              }}
            >
              {TONNAGE_VALUES.map((t) => (
                <option key={t} value={t}>
                  {t}T
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="field-label">Default press</div>
          <select
            className="select"
            value={working.default_press_id ?? ''}
            onChange={(e) =>
              setWorking({
                ...working,
                default_press_id: Number(e.target.value) || null,
              })
            }
          >
            <option value="">— None (any compatible press) —</option>
            {compatiblePresses.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.code} · {pr.tonnage}T · {pr.factory}
              </option>
            ))}
          </select>
          {compatiblePresses.length === 0 && (
            <div className="text-xs text-rose-600 mt-1">
              No press currently matches {working.required_tonnage}T or higher — add one in the
              Presses tab first.
            </div>
          )}
        </div>

        <label className="flex items-start gap-3 p-3 rounded-xl border border-steel-200 hover:bg-steel-50 cursor-pointer">
          <input
            type="checkbox"
            checked={!!working.is_die_locked}
            disabled={!working.default_press_id}
            onChange={(e) =>
              setWorking({ ...working, is_die_locked: e.target.checked ? 1 : 0 })
            }
            className="mt-0.5 w-4 h-4 accent-amber-600"
          />
          <div>
            <div className="font-semibold text-sm flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-600" /> Die-locked to default press
            </div>
            <div className="text-[11px] text-steel-500">
              Only this press can run this part. Re-route wizard will flag it as unsolvable when
              the press is down.
            </div>
          </div>
        </label>

        <div>
          <div className="field-label flex items-center justify-between">
            <span>Safety stock days (override)</span>
            <span className="text-[10px] normal-case tracking-normal font-normal text-steel-400">
              Leave blank → use {defaults?.wip_safety_days ?? 2} / {defaults?.fg_safety_days ?? 2}{' '}
              from Settings
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-steel-400 pointer-events-none">
                WIP
              </span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={working.wip_safety_days ?? ''}
                placeholder={`Default ${defaults?.wip_safety_days ?? 2}`}
                onChange={(e) =>
                  setWorking({
                    ...working,
                    wip_safety_days:
                      e.target.value === '' ? null : parseFloat(e.target.value),
                  })
                }
                className="input pl-12 pr-12 text-right"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-steel-400 pointer-events-none">
                days
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-steel-400 pointer-events-none">
                FG
              </span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={working.fg_safety_days ?? ''}
                placeholder={`Default ${defaults?.fg_safety_days ?? 2}`}
                onChange={(e) =>
                  setWorking({
                    ...working,
                    fg_safety_days:
                      e.target.value === '' ? null : parseFloat(e.target.value),
                  })
                }
                className="input pl-10 pr-12 text-right"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-steel-400 pointer-events-none">
                days
              </span>
            </div>
          </div>
        </div>

        <div>
          <div className="field-label flex items-center justify-between">
            <span>Price per piece (INR)</span>
            <span className="text-[10px] normal-case tracking-normal font-normal text-steel-400">
              Drives Dashboard ₹ KPIs
            </span>
          </div>
          <div className="relative max-w-xs">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-steel-500 pointer-events-none">
              ₹
            </span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={working.price_per_piece || ''}
              placeholder="0"
              onChange={(e) =>
                setWorking({
                  ...working,
                  price_per_piece: parseFloat(e.target.value) || 0,
                })
              }
              className="input pl-8 text-right tabular-nums"
            />
          </div>
          <p className="text-[11px] text-steel-500 mt-1">
            Leave blank or 0 if no price tracking needed for this part.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function BulkAddPartsModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  customers?: Customer[]; // kept for backward compatibility, no longer used
}) {
  const [text, setText] = useState('');
  const [tonnage, setTonnage] = useState<Tonnage>(600);
  const [prodType, setProdType] = useState<MaterialType>('HW');
  const [category, setCategory] = useState<PartCategory>('Fast Runner');
  const [busy, setBusy] = useState(false);

  const codes = useMemo(
    () =>
      text
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    [text]
  );

  const save = async () => {
    if (codes.length === 0) return;
    setBusy(true);
    for (const code of codes) {
      await fp.invoke(fp.channels.PART_UPSERT, {
        part_code: code,
        material_type: prodType,
        category,
        required_tonnage: tonnage,
        is_die_locked: false,
      });
    }
    setBusy(false);
    toast.success(`Added ${codes.length} part${codes.length !== 1 ? 's' : ''}`);
    setText('');
    onSaved();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bulk add parts"
      subtitle="Paste a list of part codes — same tonnage & prod type applied to all"
      width={640}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={codes.length === 0 || busy}
            className="btn-accent"
          >
            <Sparkles className="w-4 h-4" />
            {busy ? 'Adding…' : `Add ${codes.length} part${codes.length === 1 ? '' : 's'}`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="field-label">Tonnage</div>
            <select
              className="select"
              value={tonnage}
              onChange={(e) => setTonnage(Number(e.target.value) as Tonnage)}
            >
              {TONNAGE_VALUES.map((t) => (
                <option key={t} value={t}>
                  {t}T
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="field-label">Prod Type</div>
            <select
              className="select"
              value={prodType}
              onChange={(e) => setProdType(e.target.value as MaterialType)}
            >
              <option value="HW">HW</option>
              <option value="HWCB">HWCB</option>
              <option value="OSP">OSP</option>
            </select>
          </div>
          <div>
            <div className="field-label">Category</div>
            <select
              className="select"
              value={category}
              onChange={(e) => setCategory(e.target.value as PartCategory)}
            >
              <option value="Fast Runner">Fast Runner</option>
              <option value="Slow Runner">Slow Runner</option>
            </select>
          </div>
        </div>
        <div>
          <div className="field-label flex items-center justify-between">
            <span>Part codes</span>
            <span className="text-[10px] normal-case tracking-normal font-normal text-steel-400">
              {codes.length} detected · one per line or comma-separated
            </span>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`5KBL10031-CRANK ARM\n5KBL10032-LEVER\nBG14-PINION GEAR`}
            rows={8}
            className="input min-h-[160px] resize-y font-mono text-xs"
          />
        </div>
        {codes.length > 0 && (
          <div className="bg-steel-50 rounded-xl p-3 max-h-40 overflow-auto">
            <div className="text-[11px] uppercase tracking-wider font-bold text-steel-500 mb-1.5">
              Preview · all will be saved as {tonnage}T · {prodType} · {category}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {codes.map((c, i) => (
                <span
                  key={i}
                  className="chip bg-white text-steel-700 ring-1 ring-steel-200 font-mono"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

interface DbInfo {
  path: string;
  size_bytes: number;
  modified: string | null;
  counts: {
    presses: number;
    customers: number;
    parts: number;
    plan_rows: number;
    downtime_events: number;
  };
}

function DataTab() {
  const [info, setInfo] = useState<DbInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');

  const reload = () => fp.invoke<DbInfo>(fp.channels.DB_INFO).then(setInfo);
  useEffect(() => {
    reload();
  }, []);

  const backup = async () => {
    setBusy('backup');
    const r = await fp.invoke<{ ok: boolean; path?: string; message?: string }>(
      fp.channels.DB_BACKUP
    );
    setBusy(null);
    if (r.ok) toast.success('Backup saved');
    else if (r.message !== 'Cancelled') toast.error(r.message ?? 'Backup failed');
  };

  const restore = async () => {
    setRestoreOpen(false);
    setBusy('restore');
    const r = await fp.invoke<{ ok: boolean; message?: string }>(fp.channels.DB_RESTORE);
    if (!r.ok && r.message !== 'Cancelled') toast.error(r.message ?? 'Restore failed');
    setBusy(null);
  };

  const runReset = async () => {
    setResetOpen(false);
    setBusy('reset');
    try {
      await fp.invoke(fp.channels.DB_RESET);
      toast.success('Database reset · defaults re-seeded');
      setResetConfirmText('');
      reload();
      useApp.getState().reload();
    } catch (e) {
      console.error(e);
      toast.error('Reset failed — see console');
    } finally {
      setBusy(null);
    }
  };

  if (!info) return null;

  const sizeMb = (info.size_bytes / 1024 / 1024).toFixed(2);

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-steel-100 flex items-center justify-center text-steel-700">
            <HardDrive className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-base">Database file</h2>
            <p className="text-[11px] text-steel-500 break-all">{info.path}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <DbStat label="Size" value={`${sizeMb} MB`} />
          <DbStat label="Plan rows" value={String(info.counts.plan_rows)} />
          <DbStat
            label="Last modified"
            value={
              info.modified
                ? new Date(info.modified).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })
                : '—'
            }
          />
        </div>
        <div className="grid grid-cols-5 gap-2 text-center">
          <Mini label="Presses" value={info.counts.presses} />
          <Mini label="Customers" value={info.counts.customers} />
          <Mini label="Parts" value={info.counts.parts} />
          <Mini label="Plan rows" value={info.counts.plan_rows} />
          <Mini label="Downtime" value={info.counts.downtime_events} />
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="font-bold text-base">Backup &amp; restore</h2>
        <p className="text-xs text-steel-500">
          The database is a single SQLite file. Back it up regularly — copy the file to a USB
          drive, network share, or cloud folder. Restoring replaces the current DB and restarts
          the app.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={backup} disabled={busy === 'backup'} className="btn-primary">
            <Download className="w-4 h-4" />
            {busy === 'backup' ? 'Saving…' : 'Back up database'}
          </button>
          <button
            onClick={() => setRestoreOpen(true)}
            disabled={busy === 'restore'}
            className="btn-secondary"
          >
            <Upload className="w-4 h-4" />
            {busy === 'restore' ? 'Restoring…' : 'Restore from backup'}
          </button>
        </div>
      </div>

      <div className="card p-5 border-rose-200 bg-rose-50/40">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-rose-600 flex items-center justify-center text-white shrink-0">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-base text-rose-900">Danger zone · Reset database</h2>
            <p className="text-xs text-rose-700/80 mt-1">
              Wipes every row and re-seeds the default HIL master data (14 in-house presses, 21
              customers, default vendors & stock locations). Use this to start fresh — for
              example, when handing the app to a different planner. <span className="font-semibold">Back up first</span> if there's any
              chance you'll want the data later.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[11px] text-rose-700/70">
            Requires you to type <span className="font-mono font-bold">RESET</span> to confirm.
          </div>
          <button
            onClick={() => {
              setResetConfirmText('');
              setResetOpen(true);
            }}
            disabled={busy === 'reset'}
            className="btn-danger"
          >
            <RotateCcw className="w-4 h-4" />
            {busy === 'reset' ? 'Resetting…' : 'Reset all data'}
          </button>
        </div>
      </div>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset all data?"
        subtitle="Permanently wipes the entire database"
        width={520}
        footer={
          <>
            <button onClick={() => setResetOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={runReset}
              disabled={resetConfirmText.trim() !== 'RESET'}
              className="btn-danger disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              Reset everything
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-900">
            <div className="font-bold mb-2">This will permanently delete:</div>
            <ul className="text-[13px] space-y-1 list-disc list-inside text-rose-800">
              <li>All production plan rows · {info.counts.plan_rows} rows</li>
              <li>All downtime events · {info.counts.downtime_events} events</li>
              <li>All press assignments &amp; opening-stock breakdowns</li>
              <li>All parts you added · {info.counts.parts} parts</li>
              <li>All custom customers / vendors / stock locations</li>
              <li>Company logo &amp; preferences</li>
            </ul>
          </div>
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-900">
            <div className="font-bold mb-1">Then re-seeds defaults:</div>
            <div className="text-[13px] text-emerald-800">
              14 in-house presses · 12 vendor presses · 21 customers · default vendors &amp; stock
              locations · default safety stock days (2/2)
            </div>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[12px] text-amber-900 flex items-start gap-2">
            <span className="text-base">💡</span>
            <span>
              Cannot be undone. Click <span className="font-semibold">Cancel</span> and run{' '}
              <span className="font-semibold">Back up database</span> first if you might want this
              data later.
            </span>
          </div>
          <div>
            <div className="field-label">
              Type <span className="font-mono text-rose-600 font-bold">RESET</span> to confirm
            </div>
            <input
              autoFocus
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && resetConfirmText.trim() === 'RESET') runReset();
              }}
              placeholder="RESET"
              className={cn(
                'input font-mono tracking-widest text-center',
                resetConfirmText.trim() === 'RESET' && 'border-rose-400 ring-2 ring-rose-200'
              )}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        title="Restore database from backup?"
        subtitle="Your current data will be replaced and the app will restart"
        width={520}
        footer={
          <>
            <button onClick={() => setRestoreOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button onClick={restore} className="btn-primary">
              <Upload className="w-4 h-4" />
              Choose backup file…
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-steel-700">
          <p>
            You'll be asked to pick a previously-saved <code className="bg-steel-100 px-1.5 py-0.5 rounded text-xs">.db</code>{' '}
            file. Once you select it:
          </p>
          <ol className="list-decimal list-inside space-y-1 text-[13px] text-steel-600 pl-2">
            <li>A safety copy of your current DB is saved alongside it</li>
            <li>The chosen file replaces your live DB</li>
            <li>The app relaunches automatically</li>
          </ol>
          <p className="text-[12px] text-steel-500 pt-2">
            If anything goes wrong, look for <code className="bg-steel-100 px-1.5 py-0.5 rounded text-xs">.pre-restore-*.bak</code>{' '}
            in the database folder — that's your last-known-good copy.
          </p>
        </div>
      </Modal>
    </div>
  );
}

function DbStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-steel-50 rounded-xl p-3 border border-steel-200">
      <div className="text-[10px] uppercase tracking-wider font-bold text-steel-500">{label}</div>
      <div className="text-base font-bold tabular-nums mt-0.5 truncate">{value}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2 py-1.5">
      <div className="text-xl font-bold tabular-nums text-steel-900">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-steel-500 font-semibold">
        {label}
      </div>
    </div>
  );
}

// ── Add-entity modals (explicit Save button per user request) ────────────

/**
 * AddPressModal — flexible enough to add any machine.
 *
 * Type picks one of:
 *   · In-house (HIL plant)
 *   · Inter Branch (sister unit)
 *   · Each vendor by name (loaded from the vendors master)
 *
 * Factory is a combobox: user types freely, dropdown suggests labels already
 * in use across other presses.
 *
 * Tonnage is free-form (any positive integer) — common values 400 / 600 /
 * 1000 / 1600 / 2500 surface as click-to-fill chips.
 *
 * Capacity is split into Day shift + Night shift; cap/day = day + night.
 *
 * Initial values can be passed via `editing` so the same modal handles the
 * pencil-edit case too.
 */
function AddPressModal({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing?: Press | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  // type: 'in_house' | 'inter_branch' | `vendor:<id>`
  const [code, setCode] = useState('');
  const [type, setType] = useState<string>('in_house');
  const [factory, setFactory] = useState('');
  const [tonnage, setTonnage] = useState<number>(1000);
  const [dayCapacity, setDayCapacity] = useState<number>(1500);
  const [nightCapacity, setNightCapacity] = useState<number>(0);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [factorySuggestions, setFactorySuggestions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      fp.invoke<Vendor[]>(fp.channels.VENDORS_LIST),
      fp.invoke<Press[]>(fp.channels.PRESSES_LIST),
    ]).then(([v, pr]) => {
      setVendors(v);
      const uniq = Array.from(new Set(pr.map((p) => p.factory).filter(Boolean)));
      setFactorySuggestions(uniq);

      if (editing) {
        setCode(editing.code);
        setFactory(editing.factory);
        setTonnage(editing.tonnage);
        setDayCapacity(editing.day_capacity || editing.capacity_per_day || 0);
        setNightCapacity(editing.night_capacity || 0);
        if (editing.is_in_house && editing.factory === 'InterUnit') setType('inter_branch');
        else if (editing.is_in_house) setType('in_house');
        else if (editing.vendor_id) setType(`vendor:${editing.vendor_id}`);
        else setType('in_house');
      } else {
        setCode('');
        setType('in_house');
        setFactory('In-house');
        setTonnage(1000);
        setDayCapacity(1500);
        setNightCapacity(0);
      }
    });
  }, [open, editing]);

  // Auto-fill the factory field when type changes (only when user hasn't typed something custom)
  useEffect(() => {
    if (!open) return;
    if (type === 'in_house' && !factory) setFactory('In-house');
    if (type === 'inter_branch' && (!factory || factory === 'In-house')) setFactory('InterUnit');
    if (type.startsWith('vendor:')) {
      const vid = Number(type.split(':')[1]);
      const v = vendors.find((x) => x.id === vid);
      if (v) setFactory(v.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const totalCap = dayCapacity + nightCapacity;

  const derived = (() => {
    if (type === 'in_house') return { is_in_house: 1 as const, vendor_id: null };
    if (type === 'inter_branch') return { is_in_house: 1 as const, vendor_id: null };
    const vid = Number(type.split(':')[1]);
    return { is_in_house: 0 as const, vendor_id: vid || null };
  })();

  const canSave = code.trim().length > 0 && factory.trim().length > 0 && tonnage > 0 && totalCap > 0;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await fp.invoke(fp.channels.PRESS_UPSERT, {
        id: editing?.id,
        code: code.trim(),
        factory: factory.trim(),
        is_in_house: derived.is_in_house,
        vendor_id: derived.vendor_id,
        tonnage,
        capacity_per_day: totalCap,
        day_capacity: dayCapacity,
        night_capacity: nightCapacity,
        efficiency_pct: 85,
        is_active: 1,
      });
      toast.success(`Press ${code} ${editing ? 'updated' : 'added'}`);
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
      title={editing ? `Edit press · ${editing.code}` : 'Add new press'}
      subtitle="Pick the type, tonnage, and shift-wise capacity"
      width={620}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={save} disabled={!canSave || busy} className="btn-primary">
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Save press'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="field-label">
            Machine code <span className="text-rose-500">*</span>
          </div>
          <input
            autoFocus={!editing}
            className="input font-mono"
            placeholder="e.g. FP-15 or V5-P1"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSave) save();
            }}
          />
        </div>

        <div>
          <div className="field-label">
            Type <span className="text-rose-500">*</span>
          </div>
          <select
            className="select"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <optgroup label="In-house">
              <option value="in_house">🏢 In-house (HIL plant)</option>
              <option value="inter_branch">🏪 Inter Branch (sister unit)</option>
            </optgroup>
            {vendors.length > 0 && (
              <optgroup label="Vendors">
                {vendors.map((v) => (
                  <option key={v.id} value={`vendor:${v.id}`}>
                    🚚 {v.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {type.startsWith('vendor:') && vendors.length === 0 && (
            <div className="text-[11px] text-rose-600 mt-1">
              Add a vendor in Settings → Vendors first.
            </div>
          )}
        </div>

        <div>
          <div className="field-label flex items-center justify-between">
            <span>
              Factory label <span className="text-rose-500">*</span>
            </span>
            <span className="text-[10px] normal-case tracking-normal font-normal text-steel-400">
              Type or pick existing
            </span>
          </div>
          <input
            list="factory-suggestions"
            className="input"
            placeholder="e.g. FS1, FS2, Plant A, vendor name…"
            value={factory}
            onChange={(e) => setFactory(e.target.value)}
          />
          <datalist id="factory-suggestions">
            {factorySuggestions.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </div>

        <div>
          <div className="field-label flex items-center justify-between">
            <span>
              Tonnage <span className="text-rose-500">*</span>
            </span>
            <div className="flex gap-1">
              {[400, 600, 1000, 1600, 2500].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTonnage(t)}
                  className={cn(
                    'px-1.5 py-0.5 rounded text-[10px] font-semibold transition',
                    tonnage === t
                      ? 'bg-steel-900 text-white'
                      : 'bg-steel-100 text-steel-600 hover:bg-steel-200'
                  )}
                >
                  {t}T
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <input
              type="number"
              min={1}
              className="input pr-10 font-bold tabular-nums"
              value={tonnage || ''}
              onChange={(e) => setTonnage(Number(e.target.value) || 0)}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-steel-400 pointer-events-none">
              T
            </span>
          </div>
        </div>

        <div>
          <div className="field-label">Shift capacity (pcs)</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-amber-600 mb-1">
                ☀ Day shift
              </div>
              <input
                type="number"
                min={0}
                className="input tabular-nums"
                value={dayCapacity || ''}
                onChange={(e) => setDayCapacity(Number(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-industrial-700 mb-1">
                🌙 Night shift
              </div>
              <input
                type="number"
                min={0}
                className="input tabular-nums"
                value={nightCapacity || ''}
                onChange={(e) => setNightCapacity(Number(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
          </div>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-[11px] text-emerald-800 leading-relaxed">
          <div className="flex items-center justify-between">
            <span>Total cap / day:</span>
            <span className="font-bold tabular-nums text-emerald-900 text-base">
              {totalCap.toLocaleString('en-IN')} pcs
            </span>
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span>@ 85% efficiency:</span>
            <span className="font-bold tabular-nums text-emerald-900">
              {Math.round(totalCap * 0.85).toLocaleString('en-IN')} pcs/day
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function KindCard({
  icon: Icon,
  label,
  hint,
  active,
  tone,
  onClick,
}: {
  icon: typeof Building2;
  label: string;
  hint: string;
  active: boolean;
  tone: 'industrial' | 'emerald' | 'forge';
  onClick: () => void;
}) {
  const toneClass = {
    industrial: {
      active: 'border-industrial-500 bg-industrial-50',
      inactive: 'border-steel-200 hover:border-industrial-300',
      icon: 'bg-industrial-100 text-industrial-700',
    },
    emerald: {
      active: 'border-emerald-500 bg-emerald-50',
      inactive: 'border-steel-200 hover:border-emerald-300',
      icon: 'bg-emerald-100 text-emerald-700',
    },
    forge: {
      active: 'border-forge-500 bg-forge-50',
      inactive: 'border-steel-200 hover:border-forge-300',
      icon: 'bg-forge-100 text-forge-700',
    },
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border-2 p-3 text-left transition',
        active ? toneClass.active : `bg-white ${toneClass.inactive}`
      )}
    >
      <div
        className={cn(
          'inline-flex items-center justify-center w-7 h-7 rounded-lg mb-1.5',
          toneClass.icon
        )}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="font-bold text-xs leading-tight">{label}</div>
      <div className="text-[10px] text-steel-500 mt-0.5 leading-tight">{hint}</div>
    </button>
  );
}

function AddVendorModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setContact('');
      setPhone('');
      setEmail('');
    }
  }, [open]);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await fp.invoke(fp.channels.VENDOR_UPSERT, {
        name: name.trim(),
        contact_person: contact || null,
        phone: phone || null,
        email: email || null,
      });
      toast.success(`${name} added`);
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
      title="Add new vendor"
      width={520}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={!name.trim() || busy} className="btn-primary">
            {busy ? 'Saving…' : 'Save vendor'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <div className="field-label">Vendor name <span className="text-rose-500">*</span></div>
          <input
            autoFocus
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. ABC Forge Industries"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="field-label">Contact person</div>
            <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
          <div>
            <div className="field-label">Phone</div>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <div className="field-label">Email</div>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </div>
      </div>
    </Modal>
  );
}

function AddCustomerModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [tier, setTier] = useState<Customer['priority_tier']>('Medium');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCode('');
      setFullName('');
      setTier('Medium');
    }
  }, [open]);

  const canSave = code.trim().length > 0;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await fp.invoke(fp.channels.CUSTOMER_UPSERT, {
        code: code.trim(),
        full_name: fullName.trim() || null,
        priority_tier: tier,
      });
      toast.success(`${code} added`);
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
      title="Add new customer"
      width={520}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={!canSave || busy} className="btn-primary">
            {busy ? 'Saving…' : 'Save customer'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <div className="field-label">Customer code <span className="text-rose-500">*</span></div>
          <input
            autoFocus
            className="input font-mono"
            placeholder="e.g. HERO"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSave) save(); }}
          />
        </div>
        <div>
          <div className="field-label">Full name (optional)</div>
          <input
            className="input"
            placeholder="e.g. Hero MotoCorp"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div>
          <div className="field-label">Priority tier</div>
          <select className="select" value={tier} onChange={(e) => setTier(e.target.value as Customer['priority_tier'])}>
            <option>Critical</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
          <p className="text-[11px] text-steel-500 mt-1">
            Critical/High customers get priority during auto-distribute &amp; reroute.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function AddLocationModal({
  open,
  onClose,
  onSaved,
  vendors,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  vendors: Vendor[];
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<StockLocationKind>('HIL');
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setKind('HIL');
      setVendorId(null);
    }
  }, [open]);

  const canSave = name.trim().length > 0;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await fp.invoke(fp.channels.STOCK_LOCATION_UPSERT, {
        name: name.trim(),
        kind,
        vendor_id: kind === 'Vendor' ? vendorId : null,
        is_active: 1,
      });
      toast.success(`${name} added`);
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
      title="Add stock location"
      width={520}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={!canSave || busy} className="btn-primary">
            {busy ? 'Saving…' : 'Save location'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <div className="field-label">Location name <span className="text-rose-500">*</span></div>
          <input
            autoFocus
            className="input"
            placeholder="e.g. HIL Tooling Bay"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSave) save(); }}
          />
        </div>
        <div>
          <div className="field-label">Kind</div>
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as StockLocationKind)}>
            <option value="HIL">HIL (in-house godown)</option>
            <option value="External">External (e.g. GILL CHOCK)</option>
            <option value="Vendor">Vendor (specific partner)</option>
          </select>
        </div>
        {kind === 'Vendor' && (
          <div>
            <div className="field-label">Linked vendor</div>
            <select
              className="select"
              value={vendorId ?? ''}
              onChange={(e) => setVendorId(Number(e.target.value) || null)}
            >
              <option value="">— Pick a vendor —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </Modal>
  );
}

// Keep StatusPill import used to silence tree-shake-friendly warnings
export { StatusPill };
