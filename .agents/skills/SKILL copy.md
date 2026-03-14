---
name: medicore-tauri-nextjs
description: >
  Use this skill whenever building, extending, or debugging the MediCore HMS desktop application.
  Covers: adding new Tauri commands in Rust, creating new Next.js pages, wiring frontend invoke() calls,
  writing SQLite queries, extending the DB schema, adding new modules, fixing TypeScript type errors,
  styling with the MediCore design system, and setting up cloud sync. Trigger on any request that
  mentions MediCore, hospital management, Tauri+Next.js desktop app patterns, Rust SQLite commands,
  or any of the 13 modules (patients, appointments, prescriptions, lab, wards, staff, pharmacy,
  billing, insurance, analytics, audit, settings, dashboard).
license: MIT
---

# MediCore HMS — Developer Skill Reference

Complete reference for building and extending the MediCore Hospital Management System.
Stack: **Tauri 2 + Next.js 14 (static export) + Rust + SQLite + Neon PostgreSQL**.

---

## Quick Reference Table

| Task | Where to look |
|---|---|
| Add a new Tauri command | `src-tauri/src/commands.rs` + register in `lib.rs` |
| Add a new page/module | `src/app/<module>/page.tsx` + add to Sidebar nav |
| Add a new TypeScript type | `src/types/index.ts` |
| Add a new invoke() bridge function | `src/lib/tauri.ts` |
| Add a new DB table | `src-tauri/src/db.rs` → `SCHEMA` const |
| Add a new Serde model | `src-tauri/src/models.rs` |
| Global state (user, sidebar, sync) | `src/store/index.ts` (Zustand) |
| Server-side data fetching | TanStack React Query `useQuery()` |
| Forms with validation | `react-hook-form` + `zod` schema |
| Audit trail | `audit::log()` in `src-tauri/src/audit.rs` |
| Queue cloud sync | `sync::queue_sync()` in `src-tauri/src/sync.rs` |
| Toast notifications | `import { toast } from "sonner"` |

---

## Project Structure

```
medicore/
├── src/                              # Next.js 14 frontend
│   ├── app/
│   │   ├── layout.tsx                # Root layout — wraps AppShell
│   │   ├── globals.css               # Design tokens + Tailwind @layer components
│   │   ├── page.tsx                  # Redirects / → /dashboard
│   │   ├── dashboard/page.tsx
│   │   ├── patients/page.tsx
│   │   ├── appointments/page.tsx
│   │   ├── prescriptions/page.tsx
│   │   ├── lab/page.tsx
│   │   ├── wards/page.tsx
│   │   ├── staff/page.tsx
│   │   ├── pharmacy/page.tsx
│   │   ├── billing/page.tsx
│   │   ├── insurance/page.tsx
│   │   ├── analytics/page.tsx
│   │   ├── audit/page.tsx
│   │   └── settings/page.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx          # flex h-screen layout wrapper
│   │   │   ├── Sidebar.tsx           # Collapsible nav with badges
│   │   │   ├── Topbar.tsx            # Title + sync + new patient button
│   │   │   └── Providers.tsx         # React Query + Sonner toasts
│   │   ├── modules/
│   │   │   └── NewPatientModal.tsx   # react-hook-form + zod modal
│   │   └── ui/                       # (add shared UI components here)
│   ├── lib/
│   │   └── tauri.ts                  # ALL invoke() calls — single source of truth
│   ├── store/
│   │   └── index.ts                  # Zustand persisted store
│   └── types/
│       └── index.ts                  # All TypeScript interfaces
│
├── src-tauri/
│   ├── src/
│   │   ├── main.rs                   # Entry: calls medicore_lib::run()
│   │   ├── lib.rs                    # Tauri Builder setup, command registration
│   │   ├── db.rs                     # Pool creation + full SQLite schema (SCHEMA const)
│   │   ├── models.rs                 # All serde Serialize/Deserialize structs
│   │   ├── commands.rs               # All #[tauri::command] functions (~800 lines)
│   │   ├── audit.rs                  # audit::log() helper
│   │   └── sync.rs                   # Neon sync queue + sync_to_cloud()
│   ├── Cargo.toml
│   ├── build.rs
│   └── tauri.conf.json
│
├── package.json
├── next.config.js                    # output: "export", distDir: "out"
├── tailwind.config.ts
└── tsconfig.json                     # paths: "@/*" → "./src/*"
```

---

## Design System

