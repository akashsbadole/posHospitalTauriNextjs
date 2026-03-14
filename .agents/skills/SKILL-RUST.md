---
name: medicore-rust-backend
description: >
  Use this skill when working specifically on the Rust/Tauri backend of MediCore.
  Covers: writing Tauri commands, rusqlite queries, r2d2 connection pooling, Serde models,
  audit logging, sync queue, error handling patterns, async commands, and the full SQLite
  schema. Trigger when debugging Rust compile errors, adding new commands, writing SQL queries,
  extending models, or working on cloud sync integration.
license: MIT
---

# MediCore — Rust Backend Reference

Complete Rust/Tauri backend patterns for the MediCore HMS desktop application.

---

## File Responsibilities

| File | Purpose |
|---|---|
| `main.rs` | Single line: calls `medicore_lib::run()` |
| `lib.rs` | Tauri Builder, plugin setup, `.setup()` DB init, `.invoke_handler()` registration |
| `db.rs` | `create_pool()`, `run_migrations()`, full `SCHEMA` SQL string |
| `models.rs` | All `#[derive(Serialize, Deserialize)]` structs for every entity |
| `commands.rs` | All `#[tauri::command]` functions — one per operation |
| `audit.rs` | `audit::log()` — single function, writes to `audit_logs` table |
| `sync.rs` | `sync::queue_sync()`, `sync::sync_to_cloud()`, `sync::get_sync_status()` |

---

## Cargo.toml Key Dependencies

```toml
tauri        = { version = "2", features = ["tray-icon"] }
rusqlite     = { version = "0.31", features = ["bundled"] }  # MUST have "bundled" - no system SQLite needed
r2d2         = "0.8"
r2d2_sqlite  = "0.24"
tokio        = { version = "1", features = ["full"] }
tokio-postgres = "0.7"
serde        = { version = "1", features = ["derive"] }
serde_json   = "1"
chrono       = { version = "0.4", features = ["serde"] }
uuid         = { version = "1", features = ["v4"] }
anyhow       = "1"
```

---

## AppState & Pool

```rust
// db.rs
pub type DbPool = Pool<SqliteConnectionManager>;

pub struct AppState {
    pub pool: DbPool,
}

pub fn create_pool(db_path: &str) -> Result<DbPool> {
    let manager = SqliteConnectionManager::file(db_path)
        .with_init(|conn| {
            // Enable WAL mode for better concurrent read performance
            // Enable foreign keys — critical for CASCADE deletes to work
            conn.execute_batch(
                "PRAGMA journal_mode=WAL;
                 PRAGMA foreign_keys=ON;
                 PRAGMA synchronous=NORMAL;"
            )?;
            Ok(())
        });
    Pool::builder().max_size(10).build(manager).map_err(Into::into)
}
```

---

## Model Patterns

### Entity with optional joined fields

```rust
// In models.rs
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MyEntity {
    pub id: i64,
    pub code: String,
    pub name: String,
    // Joined from another table — Option<String> because JOIN may be LEFT JOIN
    pub related_name: Option<String>,
    pub status: String,
    pub created_at: String,
}
```

### Create DTO (never expose auto-generated fields)

```rust
#[derive(Debug, Deserialize)]
pub struct CreateMyEntity {
    // Only what the user provides
    pub name: String,
    // Use Option for fields with server-side defaults
    pub status: Option<String>,
}
```

### Update via serde_json::Value (flexible partial updates)

```rust
#[tauri::command]
pub fn update_my_entity(state: State<AppState>, id: i64, data: serde_json::Value) -> Result<MyEntity, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    if let Some(name) = data.get("name").and_then(|v| v.as_str()) {
        conn.execute("UPDATE my_entities SET name = ?1 WHERE id = ?2", params![name, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(status) = data.get("status").and_then(|v| v.as_str()) {
        conn.execute("UPDATE my_entities SET status = ?1 WHERE id = ?2", params![status, id])
            .map_err(|e| e.to_string())?;
    }
    // Re-fetch and return updated record
    get_my_entity_by_id(state, id)
}
```

---

## SQL Query Patterns

### SELECT with optional filter (NULL-safe)

```rust
// ?1 IS NULL OR col = ?1 pattern — single query handles both "all" and "filtered"
let mut stmt = conn.prepare(
    "SELECT id, name FROM things WHERE (?1 IS NULL OR status = ?1) ORDER BY id DESC"
).map_err(|e| e.to_string())?;

let items: Vec<Thing> = stmt
    .query_map(params![optional_status], |r| Ok(Thing {
        id: r.get(0)?,
        name: r.get(1)?,
    }))
    .map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())  // Skip individual row errors rather than failing entire query
    .collect();
```

### Multi-table JOIN with aliased columns

