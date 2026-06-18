import { useEffect, useState } from 'react';
import { Route, Routes, NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Factory,
  ClipboardList,
  Warehouse,
  Hammer,
  AlertTriangle,
  FileBarChart2,
  Settings as SettingsIcon,
  Search,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  HelpCircle,
} from 'lucide-react';
import { useApp } from './store';
import type { Settings } from '../shared/types';
import { cn } from './lib/cn';
import { Dashboard } from './pages/Dashboard';
import { PressBoard } from './pages/PressBoard';
import { Plan } from './pages/Plan';
import { Stock } from './pages/Stock';
import { Production } from './pages/Production';
import { Downtime } from './pages/Downtime';
import { Reports } from './pages/Reports';
import { SettingsPage } from './pages/SettingsPage';
import { Help } from './pages/Help';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, step: null },
  { to: '/press-board', label: 'Press Board', icon: Factory, step: null },
  { to: '/stock', label: 'Stock', icon: Warehouse, step: 1 },
  { to: '/plan', label: 'Plan', icon: ClipboardList, step: 2 },
  { to: '/production', label: 'Production', icon: Hammer, step: 3 },
  { to: '/downtime', label: 'Downtime', icon: AlertTriangle, step: null },
  { to: '/reports', label: 'Reports', icon: FileBarChart2, step: null },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, step: null },
  { to: '/help', label: 'Help', icon: HelpCircle, step: null },
] as const;

const COLLAPSE_KEY = 'fp.sidebarCollapsed';

export default function App() {
  const { reload, settings, month, setMonth } = useApp();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      // ignore
    }
  }, [collapsed]);

  return (
    <div className="min-h-screen flex bg-steel-50 text-steel-900">
      <Sidebar
        settings={settings}
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar month={month} onMonthChange={setMonth} />
        <main className="flex-1 overflow-auto">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="p-6"
          >
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/press-board" element={<PressBoard />} />
              <Route path="/production" element={<Production />} />
              <Route path="/help" element={<Help />} />
              <Route path="/plan" element={<Plan />} />
              <Route path="/stock" element={<Stock />} />
              <Route path="/downtime" element={<Downtime />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </motion.div>
        </main>
      </div>
    </div>
  );
}

function Sidebar({
  settings,
  collapsed,
  onToggle,
}: {
  settings: Settings | null;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className={cn(
        'shrink-0 hidden md:flex flex-col bg-steel-950 text-steel-100 transition-[width] duration-200 ease-out',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      <div
        className={cn(
          'flex items-center border-b border-white/5 py-5',
          collapsed ? 'justify-center px-2' : 'px-5 gap-3'
        )}
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-forge-500 to-forge-700 flex items-center justify-center shadow-glow-amber overflow-hidden shrink-0">
          {settings?.logo_data_url ? (
            <img src={settings.logo_data_url} alt="logo" className="w-full h-full object-cover" />
          ) : (
            <span className="text-white font-black text-lg tracking-tight">FP</span>
          )}
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-bold text-sm leading-tight truncate">
              {settings?.company_name ?? 'HIL ForgePlanner'}
            </div>
            <div className="text-[11px] text-steel-400 leading-tight">
              Plan smart. Forge ahead.
            </div>
          </div>
        )}
      </div>

      <nav className={cn('flex-1 py-4 space-y-1', collapsed ? 'px-2' : 'px-3')}>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            title={collapsed ? n.label : undefined}
            className={({ isActive }) =>
              cn(
                'group flex items-center rounded-xl text-sm font-medium transition-all',
                collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                isActive
                  ? 'bg-white/10 text-white shadow-inner'
                  : 'text-steel-300 hover:text-white hover:bg-white/5'
              )
            }
          >
            {({ isActive }) => (
              <>
                <n.icon
                  className={cn(
                    'w-[18px] h-[18px] transition shrink-0',
                    isActive ? 'text-forge-400' : 'text-steel-400 group-hover:text-steel-200'
                  )}
                />
                {!collapsed && (
                  <>
                    <span className="flex-1">{n.label}</span>
                    {n.step !== null && (
                      <span
                        className={cn(
                          'inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-black tabular-nums',
                          isActive
                            ? 'bg-forge-500 text-white'
                            : 'bg-white/10 text-steel-400 group-hover:bg-white/20 group-hover:text-steel-200'
                        )}
                      >
                        {n.step}
                      </span>
                    )}
                  </>
                )}
              </>
            )}
          </NavLink>
        ))}
        {!collapsed && (
          <>
            <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider font-semibold text-steel-500">
              Workflow
            </div>
            <div className="px-3 text-[10px] text-steel-500 leading-relaxed">
              <span className="font-bold text-forge-400">1</span> Stock →{' '}
              <span className="font-bold text-forge-400">2</span> Plan →{' '}
              <span className="font-bold text-forge-400">3</span> Produce
            </div>
          </>
        )}
      </nav>

      <button
        onClick={onToggle}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={cn(
          'border-t border-white/5 py-3 flex items-center text-steel-400 hover:text-white hover:bg-white/5 transition',
          collapsed ? 'justify-center' : 'justify-end px-5 gap-2'
        )}
      >
        {!collapsed && <span className="text-[11px] font-semibold">Collapse</span>}
        {collapsed ? (
          <ChevronsRight className="w-4 h-4" />
        ) : (
          <ChevronsLeft className="w-4 h-4" />
        )}
      </button>

      {!collapsed && (
        <div className="px-5 py-3 border-t border-white/5">
          <div className="text-[11px] text-steel-500">Offline · v1.0</div>
          <div className="text-[11px] text-steel-500">SQLite local</div>
        </div>
      )}
    </aside>
  );
}

function TopBar({ month, onMonthChange }: { month: string; onMonthChange: (m: string) => void }) {
  const months = monthOptions(month);
  return (
    <header className="h-16 bg-white border-b border-steel-200 flex items-center px-6 gap-4">
      <div className="flex items-center gap-2.5 text-steel-500 bg-steel-100 rounded-xl px-3 py-1.5 flex-1 max-w-md">
        <Search className="w-4 h-4" />
        <input
          placeholder="Search parts, presses, customers..."
          className="bg-transparent text-sm flex-1 outline-none placeholder:text-steel-400"
        />
        <kbd className="text-[10px] font-semibold bg-white border border-steel-200 rounded px-1.5 py-0.5 text-steel-500">
          Ctrl K
        </kbd>
      </div>
      <div className="flex items-center gap-3 ml-auto">
        <div className="relative">
          <select
            className="select pl-9 pr-9 font-semibold text-steel-800"
            value={month}
            onChange={(e) => onMonthChange(e.target.value)}
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-steel-400" />
        </div>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-industrial-700 to-industrial-900 flex items-center justify-center text-white text-sm font-bold shadow-sm">
            PL
          </div>
          <div className="text-sm">
            <div className="font-semibold leading-tight">Planner</div>
            <div className="text-[11px] text-steel-500 leading-tight">Full access</div>
          </div>
        </div>
      </div>
    </header>
  );
}

function monthOptions(current: string): Array<{ value: string; label: string }> {
  const [y, m] = current.split('-').map(Number);
  const base = new Date(y, (m ?? 1) - 1, 1);
  const opts: Array<{ value: string; label: string }> = [];
  for (let offset = -6; offset <= 6; offset++) {
    const d = new Date(base.getFullYear(), base.getMonth() + offset, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    opts.push({ value, label });
  }
  return opts;
}