### Color Tokens (CSS Variables in `globals.css`)

```css
--bg:       #0a0e14   /* Page background */
--surface:  #111620   /* Card / sidebar background */
--surface2: #161d2a   /* Input / secondary surface */
--surface3: #1c2638   /* Hover states / pressed */
--border:   #1f2d42   /* Default borders */
--border2:  #243348   /* Hover borders */
--accent:   #00d4ff   /* Primary blue — CTA, active nav, links */
--success:  #00ff9d   /* Green — available, paid, active */
--warning:  #ffd93d   /* Yellow — pending, reserved, partial */
--danger:   #ff6b6b   /* Red — critical, overdue, error */
--purple:   #c77dff   /* Purple — neurology, prescriptions */
--muted:    #8899bb   /* Secondary text */
--subtle:   #4a607a   /* Disabled / placeholder text */
```

### Tailwind Aliases

All tokens are mapped in `tailwind.config.ts`:
```
bg-bg, bg-surface, bg-surface2, bg-surface3
border-border, border-border2
text-accent, text-success, text-warning, text-danger, text-purple, text-muted, text-subtle
```

### Typography

- **Display font:** `font-display` → Syne (headings, stat values, titles)
- **Body font:** `font-sans` → DM Sans (all other text)

### Component Classes (defined in `globals.css` @layer components)

```css
/* Cards */
.card              /* bg-surface border border-border rounded-xl overflow-hidden */
.card-header       /* px-5 py-4 border-b border-border flex items-center justify-between */
.card-title        /* font-display font-bold text-sm text-white */

/* Buttons */
.btn               /* base: inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium */
.btn-primary       /* bg-accent text-bg hover:opacity-90 */
.btn-ghost         /* bg-surface2 text-muted border border-border hover:bg-surface3 hover:text-white */
.btn-danger        /* bg-danger/20 text-danger border border-danger/30 hover:bg-danger/30 */
.btn-success       /* bg-success/20 text-success */
.btn-sm            /* px-2.5 py-1.5 text-[12px] — modifier, combine with btn-* */

/* Badges */
.badge             /* base: inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold */
.badge-blue        /* bg-accent/10 text-accent */
.badge-green       /* bg-success/10 text-success */
.badge-yellow      /* bg-warning/10 text-warning */
.badge-red         /* bg-danger/10 text-danger */
.badge-purple      /* bg-purple/10 text-purple */
.badge-gray        /* bg-muted/10 text-muted */

/* Tables */
.data-table        /* w-full */
/* th: px-4 py-2.5 text-[11px] font-semibold text-subtle uppercase tracking-wide bg-surface2 */
/* td: px-4 py-3 border-b border-border text-[13px] align-middle */
/* hover: bg-surface2/60 */

/* Forms */
.form-label        /* text-[11px] font-semibold text-subtle uppercase tracking-wider mb-1.5 block */
.form-error        /* text-[11px] text-danger mt-1 */

/* Page layout */
.page-header       /* flex items-center justify-between mb-6 */
.page-title        /* font-display font-bold text-xl text-white */
.page-subtitle     /* text-sm text-muted mt-0.5 */

/* Stat cards */
.stat-card         /* card relative overflow-hidden p-5 transition-all hover:border-border2 */
.stat-value        /* font-display font-extrabold text-2xl mb-1 */
.stat-label        /* text-xs text-muted mb-2.5 */

/* Icon button */
.icon-btn          /* w-8 h-8 rounded-lg bg-surface2 border border-border flex items-center justify-center text-subtle hover:text-white */

/* Tab bar */
.tab-bar           /* flex gap-1 bg-surface border border-border rounded-xl p-1 w-fit */
.tab-item          /* px-3 py-1.5 rounded-[8px] text-[13px] font-medium text-muted cursor-pointer */
.tab-item.active   /* bg-surface3 text-white */
```

### Animation Classes

```css
.anim-fade-up      /* fadeUp 0.3s ease both */
.anim-fade-in      /* fadeIn 0.2s ease both */
.anim-slide-in     /* slideIn 0.25s ease both */
.anim-pulse-glow   /* pulseGlow 2.5s ease-in-out infinite */
.d1 → .d6         /* animation-delay: 0.05s → 0.30s — use for staggered card reveals */
```

---

## Adding a New Module (Step-by-Step)

### Step 1 — Add TypeScript types (`src/types/index.ts`)

