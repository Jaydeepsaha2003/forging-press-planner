import type { Database } from 'better-sqlite3';

/**
 * Seeds a realistic Feb'26-style monthly plan for HIL Forge.
 *
 * 40 parts across 11 customers covering 400T → 2500T presses,
 * realistic schedule quantities (matching the spec's Feb'26 capacity numbers:
 * 600T 107% loaded, 1600T 116%, 2500T 108%), opening stock split across HIL
 * godowns / GILL CHOCK / vendor yards, and a few seeded downtime events so the
 * Dashboard Action Center has live data to render.
 *
 * Idempotent: existing plan rows for the given month are preserved.
 */

interface SamplePart {
  customer: string;
  part_code: string;
  supply: 'FS1' | 'FS2';
  prod_type: 'HW' | 'HWCB' | 'OSP';
  category: 'Fast Runner' | 'Slow Runner';
  tonnage: 400 | 600 | 1000 | 1600 | 2500;
  customer_schedule: number;
  press_code: string | null;
  osp_split: number;
  locations: Array<{ name: string; qty: number }>;
}

const SAMPLES: SamplePart[] = [
  // ─── HERO MotoCorp (Critical · very-high volume · multi-tonnage spread) ─────
  { customer: 'HERO', part_code: '5KBL10031-CRANK ARM',     supply: 'FS1', prod_type: 'HW',   category: 'Fast Runner', tonnage: 1000, customer_schedule: 42000, press_code: 'FP-01', osp_split: 0,    locations: [{ name: 'HIL FS1 WIP/FG', qty: 4200 }, { name: 'GILL CHOCK', qty: 1800 }] },
  { customer: 'HERO', part_code: '5KBL10032-LEVER',         supply: 'FS1', prod_type: 'HW',   category: 'Fast Runner', tonnage: 600,  customer_schedule: 58000, press_code: 'FP-06', osp_split: 8000, locations: [{ name: 'HIL FS1 WIP/FG', qty: 5400 }, { name: 'Vendor 3 Yard', qty: 2200 }] },
  { customer: 'HERO', part_code: '5KBL10033-CONROD',        supply: 'FS1', prod_type: 'HW',   category: 'Fast Runner', tonnage: 1000, customer_schedule: 36000, press_code: 'FP-04', osp_split: 0,    locations: [{ name: 'HIL FS1 WIP/FG', qty: 3800 }, { name: 'GILL CHOCK', qty: 1200 }] },
  { customer: 'HERO', part_code: '5KBL10034-KICK SHAFT',    supply: 'FS1', prod_type: 'HW',   category: 'Fast Runner', tonnage: 600,  customer_schedule: 47000, press_code: 'FP-12', osp_split: 5000, locations: [{ name: 'HIL FS1 WIP/FG', qty: 4900 }] },
  { customer: 'HERO', part_code: '5KBL10035-GEAR-3RD',      supply: 'FS1', prod_type: 'HW',   category: 'Fast Runner', tonnage: 1600, customer_schedule: 22000, press_code: 'FP-03', osp_split: 0,    locations: [{ name: 'HIL FS1 WIP/FG', qty: 2400 }, { name: 'GILL CHOCK', qty: 800 }] },
  { customer: 'HERO', part_code: '5KBL10036-GEAR-5TH',      supply: 'FS1', prod_type: 'HW',   category: 'Fast Runner', tonnage: 1600, customer_schedule: 20500, press_code: 'FP-09', osp_split: 2000, locations: [{ name: 'HIL FS1 WIP/FG', qty: 2200 }] },
  { customer: 'HERO', part_code: '5KBL10037-CAM',           supply: 'FS1', prod_type: 'HW',   category: 'Slow Runner', tonnage: 600,  customer_schedule: 12000, press_code: 'FP-12A', osp_split: 0,   locations: [{ name: 'HIL FS1 WIP/FG', qty: 1400 }] },
  { customer: 'HERO', part_code: '5KBL10038-DRUM HUB',      supply: 'FS1', prod_type: 'HW',   category: 'Fast Runner', tonnage: 1000, customer_schedule: 28000, press_code: 'FP-02', osp_split: 0,    locations: [{ name: 'HIL FS1 WIP/FG', qty: 3000 }, { name: 'GILL CHOCK', qty: 600 }] },

  // ─── MSIL (Critical · large parts on big presses) ──────────────────────────
  { customer: 'MSIL', part_code: 'BG14-PINION GEAR',        supply: 'FS2', prod_type: 'HW',   category: 'Fast Runner', tonnage: 1600, customer_schedule: 24000, press_code: 'FP-08', osp_split: 0,    locations: [{ name: 'HIL FS2 WIP/FG', qty: 3100 }, { name: 'GILL CHOCK', qty: 900 }] },
  { customer: 'MSIL', part_code: 'BG21-DIFF YOKE',          supply: 'FS2', prod_type: 'HW',   category: 'Fast Runner', tonnage: 2500, customer_schedule: 15500, press_code: 'FP-05', osp_split: 0,    locations: [{ name: 'HIL FS2 WIP/FG', qty: 1650 }, { name: 'GILL CHOCK', qty: 450 }] },
  { customer: 'MSIL', part_code: 'BG33-CV YOKE',            supply: 'FS2', prod_type: 'HW',   category: 'Fast Runner', tonnage: 2500, customer_schedule: 11000, press_code: 'FP-05', osp_split: 0,    locations: [{ name: 'HIL FS2 WIP/FG', qty: 1300 }] },
  { customer: 'MSIL', part_code: 'BG42-AXLE FLANGE',        supply: 'FS2', prod_type: 'HW',   category: 'Fast Runner', tonnage: 1600, customer_schedule: 18000, press_code: 'FP-10', osp_split: 2500, locations: [{ name: 'HIL FS2 WIP/FG', qty: 2000 }, { name: 'Vendor 2 Yard', qty: 800 }] },
  { customer: 'MSIL', part_code: 'BG51-PINION SHAFT',       supply: 'FS2', prod_type: 'HW',   category: 'Slow Runner', tonnage: 1600, customer_schedule: 8500,  press_code: 'FP-08', osp_split: 0,    locations: [{ name: 'HIL FS2 WIP/FG', qty: 900 }] },

  // ─── GKN (High · mostly HWCB — supplied to CB vendor) ──────────────────────
  { customer: 'GKN',  part_code: 'GKN-AXLE SHAFT 88',       supply: 'FS1', prod_type: 'HWCB', category: 'Fast Runner', tonnage: 1600, customer_schedule: 19000, press_code: 'FP-09', osp_split: 0,    locations: [{ name: 'HIL FS1 WIP/FG', qty: 2100 }, { name: 'Vendor 2 Yard', qty: 1400 }] },
  { customer: 'GKN',  part_code: 'GKN-AXLE SHAFT 92',       supply: 'FS1', prod_type: 'HWCB', category: 'Fast Runner', tonnage: 1600, customer_schedule: 15500, press_code: 'FP-10', osp_split: 0,    locations: [{ name: 'HIL FS1 WIP/FG', qty: 1800 }, { name: 'Vendor 2 Yard', qty: 700 }] },
  { customer: 'GKN',  part_code: 'GKN-DIFF SIDE GEAR',      supply: 'FS1', prod_type: 'HWCB', category: 'Slow Runner', tonnage: 1000, customer_schedule: 7000,  press_code: 'FP-04', osp_split: 0,    locations: [{ name: 'HIL FS1 WIP/FG', qty: 800 }] },

  // ─── RICO Auto (Medium) ────────────────────────────────────────────────────
  { customer: 'RICO', part_code: 'RICO-FLANGE 4WD',         supply: 'FS1', prod_type: 'HW',   category: 'Fast Runner', tonnage: 1000, customer_schedule: 13000, press_code: 'FP-02', osp_split: 2000, locations: [{ name: 'HIL FS1 WIP/FG', qty: 1200 }, { name: 'Vendor 1 Yard', qty: 800 }] },
  { customer: 'RICO', part_code: 'RICO-FLANGE 2WD',         supply: 'FS1', prod_type: 'HW',   category: 'Fast Runner', tonnage: 1000, customer_schedule: 10500, press_code: 'FP-04', osp_split: 0,    locations: [{ name: 'HIL FS1 WIP/FG', qty: 1100 }] },

  // ─── KSS (Medium · small parts on 400T-600T) ──────────────────────────────
  { customer: 'KSS',  part_code: 'KSS-BALL STUD',           supply: 'FS1', prod_type: 'HW',   category: 'Slow Runner', tonnage: 400,  customer_schedule: 9500,  press_code: 'FP-07', osp_split: 0,    locations: [{ name: 'HIL FS1 WIP/FG', qty: 950 }] },
  { customer: 'KSS',  part_code: 'KSS-TIE ROD END',         supply: 'FS1', prod_type: 'HW',   category: 'Slow Runner', tonnage: 600,  customer_schedule: 6500,  press_code: 'FP-14', osp_split: 0,    locations: [{ name: 'HIL FS2 WIP/FG', qty: 700 }] },

  // ─── COMER (Low · slow runner) ────────────────────────────────────────────
  { customer: 'COMER', part_code: 'COM-HUB-SP',             supply: 'FS2', prod_type: 'HW',   category: 'Slow Runner', tonnage: 600,  customer_schedule: 5200,  press_code: 'FP-14', osp_split: 0,    locations: [{ name: 'HIL FS2 WIP/FG', qty: 600 }] },

  // ─── Tractor (Medium · large heavy parts) ─────────────────────────────────
  { customer: 'Tractor', part_code: 'TR-STEER ARM',         supply: 'FS1', prod_type: 'HW',   category: 'Fast Runner', tonnage: 1600, customer_schedule: 17000, press_code: 'FP-03', osp_split: 3000, locations: [{ name: 'HIL FS1 WIP/FG', qty: 1800 }, { name: 'GILL CHOCK', qty: 600 }] },
  { customer: 'Tractor', part_code: 'TR-DRAG LINK',         supply: 'FS1', prod_type: 'HW',   category: 'Fast Runner', tonnage: 1000, customer_schedule: 14500, press_code: 'FP-01', osp_split: 0,    locations: [{ name: 'HIL FS1 WIP/FG', qty: 1500 }] },
  { customer: 'Tractor', part_code: 'TR-PINION TRACTOR',    supply: 'FS2', prod_type: 'HW',   category: 'Slow Runner', tonnage: 2500, customer_schedule: 6500,  press_code: 'FP-05', osp_split: 0,    locations: [{ name: 'HIL FS2 WIP/FG', qty: 700 }] },

  // ─── INTER UNIT transfers ─────────────────────────────────────────────────
  { customer: 'INTER UNIT', part_code: 'IU-FLANGE PRE',     supply: 'FS1', prod_type: 'HW',   category: 'Slow Runner', tonnage: 1000, customer_schedule: 4800,  press_code: 'FP-02', osp_split: 0,    locations: [{ name: 'HIL FS1 WIP/FG', qty: 600 }] },
  { customer: 'INTER UNIT', part_code: 'IU-RING PRE',       supply: 'FS2', prod_type: 'HW',   category: 'Slow Runner', tonnage: 1600, customer_schedule: 3800,  press_code: 'FP-10', osp_split: 0,    locations: [{ name: 'HIL FS2 WIP/FG', qty: 450 }] },

  // ─── Export segment ───────────────────────────────────────────────────────
  { customer: 'EXPOT', part_code: 'EXP-CONROD M12',         supply: 'FS2', prod_type: 'OSP',  category: 'Slow Runner', tonnage: 1000, customer_schedule: 7000,  press_code: null,   osp_split: 7000, locations: [{ name: 'Vendor 4 Yard', qty: 800 }] },
  { customer: 'EXPOT', part_code: 'EXP-WHEEL HUB EU',       supply: 'FS2', prod_type: 'OSP',  category: 'Slow Runner', tonnage: 1600, customer_schedule: 5500,  press_code: null,   osp_split: 5500, locations: [{ name: 'Vendor 2 Yard', qty: 600 }] },
  { customer: 'EXPT',  part_code: 'EXPT-AXLE NA',           supply: 'FS2', prod_type: 'HW',   category: 'Slow Runner', tonnage: 1600, customer_schedule: 6000,  press_code: 'FP-10', osp_split: 1500, locations: [{ name: 'HIL FS2 WIP/FG', qty: 700 }, { name: 'Vendor 2 Yard', qty: 400 }] },

  // ─── Smaller / lower-volume customers ─────────────────────────────────────
  { customer: 'ASTP',  part_code: 'AST-FORK SHIFT',         supply: 'FS1', prod_type: 'HW',   category: 'Slow Runner', tonnage: 600,  customer_schedule: 4400,  press_code: 'FP-12', osp_split: 0,    locations: [{ name: 'HIL FS1 WIP/FG', qty: 500 }] },
  { customer: 'MPOST', part_code: 'MP-COVER PLATE',         supply: 'FS1', prod_type: 'HW',   category: 'Slow Runner', tonnage: 600,  customer_schedule: 3800,  press_code: 'FP-12A', osp_split: 0,   locations: [{ name: 'HIL FS1 WIP/FG', qty: 450 }] },
  { customer: 'TYSOP', part_code: 'TYS-PINION T-OP',        supply: 'FS2', prod_type: 'HW',   category: 'Slow Runner', tonnage: 1000, customer_schedule: 5200,  press_code: 'FP-04', osp_split: 1000, locations: [{ name: 'HIL FS1 WIP/FG', qty: 550 }] },
  { customer: 'MNGP',  part_code: 'MNG-DRIVE GEAR',         supply: 'FS2', prod_type: 'HW',   category: 'Slow Runner', tonnage: 1600, customer_schedule: 4900,  press_code: 'FP-08', osp_split: 0,    locations: [{ name: 'HIL FS2 WIP/FG', qty: 550 }] },
  { customer: 'MSPL',  part_code: 'MSPL-LEVER ARM',         supply: 'FS1', prod_type: 'HW',   category: 'Slow Runner', tonnage: 600,  customer_schedule: 3200,  press_code: 'FP-14', osp_split: 0,    locations: [{ name: 'HIL FS2 WIP/FG', qty: 400 }] },
  { customer: 'PNDP',  part_code: 'PND-DOG CLUTCH',         supply: 'FS1', prod_type: 'HW',   category: 'Slow Runner', tonnage: 1000, customer_schedule: 3000,  press_code: 'FP-04', osp_split: 0,    locations: [{ name: 'HIL FS1 WIP/FG', qty: 350 }] },
  { customer: 'GLK',   part_code: 'GLK-BEVEL GEAR',         supply: 'FS2', prod_type: 'HW',   category: 'Slow Runner', tonnage: 1600, customer_schedule: 2800,  press_code: 'FP-09', osp_split: 0,    locations: [{ name: 'HIL FS2 WIP/FG', qty: 300 }] },
  { customer: 'CMPT',  part_code: 'CMP-RACE',               supply: 'FS1', prod_type: 'HW',   category: 'Slow Runner', tonnage: 400,  customer_schedule: 4200,  press_code: 'FP-07', osp_split: 0,    locations: [{ name: 'HIL FS1 WIP/FG', qty: 480 }] },
  { customer: 'RCPT',  part_code: 'RC-CV STUB',             supply: 'FS1', prod_type: 'HW',   category: 'Slow Runner', tonnage: 1000, customer_schedule: 4600,  press_code: 'FP-02', osp_split: 0,    locations: [{ name: 'HIL FS1 WIP/FG', qty: 500 }] },
  { customer: 'TCKO',  part_code: 'TCK-TROD',               supply: 'FS1', prod_type: 'HW',   category: 'Slow Runner', tonnage: 600,  customer_schedule: 3600,  press_code: 'FP-06', osp_split: 0,    locations: [{ name: 'HIL FS1 WIP/FG', qty: 400 }] },
  { customer: 'KB',    part_code: 'KB-PLATE 22',            supply: 'FS1', prod_type: 'HW',   category: 'Slow Runner', tonnage: 600,  customer_schedule: 2800,  press_code: 'FP-12', osp_split: 0,    locations: [{ name: 'HIL FS1 WIP/FG', qty: 300 }] },
];

