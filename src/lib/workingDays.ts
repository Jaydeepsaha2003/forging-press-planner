/**
 * Computes calendar + working day counts for a "YYYY-MM" month string.
 * Working days = total days − Sundays (when excludeSundays is true) − extra holidays.
 */
export interface WorkingDays {
  total: number;
  sundays: number;
  working: number;
}

export function workingDaysInMonth(
  yearMonth: string,
  opts: { excludeSundays: boolean; extraHolidays: number }
): WorkingDays {
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m) return { total: 30, sundays: 4, working: 26 };
  // Last day of the month
  const total = new Date(y, m, 0).getDate();
  let sundays = 0;
  for (let d = 1; d <= total; d++) {
    const dow = new Date(y, m - 1, d).getDay(); // 0 = Sunday
    if (dow === 0) sundays++;
  }
  const off = (opts.excludeSundays ? sundays : 0) + Math.max(0, opts.extraHolidays);
  const working = Math.max(1, total - off);
  return { total, sundays, working };
}

export interface SafetyBreakdown {
  workingDays: number;
  dailyConsumption: number;
  wipDays: number;
  fgDays: number;
  wip: number;
  fg: number;
}

export function computeSafety(
  customerSchedule: number,
  yearMonth: string,
  cfg: {
    wipDays: number;
    fgDays: number;
    excludeSundays: boolean;
    extraHolidays: number;
  }
): SafetyBreakdown {
  const wd = workingDaysInMonth(yearMonth, {
    excludeSundays: cfg.excludeSundays,
    extraHolidays: cfg.extraHolidays,
  });
  const dailyConsumption = wd.working > 0 ? customerSchedule / wd.working : 0;
  return {
    workingDays: wd.working,
    dailyConsumption,
    wipDays: cfg.wipDays,
    fgDays: cfg.fgDays,
    wip: dailyConsumption * cfg.wipDays,
    fg: dailyConsumption * cfg.fgDays,
  };
}
