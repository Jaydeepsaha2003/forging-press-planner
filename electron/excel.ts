import ExcelJS from 'exceljs';
import type { Database } from 'better-sqlite3';
import type { ImportResult, MaterialType, PartCategory, Tonnage } from '../shared/types';
import { recomputePlanDerived, recomputePlanForPartMonth } from './planning';

const TONNAGE_VALUES: Tonnage[] = [400, 600, 1000, 1600, 2500];

function toNumber(v: ExcelJS.CellValue): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }
  if (typeof v === 'object' && 'result' in v) return toNumber((v as { result: ExcelJS.CellValue }).result);
  return 0;
}

function toStr(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && 'text' in v) return String((v as { text: string }).text).trim();
  if (typeof v === 'object' && 'result' in v)
    return toStr((v as { result: ExcelJS.CellValue }).result);
  return String(v).trim();
}

function nearestTonnage(n: number): Tonnage {
  let best: Tonnage = 600;
  let bestDiff = Infinity;
  for (const t of TONNAGE_VALUES) {
    const d = Math.abs(t - n);
    if (d < bestDiff) {
      bestDiff = d;
      best = t;
    }
  }
  return best;
}

function detectMaterialType(s: string): MaterialType {
  const u = s.toUpperCase();
  if (u.includes('HWCB')) return 'HWCB';
  if (u.includes('OSP')) return 'OSP';
  return 'HW';
}

function detectCategory(s: string): PartCategory {
  const u = s.toUpperCase();
  if (u.includes('SLOW')) return 'Slow Runner';
  return 'Fast Runner';
}

interface ImportContext {
  warnings: string[];
  imported: number;
  skipped: number;
}

