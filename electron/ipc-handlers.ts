import type { IpcMain, BrowserWindow } from 'electron';
import { app, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { Database } from 'better-sqlite3';
import { IPC } from '../shared/ipc-channels';
import { getDbPath, resetDatabase } from './db';
import {
  buildRelocationSuggestions,
  capacitySummary,
  customerRisk,
  customerBreakdownImpact,
  dashboardKpis,
  getSetting,
  listPlanMonths,
  listPlanRows,
  listPressesWithLoad,
  setSetting,
  suggestRelocation,
} from './queries';
import {
  exportMonthlyPlan,
  exportPartStock,
  importMonthlyPlan,
  importPartStock,
  importSchedules,
} from './excel';
import { recomputePlanDerived, recomputePlanForPartMonth } from './planning';
import { seedSampleData } from './sample-data';
import { applyAutoDistribute, previewAutoDistribute } from './auto-distribute';
import { exportDailyTemplate, importDailyActuals } from './daily-template';
import type {
  PlanStockBreakdown,
  Press,
  PressStatus,
  Settings,
  StockLocation,
} from '../shared/types';

type GetWindow = () => BrowserWindow | null;

export function registerIpcHandlers(ipc: IpcMain, db: Database, getWin: GetWindow): void {
  const emit = (channel: string, payload: unknown) => {
    getWin()?.webContents.send(channel, payload);
  };

  ipc.handle(IPC.PRESSES_LIST, () => db.prepare(`SELECT p.*, v.name as vendor_name FROM presses p LEFT JOIN vendors v ON v.id = p.vendor_id ORDER BY p.is_in_house DESC, p.code`).all());
  ipc.handle(IPC.PRESSES_LIST_WITH_LOAD, (_e, month: string) => listPressesWithLoad(db, month));
  ipc.handle(IPC.PRESS_UPSERT, (_e, press: Partial<Press>) => {
    // Derive total cap/day from day + night shifts so the rest of the app
    // keeps working from a single capacity_per_day number.
    const day = Math.max(0, press.day_capacity ?? 0);
    const night = Math.max(0, press.night_capacity ?? 0);
    const total = day + night > 0 ? day + night : press.capacity_per_day ?? 0;
    if (press.id) {
      db.prepare(`
        UPDATE presses SET code=?, factory=?, is_in_house=?, tonnage=?,
          capacity_per_day=?, day_capacity=?, night_capacity=?,
          efficiency_pct=?, is_active=?, vendor_id=? WHERE id=?
      `).run(
        press.code,
        press.factory,
        press.is_in_house ? 1 : 0,
        press.tonnage,
        total,
        day,
        night,
        press.efficiency_pct ?? 85,
        press.is_active ? 1 : 0,
        press.vendor_id ?? null,
        press.id
      );
      return press.id;
    }
    const result = db.prepare(`
      INSERT INTO presses (code, factory, is_in_house, tonnage, capacity_per_day,
        day_capacity, night_capacity, efficiency_pct, is_active, vendor_id)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      press.code,
      press.factory,
      press.is_in_house ? 1 : 0,
      press.tonnage,
      total,
      day,
      night,
      press.efficiency_pct ?? 85,
      press.is_active ? 1 : 0,
      press.vendor_id ?? null
    );
    return result.lastInsertRowid;
  });
  ipc.handle(IPC.PRESS_DELETE, (_e, id: number) => db.prepare('DELETE FROM presses WHERE id=?').run(id));
  ipc.handle(IPC.PRESS_DELETE_MANY, (_e, ids: number[]) => {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const txn = db.transaction(() => {
      const del = db.prepare('DELETE FROM presses WHERE id=?');
      for (const id of ids) del.run(id);
    });
    txn();
    return ids.length;
  });
  ipc.handle(IPC.PRESS_SET_STATUS, (_e, id: number, status: PressStatus) => {
    db.prepare(`UPDATE presses SET current_status=?, status_changed_at=datetime('now') WHERE id=?`).run(status, id);
    emit(IPC.EVT_PRESS_STATUS_CHANGED, { id, status });
    return true;
  });

  ipc.handle(IPC.VENDORS_LIST, () => db.prepare('SELECT * FROM vendors ORDER BY name').all());
  ipc.handle(IPC.VENDOR_UPSERT, (_e, v: { id?: number; name: string; contact_person?: string; phone?: string; email?: string }) => {
    if (v.id) {
      db.prepare('UPDATE vendors SET name=?, contact_person=?, phone=?, email=? WHERE id=?').run(v.name, v.contact_person ?? null, v.phone ?? null, v.email ?? null, v.id);
      return v.id;
    }
    return db.prepare('INSERT INTO vendors (name, contact_person, phone, email) VALUES (?,?,?,?)').run(v.name, v.contact_person ?? null, v.phone ?? null, v.email ?? null).lastInsertRowid;
  });
  ipc.handle(IPC.VENDOR_DELETE, (_e, id: number) => db.prepare('DELETE FROM vendors WHERE id=?').run(id));
  ipc.handle(IPC.VENDOR_DELETE_MANY, (_e, ids: number[]) => {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const txn = db.transaction(() => {
      const del = db.prepare('DELETE FROM vendors WHERE id=?');
      for (const id of ids) del.run(id);
    });
    txn();
    return ids.length;
  });

  ipc.handle(IPC.CUSTOMERS_LIST, () => db.prepare('SELECT * FROM customers ORDER BY priority_tier, code').all());
  ipc.handle(IPC.CUSTOMER_UPSERT, (_e, c: { id?: number; code: string; full_name?: string; priority_tier?: string; notes?: string }) => {
    if (c.id) {
      db.prepare('UPDATE customers SET code=?, full_name=?, priority_tier=?, notes=? WHERE id=?').run(c.code, c.full_name ?? null, c.priority_tier ?? 'Medium', c.notes ?? null, c.id);
      return c.id;
    }
    return db.prepare('INSERT INTO customers (code, full_name, priority_tier, notes) VALUES (?,?,?,?)').run(c.code, c.full_name ?? null, c.priority_tier ?? 'Medium', c.notes ?? null).lastInsertRowid;
  });
  ipc.handle(IPC.CUSTOMER_DELETE, (_e, id: number) => db.prepare('DELETE FROM customers WHERE id=?').run(id));
  ipc.handle(IPC.CUSTOMER_DELETE_MANY, (_e, ids: number[]) => {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const txn = db.transaction(() => {
      const del = db.prepare('DELETE FROM customers WHERE id=?');
      for (const id of ids) del.run(id);
    });
    txn();
    return ids.length;
  });

  ipc.handle(IPC.PARTS_LIST, () =>
    db.prepare(`SELECT * FROM parts ORDER BY part_code`).all()
  );
  ipc.handle(
    IPC.PART_UPSERT,
    (
      _e,
      p: {
        id?: number;
        part_code: string;
        material_type: string;
        category: string;
        required_tonnage: number;
        default_press_id?: number | null;
        is_die_locked?: boolean;
        wip_safety_days?: number | null;
        fg_safety_days?: number | null;
        price_per_piece?: number;
      }
    ) => {
      const wipOverride = p.wip_safety_days === undefined ? null : p.wip_safety_days;
      const fgOverride = p.fg_safety_days === undefined ? null : p.fg_safety_days;
      const price = p.price_per_piece ?? 0;
      let id: number | bigint;
      if (p.id) {
        db.prepare(
          `UPDATE parts SET part_code=?, material_type=?, category=?, required_tonnage=?,
             default_press_id=?, is_die_locked=?, wip_safety_days=?, fg_safety_days=?, price_per_piece=? WHERE id=?`
        ).run(
          p.part_code,
          p.material_type,
          p.category,
          p.required_tonnage,
          p.default_press_id ?? null,
          p.is_die_locked ? 1 : 0,
          wipOverride,
          fgOverride,
          price,
          p.id
        );
        id = p.id;
      } else {
        // Upsert by part_code (global unique)
        const existing = db.prepare('SELECT id FROM parts WHERE part_code=?').get(p.part_code) as
          | { id: number }
          | undefined;
        if (existing) {
          db.prepare(
            `UPDATE parts SET material_type=?, category=?, required_tonnage=?, default_press_id=?,
               is_die_locked=?, wip_safety_days=?, fg_safety_days=?, price_per_piece=? WHERE id=?`
          ).run(
            p.material_type,
            p.category,
            p.required_tonnage,
            p.default_press_id ?? null,
            p.is_die_locked ? 1 : 0,
            wipOverride,
            fgOverride,
            price,
            existing.id
          );
          id = existing.id;
        } else {
          id = db
            .prepare(
              `INSERT INTO parts (part_code, material_type, category, required_tonnage,
                  default_press_id, is_die_locked, wip_safety_days, fg_safety_days, price_per_piece)
               VALUES (?,?,?,?,?,?,?,?,?)`
            )
            .run(
              p.part_code,
              p.material_type,
              p.category,
              p.required_tonnage,
              p.default_press_id ?? null,
              p.is_die_locked ? 1 : 0,
              wipOverride,
              fgOverride,
              price
            ).lastInsertRowid;
        }
      }
      // Safety-day override may change derived plan numbers — recompute all
      // open plan rows for this part across months.
      const planRows = db
        .prepare(`SELECT id FROM production_plans WHERE part_id=?`)
        .all(id) as Array<{ id: number }>;
      for (const r of planRows) recomputePlanDerived(db, r.id);
      if (planRows.length > 0) emit(IPC.EVT_PLAN_UPDATED, {});
      return id;
    }
  );
  ipc.handle(IPC.PART_DELETE, (_e, id: number) => db.prepare('DELETE FROM parts WHERE id=?').run(id));

  ipc.handle(IPC.PLAN_LIST, (_e, month: string) => listPlanRows(db, month));
  ipc.handle(IPC.PLAN_MONTHS, () => listPlanMonths(db));
  ipc.handle(
    IPC.PLAN_UPSERT_ROW,
    (
      _e,
      row: {
        id?: number;
        month: string;
        part_id: number;
        customer_id?: number | null;
        supply_location?: string;
        customer_schedule_qty?: number;
        wip_safety_stock_qty?: number;
        fg_safety_stock_qty?: number;
        total_demand_qty?: number;
        opening_wip_fg_qty?: number;
        opening_gill_chock_qty?: number;
        net_prod_plan_qty?: number;
        osp_split_qty?: number;
        hil_prod_qty?: number;
      }
    ) => {
      const result = db
        .prepare(
          `
      INSERT INTO production_plans (month, part_id, customer_id, customer_schedule_qty, wip_safety_stock_qty, fg_safety_stock_qty, total_demand_qty, opening_wip_fg_qty, opening_gill_chock_qty, net_prod_plan_qty, osp_split_qty, hil_prod_qty, supply_location, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
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
    `
        )
        .run(
          row.month,
          row.part_id,
          row.customer_id ?? null,
          row.customer_schedule_qty ?? 0,
          row.wip_safety_stock_qty ?? 0,
          row.fg_safety_stock_qty ?? 0,
          row.total_demand_qty ?? 0,
          row.opening_wip_fg_qty ?? 0,
          row.opening_gill_chock_qty ?? 0,
          row.net_prod_plan_qty ?? 0,
          row.osp_split_qty ?? 0,
          row.hil_prod_qty ?? 0,
          row.supply_location ?? ''
        );
      // Always recompute derived columns from the raw inputs so the simplified
      // modal (which only sends customer_schedule_qty + osp) gets correct
      // WIP/FG/Total/Net/HIL values populated automatically.
      recomputePlanForPartMonth(db, row.part_id, row.month);
      emit(IPC.EVT_PLAN_UPDATED, { month: row.month });
      return result.lastInsertRowid;
    }
  );
  ipc.handle(IPC.PLAN_DELETE_ROW, (_e, planId: number) => db.prepare('DELETE FROM production_plans WHERE id=?').run(planId));
  ipc.handle(IPC.PLAN_ASSIGN_PRESS, (_e, p: { plan_id: number; press_id: number; allocated_qty: number; required_machine_days: number }) => {
    db.prepare('DELETE FROM press_assignments WHERE production_plan_id=?').run(p.plan_id);
    db.prepare('INSERT INTO press_assignments (production_plan_id, press_id, allocated_qty, required_machine_days) VALUES (?,?,?,?)').run(p.plan_id, p.press_id, p.allocated_qty, p.required_machine_days);
    return true;
  });
  ipc.handle(IPC.PLAN_UNASSIGN_PRESS, (_e, planId: number) => {
    db.prepare('DELETE FROM press_assignments WHERE production_plan_id=?').run(planId);
    emit(IPC.EVT_PLAN_UPDATED, {});
    return true;
  });
  // Inline edit: set just the customer schedule (and optionally OSP) — everything
  // else is auto-derived from the part's stock + settings.
  ipc.handle(
    IPC.PLAN_SET_SCHEDULE,
    (_e, p: { plan_id: number; customer_schedule_qty?: number; osp_split_qty?: number }) => {
      const sets: string[] = [];
      const args: unknown[] = [];
      if (p.customer_schedule_qty !== undefined) {
        sets.push('customer_schedule_qty=?');
        args.push(p.customer_schedule_qty);
      }
      if (p.osp_split_qty !== undefined) {
        sets.push('osp_split_qty=?');
        args.push(p.osp_split_qty);
      }
      if (sets.length > 0) {
        args.push(p.plan_id);
        db.prepare(`UPDATE production_plans SET ${sets.join(', ')} WHERE id=?`).run(...args);
      }
      recomputePlanDerived(db, p.plan_id);
      emit(IPC.EVT_PLAN_UPDATED, {});
      return true;
    }
  );
  ipc.handle(IPC.PLAN_AUTO_DISTRIBUTE_PREVIEW, (_e, month: string) =>
    previewAutoDistribute(db, month)
  );
  ipc.handle(IPC.PLAN_AUTO_DISTRIBUTE_APPLY, (_e, month: string) => {
    const r = applyAutoDistribute(db, month);
    emit(IPC.EVT_PLAN_UPDATED, { month });
    return r;
  });

  ipc.handle(IPC.PLAN_CARRY_FORWARD, (_e, p: { fromMonth: string; toMonth: string }) => {
    const rows = db.prepare('SELECT * FROM production_plans WHERE month=?').all(p.fromMonth) as Array<Record<string, unknown>>;
    const upsert = db.prepare(`
      INSERT INTO production_plans (month, part_id, customer_id, customer_schedule_qty, wip_safety_stock_qty, fg_safety_stock_qty, total_demand_qty, opening_wip_fg_qty, opening_gill_chock_qty, net_prod_plan_qty, osp_split_qty, hil_prod_qty, supply_location, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
      ON CONFLICT(month, part_id) DO NOTHING
    `);
    const txn = db.transaction(() => {
      for (const r of rows) {
        upsert.run(
          p.toMonth,
          r.part_id,
          r.customer_id ?? null,
          r.customer_schedule_qty,
          r.wip_safety_stock_qty,
          r.fg_safety_stock_qty,
          r.total_demand_qty,
          r.opening_wip_fg_qty,
          r.opening_gill_chock_qty,
          r.net_prod_plan_qty,
          r.osp_split_qty,
          r.hil_prod_qty,
          r.supply_location
        );
      }
    });
    txn();
    return rows.length;
  });

  // ── Scheduled maintenance ──────────────────────────────────────────────
  ipc.handle(IPC.MAINTENANCE_LIST, () =>
    db
      .prepare(
        `SELECT sm.*, p.code as press_code
         FROM scheduled_maintenance sm
         JOIN presses p ON p.id = sm.press_id
         ORDER BY sm.starts_on DESC, sm.id DESC`
      )
      .all()
  );

  ipc.handle(
    IPC.MAINTENANCE_UPSERT,
    (
      _e,
      m: {
        id?: number;
        press_id: number;
        starts_on: string;
        ends_on?: string | null;
        reason?: string | null;
        notes?: string | null;
        status?: string;
      }
    ) => {
      if (m.id) {
        db.prepare(
          `UPDATE scheduled_maintenance
           SET press_id=?, starts_on=?, ends_on=?, reason=?, notes=?, status=?
           WHERE id=?`
        ).run(
          m.press_id,
          m.starts_on,
          m.ends_on ?? null,
          m.reason ?? null,
          m.notes ?? null,
          m.status ?? 'planned',
          m.id
        );
        emit(IPC.EVT_PRESS_STATUS_CHANGED, { id: m.press_id });
        return m.id;
      }
      const r = db
        .prepare(
          `INSERT INTO scheduled_maintenance (press_id, starts_on, ends_on, reason, notes, status)
           VALUES (?,?,?,?,?,?)`
        )
        .run(
          m.press_id,
          m.starts_on,
          m.ends_on ?? null,
          m.reason ?? null,
          m.notes ?? null,
          m.status ?? 'planned'
        );
      emit(IPC.EVT_PRESS_STATUS_CHANGED, { id: m.press_id });
      return r.lastInsertRowid;
    }
  );

  ipc.handle(IPC.MAINTENANCE_DELETE, (_e, id: number) => {
    const row = db
      .prepare(`SELECT press_id FROM scheduled_maintenance WHERE id=?`)
      .get(id) as { press_id: number } | undefined;
    db.prepare(`DELETE FROM scheduled_maintenance WHERE id=?`).run(id);
    if (row) emit(IPC.EVT_PRESS_STATUS_CHANGED, { id: row.press_id });
    return true;
  });

  /**
   * Returns maintenance entries within the next `withinDays` days, each
   * pre-joined with the parts that would be affected (currently assigned to
   * that press for the current month) and the top alternate presses.
   */
  ipc.handle(
    IPC.MAINTENANCE_UPCOMING,
    (_e, params: { month: string; withinDays?: number }) => {
      const within = params.withinDays ?? 14;
      const today = new Date();
      const cutoff = new Date(today.getTime() + within * 86400000);
      const todayStr = today.toISOString().slice(0, 10);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const list = db
        .prepare(
          `SELECT sm.*, p.code as press_code
           FROM scheduled_maintenance sm
           JOIN presses p ON p.id = sm.press_id
           WHERE sm.status IN ('planned','in_progress')
             AND sm.starts_on >= ?
             AND sm.starts_on <= ?
           ORDER BY sm.starts_on ASC`
        )
        .all(todayStr, cutoffStr) as Array<{
        id: number;
        press_id: number;
        press_code: string;
        starts_on: string;
        ends_on: string | null;
        reason: string | null;
        notes: string | null;
        status: string;
        created_at: string;
      }>;

      return list.map((m) => {
        const parts = db
          .prepare(
            `SELECT pp.part_id, p.part_code, COALESCE(c.code,'—') as customer_code,
                    p.required_tonnage, pa.allocated_qty as qty_at_risk
             FROM press_assignments pa
             JOIN production_plans pp ON pp.id = pa.production_plan_id
             JOIN parts p ON p.id = pp.part_id
             LEFT JOIN customers c ON c.id = pp.customer_id
             WHERE pa.press_id = ? AND pp.month = ?
             ORDER BY pa.allocated_qty DESC`
          )
          .all(m.press_id, params.month) as Array<{
          part_id: number;
          part_code: string;
          customer_code: string;
          required_tonnage: number;
          qty_at_risk: number;
        }>;

        const affectedWithAlternates = parts.map((pt) => {
          const alternates = db
            .prepare(
              `SELECT p.code as press_code, p.tonnage, p.factory, p.is_in_house,
                      v.name as vendor_name,
                      COALESCE((SELECT SUM(pa.required_machine_days)
                                FROM press_assignments pa
                                JOIN production_plans pp ON pp.id = pa.production_plan_id
                                WHERE pa.press_id = p.id AND pp.month = ?), 0) as used
               FROM presses p
               LEFT JOIN vendors v ON v.id = p.vendor_id
               WHERE p.is_active = 1
                 AND p.id != ?
                 AND p.tonnage >= ?
                 AND p.current_status NOT IN ('Down','Maintenance')
                 AND p.capacity_per_day > 0
               ORDER BY (p.tonnage - ?), p.is_in_house DESC
               LIMIT 5`
            )
            .all(params.month, m.press_id, pt.required_tonnage, pt.required_tonnage) as Array<{
            press_code: string;
            tonnage: number;
            factory: string;
            is_in_house: 0 | 1;
            vendor_name: string | null;
            used: number;
          }>;
          const altWithDays = alternates.map((a) => {
            const cap = a.is_in_house ? 24 : 30;
            return { ...a, free_days: Math.max(0, cap - a.used) };
          });
          return { ...pt, alternates: altWithDays };
        });

        const days = Math.ceil(
          (new Date(m.starts_on).getTime() - today.getTime()) / 86400000
        );
        return {
          maintenance: m,
          days_until: days,
          affected_parts: affectedWithAlternates,
        };
      });
    }
  );

  ipc.handle(IPC.DOWNTIME_LIST, (_e, params: { pressId?: number; month?: string }) => {
    let q = `SELECT d.*, p.code as press_code FROM downtime_events d JOIN presses p ON p.id = d.press_id WHERE 1=1`;
    const args: unknown[] = [];
    if (params.pressId) { q += ' AND d.press_id=?'; args.push(params.pressId); }
    if (params.month) { q += ' AND substr(d.start_datetime,1,7)=?'; args.push(params.month); }
    q += ' ORDER BY d.start_datetime DESC';
    return db.prepare(q).all(...args);
  });
  ipc.handle(IPC.DOWNTIME_CREATE, (_e, d: { press_id: number; reason: string; notes?: string; expected_restoration_datetime?: string; reported_by?: number }) => {
    const result = db.prepare(`
      INSERT INTO downtime_events (press_id, start_datetime, reason, notes, expected_restoration_datetime, reported_by)
      VALUES (?, datetime('now'), ?, ?, ?, ?)
    `).run(d.press_id, d.reason, d.notes ?? null, d.expected_restoration_datetime ?? null, d.reported_by ?? null);
    db.prepare(`UPDATE presses SET current_status='Down', status_changed_at=datetime('now') WHERE id=?`).run(d.press_id);
    emit(IPC.EVT_PRESS_STATUS_CHANGED, { id: d.press_id, status: 'Down' });
    return result.lastInsertRowid;
  });
  ipc.handle(IPC.DOWNTIME_CLOSE, (_e, d: { id: number; notes?: string; bring_back_status?: PressStatus }) => {
    const row = db.prepare('SELECT press_id FROM downtime_events WHERE id=?').get(d.id) as { press_id: number } | undefined;
    db.prepare(`UPDATE downtime_events SET end_datetime=datetime('now'), notes=COALESCE(?, notes) WHERE id=?`).run(d.notes ?? null, d.id);
    if (row) {
      const status = d.bring_back_status ?? 'Running';
      db.prepare(`UPDATE presses SET current_status=?, status_changed_at=datetime('now') WHERE id=?`).run(status, row.press_id);
      emit(IPC.EVT_PRESS_STATUS_CHANGED, { id: row.press_id, status });
    }
    return true;
  });
  ipc.handle(IPC.DOWNTIME_DELETE, (_e, id: number) => db.prepare('DELETE FROM downtime_events WHERE id=?').run(id));

  ipc.handle(IPC.RELOCATION_SUGGEST, (_e, params: { fromPressId: number; month: string }) => buildRelocationSuggestions(db, params.fromPressId, params.month));
  ipc.handle(IPC.RELOCATION_APPLY, (_e, params: { plan_id: number; part_id: number; from_press_id: number; to_press_id: number; qty: number; required_machine_days: number; downtime_id?: number }) => {
    db.prepare('DELETE FROM press_assignments WHERE production_plan_id=?').run(params.plan_id);
    db.prepare('INSERT INTO press_assignments (production_plan_id, press_id, allocated_qty, required_machine_days) VALUES (?,?,?,?)').run(params.plan_id, params.to_press_id, params.qty, params.required_machine_days);
    db.prepare(`INSERT INTO relocation_logs (triggered_by_downtime_id, part_id, from_press_id, to_press_id, qty_moved, required_machine_days) VALUES (?,?,?,?,?,?)`).run(params.downtime_id ?? null, params.part_id, params.from_press_id, params.to_press_id, params.qty, params.required_machine_days);
    emit(IPC.EVT_PLAN_UPDATED, {});
    return true;
  });
  ipc.handle(IPC.RELOCATION_LOG, (_e, params: { month?: string }) => {
    const args: unknown[] = [];
    let q = `SELECT rl.*, p.part_code, fp.code as from_press_code, tp.code as to_press_code
      FROM relocation_logs rl
      JOIN parts p ON p.id = rl.part_id
      JOIN presses fp ON fp.id = rl.from_press_id
      JOIN presses tp ON tp.id = rl.to_press_id
      WHERE 1=1`;
    if (params.month) { q += ' AND substr(rl.moved_at,1,7)=?'; args.push(params.month); }
    q += ' ORDER BY rl.moved_at DESC LIMIT 200';
    return db.prepare(q).all(...args);
  });

  ipc.handle(IPC.DASHBOARD_KPIS, (_e, month: string) => dashboardKpis(db, month));
  ipc.handle(IPC.CAPACITY_SUMMARY, (_e, month: string) => capacitySummary(db, month));
  ipc.handle(IPC.CUSTOMER_RISK, (_e, month: string) => customerRisk(db, month));
  ipc.handle(IPC.CUSTOMER_BREAKDOWN_IMPACT, (_e, month: string) =>
    customerBreakdownImpact(db, month)
  );

  ipc.handle(IPC.EXCEL_IMPORT, async (_e, params: { month: string }) => {
    const win = getWin();
    const result = await dialog.showOpenDialog(win!, {
      title: 'Import monthly plan from Excel',
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, message: 'Cancelled', imported_rows: 0, skipped_rows: 0, warnings: [] };
    }
    const r = await importMonthlyPlan(db, result.filePaths[0]!, params.month);
    emit(IPC.EVT_PLAN_UPDATED, { month: params.month });
    return r;
  });

  ipc.handle(IPC.EXCEL_EXPORT, async (_e, params: { month: string }) => {
    const win = getWin();
    const result = await dialog.showSaveDialog(win!, {
      title: 'Export monthly plan',
      defaultPath: `ForgePlanner-${params.month}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, message: 'Cancelled', path: '' };
    return exportMonthlyPlan(db, result.filePath, params.month);
  });

  ipc.handle(IPC.PLAN_IMPORT_SCHEDULES, async (_e, params: { month: string }) => {
    const win = getWin();
    const result = await dialog.showOpenDialog(win!, {
      title: 'Import customer schedules (Customer · Part · Schedule)',
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, message: 'Cancelled', imported_rows: 0, skipped_rows: 0, warnings: [] };
    }
    const r = await importSchedules(db, result.filePaths[0]!, params.month);
    emit(IPC.EVT_PLAN_UPDATED, { month: params.month });
    return r;
  });

  // ── Part stock (separate per part + month) ──────────────────────────────
  ipc.handle(IPC.PART_STOCK_LIST, (_e, month: string) =>
    db
      .prepare(
        `SELECT p.id as part_id, p.part_code, p.material_type, p.category, p.required_tonnage,
                COALESCE(ps.hil_qty,0) as hil_qty, COALESCE(ps.outside_qty,0) as outside_qty,
                CASE WHEN pp.id IS NOT NULL THEN 1 ELSE 0 END as in_plan
         FROM parts p
         LEFT JOIN part_stock ps ON ps.part_id = p.id AND ps.month = ?
         LEFT JOIN production_plans pp ON pp.part_id = p.id AND pp.month = ?
         ORDER BY p.part_code`
      )
      .all(month, month)
  );

  ipc.handle(IPC.PART_STOCK_GET, (_e, params: { part_id: number; month: string }) => {
    const row = db
      .prepare(`SELECT hil_qty, outside_qty FROM part_stock WHERE part_id=? AND month=?`)
      .get(params.part_id, params.month) as { hil_qty: number; outside_qty: number } | undefined;
    return row ?? { hil_qty: 0, outside_qty: 0 };
  });

  ipc.handle(
    IPC.PART_STOCK_UPSERT,
    (_e, p: { part_id: number; month: string; hil_qty: number; outside_qty: number }) => {
      db.prepare(
        `INSERT INTO part_stock (part_id, month, hil_qty, outside_qty)
         VALUES (?,?,?,?)
         ON CONFLICT(part_id, month) DO UPDATE SET hil_qty=excluded.hil_qty, outside_qty=excluded.outside_qty`
      ).run(p.part_id, p.month, p.hil_qty ?? 0, p.outside_qty ?? 0);
      recomputePlanForPartMonth(db, p.part_id, p.month);
      emit(IPC.EVT_PLAN_UPDATED, { month: p.month });
      return true;
    }
  );

  /**
   * Per-press breakdown: returns every press joined with its stock for the
   * given part + month. Zero rows when no entries yet.
   */
  ipc.handle(
    IPC.PART_PRESS_STOCK_GET,
    (_e, params: { part_id: number; month: string }) => {
      return db
        .prepare(
          `SELECT p.id as press_id, p.code as press_code, p.is_in_house, p.tonnage,
                  p.factory, v.name as vendor_name,
                  COALESCE(pps.qty, 0) as qty
           FROM presses p
           LEFT JOIN vendors v ON v.id = p.vendor_id
           LEFT JOIN part_press_stock pps
                  ON pps.press_id = p.id AND pps.part_id = ? AND pps.month = ?
           WHERE p.is_active = 1
           ORDER BY p.is_in_house DESC, p.code`
        )
        .all(params.part_id, params.month);
    }
  );

  /**
   * Replace the entire per-press breakdown for a part+month, then recompute
   * the aggregate hil_qty / outside_qty on part_stock and the derived plan.
   */
  ipc.handle(
    IPC.PART_PRESS_STOCK_SET,
    (
      _e,
      params: {
        part_id: number;
        month: string;
        interunit_qty?: number;
        entries: Array<{ press_id: number; qty: number }>;
      }
    ) => {
      const txn = db.transaction(() => {
        db.prepare(
          `DELETE FROM part_press_stock WHERE part_id=? AND month=?`
        ).run(params.part_id, params.month);
        const ins = db.prepare(
          `INSERT INTO part_press_stock (part_id, press_id, month, qty) VALUES (?,?,?,?)`
        );
        for (const e of params.entries) {
          if (e.qty > 0) ins.run(params.part_id, e.press_id, params.month, e.qty);
        }
        // Aggregate back into part_stock so recomputePlanDerived just reads
        // the same fields it already uses.
        const sums = db
          .prepare(
            `SELECT
               COALESCE(SUM(CASE WHEN p.is_in_house = 1 THEN pps.qty ELSE 0 END), 0) as hil,
               COALESCE(SUM(CASE WHEN p.is_in_house = 0 THEN pps.qty ELSE 0 END), 0) as outside
             FROM part_press_stock pps
             JOIN presses p ON p.id = pps.press_id
             WHERE pps.part_id = ? AND pps.month = ?`
          )
          .get(params.part_id, params.month) as { hil: number; outside: number };

        db.prepare(
          `INSERT INTO part_stock (part_id, month, hil_qty, outside_qty, interunit_qty)
           VALUES (?,?,?,?,?)
           ON CONFLICT(part_id, month) DO UPDATE SET
             hil_qty = excluded.hil_qty,
             outside_qty = excluded.outside_qty,
             interunit_qty = COALESCE(excluded.interunit_qty, part_stock.interunit_qty)`
        ).run(
          params.part_id,
          params.month,
          sums.hil,
          sums.outside,
          params.interunit_qty ?? 0
        );

        recomputePlanForPartMonth(db, params.part_id, params.month);
      });
      txn();
      emit(IPC.EVT_PLAN_UPDATED, { month: params.month });
      return true;
    }
  );

  /**
   * Upsert a single (part, press, month) stock entry without touching the
   * rest of the breakdown. Re-aggregates part_stock and recomputes the plan.
   * Used by the "Add stock entry" one-at-a-time modal.
   */
  ipc.handle(
    IPC.PART_PRESS_STOCK_UPSERT_ONE,
    (
      _e,
      p: {
        part_id: number;
        press_id: number;
        month: string;
        qty: number;
      }
    ) => {
      const txn = db.transaction(() => {
        if (p.qty > 0) {
          db.prepare(
            `INSERT INTO part_press_stock (part_id, press_id, month, qty)
             VALUES (?,?,?,?)
             ON CONFLICT(part_id, press_id, month)
             DO UPDATE SET qty=excluded.qty`
          ).run(p.part_id, p.press_id, p.month, p.qty);
        } else {
          db.prepare(
            `DELETE FROM part_press_stock WHERE part_id=? AND press_id=? AND month=?`
          ).run(p.part_id, p.press_id, p.month);
        }
        const sums = db
          .prepare(
            `SELECT
               COALESCE(SUM(CASE WHEN pr.is_in_house = 1 THEN pps.qty ELSE 0 END), 0) as hil,
               COALESCE(SUM(CASE WHEN pr.is_in_house = 0 THEN pps.qty ELSE 0 END), 0) as outside
             FROM part_press_stock pps
             JOIN presses pr ON pr.id = pps.press_id
             WHERE pps.part_id = ? AND pps.month = ?`
          )
          .get(p.part_id, p.month) as { hil: number; outside: number };
        db.prepare(
          `INSERT INTO part_stock (part_id, month, hil_qty, outside_qty)
           VALUES (?,?,?,?)
           ON CONFLICT(part_id, month) DO UPDATE SET
             hil_qty = excluded.hil_qty,
             outside_qty = excluded.outside_qty`
        ).run(p.part_id, p.month, sums.hil, sums.outside);
        recomputePlanForPartMonth(db, p.part_id, p.month);
      });
      txn();
      emit(IPC.EVT_PLAN_UPDATED, { month: p.month });
      return true;
    }
  );

  /**
   * Upsert just the inter-unit qty for a part+month, leaving press breakdown
   * untouched. Used by the "Add stock entry" modal when location = Inter-unit.
   */
  ipc.handle(
    IPC.PART_INTERUNIT_STOCK_UPSERT,
    (_e, p: { part_id: number; month: string; qty: number }) => {
      db.prepare(
        `INSERT INTO part_stock (part_id, month, hil_qty, outside_qty, interunit_qty)
         VALUES (?,?,0,0,?)
         ON CONFLICT(part_id, month) DO UPDATE SET interunit_qty = excluded.interunit_qty`
      ).run(p.part_id, p.month, p.qty);
      recomputePlanForPartMonth(db, p.part_id, p.month);
      emit(IPC.EVT_PLAN_UPDATED, { month: p.month });
      return true;
    }
  );

  ipc.handle(IPC.PART_STOCK_IMPORT, async (_e, params: { month: string }) => {
    const win = getWin();
    const result = await dialog.showOpenDialog(win!, {
      title: 'Import part stock (Part Code · HIL Stock · Outside Stock)',
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, message: 'Cancelled', imported_rows: 0, skipped_rows: 0, warnings: [] };
    }
    const r = await importPartStock(db, result.filePaths[0]!, params.month);
    emit(IPC.EVT_PLAN_UPDATED, { month: params.month });
    return r;
  });

  ipc.handle(IPC.PART_STOCK_EXPORT, async (_e, params: { month: string }) => {
    const win = getWin();
    const result = await dialog.showSaveDialog(win!, {
      title: 'Export / download stock template',
      defaultPath: `ForgePlanner-Stock-${params.month}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, message: 'Cancelled', path: '' };
    return exportPartStock(db, result.filePath, params.month);
  });

  // ── Production logs (Step 3 of the workflow) ────────────────────────────
  ipc.handle(IPC.PRODUCTION_LIST, (_e, params: { month: string; part_id?: number }) => {
    let q = `SELECT pl.*, p.part_code, pr.code as press_code
             FROM production_logs pl
             JOIN parts p ON p.id = pl.part_id
             LEFT JOIN presses pr ON pr.id = pl.press_id
             WHERE pl.month=?`;
    const args: unknown[] = [params.month];
    if (params.part_id) {
      q += ' AND pl.part_id=?';
      args.push(params.part_id);
    }
    q += ' ORDER BY pl.logged_date DESC, pl.id DESC LIMIT 500';
    return db.prepare(q).all(...args);
  });

  ipc.handle(
    IPC.PRODUCTION_CREATE,
    (
      _e,
      p: {
        part_id: number;
        month: string;
        logged_date: string;
        qty_produced: number;
        press_id?: number | null;
        notes?: string | null;
      }
    ) => {
      const result = db
        .prepare(
          `INSERT INTO production_logs (part_id, month, logged_date, qty_produced, press_id, notes)
           VALUES (?,?,?,?,?,?)`
        )
        .run(
          p.part_id,
          p.month,
          p.logged_date,
          p.qty_produced,
          p.press_id ?? null,
          p.notes ?? null
        );
      emit(IPC.EVT_PLAN_UPDATED, { month: p.month });
      return result.lastInsertRowid;
    }
  );

  ipc.handle(IPC.PRODUCTION_DELETE, (_e, id: number) => {
    const row = db
      .prepare(`SELECT month FROM production_logs WHERE id=?`)
      .get(id) as { month: string } | undefined;
    db.prepare(`DELETE FROM production_logs WHERE id=?`).run(id);
    if (row) emit(IPC.EVT_PLAN_UPDATED, { month: row.month });
    return true;
  });

  /**
   * Returns one row per part in the month's plan with HIL plan, qty produced
   * so far, balance left, % complete, and how many days it would take to
   * finish on the assigned press (or "—" if unassigned / press is down).
   */
  ipc.handle(IPC.PRODUCTION_BALANCE, (_e, month: string) => {
    return db
      .prepare(
        `SELECT
           pp.part_id as part_id,
           p.part_code as part_code,
           COALESCE(c.code, '—') as customer_code,
           p.required_tonnage as required_tonnage,
           pp.hil_prod_qty as hil_plan,
           COALESCE((SELECT SUM(qty_produced) FROM production_logs
                     WHERE part_id = pp.part_id AND month = pp.month), 0) as produced,
           pr.code as assigned_press_code,
           pr.current_status as assigned_press_status,
           pr.capacity_per_day as capacity_per_day
         FROM production_plans pp
         JOIN parts p ON p.id = pp.part_id
         LEFT JOIN customers c ON c.id = pp.customer_id
         LEFT JOIN press_assignments pa ON pa.production_plan_id = pp.id
         LEFT JOIN presses pr ON pr.id = pa.press_id
         WHERE pp.month = ?
         ORDER BY (pp.hil_prod_qty - COALESCE((SELECT SUM(qty_produced) FROM production_logs
                                                WHERE part_id = pp.part_id AND month = pp.month), 0)) DESC`
      )
      .all(month)
      .map((r: unknown) => {
        const row = r as {
          part_id: number;
          part_code: string;
          customer_code: string;
          required_tonnage: number;
          hil_plan: number;
          produced: number;
          assigned_press_code: string | null;
          assigned_press_status: string | null;
          capacity_per_day: number | null;
        };
        const balance = Math.max(0, row.hil_plan - row.produced);
        const pct = row.hil_plan > 0 ? Math.min(100, (row.produced / row.hil_plan) * 100) : 0;
        const cap = row.capacity_per_day ?? 0;
        const isDown =
          row.assigned_press_status === 'Down' || row.assigned_press_status === 'Maintenance';
        const daysRemaining = cap > 0 && !isDown ? balance / (cap * 0.85) : null;
        return {
          ...row,
          balance,
          pct_complete: pct,
          days_remaining: daysRemaining,
        };
      });
  });

  /**
   * Lists every compatible alternate press for a given part — by tonnage,
   * sorted by free machine-days in the given month. Honors is_die_locked.
   */
  ipc.handle(
    IPC.PRODUCTION_ALTERNATES,
    (_e, params: { part_id: number; month: string; exclude_press_id?: number }) => {
      const part = db
        .prepare(`SELECT id, required_tonnage, is_die_locked, default_press_id FROM parts WHERE id=?`)
        .get(params.part_id) as
        | { id: number; required_tonnage: number; is_die_locked: number; default_press_id: number | null }
        | undefined;
      if (!part) return [];
      const presses = db
        .prepare(
          `SELECT p.*, v.name as vendor_name,
                  COALESCE((SELECT SUM(pa.required_machine_days)
                            FROM press_assignments pa
                            JOIN production_plans pp ON pp.id = pa.production_plan_id
                            WHERE pa.press_id = p.id AND pp.month = ?), 0) as required_days
           FROM presses p
           LEFT JOIN vendors v ON v.id = p.vendor_id
           WHERE p.is_active = 1
             AND p.tonnage >= ?
             AND p.id != COALESCE(?, -1)
             AND (? = 0 OR p.id = ?)`
        )
        .all(
          params.month,
          part.required_tonnage,
          params.exclude_press_id ?? null,
          part.is_die_locked,
          part.default_press_id ?? -1
        ) as Array<{
        id: number;
        code: string;
        tonnage: number;
        factory: string;
        is_in_house: 0 | 1;
        capacity_per_day: number;
        current_status: string;
        vendor_name: string | null;
        required_days: number;
      }>;
      // Approximate monthly available days: 24 for in-house, 30 for vendor
      return presses
        .map((p) => ({
          ...p,
          free_days: Math.max(0, (p.is_in_house ? 24 : 30) - p.required_days),
        }))
        .sort((a, b) => {
          // Exact-tonnage match first, then in-house, then most free days
          if (a.tonnage !== b.tonnage) {
            if (a.tonnage === part.required_tonnage) return -1;
            if (b.tonnage === part.required_tonnage) return 1;
            return a.tonnage - b.tonnage;
          }
          if (a.is_in_house !== b.is_in_house) return b.is_in_house - a.is_in_house;
          return b.free_days - a.free_days;
        });
    }
  );

  // ── Daily template — export / import ──────────────────────────────────
  ipc.handle(IPC.DAILY_TEMPLATE_EXPORT, async (_e, params: { date: string }) => {
    const win = getWin();
    const result = await dialog.showSaveDialog(win!, {
      title: 'Save daily template',
      defaultPath: `ForgePlanner-Daily-${params.date}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, message: 'Cancelled', rows: 0, path: '' };
    const companyName =
      (db.prepare(`SELECT value FROM settings WHERE key='company_name'`).get() as
        | { value: string }
        | undefined)?.value ?? 'ForgePlanner';
    return exportDailyTemplate(db, result.filePath, params.date, companyName);
  });

  ipc.handle(IPC.DAILY_TEMPLATE_IMPORT, async (_e, params: { date: string }) => {
    const win = getWin();
    const result = await dialog.showOpenDialog(win!, {
      title: 'Upload filled daily template',
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, message: 'Cancelled', imported_rows: 0, skipped_rows: 0, warnings: [] };
    }
    const r = await importDailyActuals(db, result.filePaths[0]!, params.date);
    emit(IPC.EVT_PLAN_UPDATED, { month: params.date.slice(0, 7) });
    return r;
  });

  ipc.handle(IPC.STOCK_LOCATIONS_LIST, () =>
    db
      .prepare(
        `SELECT sl.*, v.name as vendor_name
         FROM stock_locations sl
         LEFT JOIN vendors v ON v.id = sl.vendor_id
         WHERE sl.is_active=1
         ORDER BY
           CASE sl.kind WHEN 'HIL' THEN 1 WHEN 'External' THEN 2 WHEN 'Vendor' THEN 3 END,
           sl.name`
      )
      .all()
  );

  ipc.handle(IPC.STOCK_LOCATION_UPSERT, (_e, loc: Partial<StockLocation>) => {
    if (loc.id) {
      db.prepare(
        `UPDATE stock_locations SET name=?, kind=?, vendor_id=?, is_active=? WHERE id=?`
      ).run(
        loc.name,
        loc.kind ?? 'HIL',
        loc.vendor_id ?? null,
        loc.is_active ? 1 : 0,
        loc.id
      );
      return loc.id;
    }
    return db
      .prepare(
        `INSERT INTO stock_locations (name, kind, vendor_id, is_active) VALUES (?,?,?,?)`
      )
      .run(loc.name, loc.kind ?? 'HIL', loc.vendor_id ?? null, loc.is_active ? 1 : 0)
      .lastInsertRowid;
  });

  ipc.handle(IPC.STOCK_LOCATION_DELETE, (_e, id: number) =>
    db.prepare('DELETE FROM stock_locations WHERE id=?').run(id)
  );

  ipc.handle(IPC.PLAN_STOCKS_GET, (_e, planId: number) =>
    db
      .prepare(
        `SELECT pos.location_id, sl.name as location_name, sl.kind, pos.qty
         FROM plan_opening_stocks pos
         JOIN stock_locations sl ON sl.id = pos.location_id
         WHERE pos.production_plan_id = ?
         ORDER BY sl.kind, sl.name`
      )
      .all(planId)
  );

  ipc.handle(
    IPC.PLAN_STOCKS_SET,
    (_e, params: { plan_id: number; entries: Array<{ location_id: number; qty: number }> }) => {
      const txn = db.transaction(() => {
        db.prepare('DELETE FROM plan_opening_stocks WHERE production_plan_id=?').run(
          params.plan_id
        );
        const ins = db.prepare(
          'INSERT INTO plan_opening_stocks (production_plan_id, location_id, qty) VALUES (?,?,?)'
        );
        for (const e of params.entries) {
          if (e.location_id && e.qty > 0) ins.run(params.plan_id, e.location_id, e.qty);
        }

        // Recompute aggregate columns on the plan row so the grid stays in sync
        const breakdown = db
          .prepare(
            `SELECT sl.kind, COALESCE(SUM(pos.qty),0) as q
             FROM plan_opening_stocks pos
             JOIN stock_locations sl ON sl.id = pos.location_id
             WHERE pos.production_plan_id = ?
             GROUP BY sl.kind`
          )
          .all(params.plan_id) as Array<{ kind: string; q: number }>;
        const hil = breakdown.find((b) => b.kind === 'HIL')?.q ?? 0;
        const other = breakdown
          .filter((b) => b.kind !== 'HIL')
          .reduce((s, b) => s + b.q, 0);
        const plan = db
          .prepare(
            `SELECT customer_schedule_qty as cs, wip_safety_stock_qty as wip,
                    fg_safety_stock_qty as fg, osp_split_qty as osp
             FROM production_plans WHERE id=?`
          )
          .get(params.plan_id) as
          | { cs: number; wip: number; fg: number; osp: number }
          | undefined;
        if (plan) {
          const totalDemand = plan.cs + plan.wip + plan.fg;
          const netPlan = Math.max(0, totalDemand - hil - other);
          const hilProd = Math.max(0, netPlan - plan.osp);
          db.prepare(
            `UPDATE production_plans
             SET opening_wip_fg_qty=?, opening_gill_chock_qty=?,
                 total_demand_qty=?, net_prod_plan_qty=?, hil_prod_qty=?
             WHERE id=?`
          ).run(hil, other, totalDemand, netPlan, hilProd, params.plan_id);
        }
      });
      txn();
      emit(IPC.EVT_PLAN_UPDATED, {});
      return true;
    }
  );

  ipc.handle(IPC.SEED_SAMPLE_DATA, (_e, params: { month: string }) => {
    const r = seedSampleData(db, params.month);
    emit(IPC.EVT_PLAN_UPDATED, { month: params.month });
    return r;
  });

  ipc.handle(IPC.DB_INFO, () => {
    const dbPath = getDbPath();
    let size = 0;
    let modified: string | null = null;
    try {
      const st = fs.statSync(dbPath);
      size = st.size;
      modified = st.mtime.toISOString();
    } catch {
      // file may not exist yet
    }
    const counts = {
      presses: (db.prepare('SELECT COUNT(*) as c FROM presses').get() as { c: number }).c,
      customers: (db.prepare('SELECT COUNT(*) as c FROM customers').get() as { c: number }).c,
      parts: (db.prepare('SELECT COUNT(*) as c FROM parts').get() as { c: number }).c,
      plan_rows: (db.prepare('SELECT COUNT(*) as c FROM production_plans').get() as { c: number })
        .c,
      downtime_events: (
        db.prepare('SELECT COUNT(*) as c FROM downtime_events').get() as { c: number }
      ).c,
    };
    return { path: dbPath, size_bytes: size, modified, counts };
  });

  ipc.handle(IPC.DB_BACKUP, async () => {
    const win = getWin();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const result = await dialog.showSaveDialog(win!, {
      title: 'Backup database',
      defaultPath: `forgeplanner-backup-${ts}.db`,
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, message: 'Cancelled' };

    // Use better-sqlite3's online backup API — safe while DB is open.
    // Falls back to a checkpoint + file copy if backup() unavailable.
    try {
      await db.backup(result.filePath);
      return { ok: true, path: result.filePath };
    } catch (e) {
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
        fs.copyFileSync(getDbPath(), result.filePath);
        return { ok: true, path: result.filePath };
      } catch (err) {
        return { ok: false, message: String(err) };
      }
    }
  });

  ipc.handle(IPC.DB_RESET, () => {
    resetDatabase(db);
    emit(IPC.EVT_PLAN_UPDATED, {});
    emit(IPC.EVT_PRESS_STATUS_CHANGED, {});
    return { ok: true };
  });

  ipc.handle(IPC.DB_RESTORE, async () => {
    const win = getWin();
    const result = await dialog.showOpenDialog(win!, {
      title: 'Restore database from backup',
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, message: 'Cancelled' };
    }
    const source = result.filePaths[0]!;
    const target = getDbPath();

    // Stash a pre-restore safety backup, then queue the swap-and-relaunch.
    // The actual file swap happens at quit time so SQLite has fully closed.
    const safety = target + '.pre-restore-' + Date.now() + '.bak';
    try {
      await db.backup(safety);
    } catch {
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
        fs.copyFileSync(target, safety);
      } catch {
        // continue — best effort
      }
    }

    db.close();
    try {
      fs.copyFileSync(source, target);
      // Remove sidecar WAL/SHM so SQLite reopens cleanly
      try {
        fs.unlinkSync(target + '-wal');
      } catch {}
      try {
        fs.unlinkSync(target + '-shm');
      } catch {}
    } catch (e) {
      return { ok: false, message: 'Could not write to DB path: ' + String(e) };
    }

    app.relaunch();
    app.exit(0);
    return { ok: true };
  });

  ipc.handle(IPC.SETTINGS_GET, (): Settings => ({
    company_name: getSetting(db, 'company_name') ?? 'HIL ForgePlanner',
    default_efficiency_pct: parseFloat(getSetting(db, 'default_efficiency_pct') ?? '85'),
    default_safety_stock_pct: parseFloat(getSetting(db, 'default_safety_stock_pct') ?? '8.33'),
    wip_safety_days: parseFloat(getSetting(db, 'wip_safety_days') ?? '2'),
    fg_safety_days: parseFloat(getSetting(db, 'fg_safety_days') ?? '2'),
    exclude_sundays: (getSetting(db, 'exclude_sundays') ?? '1') === '1' ? 1 : 0,
    extra_holidays_per_month: parseFloat(getSetting(db, 'extra_holidays_per_month') ?? '0'),
    current_month: getSetting(db, 'current_month') ?? new Date().toISOString().slice(0, 7),
    logo_data_url: getSetting(db, 'logo_data_url') || null,
  }));
  ipc.handle(IPC.SETTINGS_UPDATE, (_e, s: Partial<Settings>) => {
    if (s.company_name !== undefined) setSetting(db, 'company_name', s.company_name);
    if (s.default_efficiency_pct !== undefined) setSetting(db, 'default_efficiency_pct', String(s.default_efficiency_pct));
    if (s.default_safety_stock_pct !== undefined) setSetting(db, 'default_safety_stock_pct', String(s.default_safety_stock_pct));
    if (s.wip_safety_days !== undefined) setSetting(db, 'wip_safety_days', String(s.wip_safety_days));
    if (s.fg_safety_days !== undefined) setSetting(db, 'fg_safety_days', String(s.fg_safety_days));
    if (s.exclude_sundays !== undefined) setSetting(db, 'exclude_sundays', s.exclude_sundays ? '1' : '0');
    if (s.extra_holidays_per_month !== undefined) setSetting(db, 'extra_holidays_per_month', String(s.extra_holidays_per_month));
    if (s.current_month !== undefined) setSetting(db, 'current_month', s.current_month);
    if (s.logo_data_url !== undefined) setSetting(db, 'logo_data_url', s.logo_data_url ?? '');
    return true;
  });
  ipc.handle(IPC.PICK_LOGO, async () => {
    const win = getWin();
    const result = await dialog.showOpenDialog(win!, {
      title: 'Choose logo image',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0]!;
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    return `data:${mime};base64,${data.toString('base64')}`;
  });
}
