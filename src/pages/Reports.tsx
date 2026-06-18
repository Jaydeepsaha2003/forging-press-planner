import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  FileBarChart2,
  Download,
  AlertTriangle,
  Building2,
  TrendingUp,
  Truck,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { useApp } from '../store';
import { fp } from '../lib/fp';
import type { CapacitySummary, CustomerRisk, DashboardKPIs } from '../../shared/types';
import { fmtNum, fmtPct } from '../lib/cn';

const COLORS = ['#1E3A8A', '#EA580C', '#16A34A', '#F59E0B', '#3B82F6', '#A855F7', '#0EA5E9'];

export function Reports() {
  const { month } = useApp();
  const [capacity, setCapacity] = useState<CapacitySummary[]>([]);
  const [risk, setRisk] = useState<CustomerRisk[]>([]);
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);

  useEffect(() => {
    fp.invoke<CapacitySummary[]>(fp.channels.CAPACITY_SUMMARY, month).then(setCapacity);
    fp.invoke<CustomerRisk[]>(fp.channels.CUSTOMER_RISK, month).then(setRisk);
    fp.invoke<DashboardKPIs>(fp.channels.DASHBOARD_KPIS, month).then(setKpis);
  }, [month]);

  const exportPlan = async () => {
    const res = await fp.invoke<{ ok: boolean; message: string; path: string }>(
      fp.channels.EXCEL_EXPORT,
      { month }
    );
    if (res.ok) toast.success(`Exported · ${res.message}`);
  };

  const capacityData = capacity.map((c) => ({
    name: `${c.tonnage}T`,
    required: Number(c.required_days.toFixed(1)),
    available: c.available_days,
  }));

  const splitData = kpis
    ? [
        { name: 'In-house (HIL)', value: Math.round(kpis.in_house_qty) },
        { name: 'OSP (Vendor)', value: Math.round(kpis.osp_qty) },
      ]
    : [];

  const topCustomers = risk.slice(0, 10).map((r) => ({
    name: r.customer_code,
    demand: Math.round(r.total_demand),
    planned: Math.round(r.planned),
    risk: Math.round(r.at_risk),
  }));

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileBarChart2 className="w-6 h-6 text-industrial-700" /> Reports & Insights
          </h1>
          <p className="text-sm text-steel-500 mt-1">{monthLabel(month)} · analytics dashboard</p>
        </div>
        <button onClick={exportPlan} className="btn-accent">
          <Download className="w-4 h-4" /> Export current plan
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniCard
          icon={<Building2 className="w-4 h-4" />}
          label="In-house pcs"
          value={fmtNum(kpis?.in_house_qty)}
          sub={fmtPct(kpis?.in_house_pct ?? 0)}
        />
        <MiniCard
          icon={<Truck className="w-4 h-4" />}
          label="OSP pcs"
          value={fmtNum(kpis?.osp_qty)}
          sub={fmtPct(kpis?.osp_pct ?? 0)}
        />
        <MiniCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="At-risk pcs"
          value={fmtNum(kpis?.at_risk_qty)}
          sub={kpis && kpis.at_risk_qty > 0 ? 'check Press Board' : 'all on running presses'}
        />
        <MiniCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Demand"
          value={fmtNum(kpis?.total_demand_qty)}
          sub={`${kpis?.part_count ?? 0} parts`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card p-5 lg:col-span-2">
          <h2 className="font-bold text-base mb-1">Capacity utilization</h2>
          <p className="text-xs text-steel-500 mb-4">
            Required vs available machine-days by tonnage
          </p>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={capacityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fill: '#64748B', fontSize: 12 }} />
                <YAxis tick={{ fill: '#64748B', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #E2E8F0',
                    fontSize: 13,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="available" fill="#94A3B8" name="Available" radius={[8, 8, 0, 0]} />
                <Bar dataKey="required" fill="#1E3A8A" name="Required" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-bold text-base mb-1">Production split</h2>
          <p className="text-xs text-steel-500 mb-4">In-house vs OSP</p>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={splitData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={(e: { name: string; percent?: number }) =>
                    `${e.name}: ${(((e.percent ?? 0) * 100)).toFixed(0)}%`
                  }
                >
                  {splitData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-bold text-base mb-1">Top customers by demand</h2>
        <p className="text-xs text-steel-500 mb-4">
          Planned vs demand · red bars indicate at-risk pieces
        </p>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={topCustomers}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="name" tick={{ fill: '#64748B', fontSize: 12 }} />
              <YAxis tick={{ fill: '#64748B', fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid #E2E8F0',
                  fontSize: 13,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="demand" fill="#1E3A8A" name="Demand" radius={[6, 6, 0, 0]} />
              <Bar dataKey="planned" fill="#16A34A" name="Planned" radius={[6, 6, 0, 0]} />
              <Bar dataKey="risk" fill="#DC2626" name="At Risk" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function MiniCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between text-steel-500 text-[11px] uppercase tracking-wider font-semibold">
        {label}
        <span className="w-7 h-7 rounded-lg bg-steel-100 flex items-center justify-center text-steel-600">
          {icon}
        </span>
      </div>
      <div className="text-2xl font-bold mt-2 tabular-nums">{value}</div>
      <div className="text-[11px] text-steel-500 mt-1">{sub}</div>
    </div>
  );
}

function monthLabel(m: string): string {
  const [y, mm] = m.split('-').map(Number);
  return new Date(y, (mm ?? 1) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}