```rust
// When JOINing multiple tables with the same column names (e.g. full_name),
// rusqlite returns them positionally — order matters
conn.prepare(
    "SELECT
        a.id,           -- 0
        a.code,         -- 1
        a.patient_id,   -- 2
        p.full_name,    -- 3  patient name
        a.doctor_id,    -- 4
        d.full_name,    -- 5  doctor name (same col name, different position)
        a.status        -- 6
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     JOIN doctors  d ON a.doctor_id  = d.id
     WHERE a.id = ?1"
)
// Map positionally:
|r| Ok(Appointment {
    id:           r.get(0)?,
    code:         r.get(1)?,
    patient_id:   r.get(2)?,
    patient_name: r.get(3)?,  // Option<String>
    doctor_id:    r.get(4)?,
    doctor_name:  r.get(5)?,  // Option<String>
    status:       r.get(6)?,
})
```

### Boolean in SQLite (stored as INTEGER 0/1)

```rust
// Reading
is_abnormal: r.get::<_, i64>(14)? != 0,  // i64 → bool

// Writing
params![data.is_abnormal as i64]          // bool → i64
```

### INSERT and return created record

```rust
conn.execute(
    "INSERT INTO things (code, name, status) VALUES (?1, ?2, ?3)",
    params![code, data.name, status],
).map_err(|e| e.to_string())?;

let id = conn.last_insert_rowid();

// Immediately re-fetch to return complete record (including computed fields)
conn.query_row(
    "SELECT id, code, name, status, created_at FROM things WHERE id = ?1",
    params![id],
    |r| Ok(Thing { id: r.get(0)?, code: r.get(1)?, name: r.get(2)?, status: r.get(3)?, created_at: r.get(4)? }),
).map_err(|e| e.to_string())
```

### Aggregate queries

```rust
// COUNT
let count: i64 = conn.query_row(
    "SELECT COUNT(*) FROM patients WHERE status = ?1",
    params!["Active"],
    |r| r.get(0)
).unwrap_or(0);  // unwrap_or for dashboard stats — never panic

// SUM with NULL safety
let total: f64 = conn.query_row(
    "SELECT COALESCE(SUM(paid_amount), 0) FROM invoices WHERE issue_date = ?1",
    params![today],
    |r| r.get(0)
).unwrap_or(0.0);
```

---

## Error Handling

### Standard pattern

```rust
// All commands return Result<T, String>
// Convert any error to String with .map_err(|e| e.to_string())?
let conn = state.pool.get().map_err(|e| e.to_string())?;
let mut stmt = conn.prepare("...").map_err(|e| e.to_string())?;
conn.execute("...", params![...]).map_err(|e| e.to_string())?;
```

### Dashboard stats — never fail, return 0 on error

```rust
// For aggregate stats, use unwrap_or instead of ? to avoid crashing dashboard
let total_patients: i64 = conn
    .query_row("SELECT COUNT(*) FROM patients", [], |r| r.get(0))
    .unwrap_or(0);
```

### Validation errors

```rust
#[tauri::command]
pub fn create_patient(state: State<AppState>, data: CreatePatient) -> Result<Patient, String> {
    if data.full_name.trim().is_empty() {
        return Err("Patient name cannot be empty".to_string());
    }
    if data.phone.len() < 10 {
        return Err("Invalid phone number".to_string());
    }
    // ...
}
```

---

## Async Commands (for cloud sync, file I/O)

```rust
// Async commands require 'static lifetime for State
#[tauri::command]
pub async fn sync_to_cloud(state: State<'_, AppState>) -> Result<SyncResult, String> {
    // Must use inner() to get &AppState for async operations
    crate::sync::sync_to_cloud(&state.pool)
        .await
        .map_err(|e| e.to_string())
}

// Register normally in lib.rs — Tauri handles sync/async transparently
.invoke_handler(tauri::generate_handler![
    commands::sync_to_cloud,  // async command
    commands::get_patients,   // sync command
])
```

---

## Registering Commands in lib.rs

```rust
// lib.rs — every command must be listed here
.invoke_handler(tauri::generate_handler![
    // ── Group by module ──────────────────────
    // Dashboard
    commands::get_dashboard_stats,
    commands::get_recent_activity,
    // Patients
    commands::get_patients,
    commands::get_patient_by_id,
    commands::create_patient,
    commands::update_patient,
    commands::delete_patient,
    // Add new commands at end of relevant group
    commands::my_new_command,
])
```

**Common mistake:** Forgetting to add command here causes silent failure on the frontend — the `invoke()` call will throw `"command not found"`.

---

## Schema Design Rules

1. **Every table** must have `id INTEGER PRIMARY KEY AUTOINCREMENT`
2. **Every entity** must have a `_code TEXT NOT NULL UNIQUE` column (human-readable ID)
3. **Every entity** must have `created_at TEXT NOT NULL DEFAULT (datetime('now'))`
4. **Foreign keys** must use `ON DELETE CASCADE` (patients) or `ON DELETE SET NULL` (optional refs)
5. **Indexes** on every column used in WHERE clauses, especially `status`, `patient_id`, `doctor_id`, dates
6. **Booleans** stored as `INTEGER NOT NULL DEFAULT 0` (0=false, 1=true)
7. **Money** stored as `REAL` (f64 in Rust)
8. **Dates** stored as `TEXT` in ISO format `YYYY-MM-DD`
9. **Timestamps** stored as `TEXT` in `YYYY-MM-DD HH:MM:SS` format

