export type PressStatus = 'Running' | 'Down' | 'Setup' | 'Maintenance' | 'Idle';
/**
 * Tonnage is stored as a free integer in the DB. The fixed union here lists
 * the common values so dropdowns can suggest them, but any positive number
 * is valid — users can add custom-tonnage machines via Settings → Presses.
 */
export type Tonnage = number;
export const COMMON_TONNAGES = [400, 600, 1000, 1600, 2500] as const;
/**
 * Factory label on a press.
 * Reserved: 'FS1' / 'FS2' / 'InterUnit'.
 * Vendor presses store the vendor's name directly so the UI can read it without
 * a second join. Auto-distribute keys off `is_in_house` and the special
 * 'InterUnit' string — every other value falls into the vendor tier.
 */
export type Factory = 'FS1' | 'FS2' | 'InterUnit' | (string & {});

/** Three-tier allocation priority used by auto-distribute. */
export type PressTier = 'in_house' | 'inter_unit' | 'vendor';

export interface AllocationPlan {
  /** Per plan row: how the auto-distributor splits the HIL production qty. */
  plan_id: number;
  part_id: number;
  part_code: string;
  customer_code: string;
  priority_tier: PriorityTier;
  hil_prod_qty: number;
  assignments: Array<{
    press_id: number;
    press_code: string;
    tier: PressTier;
    factory: string;
    vendor_name: string | null;
    qty: number;
    days: number;
  }>;
  unallocated_qty: number;
}

export interface AllocationPreview {
  month: string;
  rows: AllocationPlan[];
  summary: {
    parts_total: number;
    parts_fully_allocated: number;
    parts_partial: number;
    parts_unallocated: number;
    qty_total: number;
    qty_in_house: number;
    qty_inter_unit: number;
    qty_vendor: number;
    qty_unallocated: number;
  };
}
export type MaterialType = 'HW' | 'HWCB' | 'OSP';
export type PartCategory = 'Fast Runner' | 'Slow Runner';
export type PriorityTier = 'Critical' | 'High' | 'Medium' | 'Low';
export type UserRole = 'Planner' | 'Supervisor' | 'ProductionHead' | 'Admin';
export type DowntimeReason =
  | 'Electrical'
  | 'Hydraulic'
  | 'Mechanical'
  | 'Die'
  | 'Operator'
  | 'Power'
  | 'Other';

export interface Press {
  id: number;
  code: string;
  factory: Factory;
  is_in_house: 0 | 1;
  tonnage: Tonnage;
  capacity_per_day: number;
  /** Day-shift capacity in pcs. day + night = capacity_per_day. */
  day_capacity: number;
  /** Night-shift capacity in pcs. */
  night_capacity: number;
  efficiency_pct: number;
  current_status: PressStatus;
  status_changed_at: string;
  is_active: 0 | 1;
  vendor_id: number | null;
}

export interface Vendor {
  id: number;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
}

export interface Customer {
  id: number;
  code: string;
  full_name: string | null;
  priority_tier: PriorityTier;
  notes: string | null;
}

export interface Part {
  id: number;
  part_code: string;
  material_type: MaterialType;
  category: PartCategory;
  required_tonnage: Tonnage;
  default_press_id: number | null;
  is_die_locked: 0 | 1;
  notes: string | null;
  /** Per-part WIP safety days override. null = use global Settings default. */
  wip_safety_days: number | null;
  /** Per-part FG safety days override. null = use global Settings default. */
  fg_safety_days: number | null;
  /** Per-piece sale price in INR. 0 = not priced. */
  price_per_piece: number;
}

export interface ProductionPlan {
  id: number;
  month: string; // YYYY-MM
  part_id: number;
  customer_id: number;
  customer_schedule_qty: number;
  wip_safety_stock_qty: number;
  fg_safety_stock_qty: number;
  total_demand_qty: number;
  opening_wip_fg_qty: number;
  opening_gill_chock_qty: number;
  net_prod_plan_qty: number;
  osp_split_qty: number;
  hil_prod_qty: number;
  supply_location: string;
}

export interface PressAssignment {
  id: number;
  production_plan_id: number;
  press_id: number;
  allocated_qty: number;
  required_machine_days: number;
}

export interface ScheduledMaintenance {
  id: number;
  press_id: number;
  press_code: string;
  starts_on: string; // YYYY-MM-DD
  ends_on: string | null;
  reason: string | null;
  notes: string | null;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
}

export interface UpcomingMaintenance {
  maintenance: ScheduledMaintenance;
  days_until: number;
  affected_parts: Array<{
    part_id: number;
    part_code: string;
    customer_code: string;
    qty_at_risk: number;
    required_tonnage: Tonnage;
    alternates: Array<{
      press_code: string;
      tonnage: Tonnage;
      factory: string;
      is_in_house: 0 | 1;
      vendor_name: string | null;
      free_days: number;
    }>;
  }>;
}

export interface DowntimeEvent {
  id: number;
  press_id: number;
  start_datetime: string;
  end_datetime: string | null;
  reason: DowntimeReason;
  notes: string | null;
  expected_restoration_datetime: string | null;
  reported_by: number | null;
}

export interface RelocationLog {
  id: number;
  triggered_by_downtime_id: number | null;
  part_id: number;
  from_press_id: number;
  to_press_id: number;
  qty_moved: number;
  required_machine_days: number;
  moved_at: string;
  moved_by_user_id: number | null;
  notes: string | null;
}

export type StockLocationKind = 'HIL' | 'Vendor' | 'External';

