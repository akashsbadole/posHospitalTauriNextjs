// src-tauri/src/commands.rs
use crate::audit;
use crate::db::AppState;
use crate::models::*;
use crate::sync;
use rusqlite::params;
use tauri::State;
use uuid::Uuid;

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn new_code(prefix: &str) -> String {
    let id = Uuid::new_v4().to_string();
    let short = &id[..8].to_uppercase();
    format!("{}-{}", prefix, short)
}

fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

fn now() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_dashboard_stats(state: State<AppState>) -> Result<DashboardStats, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let today = today();
    let month_start = format!("{}-01", &today[..7]);

    let total_patients: i64 = conn.query_row("SELECT COUNT(*) FROM patients", [], |r| r.get(0)).unwrap_or(0);
    let today_appointments: i64 = conn.query_row("SELECT COUNT(*) FROM appointments WHERE appointment_date = ?1", params![today], |r| r.get(0)).unwrap_or(0);
    let beds_occupied: i64 = conn.query_row("SELECT COUNT(*) FROM beds WHERE status = 'Occupied'", [], |r| r.get(0)).unwrap_or(0);
    let total_beds: i64 = conn.query_row("SELECT COUNT(*) FROM beds", [], |r| r.get(0)).unwrap_or(0);
    let today_revenue: f64 = conn.query_row("SELECT COALESCE(SUM(paid_amount),0) FROM invoices WHERE issue_date = ?1", params![today], |r| r.get(0)).unwrap_or(0.0);
    let monthly_revenue: f64 = conn.query_row("SELECT COALESCE(SUM(paid_amount),0) FROM invoices WHERE issue_date >= ?1", params![month_start], |r| r.get(0)).unwrap_or(0.0);
    let pending_labs: i64 = conn.query_row("SELECT COUNT(*) FROM lab_tests WHERE status NOT IN ('Reviewed','Ready')", [], |r| r.get(0)).unwrap_or(0);
    let rx_due_refill: i64 = conn.query_row("SELECT COUNT(*) FROM prescription_drugs WHERE refills_remaining = 0", [], |r| r.get(0)).unwrap_or(0);
    let low_stock_items: i64 = conn.query_row("SELECT COUNT(*) FROM inventory WHERE current_stock <= min_threshold", [], |r| r.get(0)).unwrap_or(0);
    let pending_claims: i64 = conn.query_row("SELECT COUNT(*) FROM insurance_claims WHERE status IN ('Draft','Submitted','Under Review')", [], |r| r.get(0)).unwrap_or(0);
    let discharges_today: i64 = conn.query_row("SELECT COUNT(*) FROM audit_logs WHERE action = 'Patient discharged' AND timestamp LIKE ?1", params![format!("{}%", today)], |r| r.get(0)).unwrap_or(0);
    let new_patients_this_month: i64 = conn.query_row("SELECT COUNT(*) FROM patients WHERE created_at >= ?1", params![month_start], |r| r.get(0)).unwrap_or(0);

    Ok(DashboardStats {
        total_patients, today_appointments, beds_occupied, total_beds,
        today_revenue, pending_labs, rx_due_refill, low_stock_items,
        pending_claims, discharges_today, monthly_revenue, new_patients_this_month,
    })
}

#[tauri::command]
pub fn get_recent_activity(state: State<AppState>, limit: Option<i64>) -> Result<Vec<AuditLog>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(20);
    let mut stmt = conn.prepare(
        "SELECT id, user_name, action, entity, entity_id, details, ip_address, timestamp
         FROM audit_logs ORDER BY id DESC LIMIT ?1"
    ).map_err(|e| e.to_string())?;
    let logs = stmt.query_map(params![lim], |r| Ok(AuditLog {
        id: r.get(0)?, user_name: r.get(1)?, action: r.get(2)?,
        entity: r.get(3)?, entity_id: r.get(4)?, details: r.get(5)?,
        ip_address: r.get(6)?, timestamp: r.get(7)?,
    })).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok()).collect();
    Ok(logs)
}

// ─── PATIENTS ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_patients(state: State<AppState>, search: Option<String>, status: Option<String>) -> Result<Vec<Patient>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let search_pat = search.map(|s| format!("%{}%", s.to_lowercase()));
    let mut stmt = conn.prepare(
        "SELECT p.id, p.patient_code, p.full_name, p.dob, p.gender, p.phone, p.email,
                p.blood_group, p.address, p.emergency_contact, p.emergency_phone,
                p.allergies, p.chronic_conditions, p.department, p.assigned_doctor_id,
                d.full_name as doctor_name, p.status, p.insurance_provider, p.insurance_number,
                p.created_at, p.updated_at
         FROM patients p
         LEFT JOIN doctors d ON p.assigned_doctor_id = d.id
         WHERE (?1 IS NULL OR LOWER(p.full_name) LIKE ?1 OR p.phone LIKE ?1 OR p.patient_code LIKE ?1)
           AND (?2 IS NULL OR p.status = ?2)
         ORDER BY p.id DESC"
    ).map_err(|e| e.to_string())?;
    let patients = stmt.query_map(params![search_pat, status], |r| Ok(Patient {
        id: r.get(0)?, patient_code: r.get(1)?, full_name: r.get(2)?, dob: r.get(3)?,
        gender: r.get(4)?, phone: r.get(5)?, email: r.get(6)?, blood_group: r.get(7)?,
        address: r.get(8)?, emergency_contact: r.get(9)?, emergency_phone: r.get(10)?,
        allergies: r.get(11)?, chronic_conditions: r.get(12)?, department: r.get(13)?,
        assigned_doctor_id: r.get(14)?, assigned_doctor_name: r.get(15)?,
        status: r.get(16)?, insurance_provider: r.get(17)?, insurance_number: r.get(18)?,
        created_at: r.get(19)?, updated_at: r.get(20)?,
    })).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok()).collect();
    Ok(patients)
}

