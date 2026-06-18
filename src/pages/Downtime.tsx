import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import { useApp } from '../store';
import { fp } from '../lib/fp';
import { cn, fmtNum, timeAgo } from '../lib/cn';

interface DowntimeRow {
  id: number;
  press_id: number;
  press_code: string;
  start_datetime: string;
  end_datetime: string | null;
  reason: string;
  notes: string | null;
  expected_restoration_datetime: string | null;
}

export function Downtime() {
  const { month } = useApp();
  const [rows, setRows] = useState<DowntimeRow[]>([]);

  const refresh = () =>
    fp.invoke<DowntimeRow[]>(fp.channels.DOWNTIME_LIST, { month }).then(setRows);

  useEffect(() => {
    refresh();
    const off = fp.on(fp.channels.EVT_PRESS_STATUS_CHANGED, refresh);
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const stats = useMemo(() => {
    let totalHours = 0;
    const reasons: Record<string, number> = {};
    let openCount = 0;
    for (const r of rows) {
      const start = new Date(r.start_datetime + (r.start_datetime.endsWith('Z') ? '' : 'Z')).getTime();
      const end = r.end_datetime
        ? new Date(r.end_datetime + (r.end_datetime.endsWith('Z') ? '' : 'Z')).getTime()
        : Date.now();
      const hours = Math.max(0, (end - start) / 3600000);
      totalHours += hours;
      reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
      if (!r.end_datetime) openCount++;
    }
    const top = Object.entries(reasons)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);
    return { totalHours, openCount, top, totalEvents: rows.length };
  }, [rows]);

  const closeEvent = async (id: number) => {
    await fp.invoke(fp.channels.DOWNTIME_CLOSE, { id });
    toast.success('Press restored');
    refresh();
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this downtime entry?')) return;
    await fp.invoke(fp.channels.DOWNTIME_DELETE, id);
    refresh();
  };

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-rose-600" /> Downtime Log
        </h1>
        <p className="text-sm text-steel-500 mt-1">
          Every breakdown captured · {monthLabel(month)}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Events this month" value={fmtNum(stats.totalEvents)} cls="text-steel-900" />
        <Stat
          label="Total downtime"
          value={`${stats.totalHours.toFixed(1)}h`}
          cls="text-rose-600"
        />
        <Stat label="Still down" value={fmtNum(stats.openCount)} cls={stats.openCount > 0 ? 'text-rose-600' : 'text-emerald-600'} />
        <Stat
          label="Top reason"
          value={stats.top[0]?.[0] ?? '—'}
          sub={stats.top[0] ? `${stats.top[0][1]} event(s)` : 'none'}
          cls="text-steel-900"
        />
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-16 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <div className="font-semibold">Clean record</div>
            <div className="text-sm text-steel-500">
              No breakdowns logged in {monthLabel(month)}
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-steel-50 border-b border-steel-200 text-[11px] uppercase tracking-wider text-steel-500">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Press</th>
                <th className="text-left px-4 py-3 font-semibold">Reason</th>
                <th className="text-left px-4 py-3 font-semibold">Started</th>
                <th className="text-left px-4 py-3 font-semibold">Duration</th>
                <th className="text-left px-4 py-3 font-semibold">Notes</th>
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const start = new Date(r.start_datetime + (r.start_datetime.endsWith('Z') ? '' : 'Z')).getTime();
                const end = r.end_datetime
                  ? new Date(r.end_datetime + (r.end_datetime.endsWith('Z') ? '' : 'Z')).getTime()
                  : Date.now();
                const hours = (end - start) / 3600000;
                const open = !r.end_datetime;
                return (
                  <tr
                    key={r.id}
                    className={cn(
                      'border-b border-steel-100 hover:bg-steel-50/60 transition',
                      open && 'bg-rose-50/40'
                    )}
                  >
                    <td className="px-4 py-3 font-bold">
                      <span className="flex items-center gap-2">
                        {open && (
                          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                        )}
                        {r.press_code}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="chip bg-rose-100 text-rose-700 ring-1 ring-rose-200">
                        {r.reason}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-steel-600">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {timeAgo(r.start_datetime)}
                      </div>
                      <div className="text-[11px] text-steel-400">{r.start_datetime}</div>
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold">
                      {hours < 1 ? `${(hours * 60).toFixed(0)}m` : `${hours.toFixed(1)}h`}
                      {open && <span className="ml-1 text-[11px] text-rose-600">live</span>}
                    </td>
                    <td className="px-4 py-3 text-steel-600 max-w-[280px] truncate">
                      {r.notes || <span className="text-steel-400 italic">no notes</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {open && (
                        <button
                          onClick={() => closeEvent(r.id)}
                          className="btn-secondary text-xs py-1.5"
                        >
                          Close & restore
                        </button>
                      )}
                      <button
                        onClick={() => remove(r.id)}
                        className="text-rose-600 text-xs px-2 py-1.5 hover:bg-rose-50 rounded-lg ml-1"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  cls,
}: {
  label: string;
  value: string;
  sub?: string;
  cls?: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wider font-semibold text-steel-500">
        {label}
      </div>
      <div className={cn('text-2xl font-bold tabular-nums mt-1', cls)}>{value}</div>
      {sub && <div className="text-[11px] text-steel-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function monthLabel(m: string): string {
  const [y, mm] = m.split('-').map(Number);
  return new Date(y, (mm ?? 1) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}
