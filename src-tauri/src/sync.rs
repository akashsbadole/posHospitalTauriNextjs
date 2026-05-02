// src-tauri/src/sync.rs
use crate::db::DbPool;
use crate::models::{SyncResult, SyncStatus};
use anyhow::Result;
use rusqlite::params;
use std::env;

fn get_neon_url() -> Option<String> {
    env::var("NEON_DATABASE_URL").ok().or_else(|| {
        std::fs::read_to_string(".env")
            .ok()
            .and_then(|content| {
                content
                    .lines()
                    .find(|line| line.starts_with("NEON_DATABASE_URL="))
                    .map(|line| line.trim_start_matches("NEON_DATABASE_URL=").to_string())
            })
    })
}

pub async fn sync_to_cloud(pool: &DbPool) -> Result<SyncResult> {
    let entries: Vec<(i64, String, String, i64, String)> = {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, operation, table_name, record_id, payload
             FROM sync_queue WHERE synced = 0 ORDER BY created_at LIMIT 500",
        )?;
        let result: Vec<_> = stmt.query_map([], |row| {
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
        result
    };

    let total = entries.len() as i64;
    let mut errors = 0i64;
    let mut failed_ids = Vec::new();

    if let Some(neon_url) = get_neon_url() {
        match tokio_postgres::connect(&neon_url, tokio_postgres::NoTls).await {
            Ok((client, connection)) => {
                tokio::spawn(async move {
                    if let Err(e) = connection.await {
                        log::error!("Neon connection error: {}", e);
                    }
                });

                for (id, operation, table, record_id, payload) in &entries {
                    let sql = match operation.as_str() {
                        "INSERT" => format!(
                            "INSERT INTO {} (id, data) VALUES ({}, '{}'::jsonb) ON CONFLICT DO NOTHING",
                            table, record_id, payload.replace("'", "''")
                        ),
                        "UPDATE" => format!(
                            "UPDATE {} SET data = '{}'::jsonb, updated_at = NOW() WHERE id = {}",
                            table, payload.replace("'", "''"), record_id
                        ),
                        "DELETE" => format!("DELETE FROM {} WHERE id = {}", table, record_id),
                        _ => continue,
                    };

                    match client.execute(&sql, &[]).await {
                        Ok(_) => {}
                        Err(e) => {
                            log::error!("Sync error for {} {}: {}", operation, id, e);
                            errors += 1;
                            failed_ids.push(*id);
                        }
                    }
                }
            }
            Err(e) => {
                log::warn!("Could not connect to Neon: {}", e);
            }
        }
    }

    {
        let mut conn = pool.get()?;
        let tx = conn.transaction()?;
        
        for (id, _, _, _, _) in &entries {
            if !failed_ids.contains(id) {
                let _ = tx.execute("UPDATE sync_queue SET synced = 1 WHERE id = ?1", params![id]);
            }
        }
        
        tx.commit()?;

        conn.execute(
            "INSERT INTO audit_logs (user_name, action, entity, details)
             VALUES ('System', 'Cloud sync completed', 'sync', ?1)",
            params![format!("Synced {} records, {} errors", total - errors, errors)],
        )?;
    }

    Ok(SyncResult { synced: total - errors, errors })
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

pub fn queue_sync(pool: &DbPool, operation: &str, table: &str, record_id: i64, payload: &str) {
    if let Ok(conn) = pool.get() {
        let _ = conn.execute(
            "INSERT INTO sync_queue (operation, table_name, record_id, payload) VALUES (?1, ?2, ?3, ?4)",
            params![operation, table, record_id, payload],
        );
    }
}