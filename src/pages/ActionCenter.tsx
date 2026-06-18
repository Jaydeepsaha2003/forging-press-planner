import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  AlertOctagon,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Clock,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';
import { fp } from '../lib/fp';
import { useApp } from '../store';
import type {
  PressWithLoad,
  RelocationSuggestion,
} from '../../shared/types';
import { cn, fmtNum, timeAgo } from '../lib/cn';
import { RelocationWizard } from './RelocationWizard';

interface IncidentSummary {
  press: PressWithLoad;
  suggestions: RelocationSuggestion[];
  affectedParts: number;
  affectedQty: number;
  affectedDays: number;
  criticalCustomers: string[];
  highCustomers: string[];
  topDestinations: Array<{ code: string; tonnage: number; freeDays: number; matches: number }>;
  unsolvable: number;
}

export function ActionCenter({
  presses,
  onMutate,
}: {
  presses: PressWithLoad[];
  onMutate: () => void;
}) {
  const { month } = useApp();
  const [incidents, setIncidents] = useState<IncidentSummary[]>([]);
  const [activeWizard, setActiveWizard] = useState<PressWithLoad | null>(null);
  const [loading, setLoading] = useState(false);

  const downPresses = useMemo(
    () =>
      presses.filter(
        (p) => p.current_status === 'Down' || p.current_status === 'Maintenance'
      ),
    [presses]
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const results = await Promise.all(
        downPresses.map(async (press) => {
          const suggestions = await fp.invoke<RelocationSuggestion[]>(
            fp.channels.RELOCATION_SUGGEST,
            { fromPressId: press.id, month }
          );
          const affectedParts = suggestions.length;
          const affectedQty = suggestions.reduce(
            (sum, s) => sum + s.plan_row.hil_prod_qty,
            0
          );
          const affectedDays = suggestions.reduce(
            (sum, s) => sum + s.plan_row.required_machine_days,
            0
          );
          const criticalCustomers = Array.from(
            new Set(
              suggestions
                .filter((s) => s.plan_row.priority_tier === 'Critical')
                .map((s) => s.plan_row.customer_code)
            )
          );
          const highCustomers = Array.from(
            new Set(
              suggestions
                .filter((s) => s.plan_row.priority_tier === 'High')
                .map((s) => s.plan_row.customer_code)
            )
          );

          // Aggregate destination popularity
          const destMap = new Map<
            string,
            { code: string; tonnage: number; freeDays: number; matches: number }
          >();
          for (const s of suggestions) {
            const top = s.candidates[0];
            if (top) {
              const key = top.press.code;
              const existing = destMap.get(key);
              if (existing) existing.matches++;
              else
                destMap.set(key, {
                  code: top.press.code,
                  tonnage: top.press.tonnage,
                  freeDays: top.free_days,
                  matches: 1,
                });
            }
          }
          const topDestinations = Array.from(destMap.values())
            .sort((a, b) => b.matches - a.matches)
            .slice(0, 3);
          const unsolvable = suggestions.filter((s) => s.candidates.length === 0).length;

          return {
            press,
            suggestions,
            affectedParts,
            affectedQty,
            affectedDays,
            criticalCustomers,
            highCustomers,
            topDestinations,
            unsolvable,
          };
        })
      );
      if (!cancelled) {
        setIncidents(results);
        setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [downPresses, month]);

  const totalAtRiskQty = incidents.reduce((s, i) => s + i.affectedQty, 0);
  const totalAtRiskParts = incidents.reduce((s, i) => s + i.affectedParts, 0);
  const allCritical = Array.from(new Set(incidents.flatMap((i) => i.criticalCustomers)));

  const markRestored = async (press: PressWithLoad) => {
    const downs = await fp.invoke<Array<{ id: number; end_datetime: string | null }>>(
      fp.channels.DOWNTIME_LIST,
      { pressId: press.id }
    );
    const open = downs.find((d) => !d.end_datetime);
    if (open) {
      await fp.invoke(fp.channels.DOWNTIME_CLOSE, { id: open.id });
    } else {
      await fp.invoke(fp.channels.PRESS_SET_STATUS, press.id, 'Running');
    }
    toast.success(`${press.code} marked as Running`);
    onMutate();
  };

  // ALL CLEAR banner
  if (downPresses.length === 0) {
    const idleCount = presses.filter((p) => p.current_status === 'Idle').length;
    const runningCount = presses.filter((p) => p.current_status === 'Running').length;
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card overflow-hidden border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-emerald-50/40"
      >
        <div className="px-5 py-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-emerald-900 tracking-tight">
              All clear · Operations steady
            </h2>
            <p className="text-sm text-emerald-700/80 mt-0.5">
              {runningCount} press{runningCount !== 1 ? 'es' : ''} running
              {idleCount > 0 && ` · ${idleCount} idle`} · no breakdowns
            </p>
          </div>
          <div className="hidden md:flex items-center gap-1.5 text-emerald-700/70 text-xs font-medium">
            <Zap className="w-3.5 h-3.5" />
            Plan on track
          </div>
        </div>
      </motion.div>
    );
  }

  // ACTION REQUIRED hero + per-incident cards
  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card overflow-hidden border-rose-200 bg-gradient-to-r from-rose-50 via-white to-rose-50/40"
      >
        <div className="px-5 py-4 flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="absolute inset-0 rounded-2xl bg-rose-400/40 animate-ping" />
            <div className="relative w-12 h-12 rounded-2xl bg-rose-600 flex items-center justify-center text-white shadow-glow-red">
              <AlertOctagon className="w-6 h-6" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-rose-900 tracking-tight">
              Action required ·{' '}
              {downPresses.length} press{downPresses.length !== 1 ? 'es' : ''} need re-routing
            </h2>
            <p className="text-sm text-rose-700/80 mt-0.5">
              <span className="font-bold">{fmtNum(totalAtRiskParts)} parts</span> ·{' '}
              <span className="font-bold">{fmtNum(totalAtRiskQty)}</span> pcs at risk
              {allCritical.length > 0 && (
                <>
                  {' · '}
                  <span className="font-bold">Critical:</span>{' '}
                  {allCritical.slice(0, 3).join(', ')}
                  {allCritical.length > 3 ? ` +${allCritical.length - 3}` : ''}
                </>
              )}
            </p>
          </div>
          <div className="hidden lg:flex items-center text-rose-700 text-xs font-semibold">
            Resolve below ↓
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {incidents.map((inc, idx) => (
          <motion.div
            key={inc.press.id}
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ delay: idx * 0.04, duration: 0.22 }}
          >
            <IncidentCard
              loading={loading}
              incident={inc}
              onResolve={() => setActiveWizard(inc.press)}
              onMarkRestored={() => markRestored(inc.press)}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      {activeWizard && (
        <RelocationWizard
          open={!!activeWizard}
          fromPress={activeWizard}
          onClose={() => setActiveWizard(null)}
          onApplied={() => {
            onMutate();
          }}
        />
      )}
    </div>
  );
}

