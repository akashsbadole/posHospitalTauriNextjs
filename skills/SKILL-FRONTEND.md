---
name: medicore-frontend
description: >
  Use this skill when working on the Next.js frontend of MediCore HMS.
  Covers: design system tokens, Tailwind component classes, page structure patterns,
  React Query data fetching, form handling, modal patterns, table patterns, chart patterns,
  animation classes, badge/status conventions, and adding new UI components. Trigger on
  any request about styling, creating new pages, building forms, adding charts, debugging
  UI issues, or working with the MediCore design system.
license: MIT
---

# MediCore HMS — Frontend Design System & UI Patterns

Complete reference for building UI in the MediCore Next.js frontend.

---

## Design Philosophy

MediCore uses a **dark clinical aesthetic** — precise, data-dense, professional.
- Dark navy/slate backgrounds (NOT pure black)
- Colored accents as signals: cyan=primary, green=healthy/paid, yellow=pending, red=critical/overdue
- Syne font for display (bold, geometric) + DM Sans for body (readable, modern)
- Minimal decorative chrome — every element earns its place by conveying information
- Consistent 8px border-radius (rounded-lg) — soft but structured

---

## Color Token Reference

### When to use each accent color

| Token | Hex | Use cases |
|---|---|---|
| `text-accent` / `bg-accent` | `#00d4ff` | Primary CTA, active nav, links, "info" data |
| `text-success` / `bg-success` | `#00ff9d` | Available beds, paid invoices, active status, healthy stock |
| `text-warning` / `bg-warning` | `#ffd93d` | Pending payments, reserved beds, low stock, expiring soon |
| `text-danger` / `bg-danger` | `#ff6b6b` | Critical patients, overdue invoices, empty stock, cancelled |
| `text-purple` / `bg-purple` | `#c77dff` | Prescriptions, neurology, admin roles |
| `text-muted` | `#8899bb` | Secondary text, table cell values, labels |
| `text-subtle` | `#4a607a` | Placeholder, disabled, table headers, code |

### Background hierarchy

```
bg-bg        #0a0e14   ← Page background (main content area)
bg-surface   #111620   ← Cards, sidebar, topbar
bg-surface2  #161d2a   ← Inputs, secondary cards, hover targets
bg-surface3  #1c2638   ← Active tab, pressed state, deep background
```

---

## Typography Rules

```tsx
// Page title
<h1 className="font-display font-bold text-xl text-white">Title</h1>

// Card title
<h3 className="font-display font-bold text-sm text-white">Section</h3>

// Stat value (large number)
<div className="font-display font-extrabold text-2xl text-accent">1,284</div>

// Table header
// Handled by .data-table th — text-[11px] font-semibold text-subtle uppercase tracking-wide

// Table cell primary
<span className="font-medium text-white">Primary value</span>

// Table cell secondary
<span className="text-muted text-[12px]">Secondary value</span>

// Code / ID values
<span className="font-mono text-[12px] text-subtle">PT-A1B2C3D4</span>

// Timestamps
<span className="font-mono text-[11px] text-subtle">2024-03-15 09:30:00</span>
```

---

## Complete Component Class Reference

### Layout

```tsx
// Standard page wrapper
<div>                              {/* no extra classes needed — main handles padding */}
  <div className="page-header">   {/* flex items-center justify-between mb-6 */}
    <div>
      <h1 className="page-title">Title</h1>
      <p className="page-subtitle">Subtitle</p>
    </div>
    <div className="flex gap-2.5">
      {/* action buttons */}
    </div>
  </div>
  {/* content */}
</div>

// Two-column layout (list + detail)
<div className="grid grid-cols-[1fr_320px] gap-4">

// Three-column layout
<div className="grid grid-cols-3 gap-4">

// Four-column grid (stats)
<div className="grid grid-cols-4 gap-3.5 mb-5">

// Sidebar + content (settings, wards)
<div className="grid grid-cols-[220px_1fr] gap-4">
```

### Cards

