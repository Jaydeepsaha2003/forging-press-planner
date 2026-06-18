import type { Database } from 'better-sqlite3';

/**
 * Backend planning math — the single source of truth for turning a customer
 * schedule + the part's opening stock into the derived plan figures.
 *
 * Mirrors src/lib/workingDays.ts (renderer live-preview) so the numbers shown
 * while typing match what gets persisted.
 */

export function workingDaysInMonth(
  month: string,
  excludeSundays: boolean,
  extraHolidays: number
): number {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return 26;
  const total = new Date(y, m, 0).getDate();
  let sundays = 0;
  for (let d = 1; d <= total; d++) {
    if (new Date(y, m - 1, d).getDay() === 0) sundays++;
  }
  return Math.max(1, total - (excludeSundays ? sundays : 0) - Math.max(0, extraHolidays));
}

export interface PlanningSettings {
  wipDays: number;
  fgDays: number;
  excludeSundays: boolean;
  extraHolidays: number;
}

export function getPlanningSettings(db: Database): PlanningSettings {
  const get = (k: string, fallback: string): string =>
    (db.prepare('SELECT value FROM settings WHERE key=?').get(k) as { value: string } | undefined)
      ?.value ?? fallback;
  return {
    wipDays: parseFloat(get('wip_safety_days', '2')),
    fgDays: parseFloat(get('fg_safety_days', '2')),
    excludeSundays: get('exclude_sundays', '1') === '1',
    extraHolidays: parseFloat(get('extra_holidays_per_month', '0')),
  };
}

/**
 * Recomputes every derived column on a plan row from its customer schedule,
 * OSP split, and the part's opening stock for that month. Also keeps any
 * existing press assignment's allocated qty + machine-days in sync.
 */
export function recomputePlanDerived(db: Database, planId: number): void {
  const plan = db
    .prepare(
      `SELECT id, part_id, month, customer_schedule_qty as cs, osp_split_qty as osp
       FROM production_plans WHERE id=?`
    )
    .get(planId) as
    | { id: number; part_id: number; month: string; cs: number; osp: number }
    | undefined;
  if (!plan) return;

  const cfg = getPlanningSettings(db);

  // Per-part safety-days override: nulls fall back to the global default.
  const partOverride = db
    .prepare(`SELECT wip_safety_days, fg_safety_days FROM parts WHERE id=?`)
    .get(plan.part_id) as
    | { wip_safety_days: number | null; fg_safety_days: number | null }
    | undefined;
  const wipDays = partOverride?.wip_safety_days ?? cfg.wipDays;
  const fgDays = partOverride?.fg_safety_days ?? cfg.fgDays;

  const wd = workingDaysInMonth(plan.month, cfg.excludeSundays, cfg.extraHolidays);
  const daily = wd > 0 ? plan.cs / wd : 0;
  const wip = daily * wipDays;
  const fg = daily * fgDays;

  const stock = db
    .prepare(
      `SELECT hil_qty, outside_qty, COALESCE(interunit_qty,0) as interunit_qty
       FROM part_stock WHERE part_id=? AND month=?`
    )
    .get(plan.part_id, plan.month) as
    | { hil_qty: number; outside_qty: number; interunit_qty: number }
    | undefined;
  const hilStock = stock?.hil_qty ?? 0;
  const outsideStock = stock?.outside_qty ?? 0;
  const interunitStock = stock?.interunit_qty ?? 0;

  const totalDemand = plan.cs + wip + fg;
  const netPlan = Math.max(0, totalDemand - hilStock - outsideStock - interunitStock);
  const hilProd = Math.max(0, netPlan - plan.osp);

  db.prepare(
    `UPDATE production_plans
       SET wip_safety_stock_qty=?, fg_safety_stock_qty=?, total_demand_qty=?,
           opening_wip_fg_qty=?, opening_gill_chock_qty=?, net_prod_plan_qty=?, hil_prod_qty=?
     WHERE id=?`
  ).run(wip, fg, totalDemand, hilStock, outsideStock, netPlan, hilProd, planId);

  // Keep the assigned press load honest when HIL production changes.
  const asn = db
    .prepare(
      `SELECT pa.id as id, pr.capacity_per_day as cap
       FROM press_assignments pa JOIN presses pr ON pr.id = pa.press_id
       WHERE pa.production_plan_id=?`
    )
    .get(planId) as { id: number; cap: number } | undefined;
  if (asn) {
    const cap = asn.cap || 1;
    const reqDays = hilProd / (cap * 0.85);
    db.prepare(`UPDATE press_assignments SET allocated_qty=?, required_machine_days=? WHERE id=?`).run(
      hilProd,
      reqDays,
      asn.id
    );
  }
}

/** Recompute the plan row (if any) for a given part + month. */
export function recomputePlanForPartMonth(db: Database, partId: number, month: string): void {
  const row = db
    .prepare(`SELECT id FROM production_plans WHERE part_id=? AND month=?`)
    .get(partId, month) as { id: number } | undefined;
  if (row) recomputePlanDerived(db, row.id);
}
