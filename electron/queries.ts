import type { Database } from 'better-sqlite3';
import type {
  BreakdownImpactCustomer,
  BreakdownImpactPart,
  CapacitySummary,
  CustomerRisk,
  DashboardKPIs,
  PlanRow,
  PressWithLoad,
  RelocationCandidate,
  RelocationSuggestion,
  Tonnage,
} from '../shared/types';
import { getPlanningSettings, workingDaysInMonth } from './planning';

const TONNAGES: Tonnage[] = [400, 600, 1000, 1600, 2500];

// Available machine-days per Feb'26 numbers from the spec (Section 2.1).
// These are *tonnage-class totals* (sum across every press of that tonnage),
// used only by the aggregate capacity-by-tonnage view — never per single press.
export const AVAILABLE_DAYS_BY_TONNAGE: Record<Tonnage, number> = {
  400: 25,
  600: 288,
  1000: 96,
  1600: 72,
  2500: 96,
};

/** Machine-days a single press can run in the month = the working-day calendar. */
function availableDaysPerPress(db: Database, month: string): number {
  const cfg = getPlanningSettings(db);
  return workingDaysInMonth(month, cfg.excludeSundays, cfg.extraHolidays);
}

export function getSetting(db: Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(db: Database, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run(key, value);
}

export function listPressesWithLoad(db: Database, month: string): PressWithLoad[] {
  const rows = db
    .prepare(
      `
      SELECT
        p.*,
        v.name as vendor_name,
        COALESCE(SUM(CASE WHEN pp.month = ? THEN pa.required_machine_days ELSE 0 END), 0) as required_machine_days
      FROM presses p
      LEFT JOIN vendors v ON v.id = p.vendor_id
      LEFT JOIN press_assignments pa ON pa.press_id = p.id
      LEFT JOIN production_plans pp ON pp.id = pa.production_plan_id
      GROUP BY p.id
      ORDER BY p.is_in_house DESC, p.code
      `
    )
    .all(month) as Array<PressWithLoad & { required_machine_days: number }>;

  // Each press's available machine-days = the month's working-day calendar
  // (e.g. ~26 days), NOT the tonnage-class total. This is what makes a single
  // press's load % meaningful (and able to exceed 100% when overbooked).
  const available = availableDaysPerPress(db, month);

  return rows.map((r) => {
    const load_pct = available > 0 ? Math.min(999, (r.required_machine_days / available) * 100) : 0;
    return {
      ...r,
      available_machine_days: available,
      load_pct,
      current_part_code: getTopPartForPress(db, r.id, month),
    };
  });
}

function getTopPartForPress(db: Database, pressId: number, month: string): string | null {
  const row = db
    .prepare(
      `
      SELECT p.part_code
      FROM press_assignments pa
      JOIN production_plans pp ON pp.id = pa.production_plan_id
      JOIN parts p ON p.id = pp.part_id
      WHERE pa.press_id = ? AND pp.month = ?
      ORDER BY pa.required_machine_days DESC
      LIMIT 1
      `
    )
    .get(pressId, month) as { part_code: string } | undefined;
  return row?.part_code ?? null;
}

export function listPlanRows(db: Database, month: string): PlanRow[] {
  return db
    .prepare(
      `
      SELECT
        pp.id,
        pp.month,
        c.code as customer_code,
        c.full_name as customer_name,
        c.priority_tier,
        p.part_code,
        p.id as part_id,
        pp.supply_location,
        p.material_type,
        p.category,
        pp.customer_schedule_qty,
        pp.wip_safety_stock_qty,
        pp.fg_safety_stock_qty,
        pp.total_demand_qty,
        pp.opening_wip_fg_qty,
        pp.opening_gill_chock_qty,
        pp.net_prod_plan_qty,
        pp.osp_split_qty,
        pp.hil_prod_qty,
        p.required_tonnage,
        pr.code as assigned_press_code,
        pr.id as assigned_press_id,
        COALESCE(pa.required_machine_days, 0) as required_machine_days,
        COALESCE(pr.capacity_per_day, 0) as capacity_per_day,
        p.is_die_locked
      FROM production_plans pp
      JOIN parts p ON p.id = pp.part_id
      LEFT JOIN customers c ON c.id = pp.customer_id
      LEFT JOIN press_assignments pa ON pa.production_plan_id = pp.id
      LEFT JOIN presses pr ON pr.id = pa.press_id
      WHERE pp.month = ?
      ORDER BY COALESCE(c.priority_tier,'ZZZ'), COALESCE(c.code,'ZZZ'), p.part_code
      `
    )
    .all(month) as PlanRow[];
}

export function listPlanMonths(db: Database): string[] {
  const rows = db
    .prepare('SELECT DISTINCT month FROM production_plans ORDER BY month DESC')
    .all() as Array<{ month: string }>;
  return rows.map((r) => r.month);
}

export function dashboardKpis(db: Database, month: string): DashboardKPIs {
  const totals = db
    .prepare(
      `
      SELECT
        COALESCE(SUM(pp.total_demand_qty),0) as total_demand_qty,
        COALESCE(SUM(pp.hil_prod_qty),0) as in_house_qty,
        COALESCE(SUM(pp.osp_split_qty),0) as osp_qty,
        COUNT(DISTINCT pp.part_id) as part_count
      FROM production_plans pp
      WHERE pp.month = ?
      `
    )
    .get(month) as {
    total_demand_qty: number;
    in_house_qty: number;
    osp_qty: number;
    part_count: number;
  };

  const customer = db
    .prepare(
      `
      SELECT COUNT(DISTINCT pp.customer_id) as customer_count
      FROM production_plans pp
      WHERE pp.month = ? AND pp.customer_id IS NOT NULL
      `
    )
    .get(month) as { customer_count: number };

  const risk = computeAtRiskTotals(db, month);

  // Total order value = Σ (customer_schedule × price_per_piece) across the month
  const valueRow = db
    .prepare(
      `SELECT COALESCE(SUM(pp.customer_schedule_qty * COALESCE(p.price_per_piece, 0)), 0) as v
       FROM production_plans pp
       JOIN parts p ON p.id = pp.part_id
       WHERE pp.month = ?`
    )
    .get(month) as { v: number };

  const total = totals.total_demand_qty || 0;
  return {
    total_demand_qty: total,
    in_house_qty: totals.in_house_qty,
    osp_qty: totals.osp_qty,
    at_risk_qty: risk.qty,
    in_house_pct: total > 0 ? (totals.in_house_qty / total) * 100 : 0,
    osp_pct: total > 0 ? (totals.osp_qty / total) * 100 : 0,
    part_count: totals.part_count,
    customer_count: customer.customer_count,
    total_order_value: valueRow.v || 0,
    at_risk_value: risk.value,
  };
}

function computeAtRiskTotals(
  db: Database,
  month: string
): { qty: number; value: number } {
  const row = db
    .prepare(
      `
      SELECT
        COALESCE(SUM(pa.allocated_qty), 0) as qty,
        COALESCE(SUM(pa.allocated_qty * COALESCE(p.price_per_piece, 0)), 0) as value
      FROM press_assignments pa
      JOIN production_plans pp ON pp.id = pa.production_plan_id AND pp.month = ?
      JOIN parts p ON p.id = pp.part_id
      JOIN presses pr ON pr.id = pa.press_id
      WHERE pr.current_status IN ('Down','Maintenance')
      `
    )
    .get(month) as { qty: number; value: number };
  return { qty: row.qty || 0, value: row.value || 0 };
}

export function capacitySummary(db: Database, month: string): CapacitySummary[] {
  // Available = (active in-house presses of that tonnage) × working days,
  // so the aggregate bars stay consistent with each press's load on the tiles.
  const wd = availableDaysPerPress(db, month);
  const reqStmt = db.prepare(
    `SELECT COALESCE(SUM(pa.required_machine_days),0) as req
     FROM press_assignments pa
     JOIN production_plans pp ON pp.id = pa.production_plan_id AND pp.month = ?
     JOIN presses pr ON pr.id = pa.press_id
     WHERE pr.tonnage = ? AND pr.is_in_house = 1`
  );
  const countStmt = db.prepare(
    `SELECT COUNT(*) as c FROM presses WHERE tonnage = ? AND is_in_house = 1 AND is_active = 1`
  );
  return TONNAGES.map<CapacitySummary>((t) => {
    const required = (reqStmt.get(month, t) as { req: number }).req || 0;
    const pressCount = (countStmt.get(t) as { c: number }).c;
    const available = pressCount * wd;
    return {
      tonnage: t,
      required_days: required,
      available_days: available,
      utilization_pct: available > 0 ? (required / available) * 100 : 0,
    };
  });
}

export function customerRisk(db: Database, month: string): CustomerRisk[] {
  const rows = db
    .prepare(
      `
      SELECT
        c.id as customer_id,
        c.code as customer_code,
        c.full_name as customer_name,
        c.priority_tier,
        COALESCE(SUM(pp.total_demand_qty),0) as total_demand,
        COALESCE(SUM(pp.hil_prod_qty + pp.osp_split_qty),0) as planned,
        COALESCE(SUM(CASE WHEN pr.current_status IN ('Down','Maintenance') THEN pa.allocated_qty ELSE 0 END),0) as at_risk
      FROM customers c
      LEFT JOIN production_plans pp ON pp.customer_id = c.id AND pp.month = ?
      LEFT JOIN press_assignments pa ON pa.production_plan_id = pp.id
      LEFT JOIN presses pr ON pr.id = pa.press_id
      GROUP BY c.id
      HAVING total_demand > 0
      ORDER BY
        CASE c.priority_tier
          WHEN 'Critical' THEN 1
          WHEN 'High' THEN 2
          WHEN 'Medium' THEN 3
          WHEN 'Low' THEN 4
        END,
        at_risk DESC
      `
    )
    .all(month) as Array<
    Omit<CustomerRisk, 'risk_pct' | 'reasons'> & { total_demand: number; planned: number; at_risk: number }
  >;

  return rows.map((r) => ({
    ...r,
    risk_pct: r.total_demand > 0 ? (r.at_risk / r.total_demand) * 100 : 0,
    reasons: r.at_risk > 0 ? ['Assigned press currently Down/Maintenance'] : [],
  }));
}

/**
 * For the Customer Impact panel on the Dashboard: returns every customer
 * with at least one part stuck on a Down/Prevention press for the given
 * month, with affected part details and top-3 alternate presses per part.
 */
export function customerBreakdownImpact(
  db: Database,
  month: string
): BreakdownImpactCustomer[] {
  // Step 1: find affected parts
  const rows = db
    .prepare(
      `SELECT
         pp.customer_id as customer_id,
         COALESCE(c.code, '—') as customer_code,
         c.full_name as customer_name,
         COALESCE(c.priority_tier, 'Medium') as priority_tier,
         pp.part_id as part_id,
         p.part_code as part_code,
         p.required_tonnage as required_tonnage,
         COALESCE(p.price_per_piece, 0) as price_per_piece,
         pa.allocated_qty as planned,
         pr.code as press_code,
         pr.current_status as press_status,
         COALESCE((SELECT SUM(qty_produced) FROM production_logs
                   WHERE part_id = pp.part_id AND month = pp.month), 0) as produced
       FROM press_assignments pa
       JOIN production_plans pp ON pp.id = pa.production_plan_id
       JOIN parts p ON p.id = pp.part_id
       JOIN presses pr ON pr.id = pa.press_id
       LEFT JOIN customers c ON c.id = pp.customer_id
       WHERE pp.month = ?
         AND pr.current_status IN ('Down','Maintenance')
         AND pp.customer_id IS NOT NULL`
    )
    .all(month) as Array<{
    customer_id: number;
    customer_code: string;
    customer_name: string | null;
    priority_tier: 'Critical' | 'High' | 'Medium' | 'Low';
    part_id: number;
    part_code: string;
    required_tonnage: number;
    price_per_piece: number;
    planned: number;
    press_code: string;
    press_status: 'Down' | 'Maintenance';
    produced: number;
  }>;

  if (rows.length === 0) return [];

  // Step 2: precompute press usage map for alternates calc
  const altStmt = db.prepare(
    `SELECT p.code, p.tonnage, p.is_in_house, v.name as vendor_name,
            COALESCE((SELECT SUM(pa.required_machine_days)
                      FROM press_assignments pa
                      JOIN production_plans pp ON pp.id = pa.production_plan_id
                      WHERE pa.press_id = p.id AND pp.month = ?), 0) as used
     FROM presses p
     LEFT JOIN vendors v ON v.id = p.vendor_id
     WHERE p.is_active = 1
       AND p.tonnage >= ?
       AND p.code != ?
       AND p.current_status NOT IN ('Down','Maintenance')
       AND p.capacity_per_day > 0
     ORDER BY (p.tonnage - ?) ASC, p.is_in_house DESC
     LIMIT 5`
  );

  // Step 3: group by customer, build affected_parts with alternates + value
  const byCustomer = new Map<number, BreakdownImpactCustomer>();
  for (const r of rows) {
    const remaining = Math.max(0, r.planned - r.produced);
    if (remaining <= 0) continue;
    const altRows = altStmt.all(
      month,
      r.required_tonnage,
      r.press_code,
      r.required_tonnage
    ) as Array<{
      code: string;
      tonnage: number;
      is_in_house: 0 | 1;
      vendor_name: string | null;
      used: number;
    }>;
    const alts = altRows.map((a) => {
      const cap = a.is_in_house ? 24 : 30;
      return {
        press_code: a.code,
        tonnage: a.tonnage,
        is_in_house: a.is_in_house,
        vendor_name: a.vendor_name,
        free_days: Math.max(0, cap - a.used),
      };
    });

    const part: BreakdownImpactPart = {
      part_id: r.part_id,
      part_code: r.part_code,
      required_tonnage: r.required_tonnage,
      qty_at_risk: remaining,
      value_at_risk: remaining * (r.price_per_piece || 0),
      produced: r.produced,
      planned: r.planned,
      press_code: r.press_code,
      press_status: r.press_status,
      alternates: alts,
    };

    if (!byCustomer.has(r.customer_id)) {
      byCustomer.set(r.customer_id, {
        customer_id: r.customer_id,
        customer_code: r.customer_code,
        customer_name: r.customer_name,
        priority_tier: r.priority_tier,
        total_qty_at_risk: 0,
        total_value_at_risk: 0,
        affected_parts: [],
      });
    }
    const c = byCustomer.get(r.customer_id)!;
    c.affected_parts.push(part);
    c.total_qty_at_risk += part.qty_at_risk;
    c.total_value_at_risk += part.value_at_risk;
  }

  const list = Array.from(byCustomer.values());
  list.sort((a, b) => {
    const order = { Critical: 0, High: 1, Medium: 2, Low: 3 } as const;
    const t = order[a.priority_tier] - order[b.priority_tier];
    if (t !== 0) return t;
    return b.total_value_at_risk - a.total_value_at_risk;
  });
  for (const c of list) {
    c.affected_parts.sort((a, b) => b.value_at_risk - a.value_at_risk);
  }
  return list;
}

export function suggestRelocation(
  db: Database,
  partId: number,
  fromPressId: number,
  month: string
): RelocationCandidate[] {
  const part = db
    .prepare(
      `
      SELECT p.*, pp.supply_location
      FROM parts p
      LEFT JOIN production_plans pp ON pp.part_id = p.id AND pp.month = ?
      WHERE p.id = ?
      `
    )
    .get(month, partId) as
    | {
        id: number;
        required_tonnage: number;
        is_die_locked: number;
        default_press_id: number | null;
        supply_location: string | null;
      }
    | undefined;
  if (!part) return [];

  const presses = listPressesWithLoad(db, month).filter(
    (p) =>
      p.id !== fromPressId &&
      ['Running', 'Setup', 'Idle'].includes(p.current_status) &&
      p.tonnage >= part.required_tonnage &&
      (!part.is_die_locked || p.id === part.default_press_id) &&
      p.is_active
  );

  const candidates: RelocationCandidate[] = presses.map((p) => {
    const free = Math.max(0, p.available_machine_days - p.required_machine_days);
    const reasons: string[] = [];
    let score = 0;
    if (p.tonnage === part.required_tonnage) {
      score += 1000;
      reasons.push('Exact tonnage match');
    } else {
      score += 500;
      reasons.push(`Higher tonnage (${p.tonnage}T)`);
    }
    if (p.is_in_house) {
      score += 200;
      reasons.push('In-house press');
    }
    if (part.supply_location && p.factory === part.supply_location) {
      score += 100;
      reasons.push('Same factory');
    }
    score += free * 10;
    if (free > 0) reasons.push(`${free.toFixed(1)} days free`);
    return { press: p, score, reasons, free_days: free };
  });

  return candidates.sort((a, b) => b.score - a.score).slice(0, 3);
}

export function buildRelocationSuggestions(
  db: Database,
  fromPressId: number,
  month: string
): RelocationSuggestion[] {
  const affectedRows = db
    .prepare(
      `
      SELECT pp.part_id as part_id
      FROM press_assignments pa
      JOIN production_plans pp ON pp.id = pa.production_plan_id AND pp.month = ?
      WHERE pa.press_id = ?
      `
    )
    .all(month, fromPressId) as Array<{ part_id: number }>;

  const allPlans = listPlanRows(db, month);
  const suggestions: RelocationSuggestion[] = [];
  for (const a of affectedRows) {
    const planRow = allPlans.find((p) => p.part_id === a.part_id && p.assigned_press_id === fromPressId);
    if (!planRow) continue;
    suggestions.push({
      plan_row: planRow,
      candidates: suggestRelocation(db, a.part_id, fromPressId, month),
    });
  }
  return suggestions;
}
