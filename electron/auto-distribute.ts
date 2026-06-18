import type { Database } from 'better-sqlite3';
import type {
  AllocationPlan,
  AllocationPreview,
  PressTier,
  PriorityTier,
} from '../shared/types';
import { workingDaysInMonth, getPlanningSettings } from './planning';

/**
 * Auto-distributor — assigns each plan row's HIL production qty to compatible
 * presses, in three tiers:
 *
 *   Tier 1 · In-house (factory FS1 / FS2)
 *   Tier 2 · Inter-unit / sister branches (factory InterUnit)
 *   Tier 3 · Vendor / OSP (any vendor press)
 *
 * Within each tier, presses are tried in order of:
 *   1. Exact tonnage match (preferred over over-spec'd presses)
 *   2. Most free machine-days available
 *
 * Plan rows are processed in FIFO order, with customer priority tier as the
 * primary key (Critical → High → Medium → Low) and created_at as tiebreaker —
 * so HERO/MSIL never get bumped by a Slow Runner that was added later.
 *
 * The preview is a pure calculation (no DB writes). Apply runs the same
 * algorithm and persists the assignments.
 */

const PRIORITY_RANK: Record<PriorityTier, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

interface PressCapacity {
  id: number;
  code: string;
  tonnage: number;
  factory: string;
  vendor_name: string | null;
  tier: PressTier;
  capacity_per_day: number;
  efficiency_pct: number;
  available_days: number; // Calendar days available this month
  used_days: number; // Days already consumed by allocations in this run
}

interface PlanCandidate {
  plan_id: number;
  part_id: number;
  part_code: string;
  customer_code: string;
  priority_tier: PriorityTier;
  required_tonnage: number;
  is_die_locked: 0 | 1;
  default_press_id: number | null;
  hil_prod_qty: number;
  created_at: string;
}

function tierFor(factory: string, isInHouse: number): PressTier {
  if (isInHouse !== 1) return 'vendor';
  if (factory === 'InterUnit') return 'inter_unit';
  return 'in_house';
}

