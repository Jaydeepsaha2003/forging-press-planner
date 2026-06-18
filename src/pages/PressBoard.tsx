import { useEffect, useMemo, useState } from 'react';
import { Factory, Filter } from 'lucide-react';
import { useApp } from '../store';
import { fp } from '../lib/fp';
import { PressTile } from '../components/PressTile';
import { Drawer } from '../components/Drawer';
import { PressDrawerContent } from './PressDrawerContent';
import type { PressStatus, PressWithLoad } from '../../shared/types';
import { cn } from '../lib/cn';

const FILTERS: Array<{ value: PressStatus | 'All'; label: string }> = [
  { value: 'All', label: 'All' },
  { value: 'Running', label: 'Running' },
  { value: 'Idle', label: 'Idle' },
  { value: 'Maintenance', label: 'Prevention' },
  { value: 'Down', label: 'Breakdown' },
];

export function PressBoard() {
  const { month } = useApp();
  const [presses, setPresses] = useState<PressWithLoad[]>([]);
  const [filter, setFilter] = useState<PressStatus | 'All'>('All');
  const [factory, setFactory] = useState<string>('All');
  const [openPressId, setOpenPressId] = useState<number | null>(null);
  const openPress = openPressId !== null
    ? presses.find((p) => p.id === openPressId) ?? null
    : null;

  const refresh = () =>
    fp.invoke<PressWithLoad[]>(fp.channels.PRESSES_LIST_WITH_LOAD, month).then(setPresses);

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

  const filtered = useMemo(() => {
    return presses.filter((p) => {
      if (filter !== 'All' && p.current_status !== filter) return false;
      if (factory !== 'All' && p.factory !== factory) return false;
      return true;
    });
  }, [presses, filter, factory]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of presses) c[p.current_status] = (c[p.current_status] ?? 0) + 1;
    return c;
  }, [presses]);

  const factories = Array.from(new Set(presses.map((p) => p.factory)));
  const byLoad = (a: PressWithLoad, b: PressWithLoad) => b.load_pct - a.load_pct;
  const inHouse = filtered.filter((p) => p.is_in_house).sort(byLoad);
  const vendor = filtered.filter((p) => !p.is_in_house).sort(byLoad);
  const overCapCount = presses.filter((p) => p.load_pct > 100).length;

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Factory className="w-6 h-6 text-forge-600" /> Press Status Board
          </h1>
          <p className="text-sm text-steel-500 mt-1">
            Tap any tile to change status, log downtime, or trigger re-route
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3 text-xs">
            <SummaryStat label="Running" count={counts.Running ?? 0} cls="text-emerald-600" />
            <SummaryStat label="Idle" count={counts.Idle ?? 0} cls="text-steel-500" />
            <SummaryStat label="Prevention" count={counts.Maintenance ?? 0} cls="text-sky-600" />
            <SummaryStat label="Breakdown" count={counts.Down ?? 0} cls="text-rose-600" />
            <SummaryStat label="Over cap" count={overCapCount} cls="text-rose-600" />
          </div>
        </div>
      </div>

      <div className="card p-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-steel-500 px-2">
          <Filter className="w-3.5 h-3.5" /> Status
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition',
                filter === f.value
                  ? 'bg-steel-900 text-white'
                  : 'bg-steel-100 text-steel-600 hover:bg-steel-200'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="h-5 w-px bg-steel-200 mx-1" />
        <div className="flex items-center gap-1.5 text-xs text-steel-500 px-2">Factory</div>
        <div className="flex items-center gap-1.5">
          <FactoryBtn label="All" active={factory === 'All'} onClick={() => setFactory('All')} />
          {factories.map((f) => (
            <FactoryBtn key={f} label={f} active={factory === f} onClick={() => setFactory(f)} />
          ))}
        </div>
      </div>

      {inHouse.length > 0 && (
        <Section title="In-house presses" subtitle={`${inHouse.length} machines`}>
          <div className="grid-press">
            {inHouse.map((p) => (
              <PressTile key={p.id} press={p} onClick={() => setOpenPressId(p.id)} />
            ))}
          </div>
        </Section>
      )}
      {vendor.length > 0 && (
        <Section title="Vendor presses (OSP)" subtitle={`${vendor.length} machines`}>
          <div className="grid-press">
            {vendor.map((p) => (
              <PressTile key={p.id} press={p} onClick={() => setOpenPressId(p.id)} />
            ))}
          </div>
        </Section>
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

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-bold text-base tracking-tight">{title}</h2>
          <p className="text-xs text-steel-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function SummaryStat({ label, count, cls }: { label: string; count: number; cls: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={cn('font-bold tabular-nums text-base', cls)}>{count}</span>
      <span className="text-steel-500">{label}</span>
    </div>
  );
}

function FactoryBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-lg text-xs font-semibold transition',
        active ? 'bg-industrial-700 text-white' : 'bg-steel-100 text-steel-600 hover:bg-steel-200'
      )}
    >
      {label}
    </button>
  );
}
