import ExcelJS from 'exceljs';
import type { Database } from 'better-sqlite3';
import type { ImportResult } from '../shared/types';

/**
 * Bulk-import master data (Vendors / Customers / Presses) from Excel.
 *
 * For each entity we offer two functions:
 *   · downloadXxxTemplate(filePath)  → writes an empty Excel with the right
 *     column headers + one example row, styled and ready to fill.
 *   · importXxxFromExcel(db, filePath) → reads the same layout back, upserts
 *     by the natural key (vendor name, customer code, press code), and
 *     returns a summary the renderer can toast.
 */

// ── helpers ───────────────────────────────────────────────────────────

function str(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return '';
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && 'text' in v) return String((v as { text: string }).text).trim();
  if (typeof v === 'object' && 'result' in v)
    return String((v as { result: ExcelJS.CellValue }).result ?? '').trim();
  return String(v).trim();
}

function num(cell: ExcelJS.Cell | undefined): number {
  if (!cell) return 0;
  const v = cell.value;
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

function findHeaderRow(ws: ExcelJS.Worksheet, mustContain: string): number {
  const needle = mustContain.toLowerCase();
  for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
    let found = false;
    ws.getRow(r).eachCell((c) => {
      if (str(c).toLowerCase() === needle) found = true;
    });
    if (found) return r;
  }
  return -1;
}

function headerMap(ws: ExcelJS.Worksheet, headerRow: number): Map<string, number> {
  const map = new Map<string, number>();
  ws.getRow(headerRow).eachCell((cell, col) => {
    const label = str(cell).toLowerCase();
    if (label) map.set(label, col);
  });
  return map;
}

function styleHeader(headerRow: ExcelJS.Row): void {
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A8A' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 26;
}

// ── Vendors ────────────────────────────────────────────────────────────

export async function downloadVendorsTemplate(filePath: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ForgePlanner';
  const ws = wb.addWorksheet('Vendors');
  ws.columns = [
    { header: 'Name *', key: 'name', width: 26 },
    { header: 'Contact person', key: 'contact', width: 22 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'Email', key: 'email', width: 26 },
  ];
  styleHeader(ws.getRow(1));
  ws.addRow({
    name: 'Acme Forge Industries',
    contact: 'Mr. Patel',
    phone: '+91 98765 43210',
    email: 'patel@acme-forge.com',
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  await wb.xlsx.writeFile(filePath);
}

export async function importVendorsFromExcel(
  db: Database,
  filePath: string
): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) {
    return { ok: false, message: 'Empty workbook', imported_rows: 0, skipped_rows: 0, warnings: [] };
  }
  const headerRow = findHeaderRow(ws, 'name *') !== -1 ? findHeaderRow(ws, 'name *') : findHeaderRow(ws, 'name');
  if (headerRow === -1) {
    return {
      ok: false,
      message: "Couldn't find header row — first column should be \"Name\".",
      imported_rows: 0,
      skipped_rows: 0,
      warnings: [],
    };
  }
  const headers = headerMap(ws, headerRow);
  const col = (...needles: string[]): number => {
    for (const n of needles) {
      for (const [h, c] of headers) if (h.includes(n)) return c;
    }
    return -1;
  };
  const cName = col('name');
  const cContact = col('contact');
  const cPhone = col('phone');
  const cEmail = col('email');

  const upsert = db.prepare(
    `INSERT INTO vendors (name, contact_person, phone, email)
     VALUES (?,?,?,?)
     ON CONFLICT(name) DO UPDATE SET
       contact_person=excluded.contact_person,
       phone=excluded.phone,
       email=excluded.email`
  );

  let imported = 0;
  let skipped = 0;
  const warnings: string[] = [];
  const txn = db.transaction(() => {
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const name = str(row.getCell(cName));
      if (!name) {
        skipped++;
        continue;
      }
      upsert.run(
        name,
        cContact !== -1 ? str(row.getCell(cContact)) || null : null,
        cPhone !== -1 ? str(row.getCell(cPhone)) || null : null,
        cEmail !== -1 ? str(row.getCell(cEmail)) || null : null
      );
      imported++;
    }
  });
  txn();
  return {
    ok: imported > 0,
    message: `Imported ${imported} vendor${imported === 1 ? '' : 's'}.`,
    imported_rows: imported,
    skipped_rows: skipped,
    warnings: warnings.slice(0, 20),
  };
}

// ── Customers ──────────────────────────────────────────────────────────