#[tauri::command]
pub fn get_patient_by_id(state: State<AppState>, id: i64) -> Result<Patient, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT p.id, p.patient_code, p.full_name, p.dob, p.gender, p.phone, p.email,
                p.blood_group, p.address, p.emergency_contact, p.emergency_phone,
                p.allergies, p.chronic_conditions, p.department, p.assigned_doctor_id,
                d.full_name, p.status, p.insurance_provider, p.insurance_number,
                p.created_at, p.updated_at
         FROM patients p LEFT JOIN doctors d ON p.assigned_doctor_id = d.id
         WHERE p.id = ?1",
        params![id],
        |r| Ok(Patient {
            id: r.get(0)?, patient_code: r.get(1)?, full_name: r.get(2)?, dob: r.get(3)?,
            gender: r.get(4)?, phone: r.get(5)?, email: r.get(6)?, blood_group: r.get(7)?,
            address: r.get(8)?, emergency_contact: r.get(9)?, emergency_phone: r.get(10)?,
            allergies: r.get(11)?, chronic_conditions: r.get(12)?, department: r.get(13)?,
            assigned_doctor_id: r.get(14)?, assigned_doctor_name: r.get(15)?,
            status: r.get(16)?, insurance_provider: r.get(17)?, insurance_number: r.get(18)?,
            created_at: r.get(19)?, updated_at: r.get(20)?,
        }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_patient(state: State<AppState>, data: CreatePatient) -> Result<Patient, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("PT");
    let status = data.status.as_deref().unwrap_or("OPD");
    conn.execute(
        "INSERT INTO patients (patient_code, full_name, dob, gender, phone, email, blood_group,
          address, emergency_contact, emergency_phone, allergies, chronic_conditions, department,
          assigned_doctor_id, status, insurance_provider, insurance_number)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",
        params![code, data.full_name, data.dob, data.gender, data.phone, data.email,
                data.blood_group, data.address, data.emergency_contact, data.emergency_phone,
                data.allergies, data.chronic_conditions, data.department, data.assigned_doctor_id,
                status, data.insurance_provider, data.insurance_number],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    audit::log(&state.pool, "System", "Patient registered", "patient", Some(id), Some(&data.full_name));
    sync::queue_sync(&state.pool, "INSERT", "patients", id, &format!("{{\"patient_code\":\"{}\"}}", code));
    get_patient_by_id(state, id)
}

#[tauri::command]
pub fn update_patient(state: State<AppState>, id: i64, data: serde_json::Value) -> Result<Patient, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    if let Some(status) = data.get("status").and_then(|v| v.as_str()) {
        conn.execute("UPDATE patients SET status = ?1, updated_at = datetime('now') WHERE id = ?2", params![status, id]).map_err(|e| e.to_string())?;
    }
    if let Some(name) = data.get("full_name").and_then(|v| v.as_str()) {
        conn.execute("UPDATE patients SET full_name = ?1, updated_at = datetime('now') WHERE id = ?2", params![name, id]).map_err(|e| e.to_string())?;
    }
    audit::log(&state.pool, "System", "Patient updated", "patient", Some(id), None);
    get_patient_by_id(state, id)
}

#[tauri::command]
pub fn delete_patient(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM patients WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    audit::log(&state.pool, "System", "Patient deleted", "patient", Some(id), None);
    Ok(())
}

#[tauri::command]
pub fn get_patient_vitals(state: State<AppState>, patient_id: i64) -> Result<Vec<VitalSigns>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, patient_id, recorded_by, recorded_at, blood_pressure_sys, blood_pressure_dia,
                heart_rate, temperature, spo2, respiratory_rate, weight_kg, height_cm, notes
         FROM vital_signs WHERE patient_id = ?1 ORDER BY recorded_at DESC"
    ).map_err(|e| e.to_string())?;
    let vitals = stmt.query_map(params![patient_id], |r| Ok(VitalSigns {
        id: r.get(0)?, patient_id: r.get(1)?, recorded_by: r.get(2)?, recorded_at: r.get(3)?,
        blood_pressure_sys: r.get(4)?, blood_pressure_dia: r.get(5)?, heart_rate: r.get(6)?,
        temperature: r.get(7)?, spo2: r.get(8)?, respiratory_rate: r.get(9)?,
        weight_kg: r.get(10)?, height_cm: r.get(11)?, notes: r.get(12)?,
    })).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok()).collect();
    Ok(vitals)
}

#[tauri::command]
pub fn add_vital_signs(state: State<AppState>, data: VitalSigns) -> Result<VitalSigns, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO vital_signs (patient_id, recorded_by, blood_pressure_sys, blood_pressure_dia,
          heart_rate, temperature, spo2, respiratory_rate, weight_kg, height_cm, notes)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![data.patient_id, data.recorded_by, data.blood_pressure_sys, data.blood_pressure_dia,
                data.heart_rate, data.temperature, data.spo2, data.respiratory_rate,
                data.weight_kg, data.height_cm, data.notes],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(VitalSigns { id, ..data })
}

// ─── DOCTORS ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_doctors(state: State<AppState>) -> Result<Vec<Doctor>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, staff_code, full_name, specialization, phone, email, qualification,
                availability_status, shift, experience_years, consultation_fee, created_at
         FROM doctors ORDER BY full_name"
    ).map_err(|e| e.to_string())?;
    let docs = stmt.query_map([], |r| Ok(Doctor {
        id: r.get(0)?, staff_code: r.get(1)?, full_name: r.get(2)?, specialization: r.get(3)?,
        phone: r.get(4)?, email: r.get(5)?, qualification: r.get(6)?,
        availability_status: r.get(7)?, shift: r.get(8)?,
        experience_years: r.get(9)?, consultation_fee: r.get(10)?, created_at: r.get(11)?,
    })).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok()).collect();
    Ok(docs)
}

#[tauri::command]
pub fn get_doctor_by_id(state: State<AppState>, id: i64) -> Result<Doctor, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, staff_code, full_name, specialization, phone, email, qualification,
                availability_status, shift, experience_years, consultation_fee, created_at
         FROM doctors WHERE id = ?1",
        params![id],
        |r| Ok(Doctor {
            id: r.get(0)?, staff_code: r.get(1)?, full_name: r.get(2)?, specialization: r.get(3)?,
            phone: r.get(4)?, email: r.get(5)?, qualification: r.get(6)?,
            availability_status: r.get(7)?, shift: r.get(8)?,
            experience_years: r.get(9)?, consultation_fee: r.get(10)?, created_at: r.get(11)?,
        }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_doctor(state: State<AppState>, data: CreateDoctor) -> Result<Doctor, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("DR");
    let status = data.availability_status.as_deref().unwrap_or("Available");
    let shift = data.shift.as_deref().unwrap_or("Morning");
    conn.execute(
        "INSERT INTO doctors (staff_code, full_name, specialization, phone, email, qualification, availability_status, shift, experience_years, consultation_fee) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![code, data.full_name, data.specialization, data.phone, data.email, data.qualification, status, shift, data.experience_years, data.consultation_fee],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    audit::log(&state.pool, "System", "Doctor registered", "staff", Some(id), Some(&data.full_name));
    get_doctor_by_id(state, id)
}

#[tauri::command]
pub fn update_doctor(state: State<AppState>, id: i64, data: serde_json::Value) -> Result<Doctor, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    if let Some(status) = data.get("availability_status").and_then(|v| v.as_str()) {
        conn.execute("UPDATE doctors SET availability_status = ?1 WHERE id = ?2", params![status, id]).map_err(|e| e.to_string())?;
    }
    get_doctor_by_id(state, id)
}