export async function importMonthlyPlan(
  db: Database,
  filePath: string,
  month: string
): Promise<ImportResult> {
  const ctx: ImportContext = { warnings: [], imported: 0, skipped: 0 };
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  // Find the largest sheet that looks like a monthly plan
  let sheet: ExcelJS.Worksheet | undefined;
  for (const ws of wb.worksheets) {
    if (ws.rowCount < 5) continue;
    // Look for the header row by scanning the first 20 rows for "Customer"
    for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
      const row = ws.getRow(r);
      const labels: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => labels.push(toStr(cell.value).toLowerCase()));
      const joined = labels.join('|');
      if (joined.includes('customer') && (joined.includes('part') || joined.includes('part name'))) {
        sheet = ws;
        break;
      }
    }
    if (sheet) break;
  }

  if (!sheet) {
    return {
      ok: false,
      message: 'Could not find a sheet with a recognizable header row (Customer + Part Name).',
      imported_rows: 0,
      skipped_rows: 0,
      warnings: [],
    };
  }

  const headerRowIdx = locateHeaderRow(sheet);
  if (headerRowIdx === -1) {
    return {
      ok: false,
      message: 'Header row not located.',
      imported_rows: 0,
      skipped_rows: 0,
      warnings: [],
    };
  }
  const headers = readHeaders(sheet, headerRowIdx);

  const col = (...names: string[]): number => {
    for (const n of names) {
      const key = n.toLowerCase().replace(/\s+/g, ' ').trim();
      for (const [c, h] of headers.entries()) {
        const h2 = h.toLowerCase().replace(/\s+/g, ' ').trim();
        if (h2 === key || h2.includes(key)) return c;
      }
    }
    return -1;
  };

  const cCustomer = col('customer');
  const cPart = col('part name', 'part');
  const cSupply = col('supply plan location', 'supply location');
  const cMm = col('prod type', 'mm');
  const cCategory = col('category');
  const cCustSch = col('customer sch', 'schedule');
  const cWip = col('wip safety');
  const cFg = col('fg safety');
  const cWipFg = col('total wip', 'wip as on');
  const cGill = col('gill chock', 'gill');
  const cNetPlan = col('total prod plan', 'prod plan');
  const cOsp = col('osp');
  // Real sheets label the in-house column "INHOUSE TOTAL PROD." — accept that too.
  const cHil = col('hil total prod', 'hil prod', 'inhouse total prod', 'inhouse', 'in house');
  const cTonnage = col('forge press', 'tonnage');
  const cCapDay = col('capacity /day', 'capacity/day', 'capacity per day', 'capacity');
  const cSupplyFp = col('supply plan fp', 'fp#', 'press');
  // Real sheets have a typo "Required M/s days" — match loosely.
  const cMcDays = col('required m/', 'm/c days', 'm/s days', 'machine days', 'mc days');

  if (cCustomer === -1 || cPart === -1) {
    return {
      ok: false,
      message: 'Required columns Customer and Part not found.',
      imported_rows: 0,
      skipped_rows: 0,
      warnings: [],
    };
  }

  const insertCustomer = db.prepare(
    `INSERT OR IGNORE INTO customers (code, priority_tier) VALUES (?, 'Medium')`
  );
  const getCustomer = db.prepare(`SELECT id FROM customers WHERE code = ?`);
  const insertPart = db.prepare(
    `INSERT OR IGNORE INTO parts (part_code, material_type, category, required_tonnage)
     VALUES (?, ?, ?, ?)`
  );
  const updatePart = db.prepare(
    `UPDATE parts SET material_type = ?, category = ?, required_tonnage = ? WHERE id = ?`
  );
  const getPart = db.prepare(`SELECT id FROM parts WHERE part_code = ?`);
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
  const getPress = db.prepare(`SELECT id, capacity_per_day FROM presses WHERE code = ?`);
  const upsertPartStock = db.prepare(`
    INSERT INTO part_stock (part_id, month, hil_qty, outside_qty) VALUES (?,?,?,?)
    ON CONFLICT(part_id, month) DO UPDATE SET hil_qty=excluded.hil_qty, outside_qty=excluded.outside_qty
  `);
  const deleteAssignments = db.prepare(`DELETE FROM press_assignments WHERE production_plan_id = ?`);
  const insertAssignment = db.prepare(
    `INSERT INTO press_assignments (production_plan_id, press_id, allocated_qty, required_machine_days)
     VALUES (?,?,?,?)`
  );
  const updatePressCap = db.prepare(`UPDATE presses SET capacity_per_day = ? WHERE id = ?`);

  const txn = db.transaction((rowsToProcess: number) => {
    for (let r = headerRowIdx + 1; r <= sheet!.rowCount && r <= headerRowIdx + rowsToProcess; r++) {
      const row = sheet!.getRow(r);
      // Read a cell only when its column was located (-1 = not found) to avoid bad lookups.
      const gv = (c: number): ExcelJS.CellValue => (c !== -1 ? row.getCell(c).value : undefined);
      const customerCode = toStr(gv(cCustomer));
      const partCode = toStr(gv(cPart));
      if (!customerCode || !partCode || partCode.toLowerCase() === 'total') {
        continue;
      }

      insertCustomer.run(customerCode);
      const customerRow = getCustomer.get(customerCode) as { id: number } | undefined;
      if (!customerRow) {
        ctx.skipped++;
        continue;
      }
      const customerId = customerRow.id;

      const matType: MaterialType = detectMaterialType(toStr(gv(cMm)));
      const category: PartCategory = detectCategory(toStr(gv(cCategory)));
      const tonnageVal = toNumber(gv(cTonnage));
      const tonnage: Tonnage = tonnageVal > 0 ? nearestTonnage(tonnageVal) : 600;

      insertPart.run(partCode, matType, category, tonnage);
      const partRow = getPart.get(partCode) as { id: number } | undefined;
      if (!partRow) {
        ctx.skipped++;
        continue;
      }
      const partId = partRow.id;
      updatePart.run(matType, category, tonnage, partId);

      // Auto-calculate WIP/FG safety stock if missing from sheet (8.33% default)
      const custSch = toNumber(gv(cCustSch));
      const wipFromSheet = toNumber(gv(cWip));
      const fgFromSheet = toNumber(gv(cFg));
      const wip = wipFromSheet > 0 ? wipFromSheet : custSch * 0.0833;
      const fg = fgFromSheet > 0 ? fgFromSheet : custSch * 0.0833;
      // Total demand is always schedule + safety; "Total" sheet columns are unreliable.
      const total = custSch + wip + fg;
      const openWip = toNumber(gv(cWipFg));
      const openGill = toNumber(gv(cGill));

      const planResult = upsertPlan.get(
        month,
        partId,
        customerId,
        custSch,
        wip,
        fg,
        total,
        openWip,
        openGill,
        toNumber(gv(cNetPlan)),
        toNumber(gv(cOsp)),
        toNumber(gv(cHil)),
        toStr(gv(cSupply))
      ) as { id: number } | undefined;
      if (!planResult) {
        ctx.skipped++;
        continue;
      }
      const planId = planResult.id;
      // Mirror opening stock into the separate per-part store
      upsertPartStock.run(partId, month, openWip, openGill);
      deleteAssignments.run(planId);

      const pressCode = toStr(gv(cSupplyFp));
      const reqMcDays = toNumber(gv(cMcDays));
      const hilQty = toNumber(gv(cHil));
      const capDay = toNumber(gv(cCapDay));

      if (pressCode) {
        const codes = pressCode.split(/[,/&+]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
        for (const code of codes) {
          let pressRow = getPress.get(code) as { id: number; capacity_per_day: number } | undefined;
          if (!pressRow) {
            // Try with FP- prefix or strip leading zeros
            const alt = code.replace(/^FP-?0*/, 'FP-');
            pressRow = getPress.get(alt) as { id: number; capacity_per_day: number } | undefined;
          }
          if (pressRow) {
            const share = 1 / codes.length;
            if (capDay > 0) updatePressCap.run(capDay, pressRow.id);
            // Fall back to deriving machine-days from HIL qty ÷ (cap × 85%) when the
            // sheet has no usable machine-days column.
            const effCap = capDay > 0 ? capDay : pressRow.capacity_per_day;
            const days =
              reqMcDays > 0
                ? reqMcDays
                : effCap > 0
                ? hilQty / (effCap * 0.85)
                : 0;
            insertAssignment.run(planId, pressRow.id, hilQty * share, days * share);
          } else {
            ctx.warnings.push(`Press not found: ${code} (part ${partCode})`);
          }
        }
      }

      ctx.imported++;
    }
  });

  txn(sheet.rowCount);

  return {
    ok: true,
    message: `Imported ${ctx.imported} plan rows for ${month}.`,
    imported_rows: ctx.imported,
    skipped_rows: ctx.skipped,
    warnings: ctx.warnings.slice(0, 30),
  };
}