export async function downloadCustomersTemplate(filePath: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Customers');
  ws.columns = [
    { header: 'Code *', key: 'code', width: 14 },
    { header: 'Full name', key: 'name', width: 30 },
    { header: 'Priority tier', key: 'tier', width: 14 },
  ];
  styleHeader(ws.getRow(1));
  ws.addRow({ code: 'HERO', name: 'Hero MotoCorp', tier: 'Critical' });
  ws.addRow({ code: 'GKN', name: 'GKN', tier: 'High' });

  // Add data validation for priority
  const validator: ExcelJS.DataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: ['"Critical,High,Medium,Low"'],
    showErrorMessage: true,
    errorTitle: 'Invalid priority',
    error: 'Choose one of: Critical, High, Medium, Low',
  };
  for (let r = 2; r <= 500; r++) {
    ws.getCell(r, 3).dataValidation = validator;
  }

  ws.views = [{ state: 'frozen', ySplit: 1 }];
  await wb.xlsx.writeFile(filePath);
}

export async function importCustomersFromExcel(
  db: Database,
  filePath: string
): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) {
    return { ok: false, message: 'Empty workbook', imported_rows: 0, skipped_rows: 0, warnings: [] };
  }
  const headerRow =
    findHeaderRow(ws, 'code *') !== -1 ? findHeaderRow(ws, 'code *') : findHeaderRow(ws, 'code');
  if (headerRow === -1) {
    return {
      ok: false,
      message: "Couldn't find header row — first column should be \"Code\".",
      imported_rows: 0,
      skipped_rows: 0,
      warnings: [],
    };
  }
  const headers = headerMap(ws, headerRow);
  const col = (...needles: string[]): number => {
    for (const n of needles) {
      for (const [h, c] of headers) if (h.includes(n)) return c;
    }
    return -1;
  };
  const cCode = col('code');
  const cName = col('name');
  const cTier = col('priority', 'tier');

  const upsert = db.prepare(
    `INSERT INTO customers (code, full_name, priority_tier)
     VALUES (?,?,?)
     ON CONFLICT(code) DO UPDATE SET
       full_name=excluded.full_name,
       priority_tier=excluded.priority_tier`
  );
  const validTiers = new Set(['Critical', 'High', 'Medium', 'Low']);

  let imported = 0;
  let skipped = 0;
  const warnings: string[] = [];
  const txn = db.transaction(() => {
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const code = str(row.getCell(cCode));
      if (!code) {
        skipped++;
        continue;
      }
      const name = cName !== -1 ? str(row.getCell(cName)) || null : null;
      let tier = cTier !== -1 ? str(row.getCell(cTier)) : '';
      if (tier && !validTiers.has(tier)) {
        warnings.push(`Row ${r}: priority "${tier}" — defaulting to Medium`);
        tier = 'Medium';
      }
      upsert.run(code, name, tier || 'Medium');
      imported++;
    }
  });
  txn();
  return {
    ok: imported > 0,
    message: `Imported ${imported} customer${imported === 1 ? '' : 's'}.`,
    imported_rows: imported,
    skipped_rows: skipped,
    warnings: warnings.slice(0, 20),
  };
}

// ── Presses ────────────────────────────────────────────────────────────

export async function downloadPressesTemplate(filePath: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Presses');
  ws.columns = [
    { header: 'Code *', key: 'code', width: 14 },
    { header: 'Type *', key: 'type', width: 16 },
    { header: 'Vendor (if Vendor type)', key: 'vendor', width: 24 },
    { header: 'Factory label', key: 'factory', width: 16 },
    { header: 'Tonnage *', key: 'tonnage', width: 12 },
    { header: 'Day shift cap (pcs)', key: 'day_cap', width: 18 },
    { header: 'Night shift cap (pcs)', key: 'night_cap', width: 20 },
  ];
  styleHeader(ws.getRow(1));
  ws.addRow({
    code: 'FP-01',
    type: 'In-house',
    vendor: '',
    factory: 'FS1',
    tonnage: 1000,
    day_cap: 900,
    night_cap: 700,
  });
  ws.addRow({
    code: 'V1-P1',
    type: 'Vendor',
    vendor: 'Acme Forge Industries',
    factory: '',
    tonnage: 1600,
    day_cap: 800,
    night_cap: 500,
  });

  // Validation: Type must be one of three values
  const typeValidator: ExcelJS.DataValidation = {
    type: 'list',
    allowBlank: false,
    formulae: ['"In-house,Inter Branch,Vendor"'],
    showErrorMessage: true,
    errorTitle: 'Invalid type',
    error: 'Choose one of: In-house, Inter Branch, Vendor',
  };
  for (let r = 2; r <= 500; r++) ws.getCell(r, 2).dataValidation = typeValidator;

  ws.views = [{ state: 'frozen', ySplit: 1 }];
  await wb.xlsx.writeFile(filePath);
}

