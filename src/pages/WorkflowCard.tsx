import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Warehouse,
  ClipboardList,
  Wand2,
  Hammer,
  ArrowRight,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { fp } from '../lib/fp';
import { useApp } from '../store';
import { cn, fmtNum } from '../lib/cn';

interface Counters {
  parts_with_stock: number;
  plan_rows: number;
  rows_with_assignment: number;
  total_production_qty: number;
  total_hil_plan: number;
}

/**
 * Big banner on the Dashboard that walks the planner through the 4-step flow.
 * Each step shows live progress + a CTA. Once a step is done it goes green.
 */
export function WorkflowCard() {
  const { month } = useApp();
  const [counters, setCounters] = useState<Counters | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [stockList, planList, balanceList] = await Promise.all([
        fp.invoke<Array<{ hil_qty: number; outside_qty: number }>>(
          fp.channels.PART_STOCK_LIST,
          month
        ),
        fp.invoke<Array<{ id: number; assigned_press_id: number | null; hil_prod_qty: number }>>(
          fp.channels.PLAN_LIST,
          month
        ),
        fp.invoke<Array<{ hil_plan: number; produced: number }>>(
          fp.channels.PRODUCTION_BALANCE,
          month
        ),
      ]);
      if (cancelled) return;
      setCounters({
        parts_with_stock: stockList.filter((s) => s.hil_qty + s.outside_qty > 0).length,
        plan_rows: planList.length,
        rows_with_assignment: planList.filter((r) => r.assigned_press_id !== null).length,
        total_production_qty: balanceList.reduce((s, r) => s + r.produced, 0),
        total_hil_plan: balanceList.reduce((s, r) => s + r.hil_plan, 0),
      });
    };
    load();
    const off = fp.on(fp.channels.EVT_PLAN_UPDATED, load);
    return () => {
      cancelled = true;
      off();
    };
  }, [month]);

  if (!counters) return null;

  const steps = [
    {
      n: 1,
      label: 'Enter opening stock',
      sub: counters.parts_with_stock > 0 ? `${counters.parts_with_stock} parts with stock` : 'No stock entered yet',
      done: counters.parts_with_stock > 0,
      to: '/stock',
      icon: Warehouse,
      cta: 'Stock',
    },
    {
      n: 2,
      label: 'Add customer schedules',
      sub: counters.plan_rows > 0 ? `${counters.plan_rows} plan rows` : 'No schedules added',
      done: counters.plan_rows > 0,
      to: '/plan',
      icon: ClipboardList,
      cta: 'Plan',
    },
    {
      n: 3,
      label: 'Auto-distribute to presses',
      sub: counters.plan_rows === 0
        ? '—'
        : counters.rows_with_assignment === counters.plan_rows
        ? 'All rows allocated'
        : `${counters.rows_with_assignment} / ${counters.plan_rows} assigned`,
      done:
        counters.plan_rows > 0 && counters.rows_with_assignment === counters.plan_rows,
      to: '/plan',
      icon: Wand2,
      cta: 'Plan',
    },
    {
      n: 4,
      label: 'Log daily production',
      sub:
        counters.total_hil_plan > 0
          ? `${fmtNum(counters.total_production_qty)} / ${fmtNum(counters.total_hil_plan)} pcs done`
          : 'No plan yet',
      done: counters.total_production_qty > 0,
      to: '/production',
      icon: Hammer,
      cta: 'Produce',
    },
  ];

  const completed = steps.filter((s) => s.done).length;

  return (
    <div className="card bg-gradient-to-br from-steel-50 via-white to-industrial-50/40 p-5">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-base tracking-tight">Monthly workflow</h2>
          <p className="text-xs text-steel-500">
            {completed === 4
              ? '✓ Everything ready — keep logging production daily'
              : `Step ${completed + 1} of 4 — ${steps[completed]?.label.toLowerCase() ?? 'all done'}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {steps.map((s) => (
            <span
              key={s.n}
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                s.done ? 'bg-emerald-500' : 'bg-steel-300'
              )}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.n}
              to={s.to}
              className={cn(
                'group relative rounded-2xl p-4 transition-all border',
                s.done
                  ? 'bg-emerald-50/40 border-emerald-200 hover:border-emerald-300'
                  : i === completed
                  ? 'bg-white border-forge-300 ring-2 ring-forge-100 hover:border-forge-400'
                  : 'bg-white border-steel-200 hover:border-steel-300'
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <span
                  className={cn(
                    'inline-flex items-center justify-center w-7 h-7 rounded-lg font-black text-xs tabular-nums',
                    s.done
                      ? 'bg-emerald-500 text-white'
                      : i === completed
                      ? 'bg-forge-500 text-white'
                      : 'bg-steel-100 text-steel-500'
                  )}
                >
                  {s.done ? <CheckCircle2 className="w-4 h-4" /> : s.n}
                </span>
                <Icon
                  className={cn(
                    'w-4 h-4',
                    s.done
                      ? 'text-emerald-600'
                      : i === completed
                      ? 'text-forge-600'
                      : 'text-steel-400'
                  )}
                />
              </div>
              <div className="font-bold text-sm tracking-tight">{s.label}</div>
              <div className="text-[11px] text-steel-500 mt-0.5">{s.sub}</div>
              <div
                className={cn(
                  'mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold transition',
                  s.done
                    ? 'text-emerald-700'
                    : i === completed
                    ? 'text-forge-700'
                    : 'text-steel-500 group-hover:text-steel-700'
                )}
              >
                Open {s.cta} <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
              {!s.done && i !== completed && (
                <Circle className="absolute top-2 right-2 w-1.5 h-1.5 text-steel-300" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