#[tauri::command]
pub fn update_doctor_status(state: State<AppState>, id: i64, status: String) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("UPDATE doctors SET availability_status = ?1 WHERE id = ?2", params![status, id]).map_err(|e| e.to_string())?;
    audit::log(&state.pool, "System", "Doctor status updated", "staff", Some(id), Some(&status));
    Ok(())
}

// ─── STAFF ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_staff(state: State<AppState>) -> Result<Vec<Staff>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, staff_code, full_name, role, department, phone, email, shift, status, join_date, salary FROM staff ORDER BY full_name"
    ).map_err(|e| e.to_string())?;
    let staff = stmt.query_map([], |r| Ok(Staff {
        id: r.get(0)?, staff_code: r.get(1)?, full_name: r.get(2)?, role: r.get(3)?,
        department: r.get(4)?, phone: r.get(5)?, email: r.get(6)?,
        shift: r.get(7)?, status: r.get(8)?, join_date: r.get(9)?, salary: r.get(10)?,
    })).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok()).collect();
    Ok(staff)
}

#[tauri::command]
pub fn create_staff(state: State<AppState>, data: CreateStaff) -> Result<Staff, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("ST");
    let shift = data.shift.as_deref().unwrap_or("Morning");
    let status = data.status.as_deref().unwrap_or("Active");
    conn.execute(
        "INSERT INTO staff (staff_code, full_name, role, department, phone, email, shift, status, join_date, salary) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![code, data.full_name, data.role, data.department, data.phone, data.email, shift, status, data.join_date, data.salary],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let s = conn.query_row("SELECT id, staff_code, full_name, role, department, phone, email, shift, status, join_date, salary FROM staff WHERE id = ?1", params![id], |r| Ok(Staff {
        id: r.get(0)?, staff_code: r.get(1)?, full_name: r.get(2)?, role: r.get(3)?,
        department: r.get(4)?, phone: r.get(5)?, email: r.get(6)?,
        shift: r.get(7)?, status: r.get(8)?, join_date: r.get(9)?, salary: r.get(10)?,
    })).map_err(|e| e.to_string())?;
    Ok(s)
}

#[tauri::command]
pub fn update_staff(state: State<AppState>, id: i64, data: serde_json::Value) -> Result<Staff, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    if let Some(status) = data.get("status").and_then(|v| v.as_str()) {
        conn.execute("UPDATE staff SET status = ?1 WHERE id = ?2", params![status, id]).map_err(|e| e.to_string())?;
    }
    let s = conn.query_row("SELECT id, staff_code, full_name, role, department, phone, email, shift, status, join_date, salary FROM staff WHERE id = ?1", params![id], |r| Ok(Staff {
        id: r.get(0)?, staff_code: r.get(1)?, full_name: r.get(2)?, role: r.get(3)?,
        department: r.get(4)?, phone: r.get(5)?, email: r.get(6)?,
        shift: r.get(7)?, status: r.get(8)?, join_date: r.get(9)?, salary: r.get(10)?,
    })).map_err(|e| e.to_string())?;
    Ok(s)
}

#[tauri::command]
pub fn delete_staff(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM staff WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ─── APPOINTMENTS ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_appointments(state: State<AppState>, date: Option<String>, doctor_id: Option<i64>) -> Result<Vec<Appointment>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT a.id, a.appointment_code, a.patient_id, p.full_name, a.doctor_id, d.full_name,
                a.department, a.appointment_date, a.appointment_time, a.type, a.status,
                a.notes, a.follow_up_date, a.created_at
         FROM appointments a
         JOIN patients p ON a.patient_id = p.id
         JOIN doctors d ON a.doctor_id = d.id
         WHERE (?1 IS NULL OR a.appointment_date = ?1)
           AND (?2 IS NULL OR a.doctor_id = ?2)
         ORDER BY a.appointment_time ASC"
    ).map_err(|e| e.to_string())?;
    let appts = stmt.query_map(params![date, doctor_id], |r| Ok(Appointment {
        id: r.get(0)?, appointment_code: r.get(1)?, patient_id: r.get(2)?, patient_name: r.get(3)?,
        doctor_id: r.get(4)?, doctor_name: r.get(5)?, department: r.get(6)?,
        appointment_date: r.get(7)?, appointment_time: r.get(8)?, appt_type: r.get(9)?,
        status: r.get(10)?, notes: r.get(11)?, follow_up_date: r.get(12)?, created_at: r.get(13)?,
    })).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok()).collect();
    Ok(appts)
}

#[tauri::command]
pub fn get_appointment_by_id(state: State<AppState>, id: i64) -> Result<Appointment, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT a.id, a.appointment_code, a.patient_id, p.full_name, a.doctor_id, d.full_name,
                a.department, a.appointment_date, a.appointment_time, a.type, a.status,
                a.notes, a.follow_up_date, a.created_at
         FROM appointments a JOIN patients p ON a.patient_id = p.id JOIN doctors d ON a.doctor_id = d.id WHERE a.id = ?1",
        params![id],
        |r| Ok(Appointment {
            id: r.get(0)?, appointment_code: r.get(1)?, patient_id: r.get(2)?, patient_name: r.get(3)?,
            doctor_id: r.get(4)?, doctor_name: r.get(5)?, department: r.get(6)?,
            appointment_date: r.get(7)?, appointment_time: r.get(8)?, appt_type: r.get(9)?,
            status: r.get(10)?, notes: r.get(11)?, follow_up_date: r.get(12)?, created_at: r.get(13)?,
        }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_appointment(state: State<AppState>, data: CreateAppointment) -> Result<Appointment, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("APT");
    let status = data.status.as_deref().unwrap_or("Scheduled");
    conn.execute(
        "INSERT INTO appointments (appointment_code, patient_id, doctor_id, department, appointment_date, appointment_time, type, status, notes, follow_up_date) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![code, data.patient_id, data.doctor_id, data.department, data.appointment_date, data.appointment_time, data.appt_type, status, data.notes, data.follow_up_date],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    audit::log(&state.pool, "System", "Appointment scheduled", "appointment", Some(id), Some(&data.appointment_date));
    get_appointment_by_id(state, id)
}

#[tauri::command]
pub fn update_appointment_status(state: State<AppState>, id: i64, status: String) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("UPDATE appointments SET status = ?1 WHERE id = ?2", params![status, id]).map_err(|e| e.to_string())?;
    audit::log(&state.pool, "System", "Appointment status updated", "appointment", Some(id), Some(&status));
    Ok(())
}

