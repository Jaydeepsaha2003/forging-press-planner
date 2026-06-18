import Database from 'better-sqlite3';
import type { Database as Db } from 'better-sqlite3';

// Build-time flag injected by Vite's `define`. When true, the shareable .exe
// boots with empty Presses / Customers / Vendors / Stock-locations so the
// recipient sees a clean slate. Settings defaults still seed so the app works.
declare const __FORGE_BLANK__: boolean | undefined;
const BLANK_BUILD =
  typeof __FORGE_BLANK__ !== 'undefined' && __FORGE_BLANK__ === true;

let dbFilePath = '';

export function getDbPath(): string {
  return dbFilePath;
}

export function initDatabase(dbPath: string): Db {
  dbFilePath = dbPath;
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
  migratePartsToCustomerOnPlan(db);
  addPartSafetyOverrideColumns(db);
  addInterunitStockColumn(db);
  addPlanCreatedAtColumn(db);
  addPartPriceColumn(db);
  addPressShiftCapacityColumns(db);
  seedIfEmpty(db);
  backfillStockLocations(db);
  backfillPartStock(db);

  return db;
}

/** v6: per-piece price on parts → drives Dashboard ₹ KPIs. */
function addPartPriceColumn(db: import('better-sqlite3').Database): void {
  const cols = db.prepare(`PRAGMA table_info(parts)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'price_per_piece')) {
    db.exec(`ALTER TABLE parts ADD COLUMN price_per_piece REAL NOT NULL DEFAULT 0;`);
  }
}

/** v7: shift-wise capacity (day / night) on presses. Total cap/day stays as the sum. */
function addPressShiftCapacityColumns(db: import('better-sqlite3').Database): void {
  const cols = db.prepare(`PRAGMA table_info(presses)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'day_capacity')) {
    // Seed day_capacity from the existing capacity_per_day so totals stay identical
    db.exec(`ALTER TABLE presses ADD COLUMN day_capacity INTEGER NOT NULL DEFAULT 0;`);
    db.exec(`UPDATE presses SET day_capacity = capacity_per_day;`);
  }
  if (!cols.some((c) => c.name === 'night_capacity')) {
    db.exec(`ALTER TABLE presses ADD COLUMN night_capacity INTEGER NOT NULL DEFAULT 0;`);
  }
}

/** v5: FIFO timestamp on production_plans for auto-distribute ordering. */
function addPlanCreatedAtColumn(db: import('better-sqlite3').Database): void {
  const cols = db.prepare(`PRAGMA table_info(production_plans)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'created_at')) {
    db.exec(`ALTER TABLE production_plans ADD COLUMN created_at TEXT;`);
    // Backfill with current timestamp so existing rows have a sortable value
    db.exec(`UPDATE production_plans SET created_at = datetime('now') WHERE created_at IS NULL;`);
  }
}

/** v3: per-part WIP/FG safety-days override (nullable → falls back to global). */
function addPartSafetyOverrideColumns(db: import('better-sqlite3').Database): void {
  const cols = db.prepare(`PRAGMA table_info(parts)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'wip_safety_days')) {
    db.exec(`ALTER TABLE parts ADD COLUMN wip_safety_days REAL;`);
  }
  if (!cols.some((c) => c.name === 'fg_safety_days')) {
    db.exec(`ALTER TABLE parts ADD COLUMN fg_safety_days REAL;`);
  }
}

/** v4: per-month inter-unit (sister branches) stock. */
function addInterunitStockColumn(db: import('better-sqlite3').Database): void {
  const cols = db.prepare(`PRAGMA table_info(part_stock)`).all() as Array<{ name: string }>;
  if (cols.length === 0) return; // table not created yet — runMigrations will handle it
  if (!cols.some((c) => c.name === 'interunit_qty')) {
    db.exec(`ALTER TABLE part_stock ADD COLUMN interunit_qty REAL NOT NULL DEFAULT 0;`);
  }
}