```typescript
export interface MyEntity {
  id: number;
  entity_code: string;
  name: string;
  status: "Active" | "Inactive";
  created_at: string;
}

export interface CreateMyEntity {
  name: string;
  status?: string;
}
```

### Step 2 — Add DB table (`src-tauri/src/db.rs` → `SCHEMA` const)

```sql
CREATE TABLE IF NOT EXISTS my_entities (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_code  TEXT NOT NULL UNIQUE,
    name         TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'Active',
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_my_entities_status ON my_entities(status);
```

### Step 3 — Add Serde models (`src-tauri/src/models.rs`)

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MyEntity {
    pub id: i64,
    pub entity_code: String,
    pub name: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateMyEntity {
    pub name: String,
    pub status: Option<String>,
}
```

### Step 4 — Add Tauri commands (`src-tauri/src/commands.rs`)

```rust
#[tauri::command]
pub fn get_my_entities(state: State<AppState>, status: Option<String>) -> Result<Vec<MyEntity>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, entity_code, name, status, created_at
         FROM my_entities WHERE (?1 IS NULL OR status = ?1) ORDER BY id DESC"
    ).map_err(|e| e.to_string())?;
    let items = stmt.query_map(params![status], |r| Ok(MyEntity {
        id: r.get(0)?, entity_code: r.get(1)?, name: r.get(2)?,
        status: r.get(3)?, created_at: r.get(4)?,
    })).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok()).collect();
    Ok(items)
}

#[tauri::command]
pub fn create_my_entity(state: State<AppState>, data: CreateMyEntity) -> Result<MyEntity, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("ME");  // uses Uuid::new_v4() helper
    let status = data.status.as_deref().unwrap_or("Active");
    conn.execute(
        "INSERT INTO my_entities (entity_code, name, status) VALUES (?1, ?2, ?3)",
        params![code, data.name, status],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    audit::log(&state.pool, "System", "Entity created", "my_entity", Some(id), Some(&data.name));
    conn.query_row(
        "SELECT id, entity_code, name, status, created_at FROM my_entities WHERE id = ?1",
        params![id],
        |r| Ok(MyEntity { id: r.get(0)?, entity_code: r.get(1)?, name: r.get(2)?, status: r.get(3)?, created_at: r.get(4)? }),
    ).map_err(|e| e.to_string())
}
```

### Step 5 — Register commands (`src-tauri/src/lib.rs`)

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    commands::get_my_entities,
    commands::create_my_entity,
])
```

### Step 6 — Add invoke bridge (`src/lib/tauri.ts`)

```typescript
export const getMyEntities = (status?: string) =>
  cmd<MyEntity[]>("get_my_entities", { status });

export const createMyEntity = (data: Omit<MyEntity, "id" | "entity_code" | "created_at">) =>
  cmd<MyEntity>("create_my_entity", { data });
```

### Step 7 — Create the page (`src/app/my-module/page.tsx`)

