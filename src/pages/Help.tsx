import { Link } from 'react-router-dom';
import {
  HelpCircle,
  Warehouse,
  ClipboardList,
  Wand2,
  Hammer,
  Factory,
  AlertOctagon,
  Settings as SettingsIcon,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  Database,
  Wrench,
  KeyRound,
} from 'lucide-react';

/**
 * Step-by-step onboarding & reference guide. One page, scrollable, with
 * jump links at the top and detailed sections below.
 */
export function Help() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <header className="card p-6 bg-gradient-to-br from-steel-900 via-industrial-900 to-steel-900 text-white">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
            <HelpCircle className="w-6 h-6 text-forge-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Help &amp; quick start</h1>
            <p className="text-sm text-steel-300 mt-1">
              The four-step workflow, in plain language. Skim the jump-links below or read top-to-bottom.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
              {[
                ['#first', 'First-time setup'],
                ['#step1', 'Step 1 · Stock'],
                ['#step2', 'Step 2 · Plan'],
                ['#step3', 'Step 3 · Auto-distribute'],
                ['#step4', 'Step 4 · Production'],
                ['#press', 'Press Board & re-route'],
                ['#maint', 'Scheduled maintenance'],
                ['#db', 'Backup & reset'],
              ].map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold"
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </header>

      <Section id="first" icon={KeyRound} title="First-time setup (5 minutes)" tone="forge">
        <Ol>
          <li>
            <b>Settings → Company</b>: company name + logo (top-left of sidebar)
          </li>
          <li>
            <b>Settings → Presses</b>: 14 in-house FP presses already pre-seeded. Edit factory
            (FS1 / FS2 / InterUnit), tonnage and per-day capacity to match your shop.
          </li>
          <li>
            <b>Settings → Vendors</b>: rename the default Vendor 1–4 to your real partners.
            Optionally fill contact info.
          </li>
          <li>
            <b>Settings → Customers</b>: 21 codes pre-seeded with priority tier. Edit full names
            and tier (Critical / High / Medium / Low) — drives FIFO &amp; risk panel order.
          </li>
          <li>
            <b>Settings → Parts</b>: add each part you forge (Bulk-add lets you paste many at
            once). Set tonnage. Optional: per-part WIP/FG safety days override.
          </li>
          <li>
            <b>Settings → Preferences</b>: confirm WIP/FG safety days default (start with 2/2),
            "Exclude Sundays" on, any extra monthly holidays.
          </li>
        </Ol>
        <Note>
          One-time master data setup. Touch Settings only when something changes (new press,
          new part, vendor changes, holidays). Day-to-day, you stay in Steps 1–4 below.
        </Note>
      </Section>

      <Section id="step1" icon={Warehouse} title="Step 1 · Stock — opening inventory" tone="industrial" step={1}>
        <p>
          At the start of every month, tell the system what's already in stock for each part —
          across HIL godowns, sister branches, and vendor yards.
        </p>
        <Ol>
          <li>
            Open <Link to="/stock" className="link">Stock</Link> from the sidebar.
          </li>
          <li>
            Click <Btn>＋ Add stock entry</Btn> for one-at-a-time entry:
            <ul className="list-disc list-inside ml-4 mt-1 text-steel-600">
              <li>Pick the part</li>
              <li>Pick where the stock is — in-house press, vendor press, or inter-unit branch</li>
              <li>Type quantity → Save &amp; close (or "Save &amp; add another" for the same part at multiple presses)</li>
            </ul>
          </li>
          <li>
            Or click the chevron on any existing row to expand → enter qty per press in bulk →{' '}
            <Btn>Save breakdown</Btn>.
          </li>
          <li>
            HIL Stock and Outside Stock columns auto-aggregate from your per-press entries.
          </li>
        </Ol>
        <Note>
          Tip: enter stock once on the 1st of the month. Any leftover after production runs
          carries forward automatically — just update at the next month start.
        </Note>
      </Section>

      <Section id="step2" icon={ClipboardList} title="Step 2 · Plan — customer schedules" tone="industrial" step={2}>
        <p>
          Add each customer's monthly order. The system auto-calculates WIP safety, FG safety,
          total demand, opening-stock deduction, and net production needed.
        </p>
        <Ol>
          <li>
            Open <Link to="/plan" className="link">Plan</Link>.
          </li>
          <li>
            Use the <b>Quick add strip</b> at the top: Customer → Part → Required Qty →{' '}
            <Btn>Add to plan</Btn>. That's it.
          </li>
          <li>
            Or click <Btn>＋ Add row</Btn> for the full modal (same 3 fields, with a live preview
            card showing the calculation).
          </li>
          <li>
            Hover any row → pencil icon to edit, trash to delete.
          </li>
        </Ol>
        <Note>
          You don't enter WIP/FG safety here — those come from the part settings or global
          default. Press assignment also happens later in Step 3.
        </Note>
      </Section>

      <Section
        id="step3"
        icon={Wand2}
        title="Step 3 · Auto-distribute — assign presses (FIFO)"
        tone="forge"
        step={3}
      >
        <p>
          Once all your schedules are in, click <Btn className="bg-forge-500 text-white">✨ Auto-distribute</Btn>{' '}
          on the Plan page.
        </p>
        <Ol>
          <li>
            A preview modal opens with the proposed press assignments. Color codes:
            <ul className="list-disc list-inside ml-4 mt-1 text-steel-600">
              <li>🟢 Green — fully allocated</li>
              <li>🟡 Amber — partially (some pieces couldn't fit, will need attention)</li>
              <li>🔴 Red — no compatible press has free capacity</li>
            </ul>
          </li>
          <li>
            Allocation priority (3 tiers, FIFO within tier):
            <ol className="list-decimal list-inside ml-4 mt-1 text-steel-600">
              <li>In-house (FS1, FS2)</li>
              <li>Inter-unit / sister branches</li>
              <li>Vendors (OSP)</li>
            </ol>
            Critical customers (HERO, MSIL) get capacity first regardless of when their row was
            added.
          </li>
          <li>
            Click <Btn>Apply allocations</Btn> to commit. Re-run any time — wipes and re-allocates
            cleanly.
          </li>
        </Ol>
        <Note>
          Down/Maintenance presses are skipped automatically. Die-locked parts only get
          suggested their default press.
        </Note>
      </Section>

      <Section id="step4" icon={Hammer} title="Step 4 · Production — log daily output" tone="emerald" step={4}>
        <p>
          As parts are produced each day, log the output. Balance decrements in real-time.
        </p>
        <Ol>
          <li>
            Open <Link to="/production" className="link">Production</Link>.
          </li>
          <li>
            Click <Btn>＋ Log production</Btn>. Pick date (defaults to today), part, qty, optional
            press → Save.
          </li>
          <li>
            The main table shows HIL plan / Produced / Balance / days-remaining for every part.
            Progress bars turn green when complete, red when the assigned press is down.
          </li>
          <li>
            Click <Btn>Alternates</Btn> on any row to see every compatible press it could run on
            (sorted by free capacity).
          </li>
        </Ol>
      </Section>

      <Section id="press" icon={Factory} title="Press Board & re-route on breakdown">
        <p>
          When something goes wrong, the <Link to="/press-board" className="link">Press Board</Link>{' '}
          is your control panel.
        </p>
        <Ol>
          <li>
            Click any press tile → drawer opens. Pick from <b>Running</b>, <b>Idle</b>,{' '}
            <b>Prevention</b> (planned servicing), or <b>Breakdown</b> (unexpected failure).
            Parts queue and recent downtime show below.
          </li>
          <li>
            Hit <Btn className="bg-rose-600 text-white">Change to Breakdown</Btn> → pick reason →
            save. The press turns red and an Action Card appears on the Dashboard with the
            recovery plan.
          </li>
          <li>
            The Action Card lists affected parts + top-3 alternate presses ranked by free
            capacity. Click <Btn>Re-route now</Btn> → wizard opens with suggestions pre-selected
            → Apply.
          </li>
          <li>
            When the press is fixed, open it again → click any non-Down status (e.g. Running) →
            downtime auto-closes.
          </li>
        </Ol>
      </Section>

      <Section id="maint" icon={Wrench} title="Scheduled maintenance — plan ahead" tone="industrial">
        <p>
          For planned shutdowns (preventive maintenance, die changes, factory holidays), log
          them in advance so the system can warn you.
        </p>
        <Ol>
          <li>
            Press Board → click a press → in the drawer, scroll to <b>Scheduled maintenance</b>{' '}
            → click <Btn>＋ Schedule</Btn>.
          </li>
          <li>
            Pick the start date (and optional end date), enter a reason and notes → Save.
          </li>
          <li>
            14 days before the maintenance date, a banner appears on the Dashboard showing the
            press, the affected parts, and ranked alternate presses you can pre-allocate to.
          </li>
        </Ol>
      </Section>

      <Section id="db" icon={Database} title="Backup, restore & reset">
        <Ol>
          <li>
            <b>Backup:</b> Settings → Database → <Btn>Back up database</Btn>. Saves a .db file
            you can share or restore later.
          </li>
          <li>
            <b>Restore:</b> Pick a previously backed-up .db file. App restarts with that data.
            A safety copy of the current DB is kept automatically.
          </li>
          <li>
            <b>Reset:</b> Wipes all rows and re-seeds defaults. Type <code className="bg-steel-100 px-1.5 py-0.5 rounded text-xs">RESET</code>{' '}
            in caps to confirm.
          </li>
          <li>
            <b>Demo data:</b> Plan → Sample data button loads ~40 realistic rows so you can
            explore the workflow before entering real data.
          </li>
        </Ol>
      </Section>

      <Section id="tips" icon={Sparkles} title="Tips that save time" tone="emerald">
        <Ol>
          <li>
            Use the <b>month selector in the top bar</b> to switch periods. Each month is its
            own plan + stock + production log — no cross-contamination.
          </li>
          <li>
            <b>Carry forward</b> on the Plan page copies last month's schedule structure into
            the current month so you only edit what changed.
          </li>
          <li>
            <b>Collapse the sidebar</b> with the chevron at the bottom — gives you more table
            width on smaller screens.
          </li>
          <li>
            Press <b>Esc</b> to close any drawer or modal quickly.
          </li>
          <li>
            The <b>Dashboard Workflow card</b> turns green tiles as you complete each step.
            Aim for all four green by end of the first week of each month.
          </li>
        </Ol>
      </Section>
    </div>
  );
}

