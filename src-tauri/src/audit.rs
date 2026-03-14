// src-tauri/src/audit.rs
use crate::db::DbPool;
use rusqlite::params;

pub fn log(
    pool: &DbPool,
    user_name: &str,
    action: &str,
    entity: &str,
    entity_id: Option<i64>,
    details: Option<&str>,
) {
    if let Ok(conn) = pool.get() {
        let _ = conn.execute(
            "INSERT INTO audit_logs (user_name, action, entity, entity_id, details)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![user_name, action, entity, entity_id, details],
        );
    }
}