```tsx
"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getMyEntities, createMyEntity } from "@/lib/tauri";
import { toast } from "sonner";

export default function MyModulePage() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["my-entities"],
    queryFn: () => getMyEntities(),
  });

  const createMut = useMutation({
    mutationFn: createMyEntity,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-entities"] });
      toast.success("Created!");
    },
    onError: () => toast.error("Failed"),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Module</h1>
          <p className="page-subtitle">{items.length} items</p>
        </div>
        <button className="btn btn-primary">+ Add New</button>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="py-12 text-center text-muted">Loading…</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Code</th><th>Name</th><th>Status</th></tr></thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td className="font-mono text-subtle text-[12px]">{item.entity_code}</td>
                  <td className="font-medium text-white">{item.name}</td>
                  <td><span className={`badge ${item.status === "Active" ? "badge-green" : "badge-gray"}`}>{item.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

### Step 8 — Add to Sidebar (`src/components/layout/Sidebar.tsx`)

```tsx
// In the NAV array, add to appropriate section:
{ href: "/my-module", icon: MyIcon, label: "My Module" }
```

### Step 9 — Add page title (`src/components/layout/AppShell.tsx`)

```tsx
"/my-module": "My Module Title",
```

---

## Rust Patterns Reference

### Code generation helper
```rust
fn new_code(prefix: &str) -> String {
    let id = Uuid::new_v4().to_string();
    let short = &id[..8].to_uppercase();
    format!("{}-{}", prefix, short)
    // e.g. "PT-A1B2C3D4"
}
```

### Date helpers
```rust
fn today() -> String { chrono::Local::now().format("%Y-%m-%d").to_string() }
fn now()   -> String { chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string() }
```

### Standard command pattern (GET list)
```rust
#[tauri::command]
pub fn get_things(state: State<AppState>, filter: Option<String>) -> Result<Vec<Thing>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, name FROM things WHERE (?1 IS NULL OR status = ?1) ORDER BY id DESC"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![filter], |r| Ok(Thing { id: r.get(0)?, name: r.get(1)? }))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}
```

### Standard command pattern (CREATE)
```rust
#[tauri::command]
pub fn create_thing(state: State<AppState>, data: CreateThing) -> Result<Thing, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("TH");
    conn.execute(
        "INSERT INTO things (code, name) VALUES (?1, ?2)",
        params![code, data.name],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    // Always write audit log on mutations
    audit::log(&state.pool, "System", "Thing created", "thing", Some(id), Some(&data.name));
    // Always queue for cloud sync on mutations
    sync::queue_sync(&state.pool, "INSERT", "things", id, &format!("{{\"code\":\"{}\"}}", code));
    // Return the full created record
    conn.query_row(
        "SELECT id, code, name FROM things WHERE id = ?1",
        params![id],
        |r| Ok(Thing { id: r.get(0)?, code: r.get(1)?, name: r.get(2)? }),
    ).map_err(|e| e.to_string())
}
```

### Async command (for sync operations)
```rust
#[tauri::command]
pub async fn my_async_command(state: State<'_, AppState>) -> Result<String, String> {
    // Note: State must use 'static lifetime for async commands
    Ok("done".to_string())
}
```

### Optional params in SQL
```rust
// Pass None for optional filter — SQLite ?1 IS NULL OR col = ?1 pattern
conn.prepare("SELECT * FROM t WHERE (?1 IS NULL OR status = ?1)")
    .query_map(params![optional_status], |r| ...)
```

### Joined queries
```rust
// Always JOIN patient/doctor names — never return bare IDs to frontend
"SELECT a.id, a.code, p.full_name, d.full_name
 FROM appointments a
 JOIN patients p ON a.patient_id = p.id
 JOIN doctors d  ON a.doctor_id  = d.id"
```

---

## Frontend Patterns Reference

### Standard page skeleton

```tsx
"use client";
import { useQuery } from "@tanstack/react-query";
import { getSomething } from "@/lib/tauri";

export default function MyPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["my-data"],   // unique cache key
    queryFn: getSomething,
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Title</h1>
          <p className="page-subtitle">Subtitle</p>
        </div>
        <button className="btn btn-primary">+ Add</button>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-4 gap-3.5 mb-5">
        <div className="stat-card anim-fade-up d1">
          <div className="stat-value text-accent">42</div>
          <div className="stat-label">Total Items</div>
        </div>
      </div>

      {/* Main content card */}
      <div className="card">
        {isLoading ? (
          <div className="py-12 text-center text-muted">Loading…</div>
        ) : (
          <table className="data-table">...</table>
        )}
      </div>
    </div>
  );
}
```

### Mutation with query invalidation

```tsx
const qc = useQueryClient();
const mut = useMutation({
  mutationFn: (data: MyType) => createSomething(data),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["my-data"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] }); // update KPIs
    toast.success("Created successfully!");
    onClose(); // close modal if applicable
  },
  onError: (err) => toast.error("Operation failed"),
});
```

### Modal pattern

```tsx
// Parent
const [showModal, setShowModal] = useState(false);
<button onClick={() => setShowModal(true)}>Open</button>
<MyModal open={showModal} onClose={() => setShowModal(false)} />

// Modal component
export function MyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in">
      <div className="bg-surface border border-border2 rounded-2xl w-[560px] flex flex-col shadow-card">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-bold text-base">Modal Title</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-6">
          {/* form content */}
        </div>
        <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button className="btn btn-primary">Save →</button>
        </div>
      </div>
    </div>
  );
}
```

### Form with react-hook-form + zod

```tsx
const schema = z.object({
  name:   z.string().min(2, "Required"),
  status: z.enum(["Active", "Inactive"]).default("Active"),
  amount: z.number().min(0).optional(),
});
type F = z.infer<typeof schema>;

const { register, handleSubmit, formState: { errors } } = useForm<F>({
  resolver: zodResolver(schema),
  defaultValues: { status: "Active" },
});