function buildPressPool(db: Database, month: string, workingDays: number): PressCapacity[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.code, p.tonnage, p.factory, p.is_in_house, p.capacity_per_day,
              p.efficiency_pct, p.current_status, v.name as vendor_name,
              COALESCE((SELECT SUM(pa.required_machine_days)
                        FROM press_assignments pa
                        JOIN production_plans pp ON pp.id = pa.production_plan_id
                        WHERE pa.press_id = p.id AND pp.month = ?), 0) as used_days
       FROM presses p
       LEFT JOIN vendors v ON v.id = p.vendor_id
       WHERE p.is_active = 1
         AND p.current_status NOT IN ('Down', 'Maintenance')
         AND p.capacity_per_day > 0`
    )
    .all(month) as Array<{
    id: number;
    code: string;
    tonnage: number;
    factory: string;
    is_in_house: number;
    capacity_per_day: number;
    efficiency_pct: number;
    current_status: string;
    vendor_name: string | null;
    used_days: number;
  }>;

  return rows.map((r) => {
    const tier = tierFor(r.factory, r.is_in_house);
    // Approximate monthly capacity: working days for in-house/inter-unit,
    // 30 days for vendor presses (they typically run all days).
    const availableDays = tier === 'vendor' ? 30 : workingDays;
    return {
      id: r.id,
      code: r.code,
      tonnage: r.tonnage,
      factory: r.factory,
      vendor_name: r.vendor_name,
      tier,
      capacity_per_day: r.capacity_per_day,
      efficiency_pct: r.efficiency_pct,
      available_days: availableDays,
      used_days: 0, // We track *new* usage from this allocation run only
    };
  });
}

function listPlanCandidates(db: Database, month: string): PlanCandidate[] {
  return db
    .prepare(
      `SELECT pp.id as plan_id, pp.part_id, p.part_code,
              COALESCE(c.code, '—') as customer_code,
              COALESCE(c.priority_tier, 'Medium') as priority_tier,
              p.required_tonnage, p.is_die_locked, p.default_press_id,
              pp.hil_prod_qty, COALESCE(pp.created_at, '1970-01-01') as created_at
       FROM production_plans pp
       JOIN parts p ON p.id = pp.part_id
       LEFT JOIN customers c ON c.id = pp.customer_id
       WHERE pp.month = ? AND pp.hil_prod_qty > 0
       ORDER BY
         CASE COALESCE(c.priority_tier, 'Medium')
           WHEN 'Critical' THEN 0
           WHEN 'High' THEN 1
           WHEN 'Medium' THEN 2
           WHEN 'Low' THEN 3
         END,
         pp.created_at,
         pp.id`
    )
    .all(month) as PlanCandidate[];
}

function pickPress(
  pool: PressCapacity[],
  tier: PressTier,
  part: PlanCandidate
): PressCapacity | null {
  // Filter the pool to presses in this tier that match this part's constraints
  const candidates = pool.filter((p) => {
    if (p.tier !== tier) return false;
    if (p.tonnage < part.required_tonnage) return false;
    if (part.is_die_locked && p.id !== part.default_press_id) return false;
    return p.available_days - p.used_days > 0.0001;
  });
  if (candidates.length === 0) return null;
  // Prefer exact tonnage match; then prefer the press with the most remaining capacity
  candidates.sort((a, b) => {
    const aExact = a.tonnage === part.required_tonnage ? 0 : 1;
    const bExact = b.tonnage === part.required_tonnage ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    const aFree = a.available_days - a.used_days;
    const bFree = b.available_days - b.used_days;
    return bFree - aFree;
  });
  return candidates[0];
}

function allocateOne(part: PlanCandidate, pool: PressCapacity[]): AllocationPlan {
  let remaining = part.hil_prod_qty;
  const assignments: AllocationPlan['assignments'] = [];

  const tiers: PressTier[] = ['in_house', 'inter_unit', 'vendor'];

  for (const tier of tiers) {
    while (remaining > 0.0001) {
      const press = pickPress(pool, tier, part);
      if (!press) break;
      const effectiveCapPerDay = press.capacity_per_day * (press.efficiency_pct / 100);
      const freeDays = press.available_days - press.used_days;
      const daysNeeded = remaining / effectiveCapPerDay;
      const daysToUse = Math.min(daysNeeded, freeDays);
      const qtyForPress = daysToUse * effectiveCapPerDay;
      if (qtyForPress < 1) break; // Avoid infinite loops on rounding edges
      assignments.push({
        press_id: press.id,
        press_code: press.code,
        tier,
        factory: press.factory,
        vendor_name: press.vendor_name,
        qty: qtyForPress,
        days: daysToUse,
      });
      press.used_days += daysToUse;
      remaining -= qtyForPress;
    }
    if (remaining <= 0.0001) break;
  }

  return {
    plan_id: part.plan_id,
    part_id: part.part_id,
    part_code: part.part_code,
    customer_code: part.customer_code,
    priority_tier: part.priority_tier,
    hil_prod_qty: part.hil_prod_qty,
    assignments,
    unallocated_qty: Math.max(0, remaining),
  };
}

function summarize(rows: AllocationPlan[]): AllocationPreview['summary'] {
  let qtyInHouse = 0;
  let qtyInterUnit = 0;
  let qtyVendor = 0;
  let qtyUnalloc = 0;
  let full = 0;
  let partial = 0;
  let unalloc = 0;
  for (const r of rows) {
    for (const a of r.assignments) {
      if (a.tier === 'in_house') qtyInHouse += a.qty;
      else if (a.tier === 'inter_unit') qtyInterUnit += a.qty;
      else qtyVendor += a.qty;
    }
    qtyUnalloc += r.unallocated_qty;
    if (r.unallocated_qty <= 0.0001) full++;
    else if (r.assignments.length > 0) partial++;
    else unalloc++;
  }
  return {
    parts_total: rows.length,
    parts_fully_allocated: full,
    parts_partial: partial,
    parts_unallocated: unalloc,
    qty_total: rows.reduce((s, r) => s + r.hil_prod_qty, 0),
    qty_in_house: qtyInHouse,
    qty_inter_unit: qtyInterUnit,
    qty_vendor: qtyVendor,
    qty_unallocated: qtyUnalloc,
  };
}

export function previewAutoDistribute(db: Database, month: string): AllocationPreview {
  const cfg = getPlanningSettings(db);
  const wd = workingDaysInMonth(month, cfg.excludeSundays, cfg.extraHolidays);
  const pool = buildPressPool(db, month, wd);
  const candidates = listPlanCandidates(db, month);
  const rows = candidates.map((c) => allocateOne(c, pool));
  return { month, rows, summary: summarize(rows) };
}

export function applyAutoDistribute(db: Database, month: string): AllocationPreview {
  const preview = previewAutoDistribute(db, month);
  const txn = db.transaction(() => {
    // Wipe previous assignments for plan rows in this month so re-running is clean
    db.prepare(
      `DELETE FROM press_assignments
       WHERE production_plan_id IN (SELECT id FROM production_plans WHERE month=?)`
    ).run(month);

    const ins = db.prepare(
      `INSERT INTO press_assignments (production_plan_id, press_id, allocated_qty, required_machine_days)
       VALUES (?,?,?,?)`
    );
    for (const row of preview.rows) {
      for (const a of row.assignments) {
        ins.run(row.plan_id, a.press_id, a.qty, a.days);
      }
    }
  });
  txn();
  return preview;
}