interface SampleDowntime {
  press_code: string;
  reason: 'Electrical' | 'Hydraulic' | 'Mechanical' | 'Die' | 'Operator' | 'Power' | 'Other';
  notes: string;
  hoursAgoStarted: number;
  hoursAgoClosed: number | null; // null = still down
  expected_in_hours: number | null;
}

const SAMPLE_DOWNTIME: SampleDowntime[] = [
  // One currently-Down press so the Action Center has something to show
  {
    press_code: 'FP-08',
    reason: 'Hydraulic',
    notes: 'Main ram oil leak — shop-floor maintenance investigating, seal replacement underway',
    hoursAgoStarted: 4,
    hoursAgoClosed: null,
    expected_in_hours: 18,
  },
  // One closed event from yesterday for the downtime log to look populated
  {
    press_code: 'FP-03',
    reason: 'Die',
    notes: 'Die change overran — replaced cracked upper die insert. Resumed Running.',
    hoursAgoStarted: 30,
    hoursAgoClosed: 26,
    expected_in_hours: null,
  },
  {
    press_code: 'FP-06',
    reason: 'Power',
    notes: 'Plant-wide power dip — back online in 35 min',
    hoursAgoStarted: 72,
    hoursAgoClosed: 71.4,
    expected_in_hours: null,
  },
];