// In JSX:
<label className="form-label">Name *</label>
<input {...register("name")} placeholder="Enter name" />
{errors.name && <p className="form-error">{errors.name.message}</p>}
```

### Status badge pattern

```tsx
const STATUS_BADGE: Record<MyStatus, string> = {
  Active:    "badge-green",
  Pending:   "badge-yellow",
  Cancelled: "badge-red",
  Completed: "badge-gray",
};

<span className={`badge ${STATUS_BADGE[item.status]}`}>{item.status}</span>
```

### Search + filter bar

```tsx
<div className="flex gap-3 mb-4">
  <div className="flex-1 relative">
    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
    <input value={search} onChange={e => setSearch(e.target.value)}
      placeholder="Search…" className="pl-9" />
  </div>
  <select value={filter} onChange={e => setFilter(e.target.value)} className="w-40">
    <option value="">All</option>
    {OPTIONS.map(o => <option key={o}>{o}</option>)}
  </select>
</div>
```

---

## Database Schema Reference

### All 12 Tables

| Table | Primary key | Notable columns |
|---|---|---|
| `patients` | `id` | `patient_code`, `status`, `department`, `assigned_doctor_id` |
| `doctors` | `id` | `staff_code`, `availability_status`, `shift`, `consultation_fee` |
| `staff` | `id` | `staff_code`, `role`, `shift`, `status` |
| `appointments` | `id` | `appointment_code`, `patient_id`, `doctor_id`, `appointment_date`, `appointment_time`, `status` |
| `prescriptions` | `id` | `rx_code`, `patient_id`, `valid_until`, `status` |
| `prescription_drugs` | `id` | `prescription_id`, `drug_name`, `dosage`, `frequency`, `refills_remaining` |
| `lab_tests` | `id` | `lab_code`, `patient_id`, `test_category`, `status`, `is_abnormal`, `report_path` |
| `wards` | `id` | `ward_code`, `ward_type`, `total_beds` |
| `beds` | `id` | `ward_id`, `bed_number`, `status`, `patient_id`, `admission_date` |
| `invoices` | `id` | `invoice_code`, `patient_id`, `total`, `paid_amount`, `balance`, `status` |
| `invoice_items` | `id` | `invoice_id`, `description`, `category`, `quantity`, `unit_price`, `total` |
| `insurance_claims` | `id` | `claim_code`, `invoice_id`, `provider_name`, `claim_amount`, `approved_amount`, `status` |
| `inventory` | `id` | `item_code`, `category`, `current_stock`, `min_threshold`, `expiry_date` |
| `vital_signs` | `id` | `patient_id`, `blood_pressure_sys/dia`, `heart_rate`, `temperature`, `spo2` |
| `audit_logs` | `id` | `user_name`, `action`, `entity`, `entity_id`, `details`, `timestamp` |
| `sync_queue` | `id` | `operation`, `table_name`, `record_id`, `payload`, `synced` |

### Code prefixes by entity

| Entity | Code prefix | Example |
|---|---|---|
| Patient | `PT` | `PT-A1B2C3D4` |
| Doctor/Staff | `DR` / `ST` | `DR-F4E3D2C1` |
| Appointment | `APT` | `APT-12345678` |
| Prescription | `RX` | `RX-AABB1122` |
| Lab test | `LAB` | `LAB-CCDD3344` |
| Ward | `WD` | `WD-EE556677` |
| Invoice | `INV` | `INV-FF889900` |
| Insurance claim | `CLM` | `CLM-11223344` |
| Inventory item | `INV` | `INV-55667788` |

---

## Audit Logging

**Always call `audit::log()` after any data mutation:**

```rust
// Signature
pub fn log(pool: &DbPool, user_name: &str, action: &str, entity: &str, entity_id: Option<i64>, details: Option<&str>)

