import ExcelJS from 'exceljs';
import type { Database } from 'better-sqlite3';
import type { ImportResult } from '../shared/types';

/**
 * Daily production template flow:
 *
 *   1. Planner picks a date and clicks "Download template".
 *      → exportDailyTemplate writes an Excel sheet listing every part assigned
 *        to every press for that date's month, with blank Day/Night "Actual"
 *        columns for the operator to write in.
 *
 *   2. Operator fills the actual production numbers (on paper or in Excel).
 *
 *   3. Planner clicks "Upload filled template" and picks the same file.
 *      → importDailyActuals reads each row, and for every non-zero actual
 *        creates a production_logs entry for that part on that date.
 *
 * The balance on the Production page decrements automatically after import.
 */

const SIGN_PHRASE = 'FORGEPLANNER_DAILY_v1';

interface DailyRowPlan {
  press_id: number;
  press_code: string;
  press_factory: string;
  press_tonnage: number;
  day_capacity: number;
  night_capacity: number;
  part_id: number;
  part_code: string;
  customer_code: string;
  planned_qty: number;
  already_produced: number;
  balance: number;
}

function loadDailyRows(db: Database, date: string): DailyRowPlan[] {
  const month = date.slice(0, 7);
  return db
    .prepare(
      `SELECT
         pr.id as press_id,
         pr.code as press_code,
         pr.factory as press_factory,
         pr.tonnage as press_tonnage,
         COALESCE(pr.day_capacity, 0) as day_capacity,
         COALESCE(pr.night_capacity, 0) as night_capacity,
         pp.part_id as part_id,
         p.part_code as part_code,
         COALESCE(c.code, '—') as customer_code,
         pa.allocated_qty as planned_qty,
         COALESCE((SELECT SUM(qty_produced) FROM production_logs
                   WHERE part_id = pp.part_id AND month = pp.month), 0) as already_produced
       FROM press_assignments pa
       JOIN production_plans pp ON pp.id = pa.production_plan_id
       JOIN parts p ON p.id = pp.part_id
       LEFT JOIN customers c ON c.id = pp.customer_id
       JOIN presses pr ON pr.id = pa.press_id
       WHERE pp.month = ?
       ORDER BY pr.is_in_house DESC, pr.code, pa.allocated_qty DESC`
    )
    .all(month)
    .map((r) => {
      const row = r as DailyRowPlan;
      return { ...row, balance: Math.max(0, row.planned_qty - row.already_produced) };
    });
}