function locateHeaderRow(sheet: ExcelJS.Worksheet): number {
  for (let r = 1; r <= Math.min(25, sheet.rowCount); r++) {
    const row = sheet.getRow(r);
    let foundCustomer = false;
    let foundPart = false;
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = toStr(cell.value).toLowerCase();
      if (v === 'customer') foundCustomer = true;
      if (v.startsWith('part')) foundPart = true;
    });
    if (foundCustomer && foundPart) return r;
  }
  return -1;
}

/** Build a fuzzy column finder over a header map (exact then substring match). */
function buildColFinder(headers: Map<number, string>) {
  return (...names: string[]): number => {
    for (const n of names) {
      const key = n.toLowerCase().replace(/\s+/g, ' ').trim();
      for (const [c, h] of headers.entries()) {
        const h2 = h.toLowerCase().replace(/\s+/g, ' ').trim();
        if (h2 === key || h2.includes(key)) return c;
      }
    }
    return -1;
  };
}

/** Scan every worksheet's first 25 rows for a header row matching a predicate. */
function findSheetAndHeader(
  wb: ExcelJS.Workbook,
  predicate: (labels: string[]) => boolean
): { sheet: ExcelJS.Worksheet; headerRowIdx: number } | null {
  for (const ws of wb.worksheets) {
    if (ws.rowCount < 2) continue;
    for (let r = 1; r <= Math.min(25, ws.rowCount); r++) {
      const labels: string[] = [];
      ws.getRow(r).eachCell({ includeEmpty: false }, (cell) =>
        labels.push(toStr(cell.value).toLowerCase())
      );
      if (predicate(labels)) return { sheet: ws, headerRowIdx: r };
    }
  }
  return null;
}

/**
 * Bulk-import opening stock (HIL + outside) per part for a month.
 * Expected columns: Part Code · HIL Stock · Outside Stock.
 * Matches existing parts by code; unknown parts are reported as warnings.
 */
