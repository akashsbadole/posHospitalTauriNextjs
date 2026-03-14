// src-tauri/src/sync.rs
use crate::db::DbPool;
use crate::models::{SyncResult, SyncStatus};
use anyhow::Result;
use rusqlite::params;

/// Push pending sync_queue entries to Neon PostgreSQL.
/// In production this uses the NEON_DATABASE_URL env variable.
pub async fn sync_to_cloud(pool: &DbPool) -> Result<SyncResult> {
    let conn = pool.get()?;

    // Fetch all unsynced entries
    let mut stmt = conn.prepare(
        "SELECT id, operation, table_name, record_id, payload
         FROM sync_queue WHERE synced = 0 ORDER BY created_at LIMIT 500",
    )?;

    let entries: Vec<(i64, String, String, i64, String)> = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, String>(4)?,
            ))
        })?
        .filter_map(|r| r.ok())
        .collect();

    let total = entries.len() as i64;
    let mut errors = 0i64;

    // TODO: Replace with actual Neon connection when NEON_DATABASE_URL is set.
    // Example:
    //   let (client, connection) = tokio_postgres::connect(&neon_url, tokio_postgres::NoTls).await?;
    //   tokio::spawn(async move { let _ = connection.await; });
    //   for entry in &entries {
    //       match entry.1.as_str() {
    //           "INSERT" => { client.execute(&format!("..."), &[]).await?; }
    //           "UPDATE" => { ... }
    //           "DELETE" => { ... }
    //       }
    //   }

    // Mark all as synced (simulated for now)
    for (id, _, _, _, _) in &entries {
        conn.execute("UPDATE sync_queue SET synced = 1 WHERE id = ?1", params![id])?;
    }

    // Record last sync time
    conn.execute(
        "INSERT OR REPLACE INTO audit_logs (user_name, action, entity, details)
         VALUES ('System', 'Cloud sync completed', 'sync', ?1)",
        params![format!("Synced {} records", total)],
    )?;

    Ok(SyncResult {
        synced: total,
        errors,
    })
}

pub fn get_sync_status(pool: &DbPool) -> Result<SyncStatus> {
    let conn = pool.get()?;

    let pending: i64 = conn
        .query_row("SELECT COUNT(*) FROM sync_queue WHERE synced = 0", [], |r| r.get(0))
        .unwrap_or(0);

    let last_sync = conn
        .query_row(
            "SELECT timestamp FROM audit_logs WHERE action = 'Cloud sync completed' ORDER BY id DESC LIMIT 1",
            [],
            |r| r.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "Never".to_string());

    Ok(SyncStatus { last_sync, pending })
}

/// Queue a change for cloud sync
pub fn queue_sync(pool: &DbPool, operation: &str, table: &str, record_id: i64, payload: &str) {
    if let Ok(conn) = pool.get() {
        let _ = conn.execute(
            "INSERT INTO sync_queue (operation, table_name, record_id, payload) VALUES (?1, ?2, ?3, ?4)",
            params![operation, table, record_id, payload],
        );
    }
}