#[tauri::command]
pub fn cancel_appointment(state: State<AppState>, id: i64, reason: Option<String>) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("UPDATE appointments SET status = 'Cancelled' WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    audit::log(&state.pool, "System", "Appointment cancelled", "appointment", Some(id), reason.as_deref());
    Ok(())
}

#[tauri::command]
pub fn get_upcoming_appointments(state: State<AppState>, patient_id: i64) -> Result<Vec<Appointment>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let today = today();
    let mut stmt = conn.prepare(
        "SELECT a.id, a.appointment_code, a.patient_id, p.full_name, a.doctor_id, d.full_name,
                a.department, a.appointment_date, a.appointment_time, a.type, a.status,
                a.notes, a.follow_up_date, a.created_at
         FROM appointments a JOIN patients p ON a.patient_id = p.id JOIN doctors d ON a.doctor_id = d.id
         WHERE a.patient_id = ?1 AND a.appointment_date >= ?2 AND a.status NOT IN ('Cancelled','Completed')
         ORDER BY a.appointment_date, a.appointment_time"
    ).map_err(|e| e.to_string())?;
    let appts = stmt.query_map(params![patient_id, today], |r| Ok(Appointment {
        id: r.get(0)?, appointment_code: r.get(1)?, patient_id: r.get(2)?, patient_name: r.get(3)?,
        doctor_id: r.get(4)?, doctor_name: r.get(5)?, department: r.get(6)?,
        appointment_date: r.get(7)?, appointment_time: r.get(8)?, appt_type: r.get(9)?,
        status: r.get(10)?, notes: r.get(11)?, follow_up_date: r.get(12)?, created_at: r.get(13)?,
    })).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok()).collect();
    Ok(appts)
}

// ─── PRESCRIPTIONS ────────────────────────────────────────────────────────────

fn load_drugs(conn: &rusqlite::Connection, prescription_id: i64) -> Vec<PrescriptionDrug> {
    let mut stmt = conn.prepare(
        "SELECT id, prescription_id, drug_name, dosage, frequency, duration_days, route, instructions, refills_remaining FROM prescription_drugs WHERE prescription_id = ?1"
    ).unwrap();
    stmt.query_map(params![prescription_id], |r| Ok(PrescriptionDrug {
        id: r.get(0)?, prescription_id: r.get(1)?, drug_name: r.get(2)?, dosage: r.get(3)?,
        frequency: r.get(4)?, duration_days: r.get(5)?, route: r.get(6)?,
        instructions: r.get(7)?, refills_remaining: r.get(8)?,
    })).unwrap().filter_map(|r| r.ok()).collect()
}

#[tauri::command]
pub fn get_prescriptions(state: State<AppState>, patient_id: Option<i64>) -> Result<Vec<Prescription>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT r.id, r.rx_code, r.patient_id, p.full_name, r.doctor_id, d.full_name,
                r.issue_date, r.valid_until, r.status, r.diagnosis, r.notes, r.created_at
         FROM prescriptions r JOIN patients p ON r.patient_id = p.id JOIN doctors d ON r.doctor_id = d.id
         WHERE (?1 IS NULL OR r.patient_id = ?1) ORDER BY r.id DESC"
    ).map_err(|e| e.to_string())?;
    let rxs: Vec<Prescription> = stmt.query_map(params![patient_id], |r| {
        let id: i64 = r.get(0)?;
        Ok((id, r.get::<_,String>(1)?, r.get::<_,i64>(2)?, r.get::<_,Option<String>>(3)?,
            r.get::<_,i64>(4)?, r.get::<_,Option<String>>(5)?,
            r.get::<_,String>(6)?, r.get::<_,String>(7)?, r.get::<_,String>(8)?,
            r.get::<_,Option<String>>(9)?, r.get::<_,Option<String>>(10)?, r.get::<_,String>(11)?))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .map(|(id, rx_code, patient_id, patient_name, doctor_id, doctor_name, issue_date, valid_until, status, diagnosis, notes, created_at)| {
        let drugs = load_drugs(&conn, id);
        Prescription { id, rx_code, patient_id, patient_name, doctor_id, doctor_name, issue_date, valid_until, status, drugs, diagnosis, notes, created_at }
    }).collect();
    Ok(rxs)
}

#[tauri::command]
pub fn get_prescription_by_id(state: State<AppState>, id: i64) -> Result<Prescription, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let (rx_code, patient_id, patient_name, doctor_id, doctor_name, issue_date, valid_until, status, diagnosis, notes, created_at) = conn.query_row(
        "SELECT r.rx_code, r.patient_id, p.full_name, r.doctor_id, d.full_name, r.issue_date, r.valid_until, r.status, r.diagnosis, r.notes, r.created_at
         FROM prescriptions r JOIN patients p ON r.patient_id = p.id JOIN doctors d ON r.doctor_id = d.id WHERE r.id = ?1",
        params![id],
        |r| Ok((r.get::<_,String>(0)?, r.get::<_,i64>(1)?, r.get::<_,Option<String>>(2)?,
                r.get::<_,i64>(3)?, r.get::<_,Option<String>>(4)?, r.get::<_,String>(5)?,
                r.get::<_,String>(6)?, r.get::<_,String>(7)?, r.get::<_,Option<String>>(8)?,
                r.get::<_,Option<String>>(9)?, r.get::<_,String>(10)?)),
    ).map_err(|e| e.to_string())?;
    let drugs = load_drugs(&conn, id);
    Ok(Prescription { id, rx_code, patient_id, patient_name, doctor_id, doctor_name, issue_date, valid_until, status, drugs, diagnosis, notes, created_at })
}