// Examples
audit::log(&state.pool, "System", "Patient registered",   "patient",      Some(id), Some(&data.full_name));
audit::log(&state.pool, "System", "Appointment cancelled","appointment",  Some(id), reason.as_deref());
audit::log(&state.pool, "System", "Payment recorded",     "billing",      Some(id), Some(&format!("₹{}", amount)));
audit::log(&state.pool, "System", "Stock updated",        "inventory",    Some(id), Some(&format!("qty: {}", quantity)));
```

---

## Cloud Sync

**Queue a change after any successful write:**

```rust
sync::queue_sync(&state.pool, "INSERT", "patients", id, &serde_json::to_string(&patient).unwrap());
sync::queue_sync(&state.pool, "UPDATE", "invoices",  id, &format!("{{\"status\":\"{}\"}}", status));
sync::queue_sync(&state.pool, "DELETE", "staff",     id, "{}");
```

**Neon DB connection (in `src-tauri/src/sync.rs`):**
- Read `NEON_DATABASE_URL` from environment at runtime
- The `sync_queue` table holds all pending changes
- `synced = 0` = pending, `synced = 1` = sent
- Frontend calls `syncToCloud()` → Tauri command → `sync::sync_to_cloud()`

---

## Common Pitfalls & Rules

### NEVER do these:

1. **Never call `invoke()` directly from a component** — always go through `src/lib/tauri.ts`
2. **Never add a DB column without adding it to the SCHEMA const in `db.rs`** — it won't exist on fresh installs
3. **Never forget to register new Tauri commands in `lib.rs`** — they will silently fail
4. **Never use `serde_json::Value` for structured data** — define a proper Serde struct in `models.rs`
5. **Never skip `audit::log()` on mutations** — audit trail is required for all write operations
6. **Never use `localhost` API calls** — all data flows through Tauri invoke() commands, no HTTP
7. **Never use `useEffect` for data fetching** — always use `useQuery` from TanStack React Query

### ALWAYS do these:

1. **Always `use "client"` at top of any component using hooks or Tauri invoke**
2. **Always invalidate related query keys after mutations** (e.g. update patients → also invalidate dashboard-stats)
3. **Always use `params![]` macro for SQLite queries** — never interpolate strings (SQL injection)
4. **Always handle `pool.get()` errors with `.map_err(|e| e.to_string())?`**
5. **Always JOIN patient/doctor names** — return `patient_name` and `doctor_name` in every query that references them
6. **Always use `filter_map(|r| r.ok())` when collecting from `query_map`** to skip individual row errors
7. **Always add `ORDER BY id DESC`** for list queries unless a different sort is explicitly needed
8. **Always return the full created/updated record** from create/update commands (not just the ID)

---

## Running & Building

```bash
# Development (hot reload — Next.js + Tauri window together)
npm run tauri

# Build production desktop binary
npm run tauri:build
# Output: src-tauri/target/release/bundle/

# Next.js only (for UI work without Tauri)
npm run dev
# Visit http://localhost:3000 — Tauri invoke() calls will fail gracefully

# TypeScript check
npx tsc --noEmit

# Tailwind IntelliSense — install VS Code extension:
# bradlc.vscode-tailwindcss
```

### Build outputs by platform

| Platform | Output |
|---|---|
| Windows | `.exe` installer + `.msi` |
| macOS | `.dmg` + `.app` |
| Linux | `.AppImage` + `.deb` |

---

## Adding Charts (Analytics Page Pattern)

Always use Recharts. Import pattern:

```tsx
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
         LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// Consistent tooltip style across all charts:
const TIP = {
  contentStyle: {
    background: "#161d2a", border: "1px solid #1f2d42",
    borderRadius: "8px", fontSize: "12px", color: "#e8f0fe",
  },
  cursor: { fill: "rgba(255,255,255,0.04)" },
};

// Always wrap in ResponsiveContainer
<ResponsiveContainer width="100%" height={220}>
  <AreaChart data={data}>
    <XAxis dataKey="month" tick={{ fill:"#4a607a", fontSize:11 }} axisLine={false} tickLine={false} />
    <YAxis tick={{ fill:"#4a607a", fontSize:11 }} axisLine={false} tickLine={false} />
    <Tooltip {...TIP} />
    <Area type="monotone" dataKey="value" stroke="#00d4ff" strokeWidth={2} fill="url(#grad)" />
  </AreaChart>
</ResponsiveContainer>
```

---

## Settings Page Pattern

Settings use a two-column layout: left sidebar of section buttons, right content panel.

```tsx
const SECTIONS = ["General", "Database", "Advanced"] as const;
type Section = typeof SECTIONS[number];

const [active, setActive] = useState<Section>("General");

<div className="grid grid-cols-[220px_1fr] gap-4">
  <div className="card p-2">
    {SECTIONS.map(s => (
      <button key={s} onClick={() => setActive(s)}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all mb-0.5
          ${active === s ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface2 hover:text-white"}`}>
        {s}
      </button>
    ))}
  </div>
  <div className="card p-6">
    {active === "General" && <GeneralSettings />}
    {active === "Database" && <DatabaseSettings />}
  </div>
</div>
```