### Schema template for new table

```sql
CREATE TABLE IF NOT EXISTS new_things (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    thing_code      TEXT NOT NULL UNIQUE,
    patient_id      INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'Active'
                         CHECK(status IN ('Active', 'Inactive', 'Archived')),
    amount          REAL NOT NULL DEFAULT 0,
    flag            INTEGER NOT NULL DEFAULT 0,       -- boolean
    notes           TEXT,                              -- nullable optional
    due_date        TEXT,                              -- YYYY-MM-DD nullable
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_new_things_patient ON new_things(patient_id);
CREATE INDEX IF NOT EXISTS idx_new_things_status  ON new_things(status);
```

---

## PRAGMA Settings Explained

```sql
PRAGMA journal_mode=WAL;
-- Write-Ahead Logging: allows concurrent reads during writes
-- Critical for desktop app where UI reads while Rust writes

PRAGMA foreign_keys=ON;
-- Must be set per-connection — not persistent across connections
-- Required for ON DELETE CASCADE to work

PRAGMA synchronous=NORMAL;
-- Balance between safety and performance
-- FULL = safest, NORMAL = good for desktop, OFF = fastest but risky
```

---

## Common Compile Errors & Fixes

### "cannot find derive macro `Serialize`"
```toml
# Cargo.toml — must have features = ["derive"]
serde = { version = "1", features = ["derive"] }
```

### "the trait `FromSql` is not implemented for `bool`"
```rust
// SQLite has no bool type — read as i64 and convert
is_abnormal: r.get::<_, i64>(14)? != 0,
```

### "cannot borrow `state.pool` as immutable"
```rust
// State<AppState> is fine, but async commands need State<'_, AppState>
pub async fn my_cmd(state: State<'_, AppState>) -> Result<(), String> { ... }
```

### "unused import `params`"
```rust
// Add to top of commands.rs
use rusqlite::params;
```

### "foreign key constraint failed"
```sql
-- Make sure PRAGMA foreign_keys=ON is set
-- Check that the referenced record exists before INSERT
-- Check ON DELETE CASCADE is defined correctly in schema
```

### "database is locked"
```rust
// Increase pool size or check for uncommitted transactions
Pool::builder().max_size(10).build(manager)
// Also check: are there long-running transactions holding the write lock?
```

---

## Neon PostgreSQL Cloud Sync Implementation

When ready to enable real cloud sync, update `src-tauri/src/sync.rs`:

```rust
use tokio_postgres::NoTls;

pub async fn sync_to_cloud(pool: &DbPool) -> Result<SyncResult> {
    // 1. Get Neon connection string from env or settings table
    let neon_url = std::env::var("NEON_DATABASE_URL")
        .map_err(|_| anyhow::anyhow!("NEON_DATABASE_URL not set"))?;

    // 2. Connect to Neon
    let (client, connection) = tokio_postgres::connect(&neon_url, NoTls).await?;
    tokio::spawn(async move { let _ = connection.await; });

    // 3. Fetch pending queue entries from local SQLite
    let conn = pool.get()?;
    let entries = /* query sync_queue WHERE synced = 0 */;

    let mut synced = 0i64;
    let mut errors = 0i64;

    for entry in &entries {
        let result = match entry.operation.as_str() {
            "INSERT" => {
                let payload: serde_json::Value = serde_json::from_str(&entry.payload)?;
                client.execute(
                    &format!("INSERT INTO {} ... ON CONFLICT DO NOTHING", entry.table_name),
                    &[/* params from payload */]
                ).await
            }
            "UPDATE" => { /* ... */ }
            "DELETE" => { /* ... */ }
            _ => continue,
        };

        match result {
            Ok(_) => {
                conn.execute("UPDATE sync_queue SET synced = 1 WHERE id = ?1", params![entry.id])?;
                synced += 1;
            }
            Err(e) => {
                log::error!("Sync error for {}: {}", entry.id, e);
                errors += 1;
            }
        }
    }

    Ok(SyncResult { synced, errors })
}
```

---

## Testing Commands Manually

While Tauri doesn't have a built-in test harness for commands, you can test SQL logic with:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{create_pool, run_migrations};

    fn test_pool() -> DbPool {
        let pool = create_pool(":memory:").unwrap(); // in-memory SQLite
        run_migrations(&pool).unwrap();
        pool
    }

    #[test]
    fn test_create_patient() {
        let pool = test_pool();
        let conn = pool.get().unwrap();
        let code = new_code("PT");
        conn.execute(
            "INSERT INTO patients (patient_code, full_name, dob, gender, phone, blood_group, department, status)
             VALUES (?1, 'Test Patient', '1990-01-01', 'Male', '9876543210', 'O+', 'General Medicine', 'OPD')",
            params![code],
        ).unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM patients", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
    }
}
```

Run with: `cd src-tauri && cargo test`