```tsx
<div className="card">
  <div className="card-header">
    <h3 className="card-title">Section Title</h3>
    <a href="/route" className="text-[12px] text-accent hover:underline">Action →</a>
  </div>
  {/* content */}
</div>

// Stat card (with colored top border + glow effect)
<div className="stat-card anim-fade-up d1">
  {/* Top accent line */}
  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-current to-transparent text-accent" />
  {/* Glow blob (optional) */}
  <div className="absolute -top-5 -right-5 w-20 h-20 rounded-full blur-2xl bg-accent opacity-[0.07]" />

  <div className="text-xl mb-3">📊</div>
  <div className="stat-value text-accent">1,284</div>
  <div className="stat-label">Total Patients</div>
  <div className="text-[11px] text-success flex items-center gap-1">
    <TrendingUp size={11} />↑ 12% vs last month
  </div>
</div>
```

### Buttons

```tsx
// Primary (main CTA)
<button className="btn btn-primary">
  <Plus size={14} />New Patient
</button>

// Ghost (secondary actions)
<button className="btn btn-ghost">
  <Download size={13} />Export
</button>

// Danger (destructive actions)
<button className="btn btn-danger">Delete</button>

// Success (positive actions)
<button className="btn btn-success">Approve</button>

// Small variant (table actions)
<button className="btn btn-ghost btn-sm">Discharge</button>

// Icon-only button
<button className="icon-btn" title="Edit">
  <Edit size={12} />
</button>
// With color override on hover
<button className="icon-btn hover:!text-accent"><Edit size={12} /></button>
<button className="icon-btn hover:!text-danger"><Trash2 size={12} /></button>
<button className="icon-btn hover:!text-success"><Check size={12} /></button>
```

### Badges

```tsx
// Status badges — pick color by meaning (see Color Token Reference)
<span className="badge badge-green">Active</span>
<span className="badge badge-yellow">Pending</span>
<span className="badge badge-red">Critical</span>
<span className="badge badge-blue">Scheduled</span>
<span className="badge badge-purple">Neurology</span>
<span className="badge badge-gray">Discharged</span>

// Smaller badge (inside tight table cells)
<span className="badge badge-blue text-[10px]">General Medicine</span>
```

### Tables

```tsx
<div className="card">
  <div className="overflow-x-auto">
    <table className="data-table">
      <thead>
        <tr>
          <th>Column A</th>
          <th>Column B</th>
        </tr>
      </thead>
      <tbody>
        {items.map(item => (
          <tr key={item.id}>
            {/* Primary value */}
            <td className="font-medium text-white">{item.name}</td>
            {/* Secondary value */}
            <td className="text-muted text-[12px]">{item.date}</td>
            {/* Code / ID */}
            <td className="font-mono text-[12px] text-subtle">{item.code}</td>
            {/* Badge */}
            <td><span className="badge badge-green">{item.status}</span></td>
            {/* Money */}
            <td className="font-semibold text-white">₹{item.amount.toLocaleString("en-IN")}</td>
            {/* Action buttons */}
            <td>
              <div className="flex gap-1.5">
                <button className="icon-btn hover:!text-accent"><Edit size={12} /></button>
                <button className="icon-btn hover:!text-danger"><Trash2 size={12} /></button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>
```

### Forms

```tsx
// Form field pattern
<div>
  <label className="form-label">Field Name *</label>
  <input
    {...register("field_name")}
    placeholder="e.g. value"
  />
  {errors.field_name && (
    <p className="form-error">{errors.field_name.message}</p>
  )}
</div>

// Select
<select {...register("department")}>
  {OPTIONS.map(o => <option key={o}>{o}</option>)}
</select>

// Textarea
<textarea
  {...register("notes")}
  rows={3}
  placeholder="Optional notes…"
  className="resize-none"
/>

// Two-column form grid
<div className="grid grid-cols-2 gap-4">
  <div>...</div>
  <div>...</div>
  {/* Full-width field */}
  <div className="col-span-2">...</div>
</div>
```

### Search + Filter Bar

```tsx
<div className="flex gap-3 mb-4">
  {/* Search */}
  <div className="flex-1 relative">
    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
    <input
      value={search}
      onChange={e => setSearch(e.target.value)}
      placeholder="Search by name, code…"
      className="pl-9"
    />
  </div>

  {/* Filter dropdown */}
  <select value={filter} onChange={e => setFilter(e.target.value)} className="w-40">
    <option value="">All Status</option>
    {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
  </select>

  {/* Extra filter button */}
  <button className="btn btn-ghost gap-1.5">
    <Filter size={13} />Filters
  </button>
</div>
```

### Tab Bar

