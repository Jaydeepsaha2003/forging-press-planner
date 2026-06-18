import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Package,
  Building2,
  Truck,
  AlertTriangle,
  TrendingUp,
  IndianRupee,
} from 'lucide-react';
import { useApp } from '../store';
import { fp } from '../lib/fp';
import { KpiCard } from '../components/KpiCard';
import { PressTile } from '../components/PressTile';
import { StatusPill } from '../components/StatusPill';
import { Drawer } from '../components/Drawer';
import { PressDrawerContent } from './PressDrawerContent';
import { ActionCenter } from './ActionCenter';
import { WorkflowCard } from './WorkflowCard';
import { MaintenanceBanner } from './MaintenanceBanner';
import { CustomerImpactPanel } from './CustomerImpactPanel';
import type {
  CapacitySummary,
  CustomerRisk,
  DashboardKPIs,
  PressWithLoad,
} from '../../shared/types';
import { cn, fmtNum, fmtPct, fmtCurrency, timeAgo } from '../lib/cn';

export function Dashboard() {
  const { month } = useApp();
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [presses, setPresses] = useState<PressWithLoad[]>([]);
  const [capacity, setCapacity] = useState<CapacitySummary[]>([]);
  const [risk, setRisk] = useState<CustomerRisk[]>([]);
  const [activity, setActivity] = useState<Array<{ kind: string; text: string; when: string }>>([]);
  const [openPressId, setOpenPressId] = useState<number | null>(null);
  const openPress = openPressId !== null
    ? presses.find((p) => p.id === openPressId) ?? null
    : null;

  const refresh = async () => {
    const [k, p, c, r] = await Promise.all([
      fp.invoke<DashboardKPIs>(fp.channels.DASHBOARD_KPIS, month),
      fp.invoke<PressWithLoad[]>(fp.channels.PRESSES_LIST_WITH_LOAD, month),
      fp.invoke<CapacitySummary[]>(fp.channels.CAPACITY_SUMMARY, month),
      fp.invoke<CustomerRisk[]>(fp.channels.CUSTOMER_RISK, month),
    ]);
    setKpis(k);
    setPresses(p);
    setCapacity(c);
    setRisk(r.slice(0, 6));

    const downtime = await fp.invoke<Array<{ id: number; press_code: string; reason: string; start_datetime: string; end_datetime: string | null }>>(
      fp.channels.DOWNTIME_LIST,
      { month }
    );
    const reloc = await fp.invoke<Array<{ id: number; part_code: string; from_press_code: string; to_press_code: string; moved_at: string }>>(
      fp.channels.RELOCATION_LOG,
      { month }
    );
    const merged = [
      ...downtime.slice(0, 6).map((d) => ({
        kind: d.end_datetime ? 'restored' : 'down',
        text: `${d.press_code} — ${d.reason}${d.end_datetime ? ' · restored' : ''}`,
        when: d.start_datetime,
      })),
      ...reloc.slice(0, 6).map((r) => ({
        kind: 'reroute',
        text: `${r.part_code}: ${r.from_press_code} → ${r.to_press_code}`,
        when: r.moved_at,
      })),
    ]
      .sort((a, b) => b.when.localeCompare(a.when))
      .slice(0, 10);
    setActivity(merged);
  };

  useEffect(() => {
    refresh();
    const off1 = fp.on(fp.channels.EVT_PRESS_STATUS_CHANGED, refresh);
    const off2 = fp.on(fp.channels.EVT_PLAN_UPDATED, refresh);
    return () => {
      off1();
      off2();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const byLoad = (a: PressWithLoad, b: PressWithLoad) => b.load_pct - a.load_pct;
  const inHouse = presses.filter((p) => p.is_in_house).sort(byLoad);
  const vendor = presses.filter((p) => !p.is_in_house).sort(byLoad);
  const loadedInHouse = inHouse.filter((p) => p.required_machine_days > 0);
  const avgLoad = loadedInHouse.length
    ? Math.round(loadedInHouse.reduce((s, p) => s + p.load_pct, 0) / loadedInHouse.length)
    : 0;
  const overCap = inHouse.filter((p) => p.load_pct > 100);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Production Control Room</h1>
          <p className="text-sm text-steel-500 mt-1">
            Live operations view for {monthLabel(month)} · {inHouse.length} in-house +{' '}
            {vendor.length} vendor presses
          </p>
        </div>
      </div>

      {/* 4-step workflow walkthrough */}
      <WorkflowCard />

      {/* Upcoming scheduled maintenance — plan ahead */}
      <MaintenanceBanner />

      {/* Action Center — breakdown indication + re-route suggestions */}
      <ActionCenter presses={presses} onMutate={refresh} />

      {/* Customer Impact — who's affected by Down/Prevention presses */}
      <CustomerImpactPanel />

      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Total demand"
          value={fmtNum(kpis?.total_demand_qty ?? 0)}
          delta={`${kpis?.part_count ?? 0} parts · ${kpis?.customer_count ?? 0} customers`}
          accent="steel"
          icon={<Package className="w-5 h-5" />}
        />
        <KpiCard
          label="In-house planned"
          value={fmtNum(kpis?.in_house_qty ?? 0)}
          delta={
            <span className="text-emerald-600 font-medium">{fmtPct(kpis?.in_house_pct ?? 0)} of demand</span>
          }
          accent="industrial"
          icon={<Building2 className="w-5 h-5" />}
        />
        <KpiCard
          label="OSP planned"
          value={fmtNum(kpis?.osp_qty ?? 0)}
          delta={
            <span className="text-forge-600 font-medium">{fmtPct(kpis?.osp_pct ?? 0)} outsourced</span>
          }
          accent="forge"
          icon={<Truck className="w-5 h-5" />}
        />
        <KpiCard
          label="At-risk pieces"
          value={
            <span className={cn(kpis && kpis.at_risk_qty > 0 ? 'text-rose-600' : 'text-emerald-600')}>
              {fmtNum(kpis?.at_risk_qty ?? 0)}
            </span>
          }
          delta={
            kpis && kpis.at_risk_qty > 0
              ? <span className="text-rose-600">Stuck on Down/Maintenance presses</span>
              : 'All planned work on running presses'
          }
          accent={kpis && kpis.at_risk_qty > 0 ? 'rose' : 'emerald'}
          icon={<AlertTriangle className="w-5 h-5" />}
        />
      </div>

      {/* ₹ Financial KPIs — only show when there's pricing data */}
      {kpis && (kpis.total_order_value > 0 || kpis.at_risk_value > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <KpiCard
            label="Total order value"
            value={
              <span title={`₹${Math.round(kpis.total_order_value).toLocaleString('en-IN')}`}>
                {fmtCurrency(kpis.total_order_value)}
              </span>
            }
            delta={`Across ${kpis.customer_count} customer${kpis.customer_count === 1 ? '' : 's'} · ${monthLabel(month)}`}
            accent="industrial"
            icon={<IndianRupee className="w-5 h-5" />}
            hint="Customer schedule × per-piece price · set in Settings → Parts"
          />
          <KpiCard
            label="At-risk amount"
            value={
              <span
                className={cn(kpis.at_risk_value > 0 ? 'text-rose-600' : 'text-emerald-600')}
                title={`₹${Math.round(kpis.at_risk_value).toLocaleString('en-IN')}`}
              >
                {fmtCurrency(kpis.at_risk_value)}
              </span>
            }
            delta={
              kpis.at_risk_value > 0
                ? <span className="text-rose-600">Locked on Down / Prevention presses</span>
                : 'No revenue exposure right now'
            }
            accent={kpis.at_risk_value > 0 ? 'rose' : 'emerald'}
            icon={<IndianRupee className="w-5 h-5" />}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Capacity bars */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-base tracking-tight">Capacity by tonnage</h2>
              <p className="text-xs text-steel-500 mt-0.5">Required vs available machine-days</p>
            </div>
            <TrendingUp className="w-5 h-5 text-steel-400" />
          </div>
          <div className="space-y-4">
            {capacity.map((c) => (
              <CapacityRow key={c.tonnage} c={c} />
            ))}
          </div>
        </div>

        {/* Activity */}
        <div className="card p-5">
          <h2 className="font-bold text-base tracking-tight mb-1">Today's alerts</h2>
          <p className="text-xs text-steel-500 mb-4">Recent press events & re-routes</p>
          <ul className="space-y-2.5 max-h-[420px] overflow-auto -mx-1 px-1">
            {activity.length === 0 && (
              <li className="text-sm text-steel-500 py-8 text-center">
                Nothing to report — operations steady.
              </li>
            )}
            {activity.map((a, i) => (
              <li key={i} className="flex items-start gap-3 py-2 border-b border-steel-100 last:border-0">
                <span
                  className={cn(
                    'w-2 h-2 rounded-full mt-1.5 shrink-0',
                    a.kind === 'down' && 'bg-rose-500 animate-pulse',
                    a.kind === 'restored' && 'bg-emerald-500',
                    a.kind === 'reroute' && 'bg-forge-500'
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{a.text}</div>
                  <div className="text-[11px] text-steel-500">{timeAgo(a.when)}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Press grid */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-base tracking-tight">In-house presses</h2>
            <p className="text-xs text-steel-500 mt-0.5">
              {inHouse.length} machines · sorted by load · avg{' '}
              <span className="font-semibold text-steel-700">{avgLoad}%</span>
              {overCap.length > 0 && (
                <>
                  {' · '}
                  <span className="font-semibold text-rose-600">
                    {overCap.length} over capacity
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <LegendDot color="bg-emerald-500" label="Running" />
            <LegendDot color="bg-steel-300" label="Idle" />
            <LegendDot color="bg-sky-500" label="Prevention" />
            <LegendDot color="bg-rose-500" label="Breakdown" />
          </div>
        </div>
        {overCap.length > 0 && (
          <div className="mb-4 flex items-center gap-2 flex-wrap rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="font-semibold">Over capacity:</span>
            {overCap.map((p) => (
              <span key={p.id} className="chip bg-white text-rose-700 ring-1 ring-rose-200">
                {p.code} · {p.load_pct.toFixed(0)}%
              </span>
            ))}
            <span className="text-rose-600/80">— rebalance to free machine-days</span>
          </div>
        )}
        <div className="grid-press">
          {inHouse.map((p) => (
            <PressTile key={p.id} press={p} onClick={() => setOpenPressId(p.id)} />
          ))}
        </div>

        <div className="mt-7 pt-5 border-t border-steel-200">
          <h3 className="font-semibold text-sm tracking-tight mb-3 text-steel-700">
            Vendor presses (OSP)
          </h3>
          <div className="grid-press">
            {vendor.map((p) => (
              <PressTile key={p.id} press={p} onClick={() => setOpenPressId(p.id)} />
            ))}
          </div>
        </div>
      </div>

      {/* Customer risk */}
      {risk.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-base tracking-tight">Customer delivery risk</h2>
              <p className="text-xs text-steel-500 mt-0.5">Sorted by priority tier</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-steel-500 border-b border-steel-200">
                <tr>
                  <th className="text-left py-2 font-semibold">Customer</th>
                  <th className="text-left py-2 font-semibold">Priority</th>
                  <th className="text-right py-2 font-semibold">Demand</th>
                  <th className="text-right py-2 font-semibold">Planned</th>
                  <th className="text-right py-2 font-semibold">At risk</th>
                  <th className="text-right py-2 font-semibold">Risk %</th>
                </tr>
              </thead>
              <tbody>
                {risk.map((r) => (
                  <tr key={r.customer_id} className="border-b border-steel-100 last:border-0">
                    <td className="py-2.5">
                      <div className="font-semibold">{r.customer_code}</div>
                      {r.customer_name && (
                        <div className="text-[11px] text-steel-500">{r.customer_name}</div>
                      )}
                    </td>
                    <td className="py-2.5">
                      <PriorityChip tier={r.priority_tier} />
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{fmtNum(r.total_demand)}</td>
                    <td className="py-2.5 text-right tabular-nums">{fmtNum(r.planned)}</td>
                    <td className="py-2.5 text-right tabular-nums font-bold text-rose-600">
                      {r.at_risk > 0 ? fmtNum(r.at_risk) : '–'}
                    </td>
                    <td className="py-2.5 text-right tabular-nums font-medium">
                      {r.risk_pct > 0 ? fmtPct(r.risk_pct) : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Drawer
        open={!!openPress}
        onClose={() => setOpenPressId(null)}
        title={openPress?.code}
        subtitle={openPress ? `${openPress.tonnage}T · ${openPress.factory}` : undefined}
        width={520}
      >
        {openPress && <PressDrawerContent press={openPress} onMutate={refresh} />}
      </Drawer>
    </div>
  );
}

function CapacityRow({ c }: { c: CapacitySummary }) {
  const pct = Math.min(160, c.utilization_pct);
  const tone =
    c.utilization_pct > 95
      ? 'bg-rose-500'
      : c.utilization_pct > 80
      ? 'bg-amber-500'
      : 'bg-emerald-500';
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="font-semibold text-steel-700">{c.tonnage}T</span>
        <span className="text-steel-500 tabular-nums">
          <span className="font-bold text-steel-800">{c.required_days.toFixed(1)}</span> /{' '}
          {c.available_days} days
          <span
            className={cn(
              'ml-2 chip',
              c.utilization_pct > 95
                ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                : c.utilization_pct > 80
                ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
            )}
          >
            {fmtPct(c.utilization_pct, 0)}
          </span>
        </span>
      </div>
      <div className="h-3 bg-steel-100 rounded-full overflow-hidden relative">
        <motion.div
          className={cn('h-full rounded-full', tone)}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, pct)}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
        {c.utilization_pct > 100 && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-rose-700">
            +{(c.utilization_pct - 100).toFixed(0)}% over
          </div>
        )}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-steel-600">
      <span className={cn('w-2 h-2 rounded-full', color)} /> {label}
    </span>
  );
}

function PriorityChip({ tier }: { tier: string }) {
  const map: Record<string, string> = {
    Critical: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
    High: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    Medium: 'bg-steel-100 text-steel-700 ring-1 ring-steel-200',
    Low: 'bg-steel-50 text-steel-500 ring-1 ring-steel-200',
  };
  return <span className={cn('chip', map[tier] ?? map.Medium)}>{tier}</span>;
}

function monthLabel(m: string): string {
  const [y, mm] = m.split('-').map(Number);
  return new Date(y, (mm ?? 1) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

// Re-export status pill for now-unused inlined usage
export { StatusPill };