export async function importPressesFromExcel(
  db: Database,
  filePath: string
): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) {
    return { ok: false, message: 'Empty workbook', imported_rows: 0, skipped_rows: 0, warnings: [] };
  }
  const headerRow =
    findHeaderRow(ws, 'code *') !== -1 ? findHeaderRow(ws, 'code *') : findHeaderRow(ws, 'code');
  if (headerRow === -1) {
    return {
      ok: false,
      message: "Couldn't find header row — first column should be \"Code\".",
      imported_rows: 0,
      skipped_rows: 0,
      warnings: [],
    };
  }
  const headers = headerMap(ws, headerRow);
  const col = (...needles: string[]): number => {
    for (const n of needles) {
      for (const [h, c] of headers) if (h.includes(n)) return c;
    }
    return -1;
  };
  const cCode = col('code');
  const cType = col('type');
  const cVendor = col('vendor');
  const cFactory = col('factory');
  const cTon = col('tonnage');
  const cDay = col('day');
  const cNight = col('night');

  const vendorsByName = new Map<string, number>();
  for (const v of db.prepare('SELECT id, name FROM vendors').all() as Array<{
    id: number;
    name: string;
  }>) {
    vendorsByName.set(v.name.toLowerCase(), v.id);
  }
  const insertVendor = db.prepare('INSERT OR IGNORE INTO vendors (name) VALUES (?)');
  const findVendor = db.prepare('SELECT id FROM vendors WHERE name=?');

  const upsert = db.prepare(`
    INSERT INTO presses (code, factory, is_in_house, tonnage, capacity_per_day,
      day_capacity, night_capacity, efficiency_pct, is_active, vendor_id)
    VALUES (?,?,?,?,?,?,?,85,1,?)
    ON CONFLICT(code) DO UPDATE SET
      factory=excluded.factory,
      is_in_house=excluded.is_in_house,
      tonnage=excluded.tonnage,
      capacity_per_day=excluded.capacity_per_day,
      day_capacity=excluded.day_capacity,
      night_capacity=excluded.night_capacity,
      vendor_id=excluded.vendor_id
  `);

  let imported = 0;
  let skipped = 0;
  const warnings: string[] = [];
  const txn = db.transaction(() => {
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const code = str(row.getCell(cCode));
      if (!code) {
        skipped++;
        continue;
      }
      const typeRaw = cType !== -1 ? str(row.getCell(cType)).toLowerCase() : 'in-house';
      const tonnage = cTon !== -1 ? num(row.getCell(cTon)) : 0;
      if (tonnage <= 0) {
        warnings.push(`Row ${r} (${code}): missing tonnage — skipped`);
        skipped++;
        continue;
      }
      const day = cDay !== -1 ? num(row.getCell(cDay)) : 0;
      const night = cNight !== -1 ? num(row.getCell(cNight)) : 0;
      const total = day + night;

      let isInHouse = 1;
      let vendorId: number | null = null;
      let factoryLabel = cFactory !== -1 ? str(row.getCell(cFactory)) : '';

      if (typeRaw.includes('vendor')) {
        isInHouse = 0;
        const vName = cVendor !== -1 ? str(row.getCell(cVendor)) : '';
        if (!vName) {
          warnings.push(`Row ${r} (${code}): Vendor type but no vendor name — skipped`);
          skipped++;
          continue;
        }
        vendorId = vendorsByName.get(vName.toLowerCase()) ?? null;
        if (!vendorId) {
          insertVendor.run(vName);
          const newV = findVendor.get(vName) as { id: number } | undefined;
          vendorId = newV?.id ?? null;
          if (vendorId) vendorsByName.set(vName.toLowerCase(), vendorId);
        }
        factoryLabel = factoryLabel || vName;
      } else if (typeRaw.includes('inter')) {
        factoryLabel = 'InterUnit';
      } else {
        factoryLabel = factoryLabel || 'In-house';
      }

      upsert.run(code, factoryLabel, isInHouse, tonnage, total, day, night, vendorId);
      imported++;
    }
  });
  txn();
  return {
    ok: imported > 0,
    message: `Imported ${imported} press${imported === 1 ? '' : 'es'}.`,
    imported_rows: imported,
    skipped_rows: skipped,
    warnings: warnings.slice(0, 20),
  };
}
