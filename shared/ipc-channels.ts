export const IPC = {
  // Master data
  PRESSES_LIST: 'presses:list',
  PRESSES_LIST_WITH_LOAD: 'presses:list-with-load',
  PRESS_UPSERT: 'press:upsert',
  PRESS_DELETE: 'press:delete',
  PRESS_DELETE_MANY: 'press:delete-many',
  PRESS_SET_STATUS: 'press:set-status',

  VENDORS_LIST: 'vendors:list',
  VENDOR_UPSERT: 'vendor:upsert',
  VENDOR_DELETE: 'vendor:delete',
  VENDOR_DELETE_MANY: 'vendor:delete-many',

  CUSTOMERS_LIST: 'customers:list',
  CUSTOMER_UPSERT: 'customer:upsert',
  CUSTOMER_DELETE: 'customer:delete',
  CUSTOMER_DELETE_MANY: 'customer:delete-many',

  PARTS_LIST: 'parts:list',
  PART_UPSERT: 'part:upsert',
  PART_DELETE: 'part:delete',

  // Plan
  PLAN_LIST: 'plan:list',
  PLAN_MONTHS: 'plan:months',
  PLAN_UPSERT_ROW: 'plan:upsert-row',
  PLAN_DELETE_ROW: 'plan:delete-row',
  PLAN_ASSIGN_PRESS: 'plan:assign-press',
  PLAN_UNASSIGN_PRESS: 'plan:unassign-press',
  PLAN_CARRY_FORWARD: 'plan:carry-forward',
  PLAN_SET_SCHEDULE: 'plan:set-schedule',
  PLAN_IMPORT_SCHEDULES: 'plan:import-schedules',

  // Auto-distribute (FIFO across in-house → inter-unit → vendor)
  PLAN_AUTO_DISTRIBUTE_PREVIEW: 'plan:auto-distribute-preview',
  PLAN_AUTO_DISTRIBUTE_APPLY: 'plan:auto-distribute-apply',

  // Part stock (separate per part + month, HIL vs outside vs interunit)
  PART_STOCK_LIST: 'part-stock:list',
  PART_STOCK_GET: 'part-stock:get',
  PART_STOCK_UPSERT: 'part-stock:upsert',
  PART_STOCK_IMPORT: 'part-stock:import',
  PART_STOCK_EXPORT: 'part-stock:export',

  // Granular per-press stock (auto-aggregates into part_stock)
  PART_PRESS_STOCK_GET: 'part-press-stock:get',
  PART_PRESS_STOCK_SET: 'part-press-stock:set',
  PART_PRESS_STOCK_UPSERT_ONE: 'part-press-stock:upsert-one',
  PART_INTERUNIT_STOCK_UPSERT: 'part-interunit-stock:upsert',

  // Production log (daily output deducting from HIL Prod balance)
  PRODUCTION_LIST: 'production:list',
  PRODUCTION_CREATE: 'production:create',
  PRODUCTION_DELETE: 'production:delete',
  PRODUCTION_BALANCE: 'production:balance',
  PRODUCTION_ALTERNATES: 'production:alternates',

  // Daily template — operator fills, planner re-imports
  DAILY_TEMPLATE_EXPORT: 'daily-template:export',
  DAILY_TEMPLATE_IMPORT: 'daily-template:import',

  // Scheduled maintenance (pre-planned, future-dated)
  MAINTENANCE_LIST: 'maintenance:list',
  MAINTENANCE_UPSERT: 'maintenance:upsert',
  MAINTENANCE_DELETE: 'maintenance:delete',
  MAINTENANCE_UPCOMING: 'maintenance:upcoming',

  // Downtime
  DOWNTIME_LIST: 'downtime:list',
  DOWNTIME_CREATE: 'downtime:create',
  DOWNTIME_CLOSE: 'downtime:close',
  DOWNTIME_DELETE: 'downtime:delete',

  // Relocation
  RELOCATION_SUGGEST: 'relocation:suggest',
  RELOCATION_APPLY: 'relocation:apply',
  RELOCATION_LOG: 'relocation:log',

  // Dashboard / analytics
  DASHBOARD_KPIS: 'dashboard:kpis',
  CAPACITY_SUMMARY: 'capacity:summary',
  CUSTOMER_RISK: 'customer:risk',
  CUSTOMER_BREAKDOWN_IMPACT: 'customer:breakdown-impact',

  // Excel
  EXCEL_IMPORT: 'excel:import',
  EXCEL_EXPORT: 'excel:export',

  // Stock locations
  STOCK_LOCATIONS_LIST: 'stock-locations:list',
  STOCK_LOCATION_UPSERT: 'stock-location:upsert',
  STOCK_LOCATION_DELETE: 'stock-location:delete',
  PLAN_STOCKS_GET: 'plan-stocks:get',
  PLAN_STOCKS_SET: 'plan-stocks:set',

  // Sample data
  SEED_SAMPLE_DATA: 'seed:sample-data',

  // Database management
  DB_INFO: 'db:info',
  DB_RESET: 'db:reset',
  DB_BACKUP: 'db:backup',
  DB_RESTORE: 'db:restore',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  PICK_LOGO: 'settings:pick-logo',

  // Events (main -> renderer)
  EVT_PRESS_STATUS_CHANGED: 'evt:press-status-changed',
  EVT_PLAN_UPDATED: 'evt:plan-updated',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