export async function exportDailyTemplate(
  db: Database,
  filePath: string,
  date: string,
  companyName: string
): Promise<{ ok: boolean; path: string; rows: number; message: string }> {
  const rows = loadDailyRows(db, date);
  if (rows.length === 0) {
    return {
      ok: false,
      path: filePath,
      rows: 0,
      message: 'No parts assigned to any press for this month — nothing to print.',
    };
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'HIL ForgePlanner';
  wb.created = new Date();

  const ws = wb.addWorksheet(`Daily ${date}`, {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
  });

  ws.columns = [
    { header: 'Press', key: 'press', width: 10 },
    { header: 'Tonnage', key: 'tonnage', width: 9 },
    { header: 'Customer', key: 'customer', width: 12 },
    { header: 'Part code', key: 'part', width: 28 },
    { header: 'Month plan', key: 'plan', width: 12 },
    { header: 'Done so far', key: 'done', width: 12 },
    { header: 'Balance', key: 'balance', width: 11 },
    { header: 'Day-shift cap', key: 'day_cap', width: 13 },
    { header: 'Day actual', key: 'day_actual', width: 12 },
    { header: 'Night-shift cap', key: 'night_cap', width: 14 },
    { header: 'Night actual', key: 'night_actual', width: 13 },
    { header: 'Total today', key: 'total', width: 12 },
    { header: 'Operator / notes', key: 'notes', width: 22 },
  ];

  // Title row
  ws.spliceRows(1, 0, []);
  const titleCell = ws.getCell('A1');
  titleCell.value = `${companyName} · Daily Production Log · ${date}`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF1E3A8A' } };
  ws.mergeCells('A1:M1');

  const subCell = ws.getCell('A2');
  subCell.value =
    'Fill the Day actual / Night actual columns at the end of each shift. Hand back for upload.';
  subCell.font = { italic: true, size: 10, color: { argb: 'FF64748B' } };
  ws.mergeCells('A2:M2');
  ws.getRow(2).height = 16;

  // Empty spacer + then real header on row 4
  ws.spliceRows(3, 0, []);

  const headerRow = ws.getRow(4);
  ws.columns.forEach((c, i) => {
    headerRow.getCell(i + 1).value = c.header as string;
  });
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A8A' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 32;

  // Sign-line hidden in note column header so import can find the file even when renamed
  ws.getCell('M1').note = SIGN_PHRASE;

  let lastPress = '';
  rows.forEach((r) => {
    if (lastPress && lastPress !== r.press_code) {
      // Separator row for visual grouping
      ws.addRow({});
    }
    lastPress = r.press_code;
    const row = ws.addRow({
      press: r.press_code,
      tonnage: `${r.press_tonnage}T`,
      customer: r.customer_code,
      part: r.part_code,
      plan: r.planned_qty,
      done: r.already_produced,
      balance: r.balance,
      day_cap: r.day_capacity || '',
      day_actual: '',
      night_cap: r.night_capacity || '',
      night_actual: '',
      total: '',
      notes: '',
    });
    // Formula for total = day + night actual
    const rn = row.number;
    row.getCell('total').value = { formula: `IF(OR(I${rn}<>"",K${rn}<>""), N(I${rn})+N(K${rn}), "")` };
    // Style numbers + highlight actual columns
    [5, 6, 7, 8, 9, 10, 11, 12].forEach((c) => {
      const cell = row.getCell(c);
      cell.numFmt = '#,##0';
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });
    [9, 11].forEach((c) => {
      row.getCell(c).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEF3C7' }, // amber-100 — "please fill"
      };
      row.getCell(c).border = {
        top: { style: 'thin', color: { argb: 'FFD97706' } },
        bottom: { style: 'thin', color: { argb: 'FFD97706' } },
        left: { style: 'thin', color: { argb: 'FFD97706' } },
        right: { style: 'thin', color: { argb: 'FFD97706' } },
      };
    });
    row.getCell('part').font = { name: 'Consolas', size: 10 };
  });

  // Sign-off rows
  ws.addRow({});
  const signRow = ws.addRow({
    press: 'Shift In-Charge:',
    customer: '_____________________',
    plan: 'Supervisor:',
    balance: '_____________________',
    day_cap: 'Date:',
    day_actual: date,
  });
  signRow.font = { bold: true };
  signRow.height = 22;

  ws.views = [{ state: 'frozen', ySplit: 4 }];

  await wb.xlsx.writeFile(filePath);
  return {
    ok: true,
    path: filePath,
    rows: rows.length,
    message: `Template ready — ${rows.length} rows across ${new Set(rows.map((r) => r.press_id)).size} press(es).`,
  };
}

interface CellLite {
  value: ExcelJS.CellValue;
}

function num(c: CellLite | undefined): number {
  if (!c) return 0;
  const v = c.value;
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }
  if (typeof v === 'object' && 'result' in v) {
    const r = (v as { result?: ExcelJS.CellValue }).result;
    if (typeof r === 'number') return r;
    if (typeof r === 'string') return parseFloat(r) || 0;
  }
  return 0;
}

function str(c: CellLite | undefined): string {
  if (!c) return '';
  const v = c.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && 'text' in v) return String((v as { text: string }).text).trim();
  return String(v).trim();
}