export async function importPartStock(
  db: Database,
  filePath: string,
  month: string
): Promise<ImportResult> {
  const warnings: string[] = [];
  let imported = 0;
  let skipped = 0;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const found = findSheetAndHeader(wb, (labels) => {
    const joined = labels.join('|');
    return joined.includes('part') && (joined.includes('hil') || joined.includes('stock'));
  });
  if (!found) {
    return {
      ok: false,
      message: 'Could not find a sheet with Part + Stock columns (Part Code, HIL Stock, Outside Stock).',
      imported_rows: 0,
      skipped_rows: 0,
      warnings: [],
    };
  }

  const { sheet, headerRowIdx } = found;
  const headers = readHeaders(sheet, headerRowIdx);
  const col = buildColFinder(headers);
  const cPart = col('part code', 'part name', 'part');
  const cHil = col('hil stock', 'hil', 'wip/fg', 'wip');
  const cOutside = col('outside stock', 'outside', 'gill', 'vendor', 'osp stock');

  if (cPart === -1 || (cHil === -1 && cOutside === -1)) {
    return {
      ok: false,
      message: 'Required columns not found. Need Part Code and at least one of HIL Stock / Outside Stock.',
      imported_rows: 0,
      skipped_rows: 0,
      warnings: [],
    };
  }

  const getPart = db.prepare(`SELECT id FROM parts WHERE part_code = ?`);
  const upsert = db.prepare(`
    INSERT INTO part_stock (part_id, month, hil_qty, outside_qty)
    VALUES (?,?,?,?)
    ON CONFLICT(part_id, month) DO UPDATE SET hil_qty=excluded.hil_qty, outside_qty=excluded.outside_qty
  `);

  const txn = db.transaction(() => {
    for (let r = headerRowIdx + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const partCode = toStr(row.getCell(cPart).value);
      if (!partCode || partCode.toLowerCase() === 'total') continue;
      const part = getPart.get(partCode) as { id: number } | undefined;
      if (!part) {
        warnings.push(`Part not found: ${partCode}`);
        skipped++;
        continue;
      }
      const hil = cHil !== -1 ? toNumber(row.getCell(cHil).value) : 0;
      const outside = cOutside !== -1 ? toNumber(row.getCell(cOutside).value) : 0;
      upsert.run(part.id, month, hil, outside);
      recomputePlanForPartMonth(db, part.id, month);
      imported++;
    }
  });
  txn();

  return {
    ok: true,
    message: `Updated stock for ${imported} part(s) in ${month}.`,
    imported_rows: imported,
    skipped_rows: skipped,
    warnings: warnings.slice(0, 30),
  };
}

/**
 * Bulk-import customer schedules — the "simple" flow. Expected columns:
 * Customer · Part · Customer Schedule (and optional OSP). Everything else
 * (safety stock, demand, net plan, HIL prod) is auto-derived from the part's
 * stock and settings.
 */