```tsx
const [tab, setTab] = useState<"all" | "low">("all");

<div className="tab-bar">
  <div onClick={() => setTab("all")} className={`tab-item ${tab === "all" ? "active" : ""}`}>
    All Items
  </div>
  <div onClick={() => setTab("low")} className={`tab-item ${tab === "low" ? "active" : ""}`}>
    Low Stock
    {lowCount > 0 && (
      <span className="ml-1 text-[10px] bg-danger/20 text-danger px-1.5 py-0.5 rounded-full">
        {lowCount}
      </span>
    )}
  </div>
</div>
```

---

## Animated Loading States

```tsx
// Full-panel loading
{isLoading ? (
  <div className="py-12 text-center text-muted text-[13px]">Loading…</div>
) : data.length === 0 ? (
  <div className="py-12 text-center text-muted text-[13px]">No items found</div>
) : (
  /* actual content */
)}

// Skeleton (optional — add to globals.css if needed)
<div className="h-4 bg-surface3 rounded animate-pulse w-3/4" />
```

---

## Animation Pattern for Page Entry

```tsx
// Staggered stat card reveal
<div className="grid grid-cols-4 gap-3.5 mb-5">
  <div className="stat-card anim-fade-up d1">...</div>  {/* delay: 0.05s */}
  <div className="stat-card anim-fade-up d2">...</div>  {/* delay: 0.10s */}
  <div className="stat-card anim-fade-up d3">...</div>  {/* delay: 0.15s */}
  <div className="stat-card anim-fade-up d4">...</div>  {/* delay: 0.20s */}
</div>

// Modal entry
<div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">

// Sidebar item slide
<div className="anim-slide-in">
```

---

## Progress/Stock Bar Pattern

```tsx
{/* Stock level bar */}
const pct = Math.round((item.current_stock / item.max_capacity) * 100);
const barColor = pct < 15 ? "bg-danger" : pct < 30 ? "bg-warning" : "bg-success";

<div className="flex items-center gap-2">
  <div className="flex-1 h-1.5 bg-surface3 rounded-full overflow-hidden">
    <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
  </div>
  <span className="text-[11px] text-subtle w-7">{pct}%</span>
</div>

{/* Revenue breakdown bar */}
<div className="flex items-center gap-3">
  <div className="text-[12px] text-muted w-28 flex-shrink-0">OPD Consultations</div>
  <div className="flex-1 h-1.5 bg-surface3 rounded-full overflow-hidden">
    <div className="h-full bg-accent rounded-full" style={{ width: "75%" }} />
  </div>
  <div className="text-[12px] font-semibold text-white w-16 text-right">₹72,400</div>
</div>
```

---

## Alerts / Notification Strips

```tsx
{/* Error / Critical */}
{criticalCount > 0 && (
  <div className="flex items-center gap-2.5 px-4 py-2.5 bg-danger/8 border border-danger/20 rounded-lg text-danger text-[13px] mb-3">
    <AlertTriangle size={14} />
    <strong>{criticalCount} critical items</strong>&nbsp;require attention.
    <a href="/route" className="ml-auto text-[12px] underline">View →</a>
  </div>
)}

{/* Warning */}
<div className="flex items-center gap-2.5 px-4 py-2.5 bg-warning/8 border border-warning/20 rounded-lg text-warning text-[13px] mb-4">
  <AlertTriangle size={14} />
  <strong>3 items</strong>&nbsp;below threshold.
</div>

{/* Info */}
<div className="flex items-center gap-2.5 px-4 py-2.5 bg-accent/8 border border-accent/20 rounded-lg text-accent text-[13px] mb-4">
  <Info size={14} />
  Sync pending — connect to cloud to update.
</div>
```

---

## Avatar / Initials Pattern

```tsx
const AVATAR_COLORS = [
  "bg-accent/20 text-accent",
  "bg-purple/20 text-purple",
  "bg-success/20 text-success",
  "bg-danger/20 text-danger",
  "bg-warning/20 text-warning",
];

const initials = (name: string) =>
  name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

{items.map((item, i) => (
  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0 ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
    {initials(item.full_name)}
  </div>
))}
```

---

## Availability Dot Pattern