export async function importDailyActuals(
  db: Database,
  filePath: string,
  date: string
): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) {
    return {
      ok: false,
      message: 'Empty workbook',
      imported_rows: 0,
      skipped_rows: 0,
      warnings: [],
    };
  }

  const month = date.slice(0, 7);
  const partLookup = new Map<string, number>();
  const presses = db.prepare(`SELECT id, code FROM presses`).all() as Array<{
    id: number;
    code: string;
  }>;
  const pressLookup = new Map<string, number>();
  for (const p of presses) pressLookup.set(p.code.toUpperCase(), p.id);
  const parts = db.prepare(`SELECT id, part_code FROM parts`).all() as Array<{
    id: number;
    part_code: string;
  }>;
  for (const p of parts) partLookup.set(p.part_code.toUpperCase(), p.id);

  const warnings: string[] = [];
  let imported = 0;
  let skipped = 0;

  const insertLog = db.prepare(
    `INSERT INTO production_logs (part_id, month, logged_date, qty_produced, press_id, notes)
     VALUES (?,?,?,?,?,?)`
  );

  const txn = db.transaction(() => {
    // Find the header row by looking for "Part code" cell. Row 4 in our template
    let headerRow = 0;
    for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
      const row = ws.getRow(r);
      let found = false;
      row.eachCell((c) => {
        if (str(c).toLowerCase() === 'part code') found = true;
      });
      if (found) {
        headerRow = r;
        break;
      }
    }
    if (headerRow === 0) {
      warnings.push(
        'Header row not found. Make sure you uploaded the file generated by "Download template".'
      );
      return;
    }

    // Map column letters → header
    const headerMap = new Map<number, string>();
    ws.getRow(headerRow).eachCell((c, col) => {
      headerMap.set(col, str(c).toLowerCase());
    });
    const colOf = (name: string): number => {
      for (const [c, h] of headerMap.entries()) {
        if (h.includes(name)) return c;
      }
      return -1;
    };
    const cPress = colOf('press');
    const cPart = colOf('part code');
    const cDayActual = colOf('day actual');
    const cNightActual = colOf('night actual');
    const cTotal = colOf('total today');
    const cNotes = colOf('operator');

    if (cPart === -1 || (cDayActual === -1 && cNightActual === -1 && cTotal === -1)) {
      warnings.push(
        'Could not find Part code / Actual columns. Use the unmodified template layout.'
      );
      return;
    }

    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const partCode = str(row.getCell(cPart));
      if (!partCode || partCode.toLowerCase().startsWith('shift in')) continue;
      const partId = partLookup.get(partCode.toUpperCase());
      if (!partId) {
        warnings.push(`Unknown part: ${partCode}`);
        skipped++;
        continue;
      }
      const pressCode = cPress !== -1 ? str(row.getCell(cPress)) : '';
      const pressId = pressCode ? pressLookup.get(pressCode.toUpperCase()) ?? null : null;

      const dayQty = cDayActual !== -1 ? num(row.getCell(cDayActual)) : 0;
      const nightQty = cNightActual !== -1 ? num(row.getCell(cNightActual)) : 0;
      const totalQty = cTotal !== -1 ? num(row.getCell(cTotal)) : 0;
      const notes = cNotes !== -1 ? str(row.getCell(cNotes)) || null : null;

      if (dayQty > 0) {
        insertLog.run(partId, month, date, dayQty, pressId, notes ? `Day · ${notes}` : 'Day shift');
        imported++;
      }
      if (nightQty > 0) {
        insertLog.run(
          partId,
          month,
          date,
          nightQty,
          pressId,
          notes ? `Night · ${notes}` : 'Night shift'
        );
        imported++;
      }
      // If shift columns are blank but Total Today has a value, fall back to one row
      if (dayQty === 0 && nightQty === 0 && totalQty > 0) {
        insertLog.run(partId, month, date, totalQty, pressId, notes);
        imported++;
      }
    }
  });
  txn();

  return {
    ok: imported > 0 || warnings.length === 0,
    message:
      imported > 0
        ? `Imported ${imported} production entr${imported === 1 ? 'y' : 'ies'} for ${date}.`
        : 'No actual quantities found in the template. Did the operator fill the Day/Night actual columns?',
    imported_rows: imported,
    skipped_rows: skipped,
    warnings: warnings.slice(0, 30),
  };
}