/**
 * Schema v2: parts are global (no customer_id). The customer for an order lives
 * on production_plans instead. Safe to run repeatedly — no-op if already migrated.
 */
function migratePartsToCustomerOnPlan(db: import('better-sqlite3').Database): void {
  const partsCols = db.prepare(`PRAGMA table_info(parts)`).all() as Array<{ name: string }>;
  const planCols = db
    .prepare(`PRAGMA table_info(production_plans)`)
    .all() as Array<{ name: string }>;
  const partsHasCustomer = partsCols.some((c) => c.name === 'customer_id');
  const planHasCustomer = planCols.some((c) => c.name === 'customer_id');

  if (!planHasCustomer) {
    db.exec(`ALTER TABLE production_plans ADD COLUMN customer_id INTEGER REFERENCES customers(id);`);
  }

  if (partsHasCustomer) {
    db.exec('PRAGMA foreign_keys = OFF;');
    const txn = db.transaction(() => {
      // Backfill plan rows with their part's old customer link
      db.exec(`
        UPDATE production_plans
           SET customer_id = (SELECT p.customer_id FROM parts p WHERE p.id = production_plans.part_id)
         WHERE customer_id IS NULL;
      `);

      // De-duplicate parts with the same part_code: keep the lowest id,
      // remap production_plans/relocation_logs/press_assignments to it.
      const duplicates = db
        .prepare(
          `SELECT part_code, MIN(id) as canonical, GROUP_CONCAT(id) as all_ids
           FROM parts GROUP BY part_code HAVING COUNT(*) > 1`
        )
        .all() as Array<{ part_code: string; canonical: number; all_ids: string }>;
      for (const dup of duplicates) {
        const ids = dup.all_ids.split(',').map(Number);
        for (const id of ids) {
          if (id === dup.canonical) continue;
          db.prepare(`UPDATE production_plans SET part_id = ? WHERE part_id = ?`).run(
            dup.canonical,
            id
          );
          db.prepare(`UPDATE relocation_logs SET part_id = ? WHERE part_id = ?`).run(
            dup.canonical,
            id
          );
          db.prepare(`DELETE FROM parts WHERE id = ?`).run(id);
        }
      }

      // Re-create parts table without customer_id and with part_code UNIQUE on its own
      db.exec(`
        CREATE TABLE parts_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          part_code TEXT NOT NULL UNIQUE,
          material_type TEXT NOT NULL DEFAULT 'HW',
          category TEXT NOT NULL DEFAULT 'Fast Runner',
          required_tonnage INTEGER NOT NULL,
          default_press_id INTEGER REFERENCES presses(id) ON DELETE SET NULL,
          is_die_locked INTEGER NOT NULL DEFAULT 0,
          notes TEXT
        );
        INSERT INTO parts_new (id, part_code, material_type, category, required_tonnage, default_press_id, is_die_locked, notes)
          SELECT id, part_code, material_type, category, required_tonnage, default_press_id, is_die_locked, notes FROM parts;
        DROP TABLE parts;
        ALTER TABLE parts_new RENAME TO parts;
      `);
    });
    txn();
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

/**
 * Drops every user table and re-runs migrations + seeds.
 * Keeps the DB file in place (no need to restart the app or rebind IPC handlers).
 */
export function resetDatabase(db: Db): void {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS relocation_logs;
    DROP TABLE IF EXISTS press_assignments;
    DROP TABLE IF EXISTS plan_opening_stocks;
    DROP TABLE IF EXISTS part_stock;
    DROP TABLE IF EXISTS production_plans;
    DROP TABLE IF EXISTS downtime_events;
    DROP TABLE IF EXISTS parts;
    DROP TABLE IF EXISTS customers;
    DROP TABLE IF EXISTS stock_locations;
    DROP TABLE IF EXISTS presses;
    DROP TABLE IF EXISTS vendors;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS settings;
    PRAGMA foreign_keys = ON;
  `);
  runMigrations(db);
  seedIfEmpty(db);
  backfillStockLocations(db);
}

/**
 * Older databases (created before stock_locations existed) may have zero rows.
 * If the table is empty but vendors / presses exist, seed the default locations
 * so the multi-location UI works on day one without recreating the DB.
 */
function backfillStockLocations(db: import('better-sqlite3').Database): void {
  if (BLANK_BUILD) return;
  const c = db.prepare(`SELECT COUNT(*) as c FROM stock_locations`).get() as { c: number };
  if (c.c > 0) return;
  const vendors = db.prepare(`SELECT id, name FROM vendors ORDER BY id`).all() as Array<{
    id: number;
    name: string;
  }>;
  const ins = db.prepare(
    `INSERT INTO stock_locations (name, kind, vendor_id, is_active) VALUES (?,?,?,1)`
  );
  ins.run('HIL FS1 WIP/FG', 'HIL', null);
  ins.run('HIL FS2 WIP/FG', 'HIL', null);
  ins.run('GILL CHOCK', 'External', null);
  vendors.forEach((v, i) => ins.run(`${v.name} Yard`, 'Vendor', v.id));
}

/**
 * Seeds the part_stock table (per part + month, HIL vs outside) from the
 * opening-stock columns already stored on existing plan rows, so legacy plans
 * keep their stock when the new separate-stock workflow takes over. No-op once
 * part_stock has any rows.
 */
function backfillPartStock(db: import('better-sqlite3').Database): void {
  const c = db.prepare(`SELECT COUNT(*) as c FROM part_stock`).get() as { c: number };
  if (c.c > 0) return;
  db.exec(`
    INSERT OR IGNORE INTO part_stock (part_id, month, hil_qty, outside_qty)
      SELECT part_id, month, opening_wip_fg_qty, opening_gill_chock_qty
      FROM production_plans
      WHERE opening_wip_fg_qty > 0 OR opening_gill_chock_qty > 0;
  `);
}

function runMigrations(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      contact_person TEXT,
      phone TEXT,
      email TEXT
    );

    CREATE TABLE IF NOT EXISTS presses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      factory TEXT NOT NULL,
      is_in_house INTEGER NOT NULL DEFAULT 1,
      tonnage INTEGER NOT NULL,
      capacity_per_day INTEGER NOT NULL DEFAULT 0,
      efficiency_pct REAL NOT NULL DEFAULT 85,
      current_status TEXT NOT NULL DEFAULT 'Idle',
      status_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_active INTEGER NOT NULL DEFAULT 1,
      vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
      day_capacity INTEGER NOT NULL DEFAULT 0,
      night_capacity INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      full_name TEXT,
      priority_tier TEXT NOT NULL DEFAULT 'Medium',
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      part_code TEXT NOT NULL UNIQUE,
      material_type TEXT NOT NULL DEFAULT 'HW',
      category TEXT NOT NULL DEFAULT 'Fast Runner',
      required_tonnage INTEGER NOT NULL,
      default_press_id INTEGER REFERENCES presses(id) ON DELETE SET NULL,
      is_die_locked INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      price_per_piece REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS production_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      part_id INTEGER NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      customer_schedule_qty REAL NOT NULL DEFAULT 0,
      wip_safety_stock_qty REAL NOT NULL DEFAULT 0,
      fg_safety_stock_qty REAL NOT NULL DEFAULT 0,
      total_demand_qty REAL NOT NULL DEFAULT 0,
      opening_wip_fg_qty REAL NOT NULL DEFAULT 0,
      opening_gill_chock_qty REAL NOT NULL DEFAULT 0,
      net_prod_plan_qty REAL NOT NULL DEFAULT 0,
      osp_split_qty REAL NOT NULL DEFAULT 0,
      hil_prod_qty REAL NOT NULL DEFAULT 0,
      supply_location TEXT,
      UNIQUE(month, part_id)
    );

    CREATE TABLE IF NOT EXISTS press_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      production_plan_id INTEGER NOT NULL REFERENCES production_plans(id) ON DELETE CASCADE,
      press_id INTEGER NOT NULL REFERENCES presses(id) ON DELETE CASCADE,
      allocated_qty REAL NOT NULL DEFAULT 0,
      required_machine_days REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS downtime_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      press_id INTEGER NOT NULL REFERENCES presses(id) ON DELETE CASCADE,
      start_datetime TEXT NOT NULL,
      end_datetime TEXT,
      reason TEXT NOT NULL,
      notes TEXT,
      expected_restoration_datetime TEXT,
      reported_by INTEGER
    );

    CREATE TABLE IF NOT EXISTS relocation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      triggered_by_downtime_id INTEGER REFERENCES downtime_events(id) ON DELETE SET NULL,
      part_id INTEGER NOT NULL REFERENCES parts(id),
      from_press_id INTEGER NOT NULL REFERENCES presses(id),
      to_press_id INTEGER NOT NULL REFERENCES presses(id),
      qty_moved REAL NOT NULL,
      required_machine_days REAL NOT NULL DEFAULT 0,
      moved_at TEXT NOT NULL DEFAULT (datetime('now')),
      moved_by_user_id INTEGER,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS stock_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL DEFAULT 'HIL',
      vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS plan_opening_stocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      production_plan_id INTEGER NOT NULL REFERENCES production_plans(id) ON DELETE CASCADE,
      location_id INTEGER NOT NULL REFERENCES stock_locations(id) ON DELETE CASCADE,
      qty REAL NOT NULL DEFAULT 0,
      UNIQUE(production_plan_id, location_id)
    );

    CREATE INDEX IF NOT EXISTS idx_plan_stocks_plan ON plan_opening_stocks(production_plan_id);

    -- Opening stock maintained separately per part + month (HIL vs outside).
    -- Plan rows derive their opening_wip_fg_qty / opening_gill_chock_qty from here.
    CREATE TABLE IF NOT EXISTS part_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      part_id INTEGER NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      hil_qty REAL NOT NULL DEFAULT 0,
      outside_qty REAL NOT NULL DEFAULT 0,
      interunit_qty REAL NOT NULL DEFAULT 0,
      UNIQUE(part_id, month)
    );

    CREATE INDEX IF NOT EXISTS idx_part_stock_month ON part_stock(month);

    -- Granular per-press / per-vendor-press stock for a part in a month.
    -- The aggregate columns on part_stock (hil_qty / outside_qty) are kept
    -- in sync by ipc-handlers whenever this table changes.
    CREATE TABLE IF NOT EXISTS part_press_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      part_id INTEGER NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
      press_id INTEGER NOT NULL REFERENCES presses(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      qty REAL NOT NULL DEFAULT 0,
      UNIQUE(part_id, press_id, month)
    );

    CREATE INDEX IF NOT EXISTS idx_part_press_stock_pm ON part_press_stock(part_id, month);
    CREATE INDEX IF NOT EXISTS idx_part_press_stock_press ON part_press_stock(press_id);

    -- Pre-planned maintenance windows. Dashboard shows a banner as the date
    -- approaches and lists affected parts + alternate presses for relocation.
    CREATE TABLE IF NOT EXISTS scheduled_maintenance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      press_id INTEGER NOT NULL REFERENCES presses(id) ON DELETE CASCADE,
      starts_on TEXT NOT NULL,
      ends_on TEXT,
      reason TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'planned',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sched_maint_press ON scheduled_maintenance(press_id);
    CREATE INDEX IF NOT EXISTS idx_sched_maint_date ON scheduled_maintenance(starts_on);

    -- Daily production log per part. The plan grid derives "Produced" and
    -- "Balance" by summing this for the same part + month.
    CREATE TABLE IF NOT EXISTS production_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      part_id INTEGER NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      logged_date TEXT NOT NULL,
      qty_produced REAL NOT NULL DEFAULT 0,
      press_id INTEGER REFERENCES presses(id) ON DELETE SET NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_prodlog_partmonth ON production_logs(part_id, month);
    CREATE INDEX IF NOT EXISTS idx_prodlog_date ON production_logs(logged_date);

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Planner',
      factory TEXT,
      pin_or_password TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_plan_month ON production_plans(month);
    CREATE INDEX IF NOT EXISTS idx_plan_part ON production_plans(part_id);
    CREATE INDEX IF NOT EXISTS idx_assign_plan ON press_assignments(production_plan_id);
    CREATE INDEX IF NOT EXISTS idx_assign_press ON press_assignments(press_id);
    CREATE INDEX IF NOT EXISTS idx_downtime_press ON downtime_events(press_id);
  `);
}

function seedSettingsDefaults(db: Db) {
  const insertSetting = db.prepare(`INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)`);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  insertSetting.run('company_name', BLANK_BUILD ? 'ForgePlanner' : 'HIL ForgePlanner');
  insertSetting.run('default_efficiency_pct', '85');
  insertSetting.run('default_safety_stock_pct', '8.33');
  insertSetting.run('wip_safety_days', '2');
  insertSetting.run('fg_safety_days', '2');
  insertSetting.run('exclude_sundays', '1');
  insertSetting.run('extra_holidays_per_month', '0');
  insertSetting.run('current_month', currentMonth);
  insertSetting.run('logo_data_url', '');
}

function seedIfEmpty(db: Db) {
  const count = db.prepare(`SELECT COUNT(*) as c FROM presses`).get() as { c: number };
  if (count.c > 0) return;

  // Always seed settings defaults so the app has sane preferences
  seedSettingsDefaults(db);

  // Shareable blank build → stop here. No presses, customers, vendors, etc.
  if (BLANK_BUILD) {
    // Still ensure at least one user record exists so the role badge has data
    db.prepare(`INSERT INTO users(name,role,factory) VALUES(?,?,?)`).run('Planner', 'Planner', null);
    return;
  }

  // In-house presses per spec section 2.1
  const presses: Array<{ code: string; factory: 'FS1' | 'FS2'; tonnage: number; cap: number }> = [
    { code: 'FP-01', factory: 'FS1', tonnage: 1000, cap: 1800 },
    { code: 'FP-02', factory: 'FS1', tonnage: 1000, cap: 1800 },
    { code: 'FP-03', factory: 'FS1', tonnage: 1600, cap: 1500 },
    { code: 'FP-04', factory: 'FS1', tonnage: 1000, cap: 1800 },
    { code: 'FP-05', factory: 'FS2', tonnage: 2500, cap: 1200 },
    { code: 'FP-06', factory: 'FS1', tonnage: 600, cap: 2400 },
    { code: 'FP-07', factory: 'FS1', tonnage: 400, cap: 3200 },
    { code: 'FP-08', factory: 'FS2', tonnage: 1600, cap: 1500 },
    { code: 'FP-09', factory: 'FS2', tonnage: 1600, cap: 1500 },
    { code: 'FP-10', factory: 'FS2', tonnage: 1600, cap: 1500 },
    { code: 'FP-11', factory: 'FS2', tonnage: 1600, cap: 0 },
    { code: 'FP-12', factory: 'FS1', tonnage: 600, cap: 2400 },
    { code: 'FP-12A', factory: 'FS1', tonnage: 600, cap: 2400 },
    { code: 'FP-14', factory: 'FS2', tonnage: 600, cap: 2400 },
  ];
  const insertPress = db.prepare(`
    INSERT INTO presses (code, factory, is_in_house, tonnage, capacity_per_day, current_status, vendor_id)
    VALUES (?,?,?,?,?,?,?)
  `);
  for (const p of presses) {
    insertPress.run(p.code, p.factory, 1, p.tonnage, p.cap, p.cap === 0 ? 'Maintenance' : 'Idle', null);
  }

  // Vendors + their presses (placeholder tonnages, user can edit)
  const insertVendor = db.prepare(`INSERT INTO vendors (name) VALUES (?)`);
  const vendors = ['Vendor 1', 'Vendor 2', 'Vendor 3', 'Vendor 4'];
  const vendorIds: number[] = vendors.map((v) => Number(insertVendor.run(v).lastInsertRowid));
  const vendorPressLayout: Array<{ count: number; tonnage: number }> = [
    { count: 4, tonnage: 1000 },
    { count: 2, tonnage: 1600 },
    { count: 4, tonnage: 600 },
    { count: 2, tonnage: 2500 },
  ];
  vendorPressLayout.forEach((vp, vi) => {
    for (let i = 1; i <= vp.count; i++) {
      const code = `V${vi + 1}-P${i}`;
      insertPress.run(code, `Vendor${vi + 1}`, 0, vp.tonnage, 1000, 'Idle', vendorIds[vi]);
    }
  });

  // Customers
  const customers: Array<[string, string | null, string]> = [
    ['HERO', 'Hero MotoCorp', 'Critical'],
    ['MSIL', 'Maruti Suzuki India Ltd', 'Critical'],
    ['GKN', 'GKN', 'High'],
    ['RICO', 'Rico Auto', 'Medium'],
    ['COMER', 'Comer', 'Low'],
    ['KSS', 'KSS', 'Medium'],
    ['Tractor', 'Tractor (Internal Segment)', 'Medium'],
    ['INTER UNIT', 'Inter-Unit Transfer', 'Medium'],
    ['ASTP', null, 'Medium'],
    ['MPOST', null, 'Medium'],
    ['TYSOP', null, 'Medium'],
    ['MNGP', null, 'Medium'],
    ['MSPL', null, 'Medium'],
    ['PNDP', null, 'Medium'],
    ['GLK', null, 'Medium'],
    ['CMPT', null, 'Medium'],
    ['RCPT', null, 'Medium'],
    ['EXPOT', 'Export Segment', 'High'],
    ['EXPT', 'Export Segment', 'High'],
    ['TCKO', null, 'Medium'],
    ['KB', null, 'Medium'],
  ];
  const insertCustomer = db.prepare(`
    INSERT INTO customers (code, full_name, priority_tier) VALUES (?,?,?)
  `);
  for (const [code, name, tier] of customers) insertCustomer.run(code, name, tier);

  // Stock locations — seeded so users can immediately distribute opening stock across places
  const insertLoc = db.prepare(
    `INSERT INTO stock_locations (name, kind, vendor_id, is_active) VALUES (?,?,?,1)`
  );
  insertLoc.run('HIL FS1 WIP/FG', 'HIL', null);
  insertLoc.run('HIL FS2 WIP/FG', 'HIL', null);
  insertLoc.run('GILL CHOCK', 'External', null);
  vendorIds.forEach((vid, i) => {
    insertLoc.run(`Vendor ${i + 1} Yard`, 'Vendor', vid);
  });

  // Default admin user
  db.prepare(`INSERT INTO users(name,role,factory) VALUES(?,?,?)`).run('Planner', 'Planner', null);
  db.prepare(`INSERT INTO users(name,role,factory) VALUES(?,?,?)`).run('Supervisor FS1', 'Supervisor', 'FS1');
  db.prepare(`INSERT INTO users(name,role,factory) VALUES(?,?,?)`).run('Supervisor FS2', 'Supervisor', 'FS2');
  db.prepare(`INSERT INTO users(name,role,factory) VALUES(?,?,?)`).run('Production Head', 'ProductionHead', null);
}