#[tauri::command]
pub fn create_prescription(state: State<AppState>, data: CreatePrescription, drugs: Vec<CreatePrescriptionDrug>) -> Result<Prescription, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("RX");
    let status = data.status.as_deref().unwrap_or("Active");
    conn.execute(
        "INSERT INTO prescriptions (rx_code, patient_id, doctor_id, issue_date, valid_until, status, diagnosis, notes) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        params![code, data.patient_id, data.doctor_id, data.issue_date, data.valid_until, status, data.diagnosis, data.notes],
    ).map_err(|e| e.to_string())?;
    let rx_id = conn.last_insert_rowid();
    for drug in &drugs {
        let route = drug.route.as_deref().unwrap_or("Oral");
        conn.execute(
            "INSERT INTO prescription_drugs (prescription_id, drug_name, dosage, frequency, duration_days, route, instructions, refills_remaining) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![rx_id, drug.drug_name, drug.dosage, drug.frequency, drug.duration_days, route, drug.instructions, drug.refills_remaining],
        ).map_err(|e| e.to_string())?;
    }
    audit::log(&state.pool, "System", "Prescription created", "prescription", Some(rx_id), Some(&code));
    get_prescription_by_id(state, rx_id)
}

#[tauri::command]
pub fn cancel_prescription(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("UPDATE prescriptions SET status = 'Cancelled' WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    audit::log(&state.pool, "System", "Prescription cancelled", "prescription", Some(id), None);
    Ok(())
}

#[tauri::command]
pub fn refill_prescription(state: State<AppState>, id: i64, drug_id: i64) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("UPDATE prescription_drugs SET refills_remaining = refills_remaining + 3 WHERE id = ?1 AND prescription_id = ?2", params![drug_id, id]).map_err(|e| e.to_string())?;
    audit::log(&state.pool, "System", "Prescription refilled", "prescription", Some(id), None);
    Ok(())
}

#[tauri::command]
pub fn get_prescriptions_due_refill(state: State<AppState>) -> Result<Vec<Prescription>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let ids: Vec<i64> = {
        let mut stmt = conn.prepare("SELECT DISTINCT prescription_id FROM prescription_drugs WHERE refills_remaining = 0").map_err(|e| e.to_string())?;
        stmt.query_map([], |r| r.get(0)).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect()
    };
    let mut result = Vec::new();
    for id in ids {
        if let Ok(rx) = get_prescription_by_id(state.inner().clone(), id) {
            result.push(rx);
        }
    }
    Ok(result)
}

// ─── LAB TESTS ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_lab_tests(state: State<AppState>, status: Option<String>, patient_id: Option<i64>) -> Result<Vec<LabTest>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT l.id, l.lab_code, l.patient_id, p.full_name, l.doctor_id, d.full_name,
                l.test_name, l.test_category, l.ordered_date, l.result_date, l.status,
                l.result_value, l.result_unit, l.reference_range, l.is_abnormal, l.notes, l.report_path
         FROM lab_tests l JOIN patients p ON l.patient_id = p.id JOIN doctors d ON l.doctor_id = d.id
         WHERE (?1 IS NULL OR l.status = ?1) AND (?2 IS NULL OR l.patient_id = ?2)
         ORDER BY l.id DESC"
    ).map_err(|e| e.to_string())?;
    let tests = stmt.query_map(params![status, patient_id], |r| Ok(LabTest {
        id: r.get(0)?, lab_code: r.get(1)?, patient_id: r.get(2)?, patient_name: r.get(3)?,
        doctor_id: r.get(4)?, doctor_name: r.get(5)?, test_name: r.get(6)?, test_category: r.get(7)?,
        ordered_date: r.get(8)?, result_date: r.get(9)?, status: r.get(10)?,
        result_value: r.get(11)?, result_unit: r.get(12)?, reference_range: r.get(13)?,
        is_abnormal: r.get::<_,i64>(14)? != 0, notes: r.get(15)?, report_path: r.get(16)?,
    })).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok()).collect();
    Ok(tests)
}

#[tauri::command]
pub fn create_lab_test(state: State<AppState>, data: CreateLabTest) -> Result<LabTest, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("LAB");
    let status = data.status.as_deref().unwrap_or("Ordered");
    conn.execute(
        "INSERT INTO lab_tests (lab_code, patient_id, doctor_id, test_name, test_category, ordered_date, status, notes) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        params![code, data.patient_id, data.doctor_id, data.test_name, data.test_category, data.ordered_date, status, data.notes],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    audit::log(&state.pool, "System", "Lab test ordered", "lab", Some(id), Some(&data.test_name));
    conn.query_row(
        "SELECT l.id, l.lab_code, l.patient_id, p.full_name, l.doctor_id, d.full_name, l.test_name, l.test_category, l.ordered_date, l.result_date, l.status, l.result_value, l.result_unit, l.reference_range, l.is_abnormal, l.notes, l.report_path FROM lab_tests l JOIN patients p ON l.patient_id = p.id JOIN doctors d ON l.doctor_id = d.id WHERE l.id = ?1",
        params![id],
        |r| Ok(LabTest { id: r.get(0)?, lab_code: r.get(1)?, patient_id: r.get(2)?, patient_name: r.get(3)?, doctor_id: r.get(4)?, doctor_name: r.get(5)?, test_name: r.get(6)?, test_category: r.get(7)?, ordered_date: r.get(8)?, result_date: r.get(9)?, status: r.get(10)?, result_value: r.get(11)?, result_unit: r.get(12)?, reference_range: r.get(13)?, is_abnormal: r.get::<_,i64>(14)? != 0, notes: r.get(15)?, report_path: r.get(16)? }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_lab_result(state: State<AppState>, id: i64, result: UpdateLabResult) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE lab_tests SET result_value=?1, result_unit=?2, is_abnormal=?3, notes=?4, result_date=date('now'), status='Ready' WHERE id=?5",
        params![result.result_value, result.result_unit, result.is_abnormal as i64, result.notes, id],
    ).map_err(|e| e.to_string())?;
    audit::log(&state.pool, "System", "Lab result entered", "lab", Some(id), Some(&result.result_value));
    Ok(())
}

#[tauri::command]
pub fn update_lab_status(state: State<AppState>, id: i64, status: String) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("UPDATE lab_tests SET status = ?1 WHERE id = ?2", params![status, id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn upload_lab_report(state: State<AppState>, lab_id: i64, file_path: String) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("UPDATE lab_tests SET report_path = ?1 WHERE id = ?2", params![file_path, lab_id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ─── WARDS & BEDS ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_wards(state: State<AppState>) -> Result<Vec<Ward>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, ward_name, ward_code, ward_type, total_beds, department FROM wards ORDER BY ward_name").map_err(|e| e.to_string())?;
    let wards = stmt.query_map([], |r| Ok(Ward {
        id: r.get(0)?, ward_name: r.get(1)?, ward_code: r.get(2)?,
        ward_type: r.get(3)?, total_beds: r.get(4)?, department: r.get(5)?,
    })).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok()).collect();
    Ok(wards)
}

#[tauri::command]
pub fn get_beds(state: State<AppState>, ward_id: Option<i64>) -> Result<Vec<Bed>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT b.id, b.ward_id, w.ward_name, b.bed_number, b.status, b.patient_id,
                p.full_name, b.admission_date, b.expected_discharge, b.notes
         FROM beds b JOIN wards w ON b.ward_id = w.id LEFT JOIN patients p ON b.patient_id = p.id
         WHERE (?1 IS NULL OR b.ward_id = ?1) ORDER BY b.bed_number"
    ).map_err(|e| e.to_string())?;
    let beds = stmt.query_map(params![ward_id], |r| Ok(Bed {
        id: r.get(0)?, ward_id: r.get(1)?, ward_name: r.get(2)?, bed_number: r.get(3)?,
        status: r.get(4)?, patient_id: r.get(5)?, patient_name: r.get(6)?,
        admission_date: r.get(7)?, expected_discharge: r.get(8)?, notes: r.get(9)?,
    })).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok()).collect();
    Ok(beds)
}