function Section({
  id,
  icon: Icon,
  title,
  tone = 'steel',
  step,
  children,
}: {
  id: string;
  icon: typeof HelpCircle;
  title: string;
  tone?: 'steel' | 'industrial' | 'forge' | 'emerald';
  step?: number;
  children: React.ReactNode;
}) {
  const toneClass = {
    steel: 'text-steel-700 bg-steel-100',
    industrial: 'text-industrial-700 bg-industrial-50 ring-1 ring-industrial-200',
    forge: 'text-forge-700 bg-forge-50 ring-1 ring-forge-200',
    emerald: 'text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200',
  }[tone];
  return (
    <section id={id} className="card p-6 scroll-mt-6">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${toneClass}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex items-baseline gap-2 flex-wrap">
          {step !== undefined && (
            <span className="chip bg-forge-500 text-white text-[10px]">STEP {step}</span>
          )}
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        </div>
      </div>
      <div className="text-sm text-steel-700 space-y-3 leading-relaxed">{children}</div>
    </section>
  );
}

function Ol({ children }: { children: React.ReactNode }) {
  return (
    <ol className="list-decimal list-inside space-y-1.5 text-steel-700 marker:font-bold marker:text-steel-400">
      {children}
    </ol>
  );
}

function Btn({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-steel-900 text-white text-[11px] font-semibold not-italic ${className}`}
    >
      {children}
    </kbd>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-industrial-50/60 border border-industrial-200/60 rounded-xl px-3 py-2 text-[12px] text-industrial-800 leading-relaxed mt-3 flex items-start gap-2">
      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-industrial-600" />
      <span>{children}</span>
    </div>
  );
}
