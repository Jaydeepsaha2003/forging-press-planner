import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { Modal } from '../components/Modal';
import { fp } from '../lib/fp';
import { useApp } from '../store';
import type {
  PressWithLoad,
  RelocationSuggestion,
} from '../../shared/types';
import { cn, fmtNum } from '../lib/cn';

export function RelocationWizard({
  open,
  fromPress,
  onClose,
  onApplied,
}: {
  open: boolean;
  fromPress: PressWithLoad;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { month } = useApp();
  const [suggestions, setSuggestions] = useState<RelocationSuggestion[]>([]);
  const [chosen, setChosen] = useState<Record<number, number | null>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    fp.invoke<RelocationSuggestion[]>(fp.channels.RELOCATION_SUGGEST, {
      fromPressId: fromPress.id,
      month,
    }).then((s) => {
      setSuggestions(s);
      const initial: Record<number, number | null> = {};
      s.forEach((sg) => {
        initial[sg.plan_row.id] = sg.candidates[0]?.press.id ?? null;
      });
      setChosen(initial);
    });
  }, [open, fromPress.id, month]);

  const applyAll = async () => {
    setBusy(true);
    let moved = 0;
    for (const s of suggestions) {
      const toPressId = chosen[s.plan_row.id];
      if (!toPressId) continue;
      await fp.invoke(fp.channels.RELOCATION_APPLY, {
        plan_id: s.plan_row.id,
        part_id: s.plan_row.part_id,
        from_press_id: fromPress.id,
        to_press_id: toPressId,
        qty: s.plan_row.hil_prod_qty,
        required_machine_days: s.plan_row.required_machine_days,
      });
      moved++;
    }
    setBusy(false);
    toast.success(`Re-routed ${moved} part${moved !== 1 ? 's' : ''}`);
    onApplied();
    onClose();
  };

  if (suggestions.length === 0) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title={`Re-route from ${fromPress.code}`}
        subtitle="No parts assigned to this press for the current month"
        footer={
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
        }
      >
        <div className="text-center py-8 text-steel-500 text-sm">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          Nothing to re-route — this press has no work planned.
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${fromPress.code} is Down — ${suggestions.length} part${
        suggestions.length !== 1 ? 's' : ''
      } affected`}
      subtitle="Top-3 alternative presses ranked by tonnage match, free capacity & factory affinity"
      width={920}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={applyAll} disabled={busy} className="btn-accent">
            <Sparkles className="w-4 h-4" />
            {busy ? 'Applying...' : 'Apply suggestions'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {suggestions.map((s) => (
          <div
            key={s.plan_row.id}
            className="border border-steel-200 rounded-2xl p-4 bg-steel-50/50"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-sm">{s.plan_row.part_code}</span>
                  <span className="chip bg-white text-steel-700 ring-1 ring-steel-200">
                    {s.plan_row.customer_code}
                  </span>
                  <span className="chip bg-white text-steel-600 ring-1 ring-steel-200">
                    {s.plan_row.required_tonnage}T
                  </span>
                  <PrioBadge tier={s.plan_row.priority_tier} />
                </div>
                <div className="text-xs text-steel-500 mt-1.5">
                  {fmtNum(s.plan_row.hil_prod_qty)} pcs ·{' '}
                  {s.plan_row.required_machine_days.toFixed(1)} machine-days needed
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-steel-300 mt-1" />
            </div>

            {s.candidates.length === 0 ? (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm text-rose-700">
                No compatible press found
                {s.plan_row.is_die_locked && ' (die-locked to original press)'}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {s.candidates.map((c) => {
                  const selected = chosen[s.plan_row.id] === c.press.id;
                  return (
                    <button
                      key={c.press.id}
                      onClick={() =>
                        setChosen((p) => ({ ...p, [s.plan_row.id]: c.press.id }))
                      }
                      className={cn(
                        'text-left p-3 rounded-xl border-2 transition relative',
                        selected
                          ? 'border-forge-500 bg-forge-50 shadow-glow-amber'
                          : 'border-steel-200 bg-white hover:border-steel-300'
                      )}
                    >
                      {selected && (
                        <CheckCircle2 className="absolute top-2 right-2 w-4 h-4 text-forge-600" />
                      )}
                      <div className="font-bold text-sm">{c.press.code}</div>
                      <div className="text-[11px] text-steel-500 mb-2">
                        {c.press.tonnage}T · {c.press.factory}
                      </div>
                      <div className="text-[11px] text-steel-600">
                        <span className="font-bold tabular-nums">
                          {c.free_days.toFixed(1)}
                        </span>{' '}
                        days free · score {c.score.toFixed(0)}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {c.reasons.slice(0, 2).map((r, i) => (
                          <span
                            key={i}
                            className="chip bg-steel-50 text-steel-600 ring-1 ring-steel-200 text-[10px]"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

function PrioBadge({ tier }: { tier: string }) {
  const map: Record<string, string> = {
    Critical: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200',
    High: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
    Medium: 'bg-steel-100 text-steel-700 ring-1 ring-steel-200',
    Low: 'bg-steel-50 text-steel-500 ring-1 ring-steel-200',
  };
  return <span className={cn('chip', map[tier] ?? map.Medium)}>{tier}</span>;
}