export interface StockLocation {
  id: number;
  name: string;
  kind: StockLocationKind;
  vendor_id: number | null;
  is_active: 0 | 1;
}

export interface PlanOpeningStock {
  id: number;
  production_plan_id: number;
  location_id: number;
  qty: number;
}

export interface PlanStockBreakdown {
  location_id: number;
  location_name: string;
  kind: StockLocationKind;
  qty: number;
}

export interface PartStock {
  id: number;
  part_id: number;
  month: string; // YYYY-MM
  hil_qty: number;
  outside_qty: number;
}

// Row used by the Stock page — every part with its stock for the month
export interface PartStockRow {
  part_id: number;
  part_code: string;
  material_type: MaterialType;
  category: PartCategory;
  required_tonnage: Tonnage;
  hil_qty: number;
  outside_qty: number;
  in_plan: 0 | 1; // whether this part is already on the plan for the month
}

export interface AppUser {
  id: number;
  name: string;
  role: UserRole;
  factory: string | null;
  pin_or_password: string | null;
}

export interface Settings {
  company_name: string;
  default_efficiency_pct: number;
  default_safety_stock_pct: number;
  wip_safety_days: number;
  fg_safety_days: number;
  exclude_sundays: 0 | 1;
  extra_holidays_per_month: number;
  current_month: string;
  logo_data_url: string | null;
}

// Joined views used by the renderer

export interface PressWithLoad extends Press {
  vendor_name: string | null;
  load_pct: number;
  required_machine_days: number;
  available_machine_days: number;
  current_part_code: string | null;
}

export interface PlanRow {
  id: number;
  month: string;
  customer_id: number | null;
  customer_code: string;
  customer_name: string | null;
  part_code: string;
  part_id: number;
  supply_location: string;
  material_type: MaterialType;
  category: PartCategory;
  customer_schedule_qty: number;
  wip_safety_stock_qty: number;
  fg_safety_stock_qty: number;
  total_demand_qty: number;
  opening_wip_fg_qty: number;
  opening_gill_chock_qty: number;
  net_prod_plan_qty: number;
  osp_split_qty: number;
  hil_prod_qty: number;
  required_tonnage: Tonnage;
  assigned_press_code: string | null;
  assigned_press_id: number | null;
  required_machine_days: number;
  capacity_per_day: number;
  is_die_locked: 0 | 1;
  priority_tier: PriorityTier;
}

export interface CapacitySummary {
  tonnage: Tonnage;
  required_days: number;
  available_days: number;
  utilization_pct: number;
}

export interface DashboardKPIs {
  total_demand_qty: number;
  in_house_qty: number;
  osp_qty: number;
  at_risk_qty: number;
  in_house_pct: number;
  osp_pct: number;
  part_count: number;
  customer_count: number;
  /** Total INR value of customer orders for the month. */
  total_order_value: number;
  /** INR value of work currently sitting on Down/Maintenance presses. */
  at_risk_value: number;
}

export interface RelocationCandidate {
  press: PressWithLoad;
  score: number;
  reasons: string[];
  free_days: number;
}

export interface RelocationSuggestion {
  plan_row: PlanRow;
  candidates: RelocationCandidate[];
}

export interface BreakdownImpactAlt {
  press_code: string;
  tonnage: Tonnage;
  is_in_house: 0 | 1;
  vendor_name: string | null;
  free_days: number;
}

export interface BreakdownImpactPart {
  part_id: number;
  part_code: string;
  required_tonnage: Tonnage;
  qty_at_risk: number;
  value_at_risk: number;
  produced: number;
  planned: number;
  press_code: string;
  press_status: PressStatus;
  alternates: BreakdownImpactAlt[];
}

export interface BreakdownImpactCustomer {
  customer_id: number;
  customer_code: string;
  customer_name: string | null;
  priority_tier: PriorityTier;
  total_qty_at_risk: number;
  total_value_at_risk: number;
  affected_parts: BreakdownImpactPart[];
}

export interface CustomerRisk {
  customer_id: number;
  customer_code: string;
  customer_name: string | null;
  priority_tier: PriorityTier;
  total_demand: number;
  planned: number;
  at_risk: number;
  risk_pct: number;
  reasons: string[];
}

export type ImportResult = {
  ok: boolean;
  message: string;
  imported_rows: number;
  skipped_rows: number;
  warnings: string[];
};

export interface PressBoardDrawer {
  press: PressWithLoad;
  parts: PlanRow[];
  history: DowntimeEvent[];
}

export interface ProductionLog {
  id: number;
  part_id: number;
  part_code: string;
  month: string;
  logged_date: string;
  qty_produced: number;
  press_id: number | null;
  press_code: string | null;
  notes: string | null;
  created_at: string;
}

export interface ProductionBalance {
  part_id: number;
  part_code: string;
  customer_code: string;
  required_tonnage: Tonnage;
  hil_plan: number;
  produced: number;
  balance: number;
  pct_complete: number;
  capacity_per_day: number | null;
  days_remaining: number | null;
  assigned_press_code: string | null;
  assigned_press_status: PressStatus | null;
}

export interface PartPressStockEntry {
  press_id: number;
  press_code: string;
  is_in_house: 0 | 1;
  tonnage: Tonnage;
  factory: string;
  vendor_name: string | null;
  qty: number;
}

export interface AlternatePress {
  id: number;
  code: string;
  tonnage: Tonnage;
  factory: string;
  is_in_house: 0 | 1;
  vendor_name: string | null;
  current_status: PressStatus;
  free_days: number;
  capacity_per_day: number;
}