#[tauri::command]
pub fn admit_patient(state: State<AppState>, bed_id: i64, patient_id: i64, expected_discharge: Option<String>) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE beds SET status='Occupied', patient_id=?1, admission_date=date('now'), expected_discharge=?2 WHERE id=?3",
        params![patient_id, expected_discharge, bed_id],
    ).map_err(|e| e.to_string())?;
    conn.execute("UPDATE patients SET status='Admitted' WHERE id=?1", params![patient_id]).map_err(|e| e.to_string())?;
    audit::log(&state.pool, "System", "Patient admitted", "bed", Some(bed_id), Some(&format!("Patient #{}", patient_id)));
    Ok(())
}

#[tauri::command]
pub fn discharge_patient(state: State<AppState>, bed_id: i64) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let patient_id: Option<i64> = conn.query_row("SELECT patient_id FROM beds WHERE id = ?1", params![bed_id], |r| r.get(0)).ok().flatten();
    conn.execute("UPDATE beds SET status='Available', patient_id=NULL, admission_date=NULL, expected_discharge=NULL WHERE id=?1", params![bed_id]).map_err(|e| e.to_string())?;
    if let Some(pid) = patient_id {
        conn.execute("UPDATE patients SET status='Discharged' WHERE id=?1", params![pid]).map_err(|e| e.to_string())?;
    }
    audit::log(&state.pool, "System", "Patient discharged", "bed", Some(bed_id), None);
    Ok(())
}

#[tauri::command]
pub fn update_bed_status(state: State<AppState>, bed_id: i64, status: String) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("UPDATE beds SET status = ?1 WHERE id = ?2", params![status, bed_id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn create_ward(state: State<AppState>, data: Ward) -> Result<Ward, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("WD");
    conn.execute(
        "INSERT INTO wards (ward_name, ward_code, ward_type, total_beds, department) VALUES (?1,?2,?3,?4,?5)",
        params![data.ward_name, code, data.ward_type, data.total_beds, data.department],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(Ward { id, ward_code: code, ..data })
}

// ─── BILLING ──────────────────────────────────────────────────────────────────

fn load_invoice_items(conn: &rusqlite::Connection, invoice_id: i64) -> Vec<InvoiceItem> {
    let mut stmt = conn.prepare("SELECT id, invoice_id, description, category, quantity, unit_price, total FROM invoice_items WHERE invoice_id = ?1").unwrap();
    stmt.query_map(params![invoice_id], |r| Ok(InvoiceItem {
        id: r.get(0)?, invoice_id: r.get(1)?, description: r.get(2)?, category: r.get(3)?,
        quantity: r.get(4)?, unit_price: r.get(5)?, total: r.get(6)?,
    })).unwrap().filter_map(|r| r.ok()).collect()
}

#[tauri::command]
pub fn get_invoices(state: State<AppState>, status: Option<String>, patient_id: Option<i64>) -> Result<Vec<Invoice>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT i.id, i.invoice_code, i.patient_id, p.full_name, i.issue_date, i.due_date, i.status,
                i.subtotal, i.discount, i.tax, i.total, i.paid_amount, i.balance,
                i.payment_method, i.insurance_claim_id, i.notes, i.created_at
         FROM invoices i JOIN patients p ON i.patient_id = p.id
         WHERE (?1 IS NULL OR i.status = ?1) AND (?2 IS NULL OR i.patient_id = ?2)
         ORDER BY i.id DESC"
    ).map_err(|e| e.to_string())?;
    let invoices: Vec<Invoice> = stmt.query_map(params![status, patient_id], |r| {
        let id: i64 = r.get(0)?;
        Ok((id, r.get::<_,String>(1)?, r.get::<_,i64>(2)?, r.get::<_,Option<String>>(3)?,
            r.get::<_,String>(4)?, r.get::<_,String>(5)?, r.get::<_,String>(6)?,
            r.get::<_,f64>(7)?, r.get::<_,f64>(8)?, r.get::<_,f64>(9)?, r.get::<_,f64>(10)?,
            r.get::<_,f64>(11)?, r.get::<_,f64>(12)?, r.get::<_,Option<String>>(13)?,
            r.get::<_,Option<i64>>(14)?, r.get::<_,Option<String>>(15)?, r.get::<_,String>(16)?))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .map(|(id, invoice_code, patient_id, patient_name, issue_date, due_date, status, subtotal, discount, tax, total, paid_amount, balance, payment_method, insurance_claim_id, notes, created_at)| {
        let items = load_invoice_items(&conn, id);
        Invoice { id, invoice_code, patient_id, patient_name, issue_date, due_date, status, items, subtotal, discount, tax, total, paid_amount, balance, payment_method, insurance_claim_id, notes, created_at }
    }).collect();
    Ok(invoices)
}

#[tauri::command]
pub fn get_invoice_by_id(state: State<AppState>, id: i64) -> Result<Invoice, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let inv = conn.query_row(
        "SELECT i.id, i.invoice_code, i.patient_id, p.full_name, i.issue_date, i.due_date, i.status, i.subtotal, i.discount, i.tax, i.total, i.paid_amount, i.balance, i.payment_method, i.insurance_claim_id, i.notes, i.created_at FROM invoices i JOIN patients p ON i.patient_id = p.id WHERE i.id = ?1",
        params![id],
        |r| Ok((r.get::<_,i64>(0)?, r.get::<_,String>(1)?, r.get::<_,i64>(2)?, r.get::<_,Option<String>>(3)?, r.get::<_,String>(4)?, r.get::<_,String>(5)?, r.get::<_,String>(6)?, r.get::<_,f64>(7)?, r.get::<_,f64>(8)?, r.get::<_,f64>(9)?, r.get::<_,f64>(10)?, r.get::<_,f64>(11)?, r.get::<_,f64>(12)?, r.get::<_,Option<String>>(13)?, r.get::<_,Option<i64>>(14)?, r.get::<_,Option<String>>(15)?, r.get::<_,String>(16)?)),
    ).map_err(|e| e.to_string())?;
    let items = load_invoice_items(&conn, id);
    Ok(Invoice { id: inv.0, invoice_code: inv.1, patient_id: inv.2, patient_name: inv.3, issue_date: inv.4, due_date: inv.5, status: inv.6, subtotal: inv.7, discount: inv.8, tax: inv.9, total: inv.10, paid_amount: inv.11, balance: inv.12, payment_method: inv.13, insurance_claim_id: inv.14, notes: inv.15, created_at: inv.16, items })
}

#[tauri::command]
pub fn create_invoice(state: State<AppState>, data: CreateInvoice, items: Vec<CreateInvoiceItem>) -> Result<Invoice, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("INV");
    let discount = data.discount.unwrap_or(0.0);
    let tax_rate = data.tax.unwrap_or(0.0);
    let subtotal: f64 = items.iter().map(|i| i.quantity as f64 * i.unit_price).sum();
    let tax = subtotal * tax_rate / 100.0;
    let total = subtotal - discount + tax;
    conn.execute(
        "INSERT INTO invoices (invoice_code, patient_id, issue_date, due_date, status, subtotal, discount, tax, total, paid_amount, balance, payment_method, notes) VALUES (?1,?2,?3,?4,'Pending',?5,?6,?7,?8,0,?9,?10,?11)",
        params![code, data.patient_id, data.issue_date, data.due_date, subtotal, discount, tax, total, total, data.payment_method, data.notes],
    ).map_err(|e| e.to_string())?;
    let inv_id = conn.last_insert_rowid();
    for item in &items {
        let item_total = item.quantity as f64 * item.unit_price;
        conn.execute("INSERT INTO invoice_items (invoice_id, description, category, quantity, unit_price, total) VALUES (?1,?2,?3,?4,?5,?6)",
            params![inv_id, item.description, item.category, item.quantity, item.unit_price, item_total]).map_err(|e| e.to_string())?;
    }
    audit::log(&state.pool, "System", "Invoice created", "billing", Some(inv_id), Some(&format!("{} total: ₹{}", code, total)));
    sync::queue_sync(&state.pool, "INSERT", "invoices", inv_id, &format!("{{\"total\":{}}}", total));
    get_invoice_by_id(state, inv_id)
}

