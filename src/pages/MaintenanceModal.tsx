import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Wrench, Trash2, Calendar } from 'lucide-react';
import { Modal } from '../components/Modal';
import { fp } from '../lib/fp';
import { cn } from '../lib/cn';
import type { Press, ScheduledMaintenance } from '../../shared/types';

const REASONS = [
  'Preventive maintenance',
  'Die change',
  'Hydraulic overhaul',
  'Electrical service',
  'Calibration',
  'Plant shutdown',
  'Other',
];

export function MaintenanceModal({
  open,
  press,
  onClose,
  onSaved,
}: {
  open: boolean;
  press: Press;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [list, setList] = useState<ScheduledMaintenance[]>([]);
  const [adding, setAdding] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState('');
  const [reason, setReason] = useState(REASONS[0]);
  const [notes, setNotes] = useState('');

  const reload = () =>
    fp.invoke<ScheduledMaintenance[]>(fp.channels.MAINTENANCE_LIST).then((all) => {
      setList(all.filter((m) => m.press_id === press.id));
    });

  useEffect(() => {
    if (open) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, press.id]);

  const save = async () => {
    if (!startsOn) {
      toast.error('Start date required');
      return;
    }
    await fp.invoke(fp.channels.MAINTENANCE_UPSERT, {
      press_id: press.id,
      starts_on: startsOn,
      ends_on: endsOn || null,
      reason,
      notes: notes.trim() || null,
      status: 'planned',
    });
    toast.success(`Scheduled ${reason} on ${startsOn}`);
    setAdding(false);
    setEndsOn('');
    setNotes('');
    reload();
    onSaved();
  };

  const remove = async (id: number) => {
    if (!confirm('Cancel this scheduled maintenance?')) return;
    await fp.invoke(fp.channels.MAINTENANCE_DELETE, id);
    reload();
    onSaved();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Scheduled maintenance · ${press.code}`}
      subtitle="Plan downtime in advance so the system can warn you and suggest re-routes"
      width={620}
      footer={
        <button onClick={onClose} className="btn-primary">
          Done
        </button>
      }
    >
      <div className="space-y-4">
        {!adding ? (
          <button
            onClick={() => {
              setAdding(true);
              setStartsOn(today);
            }}
            className="btn-accent w-full justify-center"
          >
            <Wrench className="w-4 h-4" /> Schedule new maintenance
          </button>
        ) : (
          <div className="border-l-4 border-forge-500 pl-4 py-2 bg-forge-50/40 rounded-r-xl space-y-3 animate-fade-in">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="field-label">Start date</div>
                <input
                  type="date"
                  className="input"
                  value={startsOn}
                  min={today}
                  onChange={(e) => setStartsOn(e.target.value)}
                />
              </div>
              <div>
                <div className="field-label">End date (optional)</div>
                <input
                  type="date"
                  className="input"
                  value={endsOn}
                  min={startsOn || today}
                  onChange={(e) => setEndsOn(e.target.value)}
                />
              </div>
            </div>
            <div>
              <div className="field-label">Reason</div>
              <select
                className="select"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="field-label">Notes (optional)</div>
              <textarea
                className="input min-h-[60px] resize-y"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. die-change for HERO 600T parts, vendor visit, etc."
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setAdding(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={save} className="btn-primary">
                Save schedule
              </button>
            </div>
          </div>
        )}

        <div>
          <div className="text-[11px] uppercase tracking-wider font-bold text-steel-500 mb-2">
            Existing schedules · {list.length}
          </div>
          {list.length === 0 ? (
            <div className="text-xs text-steel-500 italic py-4 text-center bg-steel-50 rounded-xl">
              No maintenance scheduled for {press.code}
            </div>
          ) : (
            <ul className="space-y-2">
              {list.map((m) => {
                const start = new Date(m.starts_on);
                const daysUntil = Math.ceil(
                  (start.getTime() - new Date().getTime()) / 86400000
                );
                return (
                  <li
                    key={m.id}
                    className={cn(
                      'flex items-start gap-3 px-3 py-2.5 rounded-xl border',
                      m.status === 'completed'
                        ? 'border-emerald-200 bg-emerald-50/40'
                        : m.status === 'cancelled'
                        ? 'border-steel-200 bg-steel-50 opacity-60'
                        : daysUntil <= 7
                        ? 'border-amber-300 bg-amber-50/60'
                        : 'border-steel-200 bg-white'
                    )}
                  >
                    <Calendar className="w-4 h-4 text-steel-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-bold text-sm">{m.reason ?? 'Maintenance'}</span>
                        <span className="text-[11px] text-steel-500 tabular-nums">
                          {m.starts_on}
                          {m.ends_on && ` → ${m.ends_on}`}
                        </span>
                        {daysUntil >= 0 && m.status === 'planned' && (
                          <span
                            className={cn(
                              'chip text-[10px]',
                              daysUntil <= 7
                                ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'
                                : 'bg-steel-100 text-steel-600'
                            )}
                          >
                            in {daysUntil}d
                          </span>
                        )}
                        <span
                          className={cn(
                            'chip text-[10px]',
                            m.status === 'planned' && 'bg-steel-100 text-steel-600',
                            m.status === 'in_progress' && 'bg-sky-100 text-sky-700',
                            m.status === 'completed' && 'bg-emerald-100 text-emerald-700',
                            m.status === 'cancelled' && 'bg-rose-100 text-rose-700'
                          )}
                        >
                          {m.status}
                        </span>
                      </div>
                      {m.notes && (
                        <div className="text-[11px] text-steel-600 mt-0.5">{m.notes}</div>
                      )}
                    </div>
                    <button
                      onClick={() => remove(m.id)}
                      className="text-rose-600 hover:bg-rose-50 p-1 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