function IncidentCard({
  incident,
  onResolve,
  onMarkRestored,
  loading,
}: {
  incident: IncidentSummary;
  onResolve: () => void;
  onMarkRestored: () => void;
  loading: boolean;
}) {
  const { press, affectedParts, affectedQty, affectedDays, criticalCustomers, highCustomers, topDestinations, unsolvable } = incident;
  const downColor = press.current_status === 'Maintenance' ? 'sky' : 'rose';
  const colorMap = {
    rose: {
      border: 'border-rose-300',
      bg: 'bg-gradient-to-br from-rose-50/60 via-white to-white',
      ring: 'bg-rose-600 shadow-glow-red',
      title: 'text-rose-900',
      icon: AlertOctagon,
    },
    sky: {
      border: 'border-sky-300',
      bg: 'bg-gradient-to-br from-sky-50/60 via-white to-white',
      ring: 'bg-sky-600 shadow-glow-blue',
      title: 'text-sky-900',
      icon: Wrench,
    },
  };
  const c = colorMap[downColor];
  const Icon = c.icon;

  return (
    <div className={cn('card overflow-hidden', c.border, c.bg)}>
      <div className="px-5 py-4 flex items-start gap-4 flex-wrap lg:flex-nowrap">
        {/* Left: press identity + impact */}
        <div className="flex items-start gap-3 min-w-[280px] flex-1">
          <div className="relative shrink-0">
            <div className={cn('absolute inset-0 rounded-2xl opacity-30 animate-pulse', downColor === 'rose' ? 'bg-rose-400' : 'bg-sky-400')} />
            <div className={cn('relative w-12 h-12 rounded-2xl flex items-center justify-center text-white', c.ring)}>
              <Icon className="w-5 h-5" />
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h3 className={cn('text-lg font-bold tracking-tight', c.title)}>{press.code}</h3>
              <span className="chip bg-white text-steel-700 ring-1 ring-steel-200">
                {press.tonnage}T · {press.factory}
              </span>
              <span className="chip bg-steel-100 text-steel-600">
                {press.current_status}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[12px] text-steel-600 mt-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Down for {timeAgo(press.status_changed_at)}
              </span>
              {(criticalCustomers.length > 0 || highCustomers.length > 0) && (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="w-3 h-3" />
                  {criticalCustomers.length > 0 && (
                    <span className="chip bg-rose-100 text-rose-700 ring-1 ring-rose-200 text-[10px]">
                      Critical: {criticalCustomers.join(', ')}
                    </span>
                  )}
                  {highCustomers.length > 0 && (
                    <span className="chip bg-amber-100 text-amber-700 ring-1 ring-amber-200 text-[10px]">
                      High: {highCustomers.join(', ')}
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Middle: numbers */}
        <div className="grid grid-cols-3 gap-4 min-w-[280px]">
          <Metric label="Affected parts" value={fmtNum(affectedParts)} tone="steel" />
          <Metric label="At-risk pcs" value={fmtNum(affectedQty)} tone="rose" />
          <Metric label="Machine-days" value={affectedDays.toFixed(1)} tone="steel" />
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <button onClick={onMarkRestored} className="btn-secondary">
            <ShieldCheck className="w-4 h-4" /> Restored
          </button>
          <button
            onClick={onResolve}
            disabled={affectedParts === 0}
            className="btn-accent disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            Re-route now
          </button>
        </div>
      </div>

      {/* Suggested destinations strip */}
      {affectedParts > 0 && (
        <div className="px-5 py-3 border-t border-steel-200/60 bg-white/50 backdrop-blur-sm">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-[11px] uppercase tracking-wider font-bold text-steel-500">
              Best destinations
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {loading && (
                <span className="text-xs text-steel-400 italic">Computing…</span>
              )}
              {!loading && topDestinations.length === 0 && (
                <span className="text-xs text-rose-600 italic">
                  No compatible press found — review die-locked parts
                </span>
              )}
              {topDestinations.map((d, i) => (
                <DestinationChip key={d.code} dest={d} rank={i + 1} />
              ))}
              {unsolvable > 0 && (
                <span className="chip bg-rose-100 text-rose-700 ring-1 ring-rose-200">
                  ⚠ {unsolvable} unsolvable
                </span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-1 text-[11px] text-steel-500">
              <ArrowRight className="w-3 h-3" />
              Open wizard to fine-tune & apply
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'steel' | 'rose';
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-steel-500">
        {label}
      </div>
      <div
        className={cn(
          'text-xl font-bold tabular-nums mt-0.5',
          tone === 'rose' ? 'text-rose-600' : 'text-steel-900'
        )}
      >
        {value}
      </div>
    </div>
  );
}

function DestinationChip({
  dest,
  rank,
}: {
  dest: { code: string; tonnage: number; freeDays: number; matches: number };
  rank: number;
}) {
  const rankColor =
    rank === 1
      ? 'bg-emerald-100 text-emerald-700 ring-emerald-300'
      : rank === 2
      ? 'bg-industrial-100 text-industrial-700 ring-industrial-300'
      : 'bg-steel-100 text-steel-600 ring-steel-300';
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-xl px-3 py-1.5 ring-1 text-xs font-semibold',
        rankColor
      )}
    >
      <span className="font-black opacity-60">#{rank}</span>
      <span className="font-bold">{dest.code}</span>
      <span className="opacity-70">{dest.tonnage}T</span>
      <span className="opacity-50">·</span>
      <span className="tabular-nums">{dest.freeDays.toFixed(1)}d free</span>
      <span className="opacity-50">·</span>
      <span>covers {dest.matches}</span>
    </div>
  );
}