#[tauri::command]
pub fn record_payment(state: State<AppState>, invoice_id: i64, amount: f64, method: Option<String>) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let (total, paid): (f64, f64) = conn.query_row("SELECT total, paid_amount FROM invoices WHERE id=?1", params![invoice_id], |r| Ok((r.get(0)?, r.get(1)?))).map_err(|e| e.to_string())?;
    let new_paid = paid + amount;
    let new_balance = total - new_paid;
    let new_status = if new_balance <= 0.0 { "Paid" } else { "Partial" };
    conn.execute("UPDATE invoices SET paid_amount=?1, balance=?2, status=?3, payment_method=?4 WHERE id=?5",
        params![new_paid, new_balance.max(0.0), new_status, method, invoice_id]).map_err(|e| e.to_string())?;
    audit::log(&state.pool, "System", "Payment recorded", "billing", Some(invoice_id), Some(&format!("₹{} via {:?}", amount, method)));
    Ok(())
}

#[tauri::command]
pub fn export_invoice_pdf(_state: State<AppState>, invoice_id: i64) -> Result<String, String> {
    // Returns path where PDF would be saved — PDF generation requires platform-specific impl
    Ok(format!("/tmp/invoice_{}.pdf", invoice_id))
}

#[tauri::command]
pub fn get_revenue_by_range(state: State<AppState>, from: String, to: String) -> Result<Vec<RevenuePoint>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT issue_date, SUM(paid_amount) FROM invoices WHERE issue_date BETWEEN ?1 AND ?2 GROUP BY issue_date ORDER BY issue_date"
    ).map_err(|e| e.to_string())?;
    let points = stmt.query_map(params![from, to], |r| Ok(RevenuePoint { date: r.get(0)?, amount: r.get(1)? }))
        .map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
    Ok(points)
}

// ─── INSURANCE ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_insurance_claims(state: State<AppState>, status: Option<String>) -> Result<Vec<InsuranceClaim>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT c.id, c.claim_code, c.patient_id, p.full_name, c.invoice_id, c.provider_name,
                c.policy_number, c.claim_amount, c.approved_amount, c.status,
                c.submitted_date, c.resolved_date, c.notes
         FROM insurance_claims c JOIN patients p ON c.patient_id = p.id
         WHERE (?1 IS NULL OR c.status = ?1) ORDER BY c.id DESC"
    ).map_err(|e| e.to_string())?;
    let claims = stmt.query_map(params![status], |r| Ok(InsuranceClaim {
        id: r.get(0)?, claim_code: r.get(1)?, patient_id: r.get(2)?, patient_name: r.get(3)?,
        invoice_id: r.get(4)?, provider_name: r.get(5)?, policy_number: r.get(6)?,
        claim_amount: r.get(7)?, approved_amount: r.get(8)?, status: r.get(9)?,
        submitted_date: r.get(10)?, resolved_date: r.get(11)?, notes: r.get(12)?,
    })).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
    Ok(claims)
}

