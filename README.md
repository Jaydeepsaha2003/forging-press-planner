# ForgePlanner

A Windows desktop app for production planning at a forging shop: per-press capacity, opening stock, customer schedules, FIFO auto-distribute across in-house / inter-unit / vendor presses, daily production logging, breakdown re-routing, scheduled maintenance — all offline, all in one place.

Built with **Electron + React + TypeScript + Tailwind + SQLite**.

## 📥 Download

Grab the latest installer from the [**Releases**](../../releases) page. Every tagged release ships a Windows installer (`*-Setup-*.exe`) and a portable build (`*-Portable-*.exe`) — both around 93 MB.

For unreleased changes, check the [**Actions**](../../actions) tab — every push to `main` builds artifacts you can download by clicking into a workflow run.

## 🎯 What it does

```
  ┌─ Stock (Step 1) ──── Opening inventory per press, per vendor, per branch
  ├─ Plan  (Step 2) ──── Customer schedules → auto-calculated WIP/FG safety
  ├─ Auto-distribute ─── FIFO across In-house → Inter Branch → Vendor presses
  └─ Production (Step 3) Log daily output → balance decrements → ₹ visible
```

Plus:

- **Press Board** — live status grid (Running / Idle / Prevention / Breakdown) with one-click status change and re-route wizard
- **Breakdown impact** — when any press goes down, the Dashboard shows affected customers, parts, ₹ at risk, and the top-3 alternate presses inline
- **Daily template** — export an Excel sheet for operators to write Day/Night actuals → re-import to log production in bulk
- **Scheduled maintenance** — plan future downtime; Dashboard warns 14 days early with the parts that need to move
- **Per-piece pricing** — Dashboard ₹ KPIs (total order value, at-risk amount) in Indian lakh/crore short format
- **Multi-press stock** — track inventory at each specific press, vendor yard, or sister branch
- **Bulk delete + Save flows** across all master-data tabs
- **Sidebar collapse + Help page** for shop-floor usability

## 🚀 Quick start

### Run from source

```bash
git clone https://github.com/<your-username>/forging-press-planner.git
cd forging-press-planner
npm install
npm run dev
```

Vite dev server + Electron window open automatically. Hot reload on save.

### Build a Windows installer

```bash
# With default HIL-flavored seed data
npm run build

# Shareable blank build (no seeded data — recipient starts fresh)
npm run build:blank
```

Output lands in `release/`:
- `HIL ForgePlanner-Setup-1.0.0.exe` — NSIS installer
- `HIL ForgePlanner-Portable-1.0.0.exe` — single-file portable

## 🛠 Tech

| Layer | Choice |
|---|---|
| Shell | Electron 33 (Windows) |
| UI | React 18 + TypeScript + Tailwind CSS 3 |
| State | Zustand |
| DB | better-sqlite3 (local, offline, single file) |
| Excel I/O | ExcelJS |
| Charts | Recharts |
| Animations | Framer Motion |
| Build | Vite + electron-builder |

## 📂 Project structure

```
electron/                 — Main process: SQLite, IPC handlers, Excel I/O
  db.ts                   — schema + migrations + seed
  ipc-handlers.ts         — every channel the renderer can call
  planning.ts             — WIP/FG safety math + plan recompute
  auto-distribute.ts      — FIFO 3-tier press allocator
  daily-template.ts       — daily Excel export + actuals import
shared/                   — types & IPC channel names (shared with renderer)
src/                      — Renderer (React)
  pages/                  — Dashboard, Plan, Stock, Production, PressBoard, ...
  components/             — Reusable UI (Modal, Drawer, PressTile, ...)
```

## ⚙️ Settings

After install, open **Settings** to configure:

1. **Company** — name + logo
2. **Presses** — add each machine: type (In-house / Inter Branch / Vendor), tonnage (free-form), day-shift + night-shift capacity
3. **Vendors** — partner names + contacts (phone links work)
4. **Customers** — code + name + priority tier (Critical / High / Medium / Low)
5. **Parts** — code + tonnage + WIP/FG safety days override + ₹/piece price
6. **Stock Locations** — HIL godowns, GILL CHOCK, vendor yards
7. **Preferences** — default safety days, working calendar (Sundays + holidays), efficiency %
8. **Database** — backup / restore / reset

## 📜 License

MIT — see [LICENSE](LICENSE).