export async function importSchedules(
  db: Database,
  filePath: string,
  month: string
): Promise<ImportResult> {
  const warnings: string[] = [];
  let imported = 0;
  let skipped = 0;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const found = findSheetAndHeader(wb, (labels) => {
    const joined = labels.join('|');
    return (
      joined.includes('customer') &&
      joined.includes('part') &&
      (joined.includes('sch') || joined.includes('qty') || joined.includes('demand'))
    );
  });
  if (!found) {
    return {
      ok: false,
      message: 'Could not find a sheet with Customer + Part + Schedule columns.',
      imported_rows: 0,
      skipped_rows: 0,
      warnings: [],
    };
  }

  const { sheet, headerRowIdx } = found;
  const headers = readHeaders(sheet, headerRowIdx);
  const col = buildColFinder(headers);
  const cCustomer = col('customer');
  const cPart = col('part code', 'part name', 'part');
  const cSch = col('customer sch', 'schedule', 'sch', 'demand qty', 'qty');
  const cOsp = col('osp');
  const cSupply = col('supply plan location', 'supply location', 'supply');

  if (cCustomer === -1 || cPart === -1 || cSch === -1) {
    return {
      ok: false,
      message: 'Required columns Customer, Part and Customer Schedule not found.',
      imported_rows: 0,
      skipped_rows: 0,
      warnings: [],
    };
  }

  const insertCustomer = db.prepare(
    `INSERT OR IGNORE INTO customers (code, priority_tier) VALUES (?, 'Medium')`
  );
  const getCustomer = db.prepare(`SELECT id FROM customers WHERE code = ?`);
  const insertPart = db.prepare(
    `INSERT OR IGNORE INTO parts (part_code, required_tonnage) VALUES (?, 600)`
  );
  const getPart = db.prepare(`SELECT id FROM parts WHERE part_code = ?`);
  const upsertPlan = db.prepare(`
    INSERT INTO production_plans (month, part_id, customer_id, customer_schedule_qty, osp_split_qty, supply_location)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(month, part_id) DO UPDATE SET
      customer_id=excluded.customer_id,
      customer_schedule_qty=excluded.customer_schedule_qty,
      osp_split_qty=excluded.osp_split_qty,
      supply_location=COALESCE(NULLIF(excluded.supply_location,''), production_plans.supply_location)
    RETURNING id
  `);

  const txn = db.transaction(() => {
    for (let r = headerRowIdx + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const customerCode = toStr(row.getCell(cCustomer).value);
      const partCode = toStr(row.getCell(cPart).value);
      if (!customerCode || !partCode || partCode.toLowerCase() === 'total') continue;

      insertCustomer.run(customerCode);
      const customer = getCustomer.get(customerCode) as { id: number } | undefined;
      if (!customer) {
        skipped++;
        continue;
      }
      const newPart = insertPart.run(partCode);
      if (newPart.changes > 0) warnings.push(`New part created (600T default): ${partCode}`);
      const part = getPart.get(partCode) as { id: number } | undefined;
      if (!part) {
        skipped++;
        continue;
      }

      const sch = toNumber(row.getCell(cSch).value);
      const osp = cOsp !== -1 ? toNumber(row.getCell(cOsp).value) : 0;
      const supply = cSupply !== -1 ? toStr(row.getCell(cSupply).value) : '';
      const plan = upsertPlan.get(month, part.id, customer.id, sch, osp, supply) as
        | { id: number }
        | undefined;
      if (!plan) {
        skipped++;
        continue;
      }
      recomputePlanDerived(db, plan.id);
      imported++;
    }
  });
  txn();

  return {
    ok: true,
    message: `Imported ${imported} schedule row(s) for ${month}.`,
    imported_rows: imported,
    skipped_rows: skipped,
    warnings: warnings.slice(0, 30),
  };
}

/**
 * Export a stock sheet for the month (also serves as a fill-in template):
 * Part Code · HIL Stock · Outside Stock, prefilled with current values.
 */
export async function exportPartStock(
  db: Database,
  filePath: string,
  month: string
): Promise<{ ok: boolean; message: string; path: string }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HIL ForgePlanner';
  wb.created = new Date();
  const ws = wb.addWorksheet(`Stock ${month}`);
  ws.columns = [
    { header: 'Part Code', key: 'part', width: 28 },
    { header: 'HIL Stock', key: 'hil', width: 16 },
    { header: 'Outside Stock', key: 'outside', width: 16 },
  ];
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 26;

  const rows = db
    .prepare(
      `SELECT p.part_code as part,
              COALESCE(ps.hil_qty,0) as hil,
              COALESCE(ps.outside_qty,0) as outside
       FROM parts p
       LEFT JOIN part_stock ps ON ps.part_id = p.id AND ps.month = ?
       ORDER BY p.part_code`
    )
    .all(month) as Array<{ part: string; hil: number; outside: number }>;

  rows.forEach((r) => ws.addRow({ part: r.part, hil: r.hil, outside: r.outside }));
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  await wb.xlsx.writeFile(filePath);
  return { ok: true, message: `Exported stock for ${rows.length} parts.`, path: filePath };
}

function readHeaders(sheet: ExcelJS.Worksheet, rowIdx: number): Map<number, string> {
  const map = new Map<number, string>();
  const row = sheet.getRow(rowIdx);
  for (let c = 1; c <= sheet.columnCount; c++) {
    const v = toStr(row.getCell(c).value);
    if (v) map.set(c, v);
  }
  return map;
}