#[tauri::command]
pub fn create_insurance_claim(state: State<AppState>, data: CreateInsuranceClaim) -> Result<InsuranceClaim, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("CLM");
    conn.execute(
        "INSERT INTO insurance_claims (claim_code, patient_id, invoice_id, provider_name, policy_number, claim_amount, status, notes) VALUES (?1,?2,?3,?4,?5,?6,'Draft',?7)",
        params![code, data.patient_id, data.invoice_id, data.provider_name, data.policy_number, data.claim_amount, data.notes],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    audit::log(&state.pool, "System", "Insurance claim created", "insurance", Some(id), Some(&code));
    conn.query_row(
        "SELECT c.id, c.claim_code, c.patient_id, p.full_name, c.invoice_id, c.provider_name, c.policy_number, c.claim_amount, c.approved_amount, c.status, c.submitted_date, c.resolved_date, c.notes FROM insurance_claims c JOIN patients p ON c.patient_id = p.id WHERE c.id = ?1",
        params![id],
        |r| Ok(InsuranceClaim { id: r.get(0)?, claim_code: r.get(1)?, patient_id: r.get(2)?, patient_name: r.get(3)?, invoice_id: r.get(4)?, provider_name: r.get(5)?, policy_number: r.get(6)?, claim_amount: r.get(7)?, approved_amount: r.get(8)?, status: r.get(9)?, submitted_date: r.get(10)?, resolved_date: r.get(11)?, notes: r.get(12)? }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_claim_status(state: State<AppState>, id: i64, status: String, approved_amount: Option<f64>) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let today = today();
    match status.as_str() {
        "Submitted" => { conn.execute("UPDATE insurance_claims SET status='Submitted', submitted_date=?1 WHERE id=?2", params![today, id]).map_err(|e| e.to_string())?; }
        "Approved" | "Rejected" | "Paid" => { conn.execute("UPDATE insurance_claims SET status=?1, approved_amount=?2, resolved_date=?3 WHERE id=?4", params![status, approved_amount, today, id]).map_err(|e| e.to_string())?; }
        _ => { conn.execute("UPDATE insurance_claims SET status=?1 WHERE id=?2", params![status, id]).map_err(|e| e.to_string())?; }
    }
    audit::log(&state.pool, "System", "Claim status updated", "insurance", Some(id), Some(&status));
    Ok(())
}

// ─── INVENTORY ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_inventory(state: State<AppState>, category: Option<String>) -> Result<Vec<InventoryItem>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, item_code, name, category, current_stock, min_threshold, max_capacity, unit, unit_price, supplier, expiry_date, location, last_restocked FROM inventory WHERE (?1 IS NULL OR category = ?1) ORDER BY name"
    ).map_err(|e| e.to_string())?;
    let items = stmt.query_map(params![category], |r| Ok(InventoryItem {
        id: r.get(0)?, item_code: r.get(1)?, name: r.get(2)?, category: r.get(3)?,
        current_stock: r.get(4)?, min_threshold: r.get(5)?, max_capacity: r.get(6)?,
        unit: r.get(7)?, unit_price: r.get(8)?, supplier: r.get(9)?,
        expiry_date: r.get(10)?, location: r.get(11)?, last_restocked: r.get(12)?,
    })).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
    Ok(items)
}

#[tauri::command]
pub fn get_low_stock_items(state: State<AppState>) -> Result<Vec<InventoryItem>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, item_code, name, category, current_stock, min_threshold, max_capacity, unit, unit_price, supplier, expiry_date, location, last_restocked FROM inventory WHERE current_stock <= min_threshold ORDER BY current_stock ASC"
    ).map_err(|e| e.to_string())?;
    let items = stmt.query_map([], |r| Ok(InventoryItem {
        id: r.get(0)?, item_code: r.get(1)?, name: r.get(2)?, category: r.get(3)?,
        current_stock: r.get(4)?, min_threshold: r.get(5)?, max_capacity: r.get(6)?,
        unit: r.get(7)?, unit_price: r.get(8)?, supplier: r.get(9)?,
        expiry_date: r.get(10)?, location: r.get(11)?, last_restocked: r.get(12)?,
    })).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
    Ok(items)
}

#[tauri::command]
pub fn update_stock(state: State<AppState>, item_id: i64, quantity: i64, operation: String) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    match operation.as_str() {
        "add" => conn.execute("UPDATE inventory SET current_stock = current_stock + ?1, last_restocked = date('now') WHERE id = ?2", params![quantity, item_id]).map_err(|e| e.to_string())?,
        "subtract" => conn.execute("UPDATE inventory SET current_stock = MAX(0, current_stock - ?1) WHERE id = ?2", params![quantity, item_id]).map_err(|e| e.to_string())?,
        _ => return Err("Invalid operation".to_string()),
    };
    audit::log(&state.pool, "System", &format!("Stock {}", operation), "inventory", Some(item_id), Some(&format!("qty: {}", quantity)));
    Ok(())
}

#[tauri::command]
pub fn create_inventory_item(state: State<AppState>, data: CreateInventoryItem) -> Result<InventoryItem, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("INV");
    conn.execute(
        "INSERT INTO inventory (item_code, name, category, current_stock, min_threshold, max_capacity, unit, unit_price, supplier, expiry_date, location) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![code, data.name, data.category, data.current_stock, data.min_threshold, data.max_capacity, data.unit, data.unit_price, data.supplier, data.expiry_date, data.location],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row("SELECT id, item_code, name, category, current_stock, min_threshold, max_capacity, unit, unit_price, supplier, expiry_date, location, last_restocked FROM inventory WHERE id = ?1", params![id], |r| Ok(InventoryItem {
        id: r.get(0)?, item_code: r.get(1)?, name: r.get(2)?, category: r.get(3)?,
        current_stock: r.get(4)?, min_threshold: r.get(5)?, max_capacity: r.get(6)?,
        unit: r.get(7)?, unit_price: r.get(8)?, supplier: r.get(9)?,
        expiry_date: r.get(10)?, location: r.get(11)?, last_restocked: r.get(12)?,
    })).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_inventory_item(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM inventory WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ─── AUDIT ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_audit_logs(state: State<AppState>, limit: Option<i64>, entity: Option<String>) -> Result<Vec<AuditLog>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(100);
    let mut stmt = conn.prepare(
        "SELECT id, user_name, action, entity, entity_id, details, ip_address, timestamp
         FROM audit_logs WHERE (?1 IS NULL OR LOWER(entity) = LOWER(?1))
         ORDER BY id DESC LIMIT ?2"
    ).map_err(|e| e.to_string())?;
    let logs = stmt.query_map(params![entity, lim], |r| Ok(AuditLog {
        id: r.get(0)?, user_name: r.get(1)?, action: r.get(2)?, entity: r.get(3)?,
        entity_id: r.get(4)?, details: r.get(5)?, ip_address: r.get(6)?, timestamp: r.get(7)?,
    })).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
    Ok(logs)
}

// ─── SYNC ─────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn sync_to_cloud(state: State<'_, AppState>) -> Result<SyncResult, String> {
    sync::sync_to_cloud(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_sync_status(state: State<AppState>) -> Result<SyncStatus, String> {
    sync::get_sync_status(&state.pool).map_err(|e| e.to_string())
}