```tsx
const DOT_COLOR = {
  "Available":  "bg-success shadow-[0_0_6px_rgba(0,255,157,0.7)]",
  "In Surgery": "bg-warning",
  "On Round":   "bg-accent",
  "Off Duty":   "bg-muted",
  "On Leave":   "bg-danger",
};

<div className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_COLOR[status]}`} />
```

---

## Page-Level Summary Stats Pattern

Every module page should have a quick-count row before the main content:

```tsx
{/* Option A — compact flex row */}
<div className="flex gap-3 mb-5">
  {[
    ["Total",     items.length,                              "text-white"],
    ["Active",    items.filter(i => i.status === "Active").length, "text-success"],
    ["Pending",   items.filter(i => i.status === "Pending").length, "text-warning"],
    ["Overdue",   items.filter(i => i.status === "Overdue").length, "text-danger"],
  ].map(([label, val, color]) => (
    <div key={label as string} className="card flex-1 px-4 py-3">
      <div className={`font-display font-extrabold text-xl ${color}`}>{val}</div>
      <div className="text-[11px] text-subtle">{label}</div>
    </div>
  ))}
</div>

{/* Option B — grid stat cards with icons (dashboard) */}
<div className="grid grid-cols-4 gap-3.5 mb-5">
  <div className="stat-card anim-fade-up d1">
    <div className="text-xl mb-3">💊</div>
    <div className="stat-value text-purple">284</div>
    <div className="stat-label">Active Prescriptions</div>
    <div className="text-[11px] text-success flex items-center gap-1"><TrendingUp size={11} />↑ 8%</div>
  </div>
</div>
```

---

## React Query Conventions

```tsx
// Query key naming — always arrays, specific to data
queryKey: ["patients"]                    // all patients
queryKey: ["patients", search, status]   // filtered patients (re-fetches on filter change)
queryKey: ["appointments", dateStr]       // appointments for specific date
queryKey: ["beds", selectedWardId]        // beds for selected ward
queryKey: ["dashboard-stats"]            // dashboard KPIs

// Invalidation after mutations — always invalidate parent + related
onSuccess: () => {
  qc.invalidateQueries({ queryKey: ["patients"] });
  qc.invalidateQueries({ queryKey: ["dashboard-stats"] }); // keeps dashboard fresh
}

// Loading state
const { data = [], isLoading } = useQuery({ ... });
// Always default to [] for arrays to avoid .map() errors on undefined

// Error handling
const { data, isLoading, error } = useQuery({ ... });
if (error) return <div className="py-12 text-center text-danger">Failed to load: {error.message}</div>;
```

---

## Tailwind Spacing Conventions

```
gap-2     = 8px   (tight, within component)
gap-3     = 12px  (standard between related elements)
gap-3.5   = 14px  (between stat cards)
gap-4     = 16px  (between panels)
gap-6     = 24px  (section breaks)
mb-4      = 16px  (below filters/controls)
mb-5      = 20px  (below stat row)
mb-6      = 24px  (page-header bottom margin)
px-5 py-4 = card-header padding
px-4 py-3 = table cell / quick-stat card padding
px-6      = page padding (handled by AppShell main)
p-5/p-6   = card inner padding for non-table content
```

---

## Font Size Scale

```
text-[10px]  = tiny labels, nav section headers, badge text in tight spaces
text-[11px]  = form labels (uppercase), timestamps, secondary badges, stat changes
text-[12px]  = table secondary cells, tooltips, meta info
text-[13px]  = default body, table primary cells, button text
text-[13.5px]= nav items
text-sm      = subtitles, descriptions (14px)
text-base    = modal titles (16px)
text-xl      = page titles, stat values (20px)
text-2xl     = large stat values (24px)
```

---

## Do Not Do These

```tsx
// ❌ Never use arbitrary colors not in the design system
className="bg-blue-500 text-gray-200"

// ✅ Always use design system tokens
className="bg-accent text-bg"

// ❌ Never use Inter, Arial, or system-ui
style={{ fontFamily: "Inter, sans-serif" }}

// ✅ Use the configured font families
className="font-display"  // Syne
className="font-sans"     // DM Sans (default — usually no class needed)

// ❌ Never use inline styles for colors
style={{ color: "#00d4ff" }}

// ✅ Use Tailwind tokens
className="text-accent"

// ❌ Never use rounded-none or square corners for card content
className="rounded-none"

// ✅ Cards are always rounded-xl (12px)

// ❌ Never show raw IDs to users
<td>{item.assigned_doctor_id}</td>

// ✅ Always show the name (JOIN it in the SQL query)
<td>{item.assigned_doctor_name ?? "Unassigned"}</td>
```