export async function exportMonthlyPlan(
  db: Database,
  filePath: string,
  month: string
): Promise<{ ok: boolean; message: string; path: string }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HIL ForgePlanner';
  wb.created = new Date();
  const ws = wb.addWorksheet(`Plan ${month}`);

  ws.columns = [
    { header: 'S.NO', key: 'sno', width: 6 },
    { header: 'Customer', key: 'customer', width: 14 },
    { header: 'Part Name', key: 'part', width: 22 },
    { header: 'Supply plan location', key: 'supply', width: 16 },
    { header: 'Prod Type', key: 'mm', width: 10 },
    { header: 'Category', key: 'category', width: 14 },
    { header: `Customer Sch. ${month}`, key: 'cs', width: 16 },
    { header: 'WIP Safety Stock', key: 'wip', width: 14 },
    { header: 'FG Safety stk', key: 'fg', width: 14 },
    { header: 'Total', key: 'total', width: 12 },
    { header: 'Total WIP as on date + FG', key: 'open_wf', width: 18 },
    { header: 'GILL CHOCK', key: 'gill', width: 14 },
    { header: `Total Prod Plan ${month}`, key: 'netplan', width: 16 },
    { header: 'OSP', key: 'osp', width: 10 },
    { header: 'HIL TOTAL PROD', key: 'hil', width: 14 },
    { header: 'Forge Press', key: 'tonnage', width: 12 },
    { header: 'Capacity/day', key: 'cap', width: 12 },
    { header: 'Capacity/day @85%', key: 'cap85', width: 14 },
    { header: 'Supply plan FP#', key: 'fp', width: 14 },
    { header: 'ReQuired M/c days', key: 'mcdays', width: 14 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A8A' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 28;

  const rows = db
    .prepare(
      `
      SELECT
        c.code as customer,
        p.part_code as part,
        pp.supply_location as supply,
        p.material_type as mm,
        p.category as category,
        pp.customer_schedule_qty as cs,
        pp.wip_safety_stock_qty as wip,
        pp.fg_safety_stock_qty as fg,
        pp.total_demand_qty as total,
        pp.opening_wip_fg_qty as open_wf,
        pp.opening_gill_chock_qty as gill,
        pp.net_prod_plan_qty as netplan,
        pp.osp_split_qty as osp,
        pp.hil_prod_qty as hil,
        p.required_tonnage as tonnage,
        pr.capacity_per_day as cap,
        pr.code as fp,
        COALESCE(pa.required_machine_days,0) as mcdays
      FROM production_plans pp
      JOIN parts p ON p.id = pp.part_id
      LEFT JOIN customers c ON c.id = pp.customer_id
      LEFT JOIN press_assignments pa ON pa.production_plan_id = pp.id
      LEFT JOIN presses pr ON pr.id = pa.press_id
      WHERE pp.month = ?
      ORDER BY COALESCE(c.code,'ZZZ'), p.part_code
      `
    )
    .all(month) as Array<Record<string, unknown>>;

  rows.forEach((r, i) => {
    const cap = (r.cap as number) || 0;
    ws.addRow({
      sno: i + 1,
      customer: r.customer,
      part: r.part,
      supply: r.supply,
      mm: r.mm,
      category: r.category,
      cs: r.cs,
      wip: r.wip,
      fg: r.fg,
      total: r.total,
      open_wf: r.open_wf,
      gill: r.gill,
      netplan: r.netplan,
      osp: r.osp,
      hil: r.hil,
      tonnage: r.tonnage,
      cap,
      cap85: cap * 0.85,
      fp: r.fp,
      mcdays: r.mcdays,
    });
  });

  ws.eachRow((row, idx) => {
    if (idx === 1) return;
    row.alignment = { vertical: 'middle' };
    row.eachCell((cell, col) => {
      if (col >= 7 && col !== 19) cell.numFmt = '#,##0.0';
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
    });
  });

  ws.views = [{ state: 'frozen', ySplit: 1 }];

  await wb.xlsx.writeFile(filePath);
  return { ok: true, message: `Exported ${rows.length} rows.`, path: filePath };
}