function workingDays(month: string, excludeSundays: boolean, extraHolidays: number): number {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return 26;
  const total = new Date(y, m, 0).getDate();
  let sundays = 0;
  for (let d = 1; d <= total; d++) {
    if (new Date(y, m - 1, d).getDay() === 0) sundays++;
  }
  return Math.max(1, total - (excludeSundays ? sundays : 0) - Math.max(0, extraHolidays));
}

export function seedSampleData(db: Database, month: string): { rows: number; downtime: number } {
  const getSetting = (k: string, fallback: string) => {
    const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k) as
      | { value: string }
      | undefined;
    return r?.value ?? fallback;
  };
  const wipDays = parseFloat(getSetting('wip_safety_days', '2'));
  const fgDays = parseFloat(getSetting('fg_safety_days', '2'));
  const excludeSundays = getSetting('exclude_sundays', '1') === '1';
  const extraHolidays = parseFloat(getSetting('extra_holidays_per_month', '0'));
  const wd = workingDays(month, excludeSundays, extraHolidays);

  const customers = db
    .prepare('SELECT id, code FROM customers')
    .all() as Array<{ id: number; code: string }>;
  const presses = db
    .prepare('SELECT id, code, tonnage, capacity_per_day FROM presses WHERE is_in_house=1')
    .all() as Array<{ id: number; code: string; tonnage: number; capacity_per_day: number }>;
  const locations = db
    .prepare('SELECT id, name, kind FROM stock_locations')
    .all() as Array<{ id: number; name: string; kind: string }>;

  const cId = (code: string) => customers.find((c) => c.code === code)?.id;
  const pId = (code: string) => presses.find((p) => p.code === code);
  const lId = (name: string) => locations.find((l) => l.name === name)?.id;

  const insertCustomer = db.prepare(
    `INSERT OR IGNORE INTO customers (code, priority_tier) VALUES (?, 'Medium')`
  );
  const insertPart = db.prepare(
    `INSERT OR IGNORE INTO parts (part_code, material_type, category, required_tonnage)
     VALUES (?,?,?,?)`
  );
  const updatePart = db.prepare(
    `UPDATE parts SET material_type=?, category=?, required_tonnage=?, price_per_piece=? WHERE id=?`
  );
  const getPart = db.prepare(`SELECT id FROM parts WHERE part_code=?`);
  const checkPlan = db.prepare(`SELECT id FROM production_plans WHERE month=? AND part_id=?`);
  const upsertPlan = db.prepare(`
    INSERT INTO production_plans
      (month, part_id, customer_id, customer_schedule_qty, wip_safety_stock_qty, fg_safety_stock_qty,
       total_demand_qty, opening_wip_fg_qty, opening_gill_chock_qty,
       net_prod_plan_qty, osp_split_qty, hil_prod_qty, supply_location)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(month, part_id) DO UPDATE SET
      customer_id=excluded.customer_id,
      customer_schedule_qty=excluded.customer_schedule_qty,
      wip_safety_stock_qty=excluded.wip_safety_stock_qty,
      fg_safety_stock_qty=excluded.fg_safety_stock_qty,
      total_demand_qty=excluded.total_demand_qty,
      opening_wip_fg_qty=excluded.opening_wip_fg_qty,
      opening_gill_chock_qty=excluded.opening_gill_chock_qty,
      net_prod_plan_qty=excluded.net_prod_plan_qty,
      osp_split_qty=excluded.osp_split_qty,
      hil_prod_qty=excluded.hil_prod_qty,
      supply_location=excluded.supply_location
    RETURNING id
  `);
  const deleteStocks = db.prepare(`DELETE FROM plan_opening_stocks WHERE production_plan_id=?`);
  const insertStock = db.prepare(
    `INSERT INTO plan_opening_stocks (production_plan_id, location_id, qty) VALUES (?,?,?)`
  );
  const upsertPartStock = db.prepare(`
    INSERT INTO part_stock (part_id, month, hil_qty, outside_qty) VALUES (?,?,?,?)
    ON CONFLICT(part_id, month) DO UPDATE SET hil_qty=excluded.hil_qty, outside_qty=excluded.outside_qty
  `);
  const deleteAssignments = db.prepare(`DELETE FROM press_assignments WHERE production_plan_id=?`);
  const insertAssignment = db.prepare(
    `INSERT INTO press_assignments (production_plan_id, press_id, allocated_qty, required_machine_days) VALUES (?,?,?,?)`
  );

  let createdCount = 0;
  const txn = db.transaction(() => {
    for (const s of SAMPLES) {
      let customerId = cId(s.customer);
      if (!customerId) {
        insertCustomer.run(s.customer);
        customerId = (
          db.prepare('SELECT id FROM customers WHERE code=?').get(s.customer) as
            | { id: number }
            | undefined
        )?.id;
        if (!customerId) continue;
      }

      insertPart.run(s.part_code, s.prod_type, s.category, s.tonnage);
      const partRow = getPart.get(s.part_code) as { id: number } | undefined;
      if (!partRow) continue;
      // Indicative ₹/piece by tonnage — bigger forgings cost more
      const samplePrice =
        s.tonnage === 2500 ? 285
        : s.tonnage === 1600 ? 165
        : s.tonnage === 1000 ? 95
        : s.tonnage === 600 ? 55
        : 28;
      updatePart.run(s.prod_type, s.category, s.tonnage, samplePrice, partRow.id);

      // Idempotent: don't overwrite existing month/part rows the user has edited
      const existing = checkPlan.get(month, partRow.id);
      if (existing) continue;

      const daily = s.customer_schedule / wd;
      const wip = daily * wipDays;
      const fg = daily * fgDays;
      const totalDemand = s.customer_schedule + wip + fg;
      const openingTotal = s.locations.reduce((sum, l) => sum + l.qty, 0);
      const openingHil = s.locations
        .filter((l) => locations.find((loc) => loc.name === l.name)?.kind === 'HIL')
        .reduce((sum, l) => sum + l.qty, 0);
      const openingOther = openingTotal - openingHil;
      const netPlan = Math.max(0, totalDemand - openingTotal);
      const hilProd = Math.max(0, netPlan - s.osp_split);

      const planRow = upsertPlan.get(
        month,
        partRow.id,
        customerId,
        s.customer_schedule,
        wip,
        fg,
        totalDemand,
        openingHil,
        openingOther,
        netPlan,
        s.osp_split,
        hilProd,
        s.supply
      ) as { id: number } | undefined;
      if (!planRow) continue;

      deleteStocks.run(planRow.id);
      for (const loc of s.locations) {
        const locId = lId(loc.name);
        if (locId) insertStock.run(planRow.id, locId, loc.qty);
      }
      // Keep the separate per-part stock store in sync (HIL vs outside)
      upsertPartStock.run(partRow.id, month, openingHil, openingOther);

      deleteAssignments.run(planRow.id);
      if (s.press_code) {
        const press = pId(s.press_code);
        if (press) {
          const capDay = press.capacity_per_day || 1;
          const reqDays = hilProd / (capDay * 0.85);
          insertAssignment.run(planRow.id, press.id, hilProd, reqDays);
        }
      }

      createdCount++;
    }

    // Downtime events — only seed if no events exist yet so we don't pile up
    const dtCount = (
      db.prepare(`SELECT COUNT(*) as c FROM downtime_events`).get() as { c: number }
    ).c;
    if (dtCount === 0) {
      const insertDt = db.prepare(`
        INSERT INTO downtime_events (press_id, start_datetime, end_datetime, reason, notes, expected_restoration_datetime)
        VALUES (?,?,?,?,?,?)
      `);
      const setPressStatus = db.prepare(
        `UPDATE presses SET current_status=?, status_changed_at=? WHERE id=?`
      );
      const now = Date.now();
      for (const dt of SAMPLE_DOWNTIME) {
        const press = pId(dt.press_code);
        if (!press) continue;
        const startIso = new Date(now - dt.hoursAgoStarted * 3600000)
          .toISOString()
          .replace('T', ' ')
          .slice(0, 19);
        const endIso =
          dt.hoursAgoClosed !== null
            ? new Date(now - dt.hoursAgoClosed * 3600000)
                .toISOString()
                .replace('T', ' ')
                .slice(0, 19)
            : null;
        const expectedIso =
          dt.expected_in_hours !== null
            ? new Date(now + dt.expected_in_hours * 3600000)
                .toISOString()
                .replace('T', ' ')
                .slice(0, 19)
            : null;
        insertDt.run(press.id, startIso, endIso, dt.reason, dt.notes, expectedIso);
        if (endIso === null) {
          // Press is currently Down
          setPressStatus.run('Down', startIso, press.id);
        }
      }
    }
  });
  txn();

  return { rows: createdCount, downtime: SAMPLE_DOWNTIME.length };
}
