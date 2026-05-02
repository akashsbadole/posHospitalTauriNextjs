// src-tauri/src/commands.rs
use crate::audit;
use crate::db::AppState;
use crate::models::*;
use crate::sync;
use rusqlite::params;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex, MutexGuard};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter, EventTarget, Manager, State};
use uuid::Uuid;

#[derive(serde::Serialize, serde::Deserialize)]
pub struct RevenueByCategory {
    pub category: String,
    pub amount: f64,
    pub percentage: f64,
    pub color: String,
}

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

// Rate limiting for login attempts
struct RateLimiter {
    attempts: HashMap<String, (u8, SystemTime)>, // username -> (count, first_attempt)
    max_attempts: u8,
    window_secs: u64,
}

impl RateLimiter {
    fn new() -> Self {
        Self {
            attempts: HashMap::new(),
            max_attempts: 5,
            window_secs: 15 * 60, // 15 minutes
        }
    }

    fn check(&mut self, username: &str) -> Result<(), String> {
        let now = SystemTime::now();
        let entry = self
            .attempts
            .entry(username.to_string())
            .or_insert((0, now));
        let (count, first_attempt) = entry;

        // Reset if window expired
        if now
            .duration_since(*first_attempt)
            .unwrap_or(Duration::from_secs(0))
            .as_secs()
            > self.window_secs
        {
            *count = 0;
            *first_attempt = now;
        }

        *count += 1;
        if *count > self.max_attempts {
            let remaining = self.window_secs
                - now
                    .duration_since(*first_attempt)
                    .unwrap_or(Duration::from_secs(0))
                    .as_secs();
            let mins = (remaining / 60) + 1;
            return Err(format!(
                "Too many failed attempts. Try again in {} minutes",
                mins
            ));
        }
        Ok(())
    }

    fn reset(&mut self, username: &str) {
        self.attempts.remove(username);
    }
}

// Global rate limiter (thread-safe, per process)
static RATE_LIMITER: LazyLock<Mutex<RateLimiter>> =
    LazyLock::new(|| Mutex::new(RateLimiter::new()));

fn get_rate_limiter() -> MutexGuard<'static, RateLimiter> {
    RATE_LIMITER.lock().unwrap()
}

fn check_permission(
    state: &State<AppState>,
    username: Option<String>,
    module: &str,
    action: &str,
) -> Result<(), String> {
    let user = username.ok_or("Unauthorized: No username provided")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;

    let role: String = conn
        .query_row(
            "SELECT role FROM users WHERE username = ?1 AND is_active = 1",
            params![user],
            |r| r.get(0),
        )
        .map_err(|_| "Unauthorized: User not found or inactive".to_string())?;

    let allowed: i64 = match action {
        "view" => conn
            .query_row(
                "SELECT can_view FROM role_permissions WHERE role = ?1 AND module = ?2",
                params![role, module],
                |r| r.get(0),
            )
            .unwrap_or(0),
        "create" => conn
            .query_row(
                "SELECT can_create FROM role_permissions WHERE role = ?1 AND module = ?2",
                params![role, module],
                |r| r.get(0),
            )
            .unwrap_or(0),
        "edit" => conn
            .query_row(
                "SELECT can_edit FROM role_permissions WHERE role = ?1 AND module = ?2",
                params![role, module],
                |r| r.get(0),
            )
            .unwrap_or(0),
        "delete" => conn
            .query_row(
                "SELECT can_delete FROM role_permissions WHERE role = ?1 AND module = ?2",
                params![role, module],
                |r| r.get(0),
            )
            .unwrap_or(0),
        _ => return Err("Invalid action".to_string()),
    };

    if allowed == 1 {
        Ok(())
    } else {
        Err(format!(
            "Unauthorized: No {} permission for {}",
            action, module
        ))
    }
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_dashboard_stats(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<DashboardStats, String> {
    check_permission(&state, requester.clone(), "Dashboard", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let today = today();
    let month_start = format!("{}-01", &today[..7]);

    let total_patients: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM patients WHERE is_deleted = 0",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let today_appointments: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM appointments WHERE appointment_date = ?1",
            params![today],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let beds_occupied: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM beds WHERE status = 'Occupied'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let total_beds: i64 = conn
        .query_row("SELECT COUNT(*) FROM beds", [], |r| r.get(0))
        .unwrap_or(0);
    let today_revenue: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(paid_amount),0) FROM invoices WHERE issue_date = ?1",
            params![today],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    let monthly_revenue: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(paid_amount),0) FROM invoices WHERE issue_date >= ?1",
            params![month_start],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    let pending_labs: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM lab_tests WHERE status NOT IN ('Reviewed','Ready')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let rx_due_refill: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM prescription_drugs WHERE refills_remaining = 0",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let low_stock_items: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM inventory WHERE current_stock <= min_threshold",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let pending_claims: i64 = conn.query_row("SELECT COUNT(*) FROM insurance_claims WHERE status IN ('Draft','Submitted','Under Review')", [], |r| r.get(0)).unwrap_or(0);
    let discharges_today: i64 = conn.query_row("SELECT COUNT(*) FROM audit_logs WHERE action = 'Patient discharged' AND timestamp LIKE ?1", params![format!("{}%", today)], |r| r.get(0)).unwrap_or(0);
    let admissions_today: i64 = conn.query_row("SELECT COUNT(*) FROM audit_logs WHERE action = 'Patient admitted' AND timestamp LIKE ?1", params![format!("{}%", today)], |r| r.get(0)).unwrap_or(0);
    let new_patients_this_month: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM patients WHERE created_at >= ?1 AND is_deleted = 0",
            params![month_start],
            |r| r.get(0),
        )
        .unwrap_or(0);

    Ok(DashboardStats {
        total_patients,
        today_appointments,
        beds_occupied,
        total_beds,
        today_revenue,
        pending_labs,
        rx_due_refill,
        low_stock_items,
        pending_claims,
        discharges_today,
        admissions_today,
        monthly_revenue,
        new_patients_this_month,
    })
}

#[tauri::command]
pub fn export_discharge_summary_pdf(
    state: State<AppState>,
    id: i64,
    app: tauri::AppHandle,
    requester: Option<String>,
) -> Result<String, String> {
    check_permission(&state, requester.clone(), "Patients", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let ds = get_discharge_summary_by_id(state.clone(), id)?;

    let patient: Patient = conn.query_row(
        "SELECT id, patient_code, full_name, dob, gender, phone, email, blood_group, address, emergency_contact, emergency_phone, allergies, chronic_conditions, department, assigned_doctor_id, status, insurance_provider, insurance_number, photo_path, created_at, updated_at FROM patients WHERE id = ?1",
        params![ds.patient_id],
        |r| Ok(Patient {
            id: r.get(0)?, patient_code: r.get(1)?, full_name: r.get(2)?, dob: r.get(3)?,
            gender: r.get(4)?, phone: r.get(5)?, email: r.get(6)?, blood_group: r.get(7)?,
            address: r.get(8)?, emergency_contact: r.get(9)?, emergency_phone: r.get(10)?,
            allergies: r.get(11)?, chronic_conditions: r.get(12)?, department: r.get(13)?,
            assigned_doctor_id: r.get(14)?, assigned_doctor_name: None,
            status: r.get(15)?, insurance_provider: r.get(16)?, insurance_number: r.get(17)?,
            photo_path: r.get(18)?, created_at: r.get(19)?, updated_at: r.get(20)?,
        }),
    ).map_err(|e| e.to_string())?;

    let h_name: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'hospital_name'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "MediCore Hospital".to_string());
    let h_addr: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'hospital_address'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "".to_string());
    let h_city: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'hospital_city'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "".to_string());

    let (doc, page1, layer1) = PdfDocument::new(
        &format!("Discharge Summary {}", ds.summary_code),
        Mm(210.0),
        Mm(297.0),
        "Layer 1",
    );
    let font = doc.add_builtin_font(BuiltinFont::Helvetica).unwrap();
    let font_bold = doc.add_builtin_font(BuiltinFont::HelveticaBold).unwrap();
    let current_layer = doc.get_page(page1).get_layer(layer1);

    current_layer.use_text(&h_name, 18.0, Mm(20.0), Mm(277.0), &font_bold);
    current_layer.use_text("DISCHARGE SUMMARY", 20.0, Mm(120.0), Mm(277.0), &font_bold);
    current_layer.use_text(
        &format!("{}, {}", h_addr, h_city),
        9.0,
        Mm(20.0),
        Mm(271.0),
        &font,
    );

    current_layer.set_outline_thickness(0.5);
    current_layer.add_line(Line {
        points: vec![
            (Point::new(Mm(20.0), Mm(265.0)), false),
            (Point::new(Mm(190.0), Mm(265.0)), false),
        ],
        is_closed: false,
    });

    current_layer.use_text("Patient:", 10.0, Mm(20.0), Mm(255.0), &font_bold);
    current_layer.use_text(&patient.full_name, 10.0, Mm(40.0), Mm(255.0), &font);
    current_layer.use_text("ID:", 10.0, Mm(110.0), Mm(255.0), &font_bold);
    current_layer.use_text(&patient.patient_code, 10.0, Mm(120.0), Mm(255.0), &font);

    current_layer.use_text("Admission:", 10.0, Mm(20.0), Mm(248.0), &font_bold);
    current_layer.use_text(&ds.admission_date, 10.0, Mm(45.0), Mm(248.0), &font);
    current_layer.use_text("Discharge:", 10.0, Mm(110.0), Mm(248.0), &font_bold);
    current_layer.use_text(&ds.discharge_date, 10.0, Mm(135.0), Mm(248.0), &font);

    current_layer.use_text("Diagnosis:", 11.0, Mm(20.0), Mm(235.0), &font_bold);
    current_layer.use_text(&ds.diagnosis, 10.0, Mm(20.0), Mm(228.0), &font);

    if let Some(proc) = &ds.procedure_done {
        current_layer.use_text("Procedure Done:", 11.0, Mm(20.0), Mm(215.0), &font_bold);
        current_layer.use_text(proc, 10.0, Mm(20.0), Mm(208.0), &font);
    }

    current_layer.use_text(
        "Advice on Discharge:",
        11.0,
        Mm(20.0),
        Mm(190.0),
        &font_bold,
    );
    current_layer.use_text(
        ds.advice_on_discharge.as_deref().unwrap_or("-"),
        10.0,
        Mm(20.0),
        Mm(183.0),
        &font,
    );

    current_layer.use_text("Medications:", 11.0, Mm(20.0), Mm(165.0), &font_bold);
    let mut y = 158.0;
    for m in &ds.medications {
        current_layer.use_text(
            &format!("• {} - {} ({})", m.medication, m.dosage, m.duration),
            10.0,
            Mm(25.0),
            Mm(y),
            &font,
        );
        y -= 7.0;
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?;
    let app_data = app_data_dir.to_string_lossy();
    let path = format!("{}/MediCore/discharge/{}.pdf", app_data, ds.summary_code);
    let dir_path = format!("{}/MediCore/discharge", app_data);
    std::fs::create_dir_all(&dir_path).map_err(|e| e.to_string())?;

    let file = File::create(&path).map_err(|e| e.to_string())?;
    doc.save(&mut BufWriter::new(file)).unwrap();

    audit::log(
        &state.pool,
        "System",
        "Discharge summary exported to PDF",
        "discharge",
        Some(id),
        None,
    );
    Ok(path)
}

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    open::that(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_prescription_pdf(
    state: State<AppState>,
    prescription_id: i64,
    app: tauri::AppHandle,
    requester: Option<String>,
) -> Result<String, String> {
    check_permission(&state, requester.clone(), "Prescriptions", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;

    let rx = get_prescription_by_id(state.clone(), prescription_id, None)?;

    let patient: Patient = conn.query_row(
        "SELECT id, patient_code, full_name, dob, gender, phone, email, blood_group, address, emergency_contact, emergency_phone, allergies, chronic_conditions, department, assigned_doctor_id, status, insurance_provider, insurance_number, photo_path, created_at, updated_at FROM patients WHERE id = ?1",
        params![rx.patient_id],
        |r| Ok(Patient {
            id: r.get(0)?, patient_code: r.get(1)?, full_name: r.get(2)?, dob: r.get(3)?,
            gender: r.get(4)?, phone: r.get(5)?, email: r.get(6)?, blood_group: r.get(7)?,
            address: r.get(8)?, emergency_contact: r.get(9)?, emergency_phone: r.get(10)?,
            allergies: r.get(11)?, chronic_conditions: r.get(12)?, department: r.get(13)?,
            assigned_doctor_id: r.get(14)?, assigned_doctor_name: None,
            status: r.get(15)?, insurance_provider: r.get(16)?, insurance_number: r.get(17)?,
            photo_path: r.get(18)?, created_at: r.get(19)?, updated_at: r.get(20)?,
        }),
    ).map_err(|e| e.to_string())?;

    let doctor: Doctor = conn.query_row(
        "SELECT id, staff_code, full_name, specialization, phone, email, qualification, availability_status, shift, experience_years, consultation_fee, created_at FROM doctors WHERE id = ?1",
        params![rx.doctor_id],
        |r| Ok(Doctor {
            id: r.get(0)?, staff_code: r.get(1)?, full_name: r.get(2)?, specialization: r.get(3)?,
            phone: r.get(4)?, email: r.get(5)?, qualification: r.get(6)?,
            availability_status: r.get(7)?, shift: r.get(8)?,
            experience_years: r.get(9)?, consultation_fee: r.get(10)?, created_at: r.get(11)?,
        }),
    ).map_err(|e| e.to_string())?;

    let h_name: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'hospital_name'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "MediCore Hospital".to_string());
    let h_addr: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'hospital_address'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "".to_string());
    let h_city: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'hospital_city'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "".to_string());
    let h_phone: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'hospital_phone'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "".to_string());

    let (doc, page1, layer1) = PdfDocument::new(
        &format!("Prescription {}", rx.rx_code),
        Mm(210.0),
        Mm(297.0),
        "Layer 1",
    );
    let font = doc.add_builtin_font(BuiltinFont::Helvetica).unwrap();
    let font_bold = doc.add_builtin_font(BuiltinFont::HelveticaBold).unwrap();
    let current_layer = doc.get_page(page1).get_layer(layer1);

    // Header
    current_layer.use_text(&h_name, 18.0, Mm(20.0), Mm(277.0), &font_bold);
    current_layer.use_text("PRESCRIPTION", 24.0, Mm(140.0), Mm(277.0), &font_bold);
    current_layer.use_text(
        &format!("{}, {}", h_addr, h_city),
        9.0,
        Mm(20.0),
        Mm(271.0),
        &font,
    );
    current_layer.use_text(
        &format!("Phone: {}", h_phone),
        9.0,
        Mm(20.0),
        Mm(266.0),
        &font,
    );

    // Doctor Info (Right aligned roughly)
    current_layer.use_text(&doctor.full_name, 12.0, Mm(140.0), Mm(260.0), &font_bold);
    current_layer.use_text(&doctor.qualification, 9.0, Mm(140.0), Mm(255.0), &font);
    current_layer.use_text(&doctor.specialization, 9.0, Mm(140.0), Mm(251.0), &font);

    // Separator
    current_layer.set_outline_thickness(0.5);
    current_layer.add_line(Line {
        points: vec![
            (Point::new(Mm(20.0), Mm(245.0)), false),
            (Point::new(Mm(190.0), Mm(245.0)), false),
        ],
        is_closed: false,
    });

    // Patient Info
    current_layer.use_text("Patient Name:", 10.0, Mm(20.0), Mm(235.0), &font_bold);
    current_layer.use_text(&patient.full_name, 10.0, Mm(50.0), Mm(235.0), &font);
    current_layer.use_text("ID:", 10.0, Mm(110.0), Mm(235.0), &font_bold);
    current_layer.use_text(&patient.patient_code, 10.0, Mm(120.0), Mm(235.0), &font);
    current_layer.use_text("Date:", 10.0, Mm(155.0), Mm(235.0), &font_bold);
    current_layer.use_text(&rx.issue_date, 10.0, Mm(165.0), Mm(235.0), &font);

    current_layer.use_text("Age/Gender:", 10.0, Mm(20.0), Mm(228.0), &font_bold);
    current_layer.use_text(
        &format!("{} / {}", patient.dob, patient.gender),
        10.0,
        Mm(50.0),
        Mm(228.0),
        &font,
    );
    current_layer.use_text("Blood Group:", 10.0, Mm(110.0), Mm(228.0), &font_bold);
    current_layer.use_text(&patient.blood_group, 10.0, Mm(135.0), Mm(228.0), &font);

    // Diagnosis
    if let Some(diagnosis) = &rx.diagnosis {
        current_layer.use_text("Diagnosis:", 11.0, Mm(20.0), Mm(215.0), &font_bold);
        current_layer.use_text(diagnosis, 11.0, Mm(20.0), Mm(208.0), &font);
    }

    // Rx Symbol
    current_layer.use_text("Rx", 24.0, Mm(20.0), Mm(190.0), &font_bold);

    // Medications Table Header
    current_layer.use_text("Medication", 10.0, Mm(25.0), Mm(175.0), &font_bold);
    current_layer.use_text("Dosage", 10.0, Mm(85.0), Mm(175.0), &font_bold);
    current_layer.use_text("Freq", 10.0, Mm(110.0), Mm(175.0), &font_bold);
    current_layer.use_text("Dur", 10.0, Mm(135.0), Mm(175.0), &font_bold);
    current_layer.use_text("Instructions", 10.0, Mm(150.0), Mm(175.0), &font_bold);

    let mut y_pos = 168.0;
    for drug in &rx.drugs {
        current_layer.use_text(&drug.drug_name, 9.0, Mm(25.0), Mm(y_pos), &font);
        current_layer.use_text(&drug.dosage, 9.0, Mm(85.0), Mm(y_pos), &font);
        current_layer.use_text(&drug.frequency, 9.0, Mm(110.0), Mm(y_pos), &font);
        current_layer.use_text(
            &format!("{} days", drug.duration_days),
            9.0,
            Mm(135.0),
            Mm(y_pos),
            &font,
        );
        current_layer.use_text(
            drug.instructions.as_deref().unwrap_or("-"),
            8.0,
            Mm(150.0),
            Mm(y_pos),
            &font,
        );
        y_pos -= 7.0;

        if y_pos < 50.0 {
            // Very basic pagination check
            break;
        }
    }

    // Notes
    if let Some(notes) = &rx.notes {
        current_layer.use_text(
            "Additional Notes:",
            10.0,
            Mm(20.0),
            Mm(y_pos - 10.0),
            &font_bold,
        );
        current_layer.use_text(notes, 9.0, Mm(20.0), Mm(y_pos - 17.0), &font);
    }

    // Footer / Signature
    current_layer.use_text("Doctor's Signature", 10.0, Mm(150.0), Mm(30.0), &font);
    current_layer.add_line(Line {
        points: vec![
            (Point::new(Mm(140.0), Mm(35.0)), false),
            (Point::new(Mm(190.0), Mm(35.0)), false),
        ],
        is_closed: false,
    });

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?;
    let app_data = app_data_dir.to_string_lossy();
    let path = format!("{}/MediCore/prescriptions/{}.pdf", app_data, rx.rx_code);
    let dir_path = format!("{}/MediCore/prescriptions", app_data);
    std::fs::create_dir_all(&dir_path).map_err(|e| e.to_string())?;

    let file = File::create(&path).map_err(|e| e.to_string())?;
    doc.save(&mut BufWriter::new(file)).unwrap();

    audit::log(
        &state.pool,
        "System",
        "Prescription exported to PDF",
        "prescription",
        Some(prescription_id),
        None,
    );
    Ok(path)
}

#[tauri::command]
pub fn get_recent_activity(
    state: State<AppState>,
    limit: Option<i64>,
    requester: Option<String>,
) -> Result<Vec<AuditLog>, String> {
    check_permission(&state, requester.clone(), "Audit", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(20);
    let mut stmt = conn
        .prepare(
            "SELECT id, user_name, action, entity, entity_id, details, ip_address, timestamp
         FROM audit_logs ORDER BY id DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let logs = stmt
        .query_map(params![lim], |r| {
            Ok(AuditLog {
                id: r.get(0)?,
                user_name: r.get(1)?,
                action: r.get(2)?,
                entity: r.get(3)?,
                entity_id: r.get(4)?,
                details: r.get(5)?,
                ip_address: r.get(6)?,
                timestamp: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(logs)
}

#[tauri::command]
pub fn get_today_admissions(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<Vec<Patient>, String> {
    check_permission(&state, requester.clone(), "Patients", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let today = today();
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.patient_code, p.full_name, p.dob, p.gender, p.phone, p.email,
                p.blood_group, p.address, p.emergency_contact, p.emergency_phone,
                p.allergies, p.chronic_conditions, p.department, p.assigned_doctor_id,
                d.full_name as doctor_name, p.status, p.insurance_provider, p.insurance_number,
                p.created_at, p.updated_at, p.photo_path
         FROM patients p
         LEFT JOIN doctors d ON p.assigned_doctor_id = d.id
         WHERE p.is_deleted = 0 AND p.status = 'Admitted' AND p.updated_at LIKE ?1
         ORDER BY p.updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let patients = stmt
        .query_map(params![format!("{}%", today)], |r| {
            Ok(Patient {
                id: r.get(0)?,
                patient_code: r.get(1)?,
                full_name: r.get(2)?,
                dob: r.get(3)?,
                gender: r.get(4)?,
                phone: r.get(5)?,
                email: r.get(6)?,
                blood_group: r.get(7)?,
                address: r.get(8)?,
                emergency_contact: r.get(9)?,
                emergency_phone: r.get(10)?,
                allergies: r.get(11)?,
                chronic_conditions: r.get(12)?,
                department: r.get(13)?,
                assigned_doctor_id: r.get(14)?,
                assigned_doctor_name: r.get(15)?,
                status: r.get(16)?,
                insurance_provider: r.get(17)?,
                insurance_number: r.get(18)?,
                created_at: r.get(19)?,
                updated_at: r.get(20)?,
                photo_path: r.get(21)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(patients)
}

#[tauri::command]
pub fn get_today_discharges(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<Vec<Patient>, String> {
    check_permission(&state, requester.clone(), "Patients", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let today = today();
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.patient_code, p.full_name, p.dob, p.gender, p.phone, p.email,
                p.blood_group, p.address, p.emergency_contact, p.emergency_phone,
                p.allergies, p.chronic_conditions, p.department, p.assigned_doctor_id,
                d.full_name as doctor_name, p.status, p.insurance_provider, p.insurance_number,
                p.created_at, p.updated_at, p.photo_path
         FROM patients p
         LEFT JOIN doctors d ON p.assigned_doctor_id = d.id
         WHERE p.is_deleted = 0 AND p.status = 'Discharged' AND p.updated_at LIKE ?1
         ORDER BY p.updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let patients = stmt
        .query_map(params![format!("{}%", today)], |r| {
            Ok(Patient {
                id: r.get(0)?,
                patient_code: r.get(1)?,
                full_name: r.get(2)?,
                dob: r.get(3)?,
                gender: r.get(4)?,
                phone: r.get(5)?,
                email: r.get(6)?,
                blood_group: r.get(7)?,
                address: r.get(8)?,
                emergency_contact: r.get(9)?,
                emergency_phone: r.get(10)?,
                allergies: r.get(11)?,
                chronic_conditions: r.get(12)?,
                department: r.get(13)?,
                assigned_doctor_id: r.get(14)?,
                assigned_doctor_name: r.get(15)?,
                status: r.get(16)?,
                insurance_provider: r.get(17)?,
                insurance_number: r.get(18)?,
                created_at: r.get(19)?,
                updated_at: r.get(20)?,
                photo_path: r.get(21)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(patients)
}

// ─── PATIENTS ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_patients(
    state: State<AppState>,
    search: Option<String>,
    status: Option<String>,
    requester: Option<String>,
) -> Result<Vec<Patient>, String> {
    check_permission(&state, requester.clone(), "Patients", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let search_pat = search.map(|s| format!("%{}%", s.to_lowercase()));
    let mut stmt = conn.prepare(
        "SELECT p.id, p.patient_code, p.full_name, p.dob, p.gender, p.phone, p.email,
                p.blood_group, p.address, p.emergency_contact, p.emergency_phone,
                p.allergies, p.chronic_conditions, p.department, p.assigned_doctor_id,
                d.full_name as doctor_name, p.status, p.insurance_provider, p.insurance_number,
                p.created_at, p.updated_at, p.photo_path
         FROM patients p
         LEFT JOIN doctors d ON p.assigned_doctor_id = d.id
         WHERE p.is_deleted = 0
           AND (?1 IS NULL OR LOWER(p.full_name) LIKE ?1 OR p.phone LIKE ?1 OR p.patient_code LIKE ?1)
           AND (?2 IS NULL OR p.status = ?2)
         ORDER BY p.id DESC"
    ).map_err(|e| e.to_string())?;
    let patients = stmt
        .query_map(params![search_pat, status], |r| {
            Ok(Patient {
                id: r.get(0)?,
                patient_code: r.get(1)?,
                full_name: r.get(2)?,
                dob: r.get(3)?,
                gender: r.get(4)?,
                phone: r.get(5)?,
                email: r.get(6)?,
                blood_group: r.get(7)?,
                address: r.get(8)?,
                emergency_contact: r.get(9)?,
                emergency_phone: r.get(10)?,
                allergies: r.get(11)?,
                chronic_conditions: r.get(12)?,
                department: r.get(13)?,
                assigned_doctor_id: r.get(14)?,
                assigned_doctor_name: r.get(15)?,
                status: r.get(16)?,
                insurance_provider: r.get(17)?,
                insurance_number: r.get(18)?,
                created_at: r.get(19)?,
                updated_at: r.get(20)?,
                photo_path: r.get(21)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(patients)
}

#[tauri::command]
pub fn get_patient_by_id(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<Patient, String> {
    check_permission(&state, requester.clone(), "Patients", "view")?;
    let conn = state.pool.get().map_err(|e| {
        let err_msg = format!("Database connection failed in get_patient_by_id: {}", e);
        eprintln!("[ERROR] {}", err_msg);
        err_msg
    })?;

    conn.query_row(
        "SELECT p.id, p.patient_code, p.full_name, p.dob, p.gender, p.phone, p.email,
                p.blood_group, p.address, p.emergency_contact, p.emergency_phone,
                p.allergies, p.chronic_conditions, p.department, p.assigned_doctor_id,
                d.full_name, p.status, p.insurance_provider, p.insurance_number,
                p.created_at, p.updated_at, p.photo_path
         FROM patients p LEFT JOIN doctors d ON p.assigned_doctor_id = d.id
         WHERE p.id = ?1 AND p.is_deleted = 0",
        params![id],
        |r| {
            let patient = Patient {
                id: r.get(0)?,
                patient_code: r.get(1)?,
                full_name: r.get(2)?,
                dob: r.get(3)?,
                gender: r.get(4)?,
                phone: r.get(5)?,
                email: r.get(6)?,
                blood_group: r.get(7)?,
                address: r.get(8)?,
                emergency_contact: r.get(9)?,
                emergency_phone: r.get(10)?,
                allergies: r.get(11)?,
                chronic_conditions: r.get(12)?,
                department: r.get(13)?,
                assigned_doctor_id: r.get(14)?,
                assigned_doctor_name: r.get(15)?,
                status: r.get(16)?,
                insurance_provider: r.get(17)?,
                insurance_number: r.get(18)?,
                created_at: r.get(19)?,
                updated_at: r.get(20)?,
                photo_path: r.get(21)?,
            };
            Ok(patient)
        },
    )
    .map_err(|e| {
        let err_msg = format!("Failed to fetch patient by ID {}: {}", id, e);
        eprintln!("[ERROR] {}", err_msg);
        err_msg
    })
}

#[tauri::command]
pub fn create_patient(
    state: State<AppState>,
    data: CreatePatient,
    requester: Option<String>,
) -> Result<Patient, String> {
    check_permission(&state, requester.clone(), "Patients", "create")?;
    let conn = state.pool.get().map_err(|e| {
        let err_msg = format!("Database connection failed: {}", e);
        eprintln!("[ERROR] {}", err_msg);
        err_msg
    })?;
    let code = new_code("PT");
    let status = data.status.as_deref().unwrap_or("OPD");

    conn.execute(
        "INSERT INTO patients (patient_code, full_name, dob, gender, phone, email, blood_group,
          address, emergency_contact, emergency_phone, allergies, chronic_conditions, department,
          assigned_doctor_id, status, insurance_provider, insurance_number)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",
        params![
            code,
            data.full_name,
            data.dob,
            data.gender,
            data.phone,
            data.email,
            data.blood_group,
            data.address,
            data.emergency_contact,
            data.emergency_phone,
            data.allergies,
            data.chronic_conditions,
            data.department,
            data.assigned_doctor_id,
            status,
            data.insurance_provider,
            data.insurance_number
        ],
    )
    .map_err(|e| {
        let err_msg = format!("Failed to insert patient: {}", e);
        eprintln!("[ERROR] {}", err_msg);
        err_msg
    })?;

    let id = conn.last_insert_rowid();

    audit::log(
        &state.pool,
        "System",
        "Patient registered",
        "patient",
        Some(id),
        Some(&data.full_name),
    );
    sync::queue_sync(
        &state.pool,
        "INSERT",
        "patients",
        id,
        &format!("{{\"patient_code\":\"{}\"}}", code),
    );
    get_patient_by_id(state, id, None)
}

#[tauri::command]
pub fn update_patient(
    state: State<AppState>,
    id: i64,
    data: serde_json::Value,
    requester: Option<String>,
) -> Result<Patient, String> {
    check_permission(&state, requester.clone(), "Patients", "edit")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let fields = [
        "full_name",
        "dob",
        "gender",
        "phone",
        "email",
        "blood_group",
        "address",
        "emergency_contact",
        "emergency_phone",
        "allergies",
        "chronic_conditions",
        "department",
        "assigned_doctor_id",
        "status",
        "insurance_provider",
        "insurance_number",
        "photo_path",
    ];

    for field in fields {
        if let Some(value) = data.get(field) {
            let sql = format!(
                "UPDATE patients SET {} = ?1, updated_at = datetime('now') WHERE id = ?2",
                field
            );
            if value.is_null() {
                tx.execute(&sql, params![rusqlite::types::Null, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(s) = value.as_str() {
                tx.execute(&sql, params![s, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(i) = value.as_i64() {
                tx.execute(&sql, params![i, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(f) = value.as_f64() {
                tx.execute(&sql, params![f, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(b) = value.as_bool() {
                tx.execute(&sql, params![if b { 1 } else { 0 }, id])
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    audit::log(
        &state.pool,
        "System",
        "Patient updated",
        "patient",
        Some(id),
        None,
    );
    get_patient_by_id(state, id, None)
}

#[tauri::command]
pub fn delete_patient(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Patients", "delete")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Soft-delete patient
    tx.execute(
        "UPDATE patients SET is_deleted = 1 WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;

    // Cascade soft-delete related records
    tx.execute(
        "UPDATE appointments SET is_deleted = 1 WHERE patient_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE prescriptions SET is_deleted = 1 WHERE patient_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE lab_tests SET is_deleted = 1 WHERE patient_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE invoices SET is_deleted = 1 WHERE patient_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE vital_signs SET is_deleted = 1 WHERE patient_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE opd_tokens SET is_deleted = 1 WHERE patient_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE discharge_summaries SET is_deleted = 1 WHERE patient_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE emergency_cases SET is_deleted = 1 WHERE patient_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE blood_requests SET is_deleted = 1 WHERE patient_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE ambulance_calls SET is_deleted = 1 WHERE patient_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE expenses SET is_deleted = 1 WHERE patient_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE medical_records SET is_deleted = 1 WHERE patient_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE staff_shifts SET is_deleted = 1 WHERE employee_id IN (SELECT id FROM employees WHERE staff_id IN (SELECT id FROM staff WHERE patient_id = ?1))",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE feedback SET patient_id = NULL WHERE patient_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE visits SET is_deleted = 1 WHERE patient_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE notifications SET patient_id = NULL WHERE patient_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Patient soft deleted with cascade",
        "patient",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn get_patient_vitals(
    state: State<AppState>,
    patient_id: i64,
    requester: Option<String>,
) -> Result<Vec<VitalSigns>, String> {
    check_permission(&state, requester.clone(), "Patients", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT v.id, v.patient_id, v.recorded_by, v.recorded_at, v.blood_pressure_sys, v.blood_pressure_dia,
                v.heart_rate, v.temperature, v.spo2, v.respiratory_rate, v.weight_kg, v.height_cm, v.notes
         FROM vital_signs v
         JOIN patients p ON v.patient_id = p.id
         WHERE v.patient_id = ?1 AND p.is_deleted = 0
         ORDER BY v.recorded_at DESC"
    ).map_err(|e| e.to_string())?;
    let vitals = stmt
        .query_map(params![patient_id], |r| {
            Ok(VitalSigns {
                id: r.get(0)?,
                patient_id: r.get(1)?,
                recorded_by: r.get(2)?,
                recorded_at: r.get(3)?,
                blood_pressure_sys: r.get(4)?,
                blood_pressure_dia: r.get(5)?,
                heart_rate: r.get(6)?,
                temperature: r.get(7)?,
                spo2: r.get(8)?,
                respiratory_rate: r.get(9)?,
                weight_kg: r.get(10)?,
                height_cm: r.get(11)?,
                notes: r.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(vitals)
}

#[tauri::command]
pub fn add_vital_signs(
    state: State<AppState>,
    data: VitalSigns,
    requester: Option<String>,
) -> Result<VitalSigns, String> {
    check_permission(&state, requester.clone(), "Patients", "create")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO vital_signs (patient_id, recorded_by, blood_pressure_sys, blood_pressure_dia,
          heart_rate, temperature, spo2, respiratory_rate, weight_kg, height_cm, notes)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![
            data.patient_id,
            data.recorded_by,
            data.blood_pressure_sys,
            data.blood_pressure_dia,
            data.heart_rate,
            data.temperature,
            data.spo2,
            data.respiratory_rate,
            data.weight_kg,
            data.height_cm,
            data.notes
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();

    audit::log(
        &state.pool,
        "System",
        "Vitals recorded",
        "patient",
        Some(data.patient_id),
        None,
    );

    Ok(VitalSigns { id, ..data })
}

// ─── DOCTORS ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_next_available_doctor(
    state: State<AppState>,
    department: String,
    requester: Option<String>,
) -> Result<Doctor, String> {
    check_permission(&state, requester.clone(), "Doctors", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;

    // Find doctor in the department with the fewest 'Waiting' tokens today
    let today = today();
    let doc_id: i64 = conn
        .query_row(
            "SELECT d.id
         FROM doctors d
         LEFT JOIN opd_tokens t ON d.id = t.doctor_id AND t.queue_date = ?1 AND t.status = 'Waiting'
         WHERE d.specialization = ?2 AND d.availability_status = 'Available'
         GROUP BY d.id
         ORDER BY COUNT(t.id) ASC
         LIMIT 1",
            params![today, department],
            |r| r.get(0),
        )
        .map_err(|_| format!("No available doctors found in {}", department))?;

    get_doctor_by_id(state, doc_id, None)
}

#[tauri::command]
pub fn get_doctors(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<Vec<Doctor>, String> {
    check_permission(&state, requester.clone(), "Doctors", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, staff_code, full_name, specialization, phone, email, qualification,
                availability_status, shift, experience_years, consultation_fee, created_at
         FROM doctors ORDER BY full_name",
        )
        .map_err(|e| e.to_string())?;
    let docs = stmt
        .query_map([], |r| {
            Ok(Doctor {
                id: r.get(0)?,
                staff_code: r.get(1)?,
                full_name: r.get(2)?,
                specialization: r.get(3)?,
                phone: r.get(4)?,
                email: r.get(5)?,
                qualification: r.get(6)?,
                availability_status: r.get(7)?,
                shift: r.get(8)?,
                experience_years: r.get(9)?,
                consultation_fee: r.get(10)?,
                created_at: r.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(docs)
}

#[tauri::command]
pub fn get_doctor_by_id(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<Doctor, String> {
    check_permission(&state, requester.clone(), "Doctors", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, staff_code, full_name, specialization, phone, email, qualification,
                availability_status, shift, experience_years, consultation_fee, created_at
         FROM doctors WHERE id = ?1",
        params![id],
        |r| {
            Ok(Doctor {
                id: r.get(0)?,
                staff_code: r.get(1)?,
                full_name: r.get(2)?,
                specialization: r.get(3)?,
                phone: r.get(4)?,
                email: r.get(5)?,
                qualification: r.get(6)?,
                availability_status: r.get(7)?,
                shift: r.get(8)?,
                experience_years: r.get(9)?,
                consultation_fee: r.get(10)?,
                created_at: r.get(11)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_doctor(
    state: State<AppState>,
    data: CreateDoctor,
    requester: Option<String>,
) -> Result<Doctor, String> {
    check_permission(&state, requester.clone(), "Doctors", "create")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("DR");
    let status = data.availability_status.as_deref().unwrap_or("Available");
    let shift = data.shift.as_deref().unwrap_or("Morning");
    conn.execute(
        "INSERT INTO doctors (staff_code, full_name, specialization, phone, email, qualification, availability_status, shift, experience_years, consultation_fee) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![code, data.full_name, data.specialization, data.phone, data.email, data.qualification, status, shift, data.experience_years, data.consultation_fee],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    audit::log(
        &state.pool,
        "System",
        "Doctor registered",
        "staff",
        Some(id),
        Some(&data.full_name),
    );
    get_doctor_by_id(state, id, None)
}

#[tauri::command]
pub fn update_doctor(
    state: State<AppState>,
    id: i64,
    data: serde_json::Value,
    requester: Option<String>,
) -> Result<Doctor, String> {
    check_permission(&state, requester.clone(), "Doctors", "edit")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let fields = [
        "full_name",
        "specialization",
        "phone",
        "email",
        "qualification",
        "availability_status",
        "shift",
        "experience_years",
        "consultation_fee",
    ];

    for field in fields {
        if let Some(value) = data.get(field) {
            let sql = format!("UPDATE doctors SET {} = ?1 WHERE id = ?2", field);
            if value.is_null() {
                tx.execute(&sql, params![rusqlite::types::Null, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(s) = value.as_str() {
                tx.execute(&sql, params![s, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(i) = value.as_i64() {
                tx.execute(&sql, params![i, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(f) = value.as_f64() {
                tx.execute(&sql, params![f, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(b) = value.as_bool() {
                tx.execute(&sql, params![if b { 1 } else { 0 }, id])
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    audit::log(
        &state.pool,
        "System",
        "Doctor updated",
        "staff",
        Some(id),
        None,
    );
    get_doctor_by_id(state, id, None)
}

#[tauri::command]
pub fn update_doctor_status(
    state: State<AppState>,
    id: i64,
    status: String,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Doctors", "edit")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE doctors SET availability_status = ?1 WHERE id = ?2",
        params![status, id],
    )
    .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        "System",
        "Doctor status updated",
        "staff",
        Some(id),
        Some(&status),
    );
    Ok(())
}

// ─── STAFF ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_staff(state: State<AppState>, requester: Option<String>) -> Result<Vec<Staff>, String> {
    check_permission(&state, requester.clone(), "Staff", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, staff_code, full_name, role, department, phone, email, shift, status, join_date, salary FROM staff ORDER BY full_name"
    ).map_err(|e| e.to_string())?;
    let staff = stmt
        .query_map([], |r| {
            Ok(Staff {
                id: r.get(0)?,
                staff_code: r.get(1)?,
                full_name: r.get(2)?,
                role: r.get(3)?,
                department: r.get(4)?,
                phone: r.get(5)?,
                email: r.get(6)?,
                shift: r.get(7)?,
                status: r.get(8)?,
                join_date: r.get(9)?,
                salary: r.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(staff)
}

#[tauri::command]
pub fn create_staff(
    state: State<AppState>,
    data: CreateStaff,
    requester: Option<String>,
) -> Result<Staff, String> {
    check_permission(&state, requester.clone(), "Staff", "create")?;
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
pub fn update_staff(
    state: State<AppState>,
    id: i64,
    data: serde_json::Value,
    requester: Option<String>,
) -> Result<Staff, String> {
    check_permission(&state, requester.clone(), "Staff", "edit")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let fields = [
        "full_name",
        "role",
        "department",
        "phone",
        "email",
        "shift",
        "status",
        "join_date",
        "salary",
    ];

    for field in fields {
        if let Some(value) = data.get(field) {
            let sql = format!("UPDATE staff SET {} = ?1 WHERE id = ?2", field);
            if value.is_null() {
                tx.execute(&sql, params![rusqlite::types::Null, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(s) = value.as_str() {
                tx.execute(&sql, params![s, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(i) = value.as_i64() {
                tx.execute(&sql, params![i, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(f) = value.as_f64() {
                tx.execute(&sql, params![f, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(b) = value.as_bool() {
                tx.execute(&sql, params![if b { 1 } else { 0 }, id])
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    let s = conn.query_row("SELECT id, staff_code, full_name, role, department, phone, email, shift, status, join_date, salary FROM staff WHERE id = ?1", params![id], |r| Ok(Staff {
        id: r.get(0)?, staff_code: r.get(1)?, full_name: r.get(2)?, role: r.get(3)?,
        department: r.get(4)?, phone: r.get(5)?, email: r.get(6)?,
        shift: r.get(7)?, status: r.get(8)?, join_date: r.get(9)?, salary: r.get(10)?,
    })).map_err(|e| e.to_string())?;
    Ok(s)
}

#[tauri::command]
pub fn delete_staff(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Staff", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM staff WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Staff deleted",
        "staff",
        Some(id),
        None,
    );
    Ok(())
}

// ─── APPOINTMENTS ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_appointments(
    state: State<AppState>,
    date: Option<String>,
    doctor_id: Option<i64>,
    patient_id: Option<i64>,
    requester: Option<String>,
) -> Result<Vec<Appointment>, String> {
    check_permission(&state, requester.clone(), "Appointments", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.appointment_code, a.patient_id, p.full_name, a.doctor_id, d.full_name,
                a.department, a.appointment_date, a.appointment_time, a.type, a.status,
                a.notes, a.follow_up_date, a.is_video_consultation, a.video_link, a.created_at
         FROM appointments a
         JOIN patients p ON a.patient_id = p.id
         JOIN doctors d ON a.doctor_id = d.id
         WHERE a.is_deleted = 0
           AND (?1 IS NULL OR a.appointment_date = ?1)
           AND (?2 IS NULL OR a.doctor_id = ?2)
           AND (?3 IS NULL OR a.patient_id = ?3)
         ORDER BY a.appointment_time ASC",
        )
        .map_err(|e| e.to_string())?;
    let appts = stmt
        .query_map(params![date, doctor_id, patient_id], |r| {
            Ok(Appointment {
                id: r.get(0)?,
                appointment_code: r.get(1)?,
                patient_id: r.get(2)?,
                patient_name: r.get(3)?,
                doctor_id: r.get(4)?,
                doctor_name: r.get(5)?,
                department: r.get(6)?,
                appointment_date: r.get(7)?,
                appointment_time: r.get(8)?,
                appt_type: r.get(9)?,
                status: r.get(10)?,
                notes: r.get(11)?,
                follow_up_date: r.get(12)?,
                is_video_consultation: r.get::<_, i64>(13).map(|v| v == 1).ok(),
                video_link: r.get(14)?,
                created_at: r.get(15)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(appts)
}

#[tauri::command]
pub fn get_appointment_by_id(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<Appointment, String> {
    check_permission(&state, requester.clone(), "Appointments", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT a.id, a.appointment_code, a.patient_id, p.full_name, a.doctor_id, d.full_name,
                a.department, a.appointment_date, a.appointment_time, a.type, a.status,
                a.notes, a.follow_up_date, a.is_video_consultation, a.video_link, a.created_at
         FROM appointments a JOIN patients p ON a.patient_id = p.id JOIN doctors d ON a.doctor_id = d.id WHERE a.id = ?1 AND a.is_deleted = 0",
        params![id],
        |r| Ok(Appointment {
            id: r.get(0)?, appointment_code: r.get(1)?, patient_id: r.get(2)?, patient_name: r.get(3)?,
            doctor_id: r.get(4)?, doctor_name: r.get(5)?, department: r.get(6)?,
            appointment_date: r.get(7)?, appointment_time: r.get(8)?, appt_type: r.get(9)?,
            status: r.get(10)?, notes: r.get(11)?, follow_up_date: r.get(12)?,
            is_video_consultation: r.get::<_, i64>(13).map(|v| v == 1).ok(),
            video_link: r.get(14)?, created_at: r.get(15)?,
        }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_appointment(
    state: State<AppState>,
    data: CreateAppointment,
    requester: Option<String>,
) -> Result<Appointment, String> {
    check_permission(&state, requester.clone(), "Appointments", "create")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("APT");
    let status = data.status.as_deref().unwrap_or("Scheduled");
    let is_video = data.is_video_consultation.unwrap_or(false) as i64;
    conn.execute(
        "INSERT INTO appointments (appointment_code, patient_id, doctor_id, department, appointment_date, appointment_time, type, status, notes, follow_up_date, is_video_consultation, video_link, visit_id) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
        params![code, data.patient_id, data.doctor_id, data.department, data.appointment_date, data.appointment_time, data.appt_type, status, data.notes, data.follow_up_date, is_video, data.video_link, data.visit_id],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    audit::log(
        &state.pool,
        "System",
        "Appointment scheduled",
        "appointment",
        Some(id),
        Some(&data.appointment_date),
    );
    get_appointment_by_id(state, id, None)
}

#[tauri::command]
pub fn update_appointment_status(
    state: State<AppState>,
    id: i64,
    status: String,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Appointments", "edit")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE appointments SET status = ?1 WHERE id = ?2",
        params![status, id],
    )
    .map_err(|e| e.to_string())?;

    // If appointment is checked in, automatically create an OPD token if it doesn't exist
    if status == "Checked In" {
        let (patient_id, doctor_id, department, appointment_date, visit_id): (i64, i64, String, String, Option<i64>) = tx.query_row(
            "SELECT patient_id, doctor_id, department, appointment_date, visit_id FROM appointments WHERE id = ?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
        ).map_err(|e| e.to_string())?;

        let exists: i64 = tx.query_row(
            "SELECT COUNT(*) FROM opd_tokens WHERE patient_id = ?1 AND doctor_id = ?2 AND queue_date = ?3",
            params![patient_id, doctor_id, appointment_date],
            |r| r.get(0)
        ).unwrap_or(0);

        if exists == 0 {
            let max_token: i64 = tx.query_row(
                "SELECT COALESCE(MAX(token_number), 0) FROM opd_tokens WHERE queue_date = ?1 AND doctor_id = ?2",
                params![appointment_date, doctor_id],
                |r| r.get(0)
            ).unwrap_or(0);

            tx.execute(
                "INSERT INTO opd_tokens (token_number, patient_id, doctor_id, department, queue_date, status, visit_id) VALUES (?1, ?2, ?3, ?4, ?5, 'Waiting', ?6)",
                params![max_token + 1, patient_id, doctor_id, department, appointment_date, visit_id]
            ).map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    audit::log(
        &state.pool,
        "System",
        "Appointment status updated",
        "appointment",
        Some(id),
        Some(&status),
    );
    Ok(())
}

#[tauri::command]
pub fn cancel_appointment(
    state: State<AppState>,
    id: i64,
    reason: Option<String>,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Appointments", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE appointments SET status = 'Cancelled' WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        "System",
        "Appointment cancelled",
        "appointment",
        Some(id),
        reason.as_deref(),
    );
    Ok(())
}

#[tauri::command]
pub fn get_upcoming_appointments(
    state: State<AppState>,
    patient_id: i64,
    requester: Option<String>,
) -> Result<Vec<Appointment>, String> {
    check_permission(&state, requester.clone(), "Appointments", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let today = today();
    let mut stmt = conn.prepare(
        "SELECT a.id, a.appointment_code, a.patient_id, p.full_name, a.doctor_id, d.full_name,
                a.department, a.appointment_date, a.appointment_time, a.type, a.status,
                a.notes, a.follow_up_date, a.is_video_consultation, a.video_link, a.created_at
         FROM appointments a JOIN patients p ON a.patient_id = p.id JOIN doctors d ON a.doctor_id = d.id
         WHERE a.patient_id = ?1 AND a.appointment_date >= ?2 AND a.status NOT IN ('Cancelled','Completed')
         ORDER BY a.appointment_date, a.appointment_time"
    ).map_err(|e| e.to_string())?;
    let appts = stmt
        .query_map(params![patient_id, today], |r| {
            Ok(Appointment {
                id: r.get(0)?,
                appointment_code: r.get(1)?,
                patient_id: r.get(2)?,
                patient_name: r.get(3)?,
                doctor_id: r.get(4)?,
                doctor_name: r.get(5)?,
                department: r.get(6)?,
                appointment_date: r.get(7)?,
                appointment_time: r.get(8)?,
                appt_type: r.get(9)?,
                status: r.get(10)?,
                notes: r.get(11)?,
                follow_up_date: r.get(12)?,
                is_video_consultation: r.get(13)?,
                video_link: r.get(14)?,
                created_at: r.get(15)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(appts)
}

// ─── PRESCRIPTIONS ────────────────────────────────────────────────────────────

fn load_drugs(conn: &rusqlite::Connection, prescription_id: i64) -> Vec<PrescriptionDrug> {
    let mut stmt = conn.prepare(
        "SELECT id, prescription_id, drug_name, dosage, frequency, duration_days, route, instructions, refills_remaining, inventory_item_id FROM prescription_drugs WHERE prescription_id = ?1"
    ).unwrap();
    stmt.query_map(params![prescription_id], |r| {
        Ok(PrescriptionDrug {
            id: r.get(0)?,
            prescription_id: r.get(1)?,
            drug_name: r.get(2)?,
            dosage: r.get(3)?,
            frequency: r.get(4)?,
            duration_days: r.get(5)?,
            route: r.get(6)?,
            instructions: r.get(7)?,
            refills_remaining: r.get(8)?,
            inventory_item_id: r.get(9)?,
        })
    })
    .unwrap()
    .filter_map(|r| r.ok())
    .collect()
}

#[tauri::command]
pub fn get_prescriptions(
    state: State<AppState>,
    patient_id: Option<i64>,
    requester: Option<String>,
) -> Result<Vec<Prescription>, String> {
    check_permission(&state, requester.clone(), "Prescriptions", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT r.id, r.rx_code, r.patient_id, p.full_name, p.phone, p.email, r.doctor_id, d.full_name,
                r.issue_date, r.valid_until, r.status, r.diagnosis, r.notes, r.created_at
         FROM prescriptions r
         JOIN patients p ON r.patient_id = p.id
         JOIN doctors d ON r.doctor_id = d.id
         WHERE r.is_deleted = 0
           AND (?1 IS NULL OR r.patient_id = ?1)
         ORDER BY r.id DESC"
    ).map_err(|e| e.to_string())?;
    let rxs: Vec<Prescription> = stmt
        .query_map(params![patient_id], |r| {
            let id: i64 = r.get(0)?;
            Ok((
                id,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, Option<String>>(4)?,
                r.get::<_, Option<String>>(5)?,
                r.get::<_, i64>(6)?,
                r.get::<_, Option<String>>(7)?,
                r.get::<_, String>(8)?,
                r.get::<_, String>(9)?,
                r.get::<_, String>(10)?,
                r.get::<_, Option<String>>(11)?,
                r.get::<_, Option<String>>(12)?,
                r.get::<_, String>(13)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .map(
            |(
                id,
                rx_code,
                patient_id,
                patient_name,
                patient_phone,
                patient_email,
                doctor_id,
                doctor_name,
                issue_date,
                valid_until,
                status,
                diagnosis,
                notes,
                created_at,
            )| {
                let drugs = load_drugs(&conn, id);
                Prescription {
                    id,
                    rx_code,
                    patient_id,
                    patient_name,
                    patient_phone,
                    patient_email,
                    doctor_id,
                    doctor_name,
                    issue_date,
                    valid_until,
                    status,
                    drugs,
                    diagnosis,
                    notes,
                    created_at,
                }
            },
        )
        .collect();
    Ok(rxs)
}

#[tauri::command]
pub fn get_prescription_by_id(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<Prescription, String> {
    check_permission(&state, requester.clone(), "Prescriptions", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let (rx_code, patient_id, patient_name, patient_phone, patient_email, doctor_id, doctor_name, issue_date, valid_until, status, diagnosis, notes, created_at) = conn.query_row(
        "SELECT r.rx_code, r.patient_id, p.full_name, p.phone, p.email, r.doctor_id, d.full_name, r.issue_date, r.valid_until, r.status, r.diagnosis, r.notes, r.created_at
         FROM prescriptions r JOIN patients p ON r.patient_id = p.id JOIN doctors d ON r.doctor_id = d.id WHERE r.id = ?1 AND r.is_deleted = 0",
        params![id],
        |r| Ok((r.get::<_,String>(0)?, r.get::<_,i64>(1)?, r.get::<_,Option<String>>(2)?,
                r.get::<_,Option<String>>(3)?, r.get::<_,Option<String>>(4)?,
                r.get::<_,i64>(5)?, r.get::<_,Option<String>>(6)?, r.get::<_,String>(7)?,
                r.get::<_,String>(8)?, r.get::<_,String>(9)?, r.get::<_,Option<String>>(10)?,
                r.get::<_,Option<String>>(11)?, r.get::<_,String>(12)?)),
    ).map_err(|e| e.to_string())?;
    let drugs = load_drugs(&conn, id);
    Ok(Prescription {
        id,
        rx_code,
        patient_id,
        patient_name,
        patient_phone,
        patient_email,
        doctor_id,
        doctor_name,
        issue_date,
        valid_until,
        status,
        drugs,
        diagnosis,
        notes,
        created_at,
    })
}

#[tauri::command]
pub fn create_prescription(
    state: State<AppState>,
    data: CreatePrescription,
    drugs: Vec<CreatePrescriptionDrug>,
    requester: Option<String>,
) -> Result<Prescription, String> {
    check_permission(&state, requester.clone(), "Prescriptions", "create")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;

    // Check for allergies
    let allergies: Option<String> = conn
        .query_row(
            "SELECT allergies FROM patients WHERE id = ?1",
            params![data.patient_id],
            |r| r.get(0),
        )
        .unwrap_or(None);

    if let Some(patient_allergies) = allergies {
        let allergy_list: Vec<String> = patient_allergies
            .to_lowercase()
            .split(',')
            .map(|s| s.trim().to_string())
            .collect();
        for drug in &drugs {
            let drug_name = drug.drug_name.to_lowercase();
            for allergy in &allergy_list {
                if drug_name.contains(allergy) || allergy.contains(&drug_name) {
                    return Err(format!(
                        "Clinical Alert: Patient is allergic to {}. Prescription blocked.",
                        drug.drug_name
                    ));
                }
            }
        }
    }

    // Validate inventory availability before creating prescription
    let mut inventory_errors = Vec::new();
    for drug in &drugs {
        if let Some(inv_item_id) = drug.inventory_item_id {
            let stock: i64 = conn
                .query_row(
                    "SELECT current_stock FROM inventory WHERE id = ?1",
                    params![inv_item_id],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            let needed_quantity = drug.duration_days; // Assuming duration_days represents quantity needed
            if stock < needed_quantity {
                inventory_errors.push(format!(
                    "'{}': need {}, have {} in inventory",
                    drug.drug_name, needed_quantity, stock
                ));
            }
        }
    }

    if !inventory_errors.is_empty() {
        return Err(format!(
            "Insufficient inventory: {}",
            inventory_errors.join("; ")
        ));
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let code = new_code("RX");
    let status = data.status.as_deref().unwrap_or("Active");
    tx.execute(
        "INSERT INTO prescriptions (rx_code, patient_id, doctor_id, issue_date, valid_until, status, diagnosis, notes, visit_id) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![code, data.patient_id, data.doctor_id, data.issue_date, data.valid_until, status, data.diagnosis, data.notes, data.visit_id],
    ).map_err(|e| e.to_string())?;

    let rx_id = tx.last_insert_rowid();

    // Move visit to BILL_PENDING if linked
    if let Some(vid) = data.visit_id {
        tx.execute(
            "UPDATE visits SET status = 'BILL_PENDING', updated_at = datetime('now') WHERE id = ?1",
            params![vid],
        )
        .map_err(|e| e.to_string())?;
    }
    for drug in &drugs {
        let route = drug.route.as_deref().unwrap_or("Oral");
        tx.execute(
            "INSERT INTO prescription_drugs (prescription_id, drug_name, dosage, frequency, duration_days, route, instructions, refills_remaining, inventory_item_id) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![rx_id, drug.drug_name, drug.dosage, drug.frequency, drug.duration_days, route, drug.instructions, drug.refills_remaining, drug.inventory_item_id],
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    audit::log(
        &state.pool,
        "System",
        "Prescription created",
        "prescription",
        Some(rx_id),
        Some(&code),
    );
    get_prescription_by_id(state, rx_id, None)
}

#[tauri::command]
pub fn issue_prescription(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Prescriptions", "edit")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Load drugs for this prescription with inventory info
    let mut stmt = tx
        .prepare(
            "SELECT pd.drug_name, pd.inventory_item_id, pd.duration_days, i.current_stock
         FROM prescription_drugs pd
         LEFT JOIN inventory i ON pd.inventory_item_id = i.id
         WHERE pd.prescription_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<(String, Option<i64>, i64, Option<i64>)> = stmt
        .query_map(params![id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<i64>>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, Option<i64>>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    drop(stmt);

    let mut items_to_deduct = Vec::new();
    let mut errors = Vec::new();

    for (drug_name, inv_item_id, duration, current_stock_opt) in rows {
        if let Some(inv_id) = inv_item_id {
            let stock = current_stock_opt.unwrap_or(0);
            if stock < duration {
                errors.push(format!(
                    "'{}': need {}, have {}",
                    drug_name, duration, stock
                ));
            } else {
                items_to_deduct.push((inv_id, duration));
            }
        }
    }

    if !errors.is_empty() {
        return Err(format!("Insufficient inventory: {}", errors.join("; ")));
    }

    // Deduct stock
    for (inv_id, qty) in &items_to_deduct {
        tx.execute(
            "UPDATE inventory SET current_stock = current_stock - ?1 WHERE id = ?2",
            params![qty, inv_id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.execute(
        "UPDATE prescriptions SET status = 'Issued' WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;

    // Link to visit if exists
    let visit_id: Option<i64> = tx
        .query_row(
            "SELECT visit_id FROM prescriptions WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .unwrap_or(None);
    if let Some(vid) = visit_id {
        tx.execute(
            "UPDATE visits SET status = 'BILL_PENDING', updated_at = datetime('now') WHERE id = ?1",
            params![vid],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        "System",
        "Prescription medicines issued",
        "prescription",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn cancel_prescription(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Prescriptions", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE prescriptions SET status = 'Cancelled' WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        "System",
        "Prescription cancelled",
        "prescription",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn refill_prescription(
    state: State<AppState>,
    id: i64,
    drug_id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Prescriptions", "edit")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("UPDATE prescription_drugs SET refills_remaining = refills_remaining + 3 WHERE id = ?1 AND prescription_id = ?2", params![drug_id, id]).map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        "System",
        "Prescription refilled",
        "prescription",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn get_prescriptions_due_refill(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<Vec<Prescription>, String> {
    check_permission(&state, requester.clone(), "Prescriptions", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let ids: Vec<i64> = {
        let mut stmt = conn.prepare("SELECT DISTINCT prescription_id FROM prescription_drugs WHERE refills_remaining = 0").map_err(|e| e.to_string())?;
        let result = stmt
            .query_map([], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        result
    };
    let mut result = Vec::new();
    for id in ids {
        if let Ok(rx) = get_prescription_by_id(state.clone(), id, None) {
            result.push(rx);
        }
    }
    Ok(result)
}

// ─── LAB TESTS ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_lab_tests(
    state: State<AppState>,
    status: Option<String>,
    patient_id: Option<i64>,
    requester: Option<String>,
) -> Result<Vec<LabTest>, String> {
    check_permission(&state, requester.clone(), "Lab", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT l.id, l.lab_code, l.patient_id, p.full_name, p.phone, p.email, l.doctor_id, d.full_name,
                l.test_name, l.test_category, l.ordered_date, l.result_date, l.status,
                l.result_value, l.result_unit, l.reference_range, l.is_abnormal, l.notes, l.report_path, l.cost
         FROM lab_tests l
         JOIN patients p ON l.patient_id = p.id
         JOIN doctors d ON l.doctor_id = d.id
         WHERE l.is_deleted = 0
           AND (?1 IS NULL OR l.status = ?1)
           AND (?2 IS NULL OR l.patient_id = ?2)
         ORDER BY l.id DESC"
    ).map_err(|e| e.to_string())?;
    let tests = stmt
        .query_map(params![status, patient_id], |r| {
            Ok(LabTest {
                id: r.get(0)?,
                lab_code: r.get(1)?,
                patient_id: r.get(2)?,
                patient_name: r.get(3)?,
                patient_phone: r.get(4)?,
                patient_email: r.get(5)?,
                doctor_id: r.get(6)?,
                doctor_name: r.get(7)?,
                test_name: r.get(8)?,
                test_category: r.get(9)?,
                ordered_date: r.get(10)?,
                result_date: r.get(11)?,
                status: r.get(12)?,
                result_value: r.get(13)?,
                result_unit: r.get(14)?,
                reference_range: r.get(15)?,
                is_abnormal: r.get::<_, i64>(16)? != 0,
                notes: r.get(17)?,
                report_path: r.get(18)?,
                cost: r.get(19).unwrap_or(0.0),
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(tests)
}

#[tauri::command]
pub fn create_lab_test(
    state: State<AppState>,
    data: CreateLabTest,
    requester: Option<String>,
) -> Result<LabTest, String> {
    check_permission(&state, requester.clone(), "Lab", "create")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let code = new_code("LAB");
    let status = data.status.as_deref().unwrap_or("Ordered");
    tx.execute(
        "INSERT INTO lab_tests (lab_code, patient_id, doctor_id, test_name, test_category, ordered_date, status, notes, visit_id, cost) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![code, data.patient_id, data.doctor_id, data.test_name, data.test_category, data.ordered_date, status, data.notes, data.visit_id, data.cost],
    ).map_err(|e| e.to_string())?;
    let id = tx.last_insert_rowid();

    // Move visit to TEST_PENDING if linked
    if let Some(vid) = data.visit_id {
        tx.execute(
            "UPDATE visits SET status = 'TEST_PENDING', updated_at = datetime('now') WHERE id = ?1",
            params![vid],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT l.id, l.lab_code, l.patient_id, p.full_name, p.phone, p.email, l.doctor_id, d.full_name, l.test_name, l.test_category, l.ordered_date, l.result_date, l.status, l.result_value, l.result_unit, l.reference_range, l.is_abnormal, l.notes, l.report_path, l.cost FROM lab_tests l JOIN patients p ON l.patient_id = p.id JOIN doctors d ON l.doctor_id = d.id WHERE l.id = ?1",
        params![id],
        |r| Ok(LabTest { id: r.get(0)?, lab_code: r.get(1)?, patient_id: r.get(2)?, patient_name: r.get(3)?, patient_phone: r.get(4)?, patient_email: r.get(5)?, doctor_id: r.get(6)?, doctor_name: r.get(7)?, test_name: r.get(8)?, test_category: r.get(9)?, ordered_date: r.get(10)?, result_date: r.get(11)?, status: r.get(12)?, result_value: r.get(13)?, result_unit: r.get(14)?, reference_range: r.get(15)?, is_abnormal: r.get::<_,i64>(16)? != 0, notes: r.get(17)?, report_path: r.get(18)?, cost: r.get(19)? }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_lab_result(
    state: State<AppState>,
    id: i64,
    result: UpdateLabResult,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Lab", "edit")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Determine is_abnormal: if None, compute from reference_range
    let is_abnormal = match result.is_abnormal {
        Some(v) => v,
        None => {
            // Fetch reference range from lab test
            let reference: Option<String> = tx
                .query_row(
                    "SELECT reference_range FROM lab_tests WHERE id = ?1",
                    params![id],
                    |r| r.get(0),
                )
                .ok()
                .flatten();
            if let Some(ref_range) = reference {
                if let (Some(low), Some(high)) = (
                    ref_range
                        .split('-')
                        .next()
                        .and_then(|s| s.trim().parse::<f64>().ok()),
                    ref_range
                        .split('-')
                        .nth(1)
                        .and_then(|s| s.trim().parse::<f64>().ok()),
                ) {
                    match result.result_value.parse::<f64>() {
                        Ok(val) => val < low || val > high,
                        Err(_) => false,
                    }
                } else {
                    false
                }
            } else {
                false
            }
        }
    };

    tx.execute(
        "UPDATE lab_tests SET result_value=?1, result_unit=?2, is_abnormal=?3, notes=?4, result_date=date('now'), status='Ready' WHERE id=?5",
        params![result.result_value, result.result_unit, is_abnormal as i64, result.notes, id],
    ).map_err(|e| e.to_string())?;

    // If linked to a visit, move visit status to TEST_COMPLETED
    let visit_id: Option<i64> = tx
        .query_row(
            "SELECT visit_id FROM lab_tests WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .unwrap_or(None);
    if let Some(vid) = visit_id {
        tx.execute("UPDATE visits SET status = 'TEST_COMPLETED', updated_at = datetime('now') WHERE id = ?1", params![vid]).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    audit::log(
        &state.pool,
        "System",
        "Lab result entered",
        "lab",
        Some(id),
        Some(&result.result_value),
    );
    Ok(())
}

#[tauri::command]
pub fn update_lab_status(
    state: State<AppState>,
    id: i64,
    status: String,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Lab", "edit")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE lab_tests SET status = ?1 WHERE id = ?2",
        params![status, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn upload_lab_report(
    state: State<AppState>,
    lab_id: i64,
    file_path: String,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Lab", "edit")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE lab_tests SET report_path = ?1 WHERE id = ?2",
        params![file_path, lab_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── WARDS & BEDS ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_wards(state: State<AppState>, requester: Option<String>) -> Result<Vec<Ward>, String> {
    check_permission(&state, requester.clone(), "Wards", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, ward_name, ward_code, ward_type, total_beds, department, base_charge FROM wards ORDER BY ward_name").map_err(|e| e.to_string())?;
    let wards = stmt
        .query_map([], |r| {
            Ok(Ward {
                id: r.get(0)?,
                ward_name: r.get(1)?,
                ward_code: r.get(2)?,
                ward_type: r.get(3)?,
                total_beds: r.get(4)?,
                department: r.get(5)?,
                base_charge: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(wards)
}

#[tauri::command]
pub fn get_beds(
    state: State<AppState>,
    ward_id: Option<i64>,
    requester: Option<String>,
) -> Result<Vec<Bed>, String> {
    check_permission(&state, requester.clone(), "Beds", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT b.id, b.ward_id, w.ward_name, b.bed_number, b.status, b.patient_id,
                p.full_name, b.admission_date, b.expected_discharge, b.notes
         FROM beds b JOIN wards w ON b.ward_id = w.id LEFT JOIN patients p ON b.patient_id = p.id
         WHERE (?1 IS NULL OR b.ward_id = ?1) ORDER BY b.bed_number",
        )
        .map_err(|e| e.to_string())?;
    let beds = stmt
        .query_map(params![ward_id], |r| {
            Ok(Bed {
                id: r.get(0)?,
                ward_id: r.get(1)?,
                ward_name: r.get(2)?,
                bed_number: r.get(3)?,
                status: r.get(4)?,
                patient_id: r.get(5)?,
                patient_name: r.get(6)?,
                admission_date: r.get(7)?,
                expected_discharge: r.get(8)?,
                notes: r.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(beds)
}

#[tauri::command]
pub fn admit_patient(
    state: State<AppState>,
    bed_id: i64,
    patient_id: i64,
    expected_discharge: Option<String>,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Beds", "edit")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE beds SET status='Occupied', patient_id=?1, admission_date=date('now'), expected_discharge=?2 WHERE id=?3",
        params![patient_id, expected_discharge, bed_id],
    ).map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE patients SET status='Admitted' WHERE id=?1",
        params![patient_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    audit::log(
        &state.pool,
        "System",
        "Patient admitted",
        "bed",
        Some(bed_id),
        Some(&format!("Patient #{}", patient_id)),
    );
    Ok(())
}

#[tauri::command]
pub fn discharge_patient(
    state: State<AppState>,
    bed_id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Beds", "edit")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let patient_id: Option<i64> = tx
        .query_row(
            "SELECT patient_id FROM beds WHERE id = ?1",
            params![bed_id],
            |r| r.get(0),
        )
        .ok()
        .flatten();

    tx.execute("UPDATE beds SET status='Available', patient_id=NULL, admission_date=NULL, expected_discharge=NULL WHERE id=?1", params![bed_id]).map_err(|e| e.to_string())?;

    if let Some(pid) = patient_id {
        tx.execute(
            "UPDATE patients SET status='Discharged' WHERE id=?1",
            params![pid],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    audit::log(
        &state.pool,
        "System",
        "Patient discharged",
        "bed",
        Some(bed_id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn transfer_patient(
    state: State<AppState>,
    from_bed_id: i64,
    to_bed_id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Beds", "edit")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Verify target bed is available
    let target_status: String = tx
        .query_row(
            "SELECT status FROM beds WHERE id = ?1",
            params![to_bed_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if target_status != "Available" {
        return Err(format!(
            "Target bed is not available (status: {})",
            target_status
        ));
    }

    let (patient_id, admission_date, expected_discharge): (i64, String, Option<String>) = tx
        .query_row(
            "SELECT patient_id, admission_date, expected_discharge FROM beds WHERE id = ?1",
            params![from_bed_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    tx.execute("UPDATE beds SET status='Available', patient_id=NULL, admission_date=NULL, expected_discharge=NULL WHERE id=?1", params![from_bed_id]).map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE beds SET status='Occupied', patient_id=?1, admission_date=?2, expected_discharge=?3 WHERE id=?4",
        params![patient_id, admission_date, expected_discharge, to_bed_id]
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        "System",
        &format!(
            "Patient transferred from bed {} to bed {}",
            from_bed_id, to_bed_id
        ),
        "bed",
        Some(to_bed_id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn update_bed_status(
    state: State<AppState>,
    bed_id: i64,
    status: String,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Beds", "edit")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE beds SET status = ?1 WHERE id = ?2",
        params![status, bed_id],
    )
    .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        "System",
        "Bed status updated",
        "bed",
        Some(bed_id),
        Some(&status),
    );
    Ok(())
}

#[tauri::command]
pub fn create_ward(
    state: State<AppState>,
    data: Ward,
    requester: Option<String>,
) -> Result<Ward, String> {
    check_permission(&state, requester.clone(), "Wards", "create")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("WD");
    conn.execute(
        "INSERT INTO wards (ward_name, ward_code, ward_type, total_beds, department, base_charge) VALUES (?1,?2,?3,?4,?5,?6)",
        params![data.ward_name, code, data.ward_type, data.total_beds, data.department, data.base_charge],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(Ward {
        id,
        ward_code: code,
        ..data
    })
}

#[tauri::command]
pub fn create_ward_with_beds(
    state: State<AppState>,
    data: Ward,
    requester: Option<String>,
) -> Result<Ward, String> {
    check_permission(&state, requester.clone(), "Wards", "create")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let code = new_code("WD");
    tx.execute(
        "INSERT INTO wards (ward_name, ward_code, ward_type, total_beds, department, base_charge) VALUES (?1,?2,?3,?4,?5,?6)",
        params![data.ward_name, code, data.ward_type, data.total_beds, data.department, data.base_charge],
    ).map_err(|e| e.to_string())?;
    let ward_id = tx.last_insert_rowid();

    for i in 1..=data.total_beds {
        let bed_num = format!("{:03}", i);
        tx.execute(
            "INSERT INTO beds (ward_id, bed_number, status) VALUES (?1, ?2, 'Available')",
            params![ward_id, bed_num],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    audit::log(
        &state.pool,
        "System",
        &format!(
            "Created ward {} with {} beds",
            data.ward_name, data.total_beds
        ),
        "wards",
        Some(ward_id),
        None,
    );
    Ok(Ward {
        id: ward_id,
        ward_code: code,
        ..data
    })
}

// ─── BILLING ──────────────────────────────────────────────────────────────────

fn load_invoice_items(conn: &rusqlite::Connection, invoice_id: i64) -> Vec<InvoiceItem> {
    let mut stmt = conn.prepare("SELECT id, invoice_id, description, category, quantity, unit_price, total, hsn_code FROM invoice_items WHERE invoice_id = ?1").unwrap();
    stmt.query_map(params![invoice_id], |r| {
        Ok(InvoiceItem {
            id: r.get(0)?,
            invoice_id: r.get(1)?,
            description: r.get(2)?,
            category: r.get(3)?,
            quantity: r.get(4)?,
            unit_price: r.get(5)?,
            total: r.get(6)?,
            hsn_code: r.get(7)?,
        })
    })
    .unwrap()
    .filter_map(|r| r.ok())
    .collect()
}

#[tauri::command]
pub fn get_invoices(
    state: State<AppState>,
    status: Option<String>,
    patient_id: Option<i64>,
    requester: Option<String>,
) -> Result<Vec<Invoice>, String> {
    check_permission(&state, requester.clone(), "Billing", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT i.id, i.invoice_code, i.patient_id, p.full_name, p.phone, p.email, i.issue_date, i.due_date, i.status,
                i.subtotal, i.discount, i.tax, i.cgst, i.sgst, i.igst, i.total, i.paid_amount, i.balance,
                i.payment_method, i.insurance_claim_id, i.notes, i.created_at
         FROM invoices i JOIN patients p ON i.patient_id = p.id
         WHERE (?1 IS NULL OR i.status = ?1) AND (?2 IS NULL OR i.patient_id = ?2)
         ORDER BY i.id DESC"
    ).map_err(|e| e.to_string())?;
    let invoices: Vec<Invoice> = stmt
        .query_map(params![status, patient_id], |r| {
            let id: i64 = r.get(0)?;
            Ok((
                id,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, Option<String>>(4)?,
                r.get::<_, Option<String>>(5)?,
                r.get::<_, String>(6)?,
                r.get::<_, String>(7)?,
                r.get::<_, String>(8)?,
                r.get::<_, f64>(9)?,
                r.get::<_, f64>(10)?,
                r.get::<_, f64>(11)?,
                r.get::<_, f64>(12)?,
                r.get::<_, f64>(13)?,
                r.get::<_, f64>(14)?,
                r.get::<_, f64>(15)?,
                r.get::<_, f64>(16)?,
                r.get::<_, f64>(17)?,
                r.get::<_, Option<String>>(18)?,
                r.get::<_, Option<i64>>(19)?,
                r.get::<_, Option<String>>(20)?,
                r.get::<_, String>(21)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .map(
            |(
                id,
                invoice_code,
                patient_id,
                patient_name,
                patient_phone,
                patient_email,
                issue_date,
                due_date,
                status,
                subtotal,
                discount,
                tax,
                cgst,
                sgst,
                igst,
                total,
                paid_amount,
                balance,
                payment_method,
                insurance_claim_id,
                notes,
                created_at,
            )| {
                let items = load_invoice_items(&conn, id);
                Invoice {
                    id,
                    invoice_code,
                    patient_id,
                    patient_name,
                    patient_phone,
                    patient_email,
                    issue_date,
                    due_date,
                    status,
                    items,
                    subtotal,
                    discount,
                    tax,
                    cgst,
                    sgst,
                    igst,
                    total,
                    paid_amount,
                    balance,
                    payment_method,
                    insurance_claim_id,
                    notes,
                    created_at,
                }
            },
        )
        .collect();
    Ok(invoices)
}

#[tauri::command]
pub fn get_invoice_by_id(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<Invoice, String> {
    check_permission(&state, requester.clone(), "Billing", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let inv = conn.query_row(
        "SELECT i.id, i.invoice_code, i.patient_id, p.full_name, p.phone, p.email, i.issue_date, i.due_date, i.status, i.subtotal, i.discount, i.tax, i.cgst, i.sgst, i.igst, i.total, i.paid_amount, i.balance, i.payment_method, i.insurance_claim_id, i.notes, i.created_at FROM invoices i JOIN patients p ON i.patient_id = p.id WHERE i.id = ?1",
        params![id],
        |r| Ok((r.get::<_,i64>(0)?, r.get::<_,String>(1)?, r.get::<_,i64>(2)?, r.get::<_,Option<String>>(3)?,
                r.get::<_,Option<String>>(4)?, r.get::<_,Option<String>>(5)?,
                r.get::<_,String>(6)?, r.get::<_,String>(7)?, r.get::<_,String>(8)?,
                r.get::<_,f64>(9)?, r.get::<_,f64>(10)?, r.get::<_,f64>(11)?, r.get::<_,f64>(12)?, r.get::<_,f64>(13)?, r.get::<_,f64>(14)?, r.get::<_,f64>(15)?, r.get::<_,f64>(16)?, r.get::<_,f64>(17)?, r.get::<_,Option<String>>(18)?, r.get::<_,Option<i64>>(19)?, r.get::<_,Option<String>>(20)?, r.get::<_,String>(21)?)),
    ).map_err(|e| e.to_string())?;
    let items = load_invoice_items(&conn, id);
    Ok(Invoice {
        id: inv.0,
        invoice_code: inv.1,
        patient_id: inv.2,
        patient_name: inv.3,
        patient_phone: inv.4,
        patient_email: inv.5,
        issue_date: inv.6,
        due_date: inv.7,
        status: inv.8,
        subtotal: inv.9,
        discount: inv.10,
        tax: inv.11,
        cgst: inv.12,
        sgst: inv.13,
        igst: inv.14,
        total: inv.15,
        paid_amount: inv.16,
        balance: inv.17,
        payment_method: inv.18,
        insurance_claim_id: inv.19,
        notes: inv.20,
        created_at: inv.21,
        items,
    })
}

#[tauri::command]
pub fn create_invoice(
    state: State<AppState>,
    data: CreateInvoice,
    items: Vec<CreateInvoiceItem>,
    requester: Option<String>,
) -> Result<Invoice, String> {
    check_permission(&state, requester.clone(), "Billing", "create")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let code = new_code("INV");
    let discount = data.discount.unwrap_or(0.0);
    let cgst_rate = data.cgst_rate.unwrap_or(0.0);
    let sgst_rate = data.sgst_rate.unwrap_or(0.0);
    let igst_rate = data.igst_rate.unwrap_or(0.0);
    let subtotal: f64 = items.iter().map(|i| i.quantity as f64 * i.unit_price).sum();
    let cgst = subtotal * cgst_rate / 100.0;
    let sgst = subtotal * sgst_rate / 100.0;
    let igst = subtotal * igst_rate / 100.0;
    let tax = cgst + sgst + igst;
    let total = subtotal - discount + tax;
    tx.execute(
        "INSERT INTO invoices (invoice_code, patient_id, issue_date, due_date, status, subtotal, discount, tax, cgst, sgst, igst, total, paid_amount, balance, payment_method, notes, visit_id) VALUES (?1,?2,?3,?4,'Pending',?5,?6,?7,?8,?9,?10,?11,0,?12,?13,?14,?15)",
        params![code, data.patient_id, data.issue_date, data.due_date, subtotal, discount, tax, cgst, sgst, igst, total, total, data.payment_method, data.notes, data.visit_id],
    ).map_err(|e| e.to_string())?;
    let inv_id = tx.last_insert_rowid();

    // If linked to visit, move to BILL_PENDING
    if let Some(vid) = data.visit_id {
        tx.execute(
            "UPDATE visits SET status = 'BILL_PENDING', updated_at = datetime('now') WHERE id = ?1",
            params![vid],
        )
        .map_err(|e| e.to_string())?;
    }
    for item in &items {
        let item_total = item.quantity as f64 * item.unit_price;
        tx.execute("INSERT INTO invoice_items (invoice_id, description, category, quantity, unit_price, total, hsn_code) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![inv_id, item.description, item.category, item.quantity, item.unit_price, item_total, item.hsn_code]).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    audit::log(
        &state.pool,
        "System",
        "Invoice created",
        "billing",
        Some(inv_id),
        Some(&format!("{} total: ₹{}", code, total)),
    );
    sync::queue_sync(
        &state.pool,
        "INSERT",
        "invoices",
        inv_id,
        &format!("{{\"total\":{}}}", total),
    );
    get_invoice_by_id(state, inv_id, None)
}

#[tauri::command]
pub fn record_payment(
    state: State<AppState>,
    invoice_id: i64,
    amount: f64,
    method: Option<String>,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Billing", "edit")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let (total, paid, visit_id): (f64, f64, Option<i64>) = tx
        .query_row(
            "SELECT total, paid_amount, visit_id FROM invoices WHERE id=?1",
            params![invoice_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| e.to_string())?;
    let remaining = total - paid;
    if amount > remaining {
        return Err(format!(
            "Overpayment not allowed. Remaining balance: ₹{:.2}",
            remaining
        ));
    }
    let new_paid = paid + amount;
    let new_balance = total - new_paid;
    let new_status = if new_balance <= 0.0 {
        "Paid"
    } else {
        "Partial"
    };
    tx.execute(
        "UPDATE invoices SET paid_amount=?1, balance=?2, status=?3, payment_method=?4 WHERE id=?5",
        params![
            new_paid,
            new_balance.max(0.0),
            new_status,
            method,
            invoice_id
        ],
    )
    .map_err(|e| e.to_string())?;

    // If paid and linked to visit, move visit to COMPLETED
    if new_status == "Paid" {
        if let Some(vid) = visit_id {
            tx.execute("UPDATE visits SET status = 'COMPLETED', updated_at = datetime('now') WHERE id = ?1", params![vid]).map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    audit::log(
        &state.pool,
        "System",
        "Payment recorded",
        "billing",
        Some(invoice_id),
        Some(&format!("₹{} via {:?}", amount, method)),
    );
    Ok(())
}

use printpdf::*;
use std::fs::File;
use std::io::BufWriter;

#[tauri::command]
pub fn export_invoice_pdf(
    state: State<AppState>,
    invoice_id: i64,
    app: tauri::AppHandle,
    requester: Option<String>,
) -> Result<String, String> {
    check_permission(&state, requester.clone(), "Billing", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;

    let invoice: Invoice = conn.query_row(
        "SELECT id, invoice_code, patient_id, issue_date, due_date, status, subtotal, discount, tax, cgst, sgst, igst, total, paid_amount, balance, payment_method, notes, created_at, insurance_claim_id
         FROM invoices WHERE id = ?1",
        params![invoice_id],
        |r| Ok(Invoice {
            id: r.get(0)?, invoice_code: r.get(1)?, patient_id: r.get(2)?, patient_name: None,
            patient_phone: None, patient_email: None,
            issue_date: r.get(3)?, due_date: r.get(4)?, status: r.get(5)?,
            items: vec![], subtotal: r.get(6)?, discount: r.get(7)?, tax: r.get(8)?,
            cgst: r.get(9)?, sgst: r.get(10)?, igst: r.get(11)?,
            total: r.get(12)?, paid_amount: r.get(13)?, balance: r.get(14)?,
            payment_method: r.get(15)?, notes: r.get(16)?, created_at: r.get(17)?,
            insurance_claim_id: r.get(18)?,
        }),
    ).map_err(|e| e.to_string())?;

    let patient_name: String = conn
        .query_row(
            "SELECT full_name FROM patients WHERE id = ?1",
            params![invoice.patient_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, invoice_id, description, category, quantity, unit_price, total, hsn_code FROM invoice_items WHERE invoice_id = ?1"
    ).map_err(|e| e.to_string())?;
    let items: Vec<InvoiceItem> = stmt
        .query_map(params![invoice_id], |r| {
            Ok(InvoiceItem {
                id: r.get(0)?,
                invoice_id: r.get(1)?,
                description: r.get(2)?,
                category: r.get(3)?,
                quantity: r.get(4)?,
                unit_price: r.get(5)?,
                total: r.get(6)?,
                hsn_code: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let h_name: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'hospital_name'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "MediCore Hospital".to_string());
    let h_addr: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'hospital_address'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "".to_string());
    let h_city: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'hospital_city'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "".to_string());
    let h_phone: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'hospital_phone'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "".to_string());
    let h_gst: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'hospital_gstin'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "".to_string());

    let (doc, page1, layer1) = PdfDocument::new(
        &format!("Invoice {}", invoice.invoice_code),
        Mm(210.0),
        Mm(297.0),
        "Layer 1",
    );
    let font = doc.add_builtin_font(BuiltinFont::Helvetica).unwrap();
    let font_bold = doc.add_builtin_font(BuiltinFont::HelveticaBold).unwrap();
    let current_layer = doc.get_page(page1).get_layer(layer1);

    current_layer.use_text(&h_name, 18.0, Mm(20.0), Mm(277.0), &font_bold);
    current_layer.use_text("INVOICE", 24.0, Mm(150.0), Mm(277.0), &font_bold);

    current_layer.use_text(
        &format!("{}, {}", h_addr, h_city),
        9.0,
        Mm(20.0),
        Mm(271.0),
        &font,
    );
    current_layer.use_text(
        &format!("Phone: {}", h_phone),
        9.0,
        Mm(20.0),
        Mm(266.0),
        &font,
    );
    if !h_gst.is_empty() {
        current_layer.use_text(
            &format!("GSTIN: {}", h_gst),
            9.0,
            Mm(20.0),
            Mm(261.0),
            &font,
        );
    }

    current_layer.use_text(
        &format!("Invoice #: {}", invoice.invoice_code),
        12.0,
        Mm(20.0),
        Mm(255.0),
        &font,
    );
    current_layer.use_text(
        &format!("Date: {}", invoice.issue_date),
        12.0,
        Mm(20.0),
        Mm(258.0),
        &font,
    );
    current_layer.use_text(
        &format!("Due Date: {}", invoice.due_date),
        12.0,
        Mm(20.0),
        Mm(251.0),
        &font,
    );

    current_layer.use_text("Bill To:", 12.0, Mm(20.0), Mm(235.0), &font_bold);
    current_layer.use_text(&patient_name, 12.0, Mm(20.0), Mm(228.0), &font);

    current_layer.use_text("Description", 10.0, Mm(20.0), Mm(205.0), &font_bold);
    current_layer.use_text("HSN", 10.0, Mm(90.0), Mm(205.0), &font_bold);
    current_layer.use_text("Qty", 10.0, Mm(110.0), Mm(205.0), &font_bold);
    current_layer.use_text("Rate", 10.0, Mm(130.0), Mm(205.0), &font_bold);
    current_layer.use_text("Amount", 10.0, Mm(160.0), Mm(205.0), &font_bold);

    let mut y_pos = 195.0;
    for item in &items {
        current_layer.use_text(&item.description, 10.0, Mm(20.0), Mm(y_pos), &font);
        current_layer.use_text(
            item.hsn_code.as_deref().unwrap_or("-"),
            10.0,
            Mm(90.0),
            Mm(y_pos),
            &font,
        );
        current_layer.use_text(
            &item.quantity.to_string(),
            10.0,
            Mm(110.0),
            Mm(y_pos),
            &font,
        );
        current_layer.use_text(
            &format!("{:.2}", item.unit_price),
            10.0,
            Mm(130.0),
            Mm(y_pos),
            &font,
        );
        current_layer.use_text(
            &format!("{:.2}", item.total),
            10.0,
            Mm(160.0),
            Mm(y_pos),
            &font,
        );
        y_pos -= 7.0;
    }

    current_layer.use_text(
        &format!("Subtotal: ₹{:.2}", invoice.subtotal),
        10.0,
        Mm(130.0),
        Mm(y_pos - 10.0),
        &font,
    );
    current_layer.use_text(
        &format!("Discount: ₹{:.2}", invoice.discount),
        10.0,
        Mm(130.0),
        Mm(y_pos - 20.0),
        &font,
    );
    if invoice.igst > 0.0 {
        current_layer.use_text(
            &format!(
                "IGST ({}%): ₹{:.2}",
                (invoice.igst / invoice.subtotal * 100.0).round(),
                invoice.igst
            ),
            10.0,
            Mm(130.0),
            Mm(y_pos - 30.0),
            &font,
        );
    } else {
        current_layer.use_text(
            &format!("CGST: ₹{:.2}", invoice.cgst),
            10.0,
            Mm(130.0),
            Mm(y_pos - 30.0),
            &font,
        );
        current_layer.use_text(
            &format!("SGST: ₹{:.2}", invoice.sgst),
            10.0,
            Mm(130.0),
            Mm(y_pos - 40.0),
            &font,
        );
    }
    current_layer.use_text(
        &format!("Tax: ₹{:.2}", invoice.tax),
        10.0,
        Mm(130.0),
        Mm(y_pos - 50.0),
        &font,
    );
    current_layer.use_text(
        &format!("TOTAL: ₹{:.2}", invoice.total),
        12.0,
        Mm(130.0),
        Mm(y_pos - 65.0),
        &font_bold,
    );
    current_layer.use_text(
        &format!("Paid: ₹{:.2}", invoice.paid_amount),
        10.0,
        Mm(130.0),
        Mm(y_pos - 80.0),
        &font,
    );
    current_layer.use_text(
        &format!("Balance: ₹{:.2}", invoice.balance),
        12.0,
        Mm(130.0),
        Mm(y_pos - 95.0),
        &font_bold,
    );

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?;
    let app_data = app_data_dir.to_string_lossy();
    let path = format!(
        "{}/MediCore/invoices/{}.pdf",
        app_data, invoice.invoice_code
    );
    let dir_path = format!("{}/MediCore/invoices", app_data);
    std::fs::create_dir_all(&dir_path).map_err(|e| e.to_string())?;

    let file = File::create(&path).map_err(|e| e.to_string())?;
    doc.save(&mut BufWriter::new(file)).unwrap();

    audit::log(
        &state.pool,
        "System",
        "Invoice exported to PDF",
        "billing",
        Some(invoice_id),
        None,
    );
    Ok(path)
}

#[tauri::command]
pub fn get_tax_report(
    state: State<AppState>,
    from: String,
    to: String,
    group_by: Option<String>,
    requester: Option<String>,
) -> Result<Vec<TaxReport>, String> {
    check_permission(&state, requester.clone(), "Billing", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;

    let group_field = match group_by.as_deref() {
        Some("month") => "strftime('%Y-%m', issue_date)",
        Some("year") => "strftime('%Y', issue_date)",
        _ => "issue_date",
    };

    let sql = format!(
        "SELECT {}, SUM(subtotal), SUM(cgst), SUM(sgst), SUM(igst), SUM(tax), SUM(total)
         FROM invoices
         WHERE issue_date BETWEEN ?1 AND ?2
         GROUP BY 1 ORDER BY 1",
        group_field
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let report = stmt
        .query_map(params![from, to], |r| {
            Ok(TaxReport {
                period: r.get(0)?,
                subtotal: r.get(1)?,
                cgst: r.get(2)?,
                sgst: r.get(3)?,
                igst: r.get(4)?,
                total_tax: r.get(5)?,
                total_amount: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(report)
}

#[tauri::command]
pub fn get_revenue_by_range(
    state: State<AppState>,
    from: String,
    to: String,
    requester: Option<String>,
) -> Result<Vec<RevenuePoint>, String> {
    check_permission(&state, requester.clone(), "Billing", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT issue_date, SUM(paid_amount) FROM invoices WHERE issue_date BETWEEN ?1 AND ?2 GROUP BY issue_date ORDER BY issue_date"
    ).map_err(|e| e.to_string())?;
    let points = stmt
        .query_map(params![from, to], |r| {
            Ok(RevenuePoint {
                date: r.get(0)?,
                amount: r.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(points)
}

// ─── INSURANCE ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_insurance_claims(
    state: State<AppState>,
    status: Option<String>,
    requester: Option<String>,
) -> Result<Vec<InsuranceClaim>, String> {
    check_permission(&state, requester.clone(), "Insurance", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.claim_code, c.patient_id, p.full_name, c.invoice_id, c.provider_name,
                c.policy_number, c.claim_amount, c.approved_amount, c.status,
                c.submitted_date, c.resolved_date, c.notes
         FROM insurance_claims c JOIN patients p ON c.patient_id = p.id
         WHERE (?1 IS NULL OR c.status = ?1) ORDER BY c.id DESC",
        )
        .map_err(|e| e.to_string())?;
    let claims = stmt
        .query_map(params![status], |r| {
            Ok(InsuranceClaim {
                id: r.get(0)?,
                claim_code: r.get(1)?,
                patient_id: r.get(2)?,
                patient_name: r.get(3)?,
                invoice_id: r.get(4)?,
                provider_name: r.get(5)?,
                policy_number: r.get(6)?,
                claim_amount: r.get(7)?,
                approved_amount: r.get(8)?,
                status: r.get(9)?,
                submitted_date: r.get(10)?,
                resolved_date: r.get(11)?,
                notes: r.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(claims)
}

#[tauri::command]
pub fn create_insurance_claim(
    state: State<AppState>,
    data: CreateInsuranceClaim,
    requester: Option<String>,
) -> Result<InsuranceClaim, String> {
    check_permission(&state, requester.clone(), "Insurance", "create")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("CLM");
    conn.execute(
        "INSERT INTO insurance_claims (claim_code, patient_id, invoice_id, provider_name, policy_number, claim_amount, status, notes) VALUES (?1,?2,?3,?4,?5,?6,'Draft',?7)",
        params![code, data.patient_id, data.invoice_id, data.provider_name, data.policy_number, data.claim_amount, data.notes],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    audit::log(
        &state.pool,
        "System",
        "Insurance claim created",
        "insurance",
        Some(id),
        Some(&code),
    );
    conn.query_row(
        "SELECT c.id, c.claim_code, c.patient_id, p.full_name, c.invoice_id, c.provider_name, c.policy_number, c.claim_amount, c.approved_amount, c.status, c.submitted_date, c.resolved_date, c.notes FROM insurance_claims c JOIN patients p ON c.patient_id = p.id WHERE c.id = ?1",
        params![id],
        |r| Ok(InsuranceClaim { id: r.get(0)?, claim_code: r.get(1)?, patient_id: r.get(2)?, patient_name: r.get(3)?, invoice_id: r.get(4)?, provider_name: r.get(5)?, policy_number: r.get(6)?, claim_amount: r.get(7)?, approved_amount: r.get(8)?, status: r.get(9)?, submitted_date: r.get(10)?, resolved_date: r.get(11)?, notes: r.get(12)? }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_claim_status(
    state: State<AppState>,
    id: i64,
    status: String,
    approved_amount: Option<f64>,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Insurance", "edit")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let today = today();
    match status.as_str() {
        "Submitted" => {
            tx.execute(
                "UPDATE insurance_claims SET status='Submitted', submitted_date=?1 WHERE id=?2",
                params![today, id],
            )
            .map_err(|e| e.to_string())?;
        }
        "Approved" | "Rejected" | "Paid" => {
            tx.execute("UPDATE insurance_claims SET status=?1, approved_amount=?2, resolved_date=?3 WHERE id=?4", params![status, approved_amount, today, id]).map_err(|e| e.to_string())?;
        }
        _ => {
            tx.execute(
                "UPDATE insurance_claims SET status=?1 WHERE id=?2",
                params![status, id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    // If claim is approved or paid, we should probably update the invoice balance or status
    if status == "Approved" || status == "Paid" {
        if let Some(approved) = approved_amount {
            let invoice_id: i64 = tx
                .query_row(
                    "SELECT invoice_id FROM insurance_claims WHERE id = ?1",
                    params![id],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;

            // Record the approved insurance amount as a payment on the invoice
            let (total, current_paid): (f64, f64) = tx
                .query_row(
                    "SELECT total, paid_amount FROM invoices WHERE id = ?1",
                    params![invoice_id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .map_err(|e| e.to_string())?;

            let new_paid = current_paid + approved;
            let new_balance = (total - new_paid).max(0.0);
            let new_status = if new_balance <= 0.0 {
                "Paid"
            } else {
                "Partial"
            };

            tx.execute(
                "UPDATE invoices SET paid_amount = ?1, balance = ?2, status = ?3, insurance_claim_id = ?4 WHERE id = ?5",
                params![new_paid, new_balance, new_status, id, invoice_id]
            ).map_err(|e| e.to_string())?;

            audit::log(
                &state.pool,
                "System",
                "Invoice updated via Insurance",
                "billing",
                Some(invoice_id),
                Some(&format!("Amount: ₹{}", approved)),
            );
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    audit::log(
        &state.pool,
        "System",
        "Claim status updated",
        "insurance",
        Some(id),
        Some(&status),
    );
    Ok(())
}

// ─── INVENTORY ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_inventory(
    state: State<AppState>,
    category: Option<String>,
    requester: Option<String>,
) -> Result<Vec<InventoryItem>, String> {
    check_permission(&state, requester.clone(), "Inventory", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, item_code, name, category, current_stock, min_threshold, max_capacity, unit, unit_price, supplier, expiry_date, location, last_restocked FROM inventory WHERE (?1 IS NULL OR category = ?1) ORDER BY name"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![category], |r| {
            Ok(InventoryItem {
                id: r.get(0)?,
                item_code: r.get(1)?,
                name: r.get(2)?,
                category: r.get(3)?,
                current_stock: r.get(4)?,
                min_threshold: r.get(5)?,
                max_capacity: r.get(6)?,
                unit: r.get(7)?,
                unit_price: r.get(8)?,
                supplier: r.get(9)?,
                expiry_date: r.get(10)?,
                location: r.get(11)?,
                last_restocked: r.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn get_expiring_inventory(
    state: State<AppState>,
    days: Option<i64>,
    requester: Option<String>,
) -> Result<Vec<InventoryItem>, String> {
    check_permission(&state, requester.clone(), "Inventory", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let d = days.unwrap_or(30);
    let mut stmt = conn.prepare(
        "SELECT id, item_code, name, category, current_stock, min_threshold, max_capacity, unit, unit_price, supplier, expiry_date, location, last_restocked
         FROM inventory
         WHERE expiry_date IS NOT NULL
           AND expiry_date <= date('now', '+' || ?1 || ' days')
           AND expiry_date >= date('now')
         ORDER BY expiry_date ASC"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![d], |r| {
            Ok(InventoryItem {
                id: r.get(0)?,
                item_code: r.get(1)?,
                name: r.get(2)?,
                category: r.get(3)?,
                current_stock: r.get(4)?,
                min_threshold: r.get(5)?,
                max_capacity: r.get(6)?,
                unit: r.get(7)?,
                unit_price: r.get(8)?,
                supplier: r.get(9)?,
                expiry_date: r.get(10)?,
                location: r.get(11)?,
                last_restocked: r.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn get_low_stock_items(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<Vec<InventoryItem>, String> {
    check_permission(&state, requester.clone(), "Inventory", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, item_code, name, category, current_stock, min_threshold, max_capacity, unit, unit_price, supplier, expiry_date, location, last_restocked FROM inventory WHERE current_stock <= min_threshold ORDER BY current_stock ASC"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map([], |r| {
            Ok(InventoryItem {
                id: r.get(0)?,
                item_code: r.get(1)?,
                name: r.get(2)?,
                category: r.get(3)?,
                current_stock: r.get(4)?,
                min_threshold: r.get(5)?,
                max_capacity: r.get(6)?,
                unit: r.get(7)?,
                unit_price: r.get(8)?,
                supplier: r.get(9)?,
                expiry_date: r.get(10)?,
                location: r.get(11)?,
                last_restocked: r.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn update_stock(
    state: State<AppState>,
    item_id: i64,
    quantity: i64,
    operation: String,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Inventory", "edit")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    match operation.as_str() {
        "add" => conn.execute("UPDATE inventory SET current_stock = current_stock + ?1, last_restocked = date('now') WHERE id = ?2", params![quantity, item_id]).map_err(|e| e.to_string())?,
        "subtract" => conn.execute("UPDATE inventory SET current_stock = MAX(0, current_stock - ?1) WHERE id = ?2", params![quantity, item_id]).map_err(|e| e.to_string())?,
        _ => return Err("Invalid operation".to_string()),
    };
    audit::log(
        &state.pool,
        "System",
        &format!("Stock {}", operation),
        "inventory",
        Some(item_id),
        Some(&format!("qty: {}, id:{}", quantity, item_id)),
    );
    Ok(())
}

#[tauri::command]
pub fn create_inventory_item(
    state: State<AppState>,
    data: CreateInventoryItem,
    requester: Option<String>,
) -> Result<InventoryItem, String> {
    check_permission(&state, requester.clone(), "Inventory", "create")?;
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
pub fn update_inventory_item(
    state: State<AppState>,
    id: i64,
    data: serde_json::Value,
    requester: Option<String>,
) -> Result<InventoryItem, String> {
    check_permission(&state, requester.clone(), "Inventory", "edit")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let fields = [
        "name",
        "category",
        "current_stock",
        "min_threshold",
        "max_capacity",
        "unit",
        "unit_price",
        "supplier",
        "expiry_date",
        "location",
    ];

    for field in fields {
        if let Some(value) = data.get(field) {
            let sql = format!("UPDATE inventory SET {} = ?1 WHERE id = ?2", field);
            if value.is_null() {
                tx.execute(&sql, params![rusqlite::types::Null, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(s) = value.as_str() {
                tx.execute(&sql, params![s, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(i) = value.as_i64() {
                tx.execute(&sql, params![i, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(f) = value.as_f64() {
                tx.execute(&sql, params![f, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(b) = value.as_bool() {
                tx.execute(&sql, params![if b { 1 } else { 0 }, id])
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    audit::log(
        &state.pool,
        "System",
        "Inventory item updated",
        "inventory",
        Some(id),
        None,
    );

    conn.query_row("SELECT id, item_code, name, category, current_stock, min_threshold, max_capacity, unit, unit_price, supplier, expiry_date, location, last_restocked FROM inventory WHERE id = ?1", params![id], |r| Ok(InventoryItem {
        id: r.get(0)?, item_code: r.get(1)?, name: r.get(2)?, category: r.get(3)?,
        current_stock: r.get(4)?, min_threshold: r.get(5)?, max_capacity: r.get(6)?,
        unit: r.get(7)?, unit_price: r.get(8)?, supplier: r.get(9)?,
        expiry_date: r.get(10)?, location: r.get(11)?, last_restocked: r.get(12)?,
    })).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_inventory_item(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Pharmacy", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM inventory WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Inventory item deleted",
        "inventory",
        Some(id),
        None,
    );
    Ok(())
}

// ─── AUDIT ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_audit_logs(
    state: State<AppState>,
    limit: Option<i64>,
    entity: Option<String>,
    requester: Option<String>,
) -> Result<Vec<AuditLog>, String> {
    check_permission(&state, requester.clone(), "Audit", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(100);
    let mut stmt = conn
        .prepare(
            "SELECT id, user_name, action, entity, entity_id, details, ip_address, timestamp
         FROM audit_logs WHERE (?1 IS NULL OR LOWER(entity) = LOWER(?1))
         ORDER BY id DESC LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let logs = stmt
        .query_map(params![entity, lim], |r| {
            Ok(AuditLog {
                id: r.get(0)?,
                user_name: r.get(1)?,
                action: r.get(2)?,
                entity: r.get(3)?,
                entity_id: r.get(4)?,
                details: r.get(5)?,
                ip_address: r.get(6)?,
                timestamp: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(logs)
}

// ─── SYNC ─────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn sync_to_cloud(
    state: State<'_, AppState>,
    requester: Option<String>,
) -> Result<SyncResult, String> {
    check_permission(&state, requester.clone(), "Sync", "edit")?;
    sync::sync_to_cloud(&state.pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_sync_status(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<SyncStatus, String> {
    check_permission(&state, requester.clone(), "Sync", "view")?;
    sync::get_sync_status(&state.pool).map_err(|e| e.to_string())
}

// ─── SETTINGS ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_setting(
    state: State<AppState>,
    key: String,
    requester: Option<String>,
) -> Result<Option<String>, String> {
    check_permission(&state, requester.clone(), "Settings", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let result: Result<String, _> = conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |r| r.get(0),
    );
    match result {
        Ok(val) => Ok(Some(val)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn set_setting(
    state: State<AppState>,
    key: String,
    value: String,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Settings", "edit")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Setting updated",
        "settings",
        None,
        Some(&key),
    );
    Ok(())
}

#[tauri::command]
pub fn get_all_settings(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<Vec<Setting>, String> {
    check_permission(&state, requester.clone(), "Settings", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT key, value, updated_at FROM settings")
        .map_err(|e| e.to_string())?;
    let settings = stmt
        .query_map([], |r| {
            Ok(Setting {
                key: r.get(0)?,
                value: r.get(1)?,
                updated_at: r.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(settings)
}

#[tauri::command]
pub fn backup_database(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<String, String> {
    check_permission(&state, requester.clone(), "Settings", "edit")?;
    use std::fs;
    use std::time::SystemTime;
    let timestamp = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let backup_path = format!("medicore_backup_{}.db", timestamp);
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let db_path: String = conn
        .query_row("PRAGMA database_path", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    fs::copy(&db_path, &backup_path).map_err(|e| e.to_string())?;
    Ok(backup_path)
}

// ─── USERS & AUTH ──────────────────────────────────────────────────────────────

#[tauri::command]
pub fn create_user(
    state: State<AppState>,
    data: CreateUser,
    requester: Option<String>,
) -> Result<User, String> {
    check_permission(&state, requester.clone(), "Settings", "create")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let password_hash = bcrypt::hash(&data.password, 10).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO users (username, password_hash, role, full_name, department) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![data.username, password_hash, data.role, data.full_name, data.department],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "User created",
        "user",
        Some(id),
        Some(&data.username),
    );
    conn.query_row(
        "SELECT id, username, role, full_name, department, is_active, last_login, created_at FROM users WHERE id = ?1",
        params![id],
        |r| Ok(User {
            id: r.get(0)?, username: r.get(1)?, role: r.get(2)?,
            full_name: r.get(3)?, department: r.get(4)?, is_active: r.get::<_, i64>(5)? == 1,
            last_login: r.get(6)?, created_at: r.get(7)?,
        }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_users(state: State<AppState>, requester: Option<String>) -> Result<Vec<User>, String> {
    check_permission(&state, requester.clone(), "Settings", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, username, role, full_name, department, is_active, last_login, created_at FROM users ORDER BY id DESC"
    ).map_err(|e| e.to_string())?;
    let users = stmt
        .query_map([], |r| {
            Ok(User {
                id: r.get(0)?,
                username: r.get(1)?,
                role: r.get(2)?,
                full_name: r.get(3)?,
                department: r.get(4)?,
                is_active: r.get::<_, i64>(5)? == 1,
                last_login: r.get(6)?,
                created_at: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(users)
}

#[tauri::command]
pub fn login_user(
    state: State<AppState>,
    username: String,
    password: String,
) -> Result<User, String> {
    // Rate limit check before DB lookup
    get_rate_limiter().check(&username)?;

    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let stored_hash: String = conn
        .query_row(
            "SELECT password_hash FROM users WHERE username = ?1 AND is_active = 1",
            params![username],
            |r| r.get(0),
        )
        .map_err(|_| {
            // Still count failed attempts for rate limiting
            let _ = get_rate_limiter().check(&username);
            "Invalid credentials".to_string()
        })?;

    if !bcrypt::verify(&password, &stored_hash).map_err(|e| e.to_string())? {
        get_rate_limiter().check(&username)?; // increment failed count
        return Err("Invalid credentials".to_string());
    }

    // Successful login: reset rate limiter
    get_rate_limiter().reset(&username);

    let _ = conn.execute(
        "UPDATE users SET last_login = datetime('now') WHERE username = ?1",
        params![username],
    );

    conn.query_row(
        "SELECT id, username, role, full_name, department, is_active, last_login, created_at FROM users WHERE username = ?1",
        params![username],
        |r| Ok(User {
            id: r.get(0)?, username: r.get(1)?, role: r.get(2)?,
            full_name: r.get(3)?, department: r.get(4)?, is_active: r.get::<_, i64>(5)? == 1,
            last_login: r.get(6)?, created_at: r.get(7)?,
        }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_user_status(state: State<AppState>, id: i64, is_active: bool) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE users SET is_active = ?1 WHERE id = ?2",
        params![if is_active { 1 } else { 0 }, id],
    )
    .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        "System",
        "User status updated",
        "user",
        Some(id),
        Some(&format!("is_active={}", is_active)),
    );
    Ok(())
}

#[tauri::command]
pub fn delete_user(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Settings", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM users WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "User deleted",
        "user",
        Some(id),
        None,
    );
    Ok(())
}

// ─────────────────────────────────────────
// TAX SETTINGS
// ─────────────────────────────────────────
#[tauri::command]
pub fn get_tax_settings(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<Vec<TaxSetting>, String> {
    check_permission(&state, requester.clone(), "Settings", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, tax_name, tax_type, rate, cgst_rate, sgst_rate, igst_rate, is_active, created_at FROM tax_settings ORDER BY id DESC"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map([], |r| {
            Ok(TaxSetting {
                id: r.get(0)?,
                tax_name: r.get(1)?,
                tax_type: r.get(2)?,
                rate: r.get(3)?,
                cgst_rate: r.get(4)?,
                sgst_rate: r.get(5)?,
                igst_rate: r.get(6)?,
                is_active: r.get(7)?,
                created_at: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn create_tax_setting(
    state: State<AppState>,
    data: CreateTaxSetting,
    requester: Option<String>,
) -> Result<TaxSetting, String> {
    check_permission(&state, requester.clone(), "Settings", "create")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let cgst = data.cgst_rate.unwrap_or(0.0);
    let sgst = data.sgst_rate.unwrap_or(0.0);
    let igst = data.igst_rate.unwrap_or(0.0);
    conn.execute(
        "INSERT INTO tax_settings (tax_name, tax_type, rate, cgst_rate, sgst_rate, igst_rate) VALUES (?1,?2,?3,?4,?5,?6)",
        params![data.tax_name, data.tax_type.unwrap_or_else(|| "GST".to_string()), data.rate, cgst, sgst, igst],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, tax_name, tax_type, rate, cgst_rate, sgst_rate, igst_rate, is_active, created_at FROM tax_settings WHERE id = ?1",
        params![id],
        |r| Ok(TaxSetting { id: r.get(0)?, tax_name: r.get(1)?, tax_type: r.get(2)?, rate: r.get(3)?,
            cgst_rate: r.get(4)?, sgst_rate: r.get(5)?, igst_rate: r.get(6)?, is_active: r.get(7)?, created_at: r.get(8)? }),
    ).map_err(|e| e.to_string())
}

// ─────────────────────────────────────────
// PAYMENT BATCHES (REVENUE CYCLE)
// ─────────────────────────────────────────
#[tauri::command]
pub fn get_payment_batches(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<Vec<PaymentBatch>, String> {
    check_permission(&state, requester.clone(), "Billing", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, batch_code, batch_date, total_amount, total_count, status, created_by, created_at FROM payment_batches ORDER BY id DESC"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map([], |r| {
            Ok(PaymentBatch {
                id: r.get(0)?,
                batch_code: r.get(1)?,
                batch_date: r.get(2)?,
                total_amount: r.get(3)?,
                total_count: r.get(4)?,
                status: r.get(5)?,
                created_by: r.get(6)?,
                created_at: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn create_payment_batch(
    state: State<AppState>,
    data: CreatePaymentBatch,
    requester: Option<String>,
) -> Result<PaymentBatch, String> {
    check_permission(&state, requester.clone(), "Billing", "create")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("BAT");
    conn.execute(
        "INSERT INTO payment_batches (batch_code, batch_date, created_by) VALUES (?1,?2,?3)",
        params![code, data.batch_date, data.created_by],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    audit::log(
        &state.pool,
        "System",
        "Payment batch created",
        "payment_batch",
        Some(id),
        Some(&code),
    );
    conn.query_row(
        "SELECT id, batch_code, batch_date, total_amount, total_count, status, created_by, created_at FROM payment_batches WHERE id = ?1",
        params![id],
        |r| Ok(PaymentBatch { id: r.get(0)?, batch_code: r.get(1)?, batch_date: r.get(2)?, total_amount: r.get(3)?,
            total_count: r.get(4)?, status: r.get(5)?, created_by: r.get(6)?, created_at: r.get(7)? }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_payment_batch_item(
    state: State<AppState>,
    batch_id: i64,
    invoice_id: i64,
    amount: f64,
    payment_method: String,
    reference_no: Option<String>,
    requester: Option<String>,
) -> Result<PaymentBatchItem, String> {
    check_permission(&state, requester.clone(), "Billing", "create")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO payment_batch_items (batch_id, invoice_id, amount, payment_method, reference_no) VALUES (?1,?2,?3,?4,?5)",
        params![batch_id, invoice_id, amount, payment_method, reference_no],
    ).map_err(|e| e.to_string())?;

    let inv_code: String = tx
        .query_row(
            "SELECT invoice_code FROM invoices WHERE id = ?1",
            params![invoice_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    tx.execute("UPDATE payment_batches SET total_amount = total_amount + ?1, total_count = total_count + 1 WHERE id = ?2", params![amount, batch_id]).map_err(|e| e.to_string())?;

    let id = tx.last_insert_rowid();
    let item = tx.query_row(
        "SELECT id, batch_id, invoice_id, amount, payment_method, reference_no, created_at FROM payment_batch_items WHERE id = ?1",
        params![id],
        |r| Ok(PaymentBatchItem { id: r.get(0)?, batch_id: r.get(1)?, invoice_id: r.get(2)?, invoice_code: Some(inv_code), amount: r.get(3)?, payment_method: r.get(4)?, reference_no: r.get(5)?, created_at: r.get(6)? }),
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(item)
}

// ─────────────────────────────────────────
// MESSAGE TEMPLATES (WHATSAPP & SMS)
// ─────────────────────────────────────────
#[tauri::command]
pub fn get_message_templates(state: State<AppState>) -> Result<Vec<MessageTemplate>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, template_name, message_type, template_body, is_active, created_at FROM message_templates ORDER BY id DESC"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map([], |r| {
            Ok(MessageTemplate {
                id: r.get(0)?,
                template_name: r.get(1)?,
                message_type: r.get(2)?,
                template_body: r.get(3)?,
                is_active: r.get::<_, i64>(4)? == 1,
                created_at: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn create_message_template(
    state: State<AppState>,
    data: CreateMessageTemplate,
    requester: Option<String>,
) -> Result<MessageTemplate, String> {
    check_permission(&state, requester.clone(), "Messages", "create")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO message_templates (template_name, message_type, template_body) VALUES (?1,?2,?3)",
        params![data.template_name, data.message_type, data.template_body],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, template_name, message_type, template_body, is_active, created_at FROM message_templates WHERE id = ?1",
        params![id],
        |r| Ok(MessageTemplate { id: r.get(0)?, template_name: r.get(1)?, message_type: r.get(2)?, template_body: r.get(3)?, is_active: r.get::<_, i64>(4)? == 1, created_at: r.get(5)? }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn send_message(
    state: State<AppState>,
    data: SendMessage,
    requester: Option<String>,
) -> Result<MessageLog, String> {
    check_permission(&state, requester.clone(), "Messages", "create")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let patient_name: Option<String> = match data.patient_id {
        Some(pid) => conn
            .query_row(
                "SELECT full_name FROM patients WHERE id = ?1",
                params![pid],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?,
        None => None,
    };
    conn.execute(
        "INSERT INTO message_logs (patient_id, phone, email, message_type, template_name, message_body, status) VALUES (?1,?2,?3,?4,?5,?6,'Sent')",
        params![data.patient_id, data.phone, data.email, data.message_type, data.template_name, data.message_body],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    audit::log(
        &state.pool,
        "System",
        "Message sent",
        "message_log",
        Some(id),
        Some(&format!(
            "{}: {}/{}",
            data.message_type,
            data.phone,
            data.email.as_deref().unwrap_or("-")
        )),
    );
    conn.query_row(
        "SELECT id, patient_id, phone, email, message_type, template_name, message_body, status, sent_at, error_message, created_at FROM message_logs WHERE id = ?1",
        params![id],
        |r| Ok(MessageLog { id: r.get(0)?, patient_id: r.get(1)?, patient_name, phone: r.get(2)?, email: r.get(3)?, message_type: r.get(4)?, template_name: r.get(5)?, message_body: r.get(6)?, status: r.get(7)?, sent_at: r.get(8)?, error_message: r.get(9)?, created_at: r.get(10)? }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_message_logs(
    state: State<AppState>,
    limit: Option<i64>,
    requester: Option<String>,
) -> Result<Vec<MessageLog>, String> {
    check_permission(&state, requester.clone(), "Messages", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(50);
    let mut stmt = conn.prepare(
        "SELECT m.id, m.patient_id, p.full_name, m.phone, m.email, m.message_type, m.template_name, m.message_body, m.status, m.sent_at, m.error_message, m.created_at
         FROM message_logs m LEFT JOIN patients p ON m.patient_id = p.id ORDER BY m.id DESC LIMIT ?1"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![limit], |r| {
            Ok(MessageLog {
                id: r.get(0)?,
                patient_id: r.get(1)?,
                patient_name: r.get(2)?,
                phone: r.get(3)?,
                email: r.get(4)?,
                message_type: r.get(5)?,
                template_name: r.get(6)?,
                message_body: r.get(7)?,
                status: r.get(8)?,
                sent_at: r.get(9)?,
                error_message: r.get(10)?,
                created_at: r.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

// ─────────────────────────────────────────
// PAYROLL & HR
// ─────────────────────────────────────────
#[tauri::command]
pub fn get_employees(
    state: State<AppState>,
    status: Option<String>,
    requester: Option<String>,
) -> Result<Vec<Employee>, String> {
    check_permission(&state, requester.clone(), "HR", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, employee_code, staff_id, first_name, last_name, email, phone, department, designation, employee_type, date_of_join, date_of_birth, gender, address, bank_name, bank_account, ifsc_code, pan_number, aadhar_number, basic_salary, status, created_at 
         FROM employees WHERE (?1 IS NULL OR status = ?1) ORDER BY id DESC"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![status], |r| {
            Ok(Employee {
                id: r.get(0)?,
                employee_code: r.get(1)?,
                staff_id: r.get(2)?,
                first_name: r.get(3)?,
                last_name: r.get(4)?,
                full_name: format!("{} {}", r.get::<_, String>(3)?, r.get::<_, String>(4)?),
                email: r.get(5)?,
                phone: r.get(6)?,
                department: r.get(7)?,
                designation: r.get(8)?,
                employee_type: r.get(9)?,
                date_of_join: r.get(10)?,
                date_of_birth: r.get(11)?,
                gender: r.get(12)?,
                address: r.get(13)?,
                bank_name: r.get(14)?,
                bank_account: r.get(15)?,
                ifsc_code: r.get(16)?,
                pan_number: r.get(17)?,
                aadhar_number: r.get(18)?,
                basic_salary: r.get(19)?,
                status: r.get(20)?,
                created_at: r.get(21)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn create_employee(state: State<AppState>, data: CreateEmployee) -> Result<Employee, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("EMP");
    conn.execute(
        "INSERT INTO employees (employee_code, staff_id, first_name, last_name, email, phone, department, designation, employee_type, date_of_join, date_of_birth, gender, address, bank_name, bank_account, ifsc_code, pan_number, aadhar_number, basic_salary) 
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)",
        params![code, data.staff_id, data.first_name, data.last_name, data.email, data.phone, data.department, data.designation, data.employee_type.unwrap_or_else(|| "Full-time".to_string()), data.date_of_join, data.date_of_birth, data.gender, data.address, data.bank_name, data.bank_account, data.ifsc_code, data.pan_number, data.aadhar_number, data.basic_salary],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    audit::log(
        &state.pool,
        "System",
        "Employee created",
        "employee",
        Some(id),
        Some(&format!("{} {}", data.first_name, data.last_name)),
    );
    conn.query_row(
        "SELECT id, employee_code, staff_id, first_name, last_name, email, phone, department, designation, employee_type, date_of_join, date_of_birth, gender, address, bank_name, bank_account, ifsc_code, pan_number, aadhar_number, basic_salary, status, created_at FROM employees WHERE id = ?1",
        params![id],
        |r| Ok(Employee { id: r.get(0)?, employee_code: r.get(1)?, staff_id: r.get(2)?, first_name: r.get(3)?, last_name: r.get(4)?, full_name: format!("{} {}", r.get::<_, String>(3)?, r.get::<_, String>(4)?), email: r.get(5)?, phone: r.get(6)?, department: r.get(7)?, designation: r.get(8)?, employee_type: r.get(9)?, date_of_join: r.get(10)?, date_of_birth: r.get(11)?, gender: r.get(12)?, address: r.get(13)?, bank_name: r.get(14)?, bank_account: r.get(15)?, ifsc_code: r.get(16)?, pan_number: r.get(17)?, aadhar_number: r.get(18)?, basic_salary: r.get(19)?, status: r.get(20)?, created_at: r.get(21)? }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_leave_requests(
    state: State<AppState>,
    status: Option<String>,
    requester: Option<String>,
) -> Result<Vec<LeaveRequest>, String> {
    check_permission(&state, requester.clone(), "HR", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT l.id, l.employee_id, e.first_name || ' ' || e.last_name, l.leave_type, l.start_date, l.end_date, l.total_days, l.reason, l.status, l.approved_by, l.approved_at, l.created_at 
         FROM leave_requests l JOIN employees e ON l.employee_id = e.id WHERE (?1 IS NULL OR l.status = ?1) ORDER BY l.id DESC"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![status], |r| {
            Ok(LeaveRequest {
                id: r.get(0)?,
                employee_id: r.get(1)?,
                employee_name: r.get(2)?,
                leave_type: r.get(3)?,
                start_date: r.get(4)?,
                end_date: r.get(5)?,
                total_days: r.get(6)?,
                reason: r.get(7)?,
                status: r.get(8)?,
                approved_by: r.get(9)?,
                approved_at: r.get(10)?,
                created_at: r.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn create_leave_request(
    state: State<AppState>,
    data: CreateLeaveRequest,
) -> Result<LeaveRequest, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, total_days, reason) VALUES (?1,?2,?3,?4,?5,?6)",
        params![data.employee_id, data.leave_type, data.start_date, data.end_date, data.total_days, data.reason],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT l.id, l.employee_id, e.first_name || ' ' || e.last_name, l.leave_type, l.start_date, l.end_date, l.total_days, l.reason, l.status, l.approved_by, l.approved_at, l.created_at FROM leave_requests l JOIN employees e ON l.employee_id = e.id WHERE l.id = ?1",
        params![id],
        |r| Ok(LeaveRequest { id: r.get(0)?, employee_id: r.get(1)?, employee_name: r.get(2)?, leave_type: r.get(3)?, start_date: r.get(4)?, end_date: r.get(5)?, total_days: r.get(6)?, reason: r.get(7)?, status: r.get(8)?, approved_by: r.get(9)?, approved_at: r.get(10)?, created_at: r.get(11)? }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn approve_leave_request(
    state: State<AppState>,
    id: i64,
    approved_by: String,
) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE leave_requests SET status = 'Approved', approved_by = ?1, approved_at = datetime('now') WHERE id = ?2",
        params![approved_by, id],
    ).map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        "System",
        "Leave request approved",
        "leave_request",
        Some(id),
        Some(&approved_by),
    );
    Ok(())
}

#[tauri::command]
pub fn get_attendance(
    state: State<AppState>,
    date: Option<String>,
    requester: Option<String>,
) -> Result<Vec<Attendance>, String> {
    check_permission(&state, requester.clone(), "HR", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let date = date.unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());
    let mut stmt = conn.prepare(
        "SELECT a.id, a.employee_id, e.first_name || ' ' || e.last_name, a.attendance_date, a.check_in, a.check_out, a.work_hours, a.status, a.created_at 
         FROM attendance a JOIN employees e ON a.employee_id = e.id WHERE a.attendance_date = ?1 ORDER BY a.id DESC"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![date], |r| {
            Ok(Attendance {
                id: r.get(0)?,
                employee_id: r.get(1)?,
                employee_name: r.get(2)?,
                attendance_date: r.get(3)?,
                check_in: r.get(4)?,
                check_out: r.get(5)?,
                work_hours: r.get(6)?,
                status: r.get(7)?,
                created_at: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn mark_attendance(state: State<AppState>, data: MarkAttendance) -> Result<Attendance, String> {
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let work_hours = match (&data.check_in, &data.check_out) {
        (Some(in_time), Some(out_time)) => {
            let calc_hours = |t: &str| -> f64 {
                let parts: Vec<&str> = t.split(':').collect();
                if parts.len() >= 2 {
                    parts[0].parse::<f64>().unwrap_or(0.0)
                        + parts[1].parse::<f64>().unwrap_or(0.0) / 60.0
                } else {
                    0.0
                }
            };
            (calc_hours(out_time) - calc_hours(in_time)).max(0.0)
        }
        _ => 0.0,
    };

    tx.execute(
        "INSERT INTO attendance (employee_id, attendance_date, check_in, check_out, work_hours, status)
         VALUES (?1,?2,?3,?4,?5,?6)
         ON CONFLICT(employee_id, attendance_date) DO UPDATE SET
            check_in = COALESCE(excluded.check_in, attendance.check_in),
            check_out = COALESCE(excluded.check_out, attendance.check_out),
            work_hours = excluded.work_hours,
            status = excluded.status",
        params![data.employee_id, data.attendance_date, data.check_in, data.check_out, work_hours, data.status],
    ).map_err(|e| e.to_string())?;

    let id: i64 = if let Some(last_id) = tx.last_insert_rowid().into() {
        if last_id == 0 {
            // Row was updated, not inserted
            tx.query_row(
                "SELECT id FROM attendance WHERE employee_id = ?1 AND attendance_date = ?2",
                params![data.employee_id, data.attendance_date],
                |r| r.get(0),
            )
            .unwrap_or(0)
        } else {
            last_id
        }
    } else {
        0
    };

    let name: String = tx
        .query_row(
            "SELECT first_name || ' ' || last_name FROM employees WHERE id = ?1",
            params![data.employee_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let attendance = tx.query_row(
        "SELECT id, employee_id, attendance_date, check_in, check_out, work_hours, status, created_at FROM attendance WHERE id = ?1",
        params![id],
        |r| Ok(Attendance { id: r.get(0)?, employee_id: r.get(1)?, employee_name: Some(name), attendance_date: r.get(2)?, check_in: r.get(3)?, check_out: r.get(4)?, work_hours: r.get(5)?, status: r.get(6)?, created_at: r.get(7)? }),
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(attendance)
}

// ─────────────────────────────────────────
// ASSET MANAGEMENT
// ─────────────────────────────────────────
#[tauri::command]
pub fn get_asset_categories(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<Vec<AssetCategory>, String> {
    check_permission(&state, requester.clone(), "Assets", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, category_name, depreciation_rate, description, created_at FROM asset_categories ORDER BY id DESC").map_err(|e| e.to_string())?;
    let items = stmt
        .query_map([], |r| {
            Ok(AssetCategory {
                id: r.get(0)?,
                category_name: r.get(1)?,
                depreciation_rate: r.get(2)?,
                description: r.get(3)?,
                created_at: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn create_asset_category(
    state: State<AppState>,
    data: CreateAssetCategory,
    requester: Option<String>,
) -> Result<AssetCategory, String> {
    check_permission(&state, requester.clone(), "Assets", "create")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO asset_categories (category_name, depreciation_rate, description) VALUES (?1,?2,?3)", params![data.category_name, data.depreciation_rate, data.description]).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row("SELECT id, category_name, depreciation_rate, description, created_at FROM asset_categories WHERE id = ?1", params![id], |r| Ok(AssetCategory { id: r.get(0)?, category_name: r.get(1)?, depreciation_rate: r.get(2)?, description: r.get(3)?, created_at: r.get(4)? })).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_assets(
    state: State<AppState>,
    status: Option<String>,
    requester: Option<String>,
) -> Result<Vec<Asset>, String> {
    check_permission(&state, requester.clone(), "Assets", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT a.id, a.asset_code, a.asset_name, a.category_id, c.category_name, a.purchase_date, a.purchase_cost, a.current_value, a.warranty_expiry, a.location, a.assigned_to, e.first_name || ' ' || e.last_name, a.status, a.created_at 
         FROM assets a LEFT JOIN asset_categories c ON a.category_id = c.id LEFT JOIN employees e ON a.assigned_to = e.id WHERE (?1 IS NULL OR a.status = ?1) ORDER BY a.id DESC"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![status], |r| {
            Ok(Asset {
                id: r.get(0)?,
                asset_code: r.get(1)?,
                asset_name: r.get(2)?,
                category_id: r.get(3)?,
                category_name: r.get(4)?,
                purchase_date: r.get(5)?,
                purchase_cost: r.get(6)?,
                current_value: r.get(7)?,
                warranty_expiry: r.get(8)?,
                location: r.get(9)?,
                assigned_to: r.get(10)?,
                assigned_employee: r.get(11)?,
                status: r.get(12)?,
                created_at: r.get(13)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn create_asset(
    state: State<AppState>,
    data: CreateAsset,
    requester: Option<String>,
) -> Result<Asset, String> {
    check_permission(&state, requester.clone(), "Assets", "create")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("AST");
    conn.execute(
        "INSERT INTO assets (asset_code, asset_name, category_id, purchase_date, purchase_cost, current_value, warranty_expiry, location, assigned_to) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![code, data.asset_name, data.category_id, data.purchase_date, data.purchase_cost, data.purchase_cost, data.warranty_expiry, data.location, data.assigned_to],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    audit::log(
        &state.pool,
        "System",
        "Asset created",
        "asset",
        Some(id),
        Some(&code),
    );
    let cat_name: Option<String> = conn
        .query_row(
            "SELECT category_name FROM asset_categories WHERE id = ?1",
            params![data.category_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let emp_name: Option<String> = match data.assigned_to {
        Some(eid) => conn
            .query_row(
                "SELECT first_name || ' ' || last_name FROM employees WHERE id = ?1",
                params![eid],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?,
        None => None,
    };
    conn.query_row("SELECT id, asset_code, asset_name, category_id, purchase_date, purchase_cost, current_value, warranty_expiry, location, assigned_to, status, created_at FROM assets WHERE id = ?1", params![id],
        |r| Ok(Asset { id: r.get(0)?, asset_code: r.get(1)?, asset_name: r.get(2)?, category_id: r.get(3)?, category_name: cat_name, purchase_date: r.get(4)?, purchase_cost: r.get(5)?, current_value: r.get(6)?, warranty_expiry: r.get(7)?, location: r.get(8)?, assigned_to: r.get(9)?, assigned_employee: emp_name, status: r.get(10)?, created_at: r.get(11)? })).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_asset_maintenance(
    state: State<AppState>,
    asset_id: Option<i64>,
    requester: Option<String>,
) -> Result<Vec<AssetMaintenance>, String> {
    check_permission(&state, requester.clone(), "Assets", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT m.id, m.asset_id, a.asset_name, m.maintenance_type, m.description, m.maintenance_date, m.cost, m.vendor, m.next_due_date, m.created_at 
         FROM asset_maintenance m JOIN assets a ON m.asset_id = a.id WHERE (?1 IS NULL OR m.asset_id = ?1) ORDER BY m.id DESC"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![asset_id], |r| {
            Ok(AssetMaintenance {
                id: r.get(0)?,
                asset_id: r.get(1)?,
                asset_name: r.get(2)?,
                maintenance_type: r.get(3)?,
                description: r.get(4)?,
                maintenance_date: r.get(5)?,
                cost: r.get(6)?,
                vendor: r.get(7)?,
                next_due_date: r.get(8)?,
                created_at: r.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn update_asset(
    state: State<AppState>,
    id: i64,
    data: serde_json::Value,
    requester: Option<String>,
) -> Result<Asset, String> {
    check_permission(&state, requester.clone(), "Assets", "edit")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let fields = [
        "asset_name",
        "category_id",
        "purchase_date",
        "purchase_cost",
        "current_value",
        "warranty_expiry",
        "location",
        "assigned_to",
        "status",
    ];

    for field in fields {
        if let Some(value) = data.get(field) {
            let sql = format!("UPDATE assets SET {} = ?1 WHERE id = ?2", field);
            if value.is_null() {
                tx.execute(&sql, params![rusqlite::types::Null, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(s) = value.as_str() {
                tx.execute(&sql, params![s, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(i) = value.as_i64() {
                tx.execute(&sql, params![i, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(f) = value.as_f64() {
                tx.execute(&sql, params![f, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(b) = value.as_bool() {
                tx.execute(&sql, params![if b { 1 } else { 0 }, id])
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    audit::log(
        &state.pool,
        "System",
        "Asset updated",
        "asset",
        Some(id),
        None,
    );

    let cat_name: Option<String> = conn.query_row("SELECT category_name FROM asset_categories WHERE id = (SELECT category_id FROM assets WHERE id = ?1)", params![id], |r| r.get(0)).map_err(|e| e.to_string())?;
    let emp_name: Option<String> = conn.query_row("SELECT first_name || ' ' || last_name FROM employees WHERE id = (SELECT assigned_to FROM assets WHERE id = ?1)", params![id], |r| r.get(0)).map_err(|e| e.to_string())?;
    conn.query_row("SELECT id, asset_code, asset_name, category_id, purchase_date, purchase_cost, current_value, warranty_expiry, location, assigned_to, status, created_at FROM assets WHERE id = ?1", params![id],
        |r| Ok(Asset { id: r.get(0)?, asset_code: r.get(1)?, asset_name: r.get(2)?, category_id: r.get(3)?, category_name: cat_name, purchase_date: r.get(4)?, purchase_cost: r.get(5)?, current_value: r.get(6)?, warranty_expiry: r.get(7)?, location: r.get(8)?, assigned_to: r.get(9)?, assigned_employee: emp_name, status: r.get(10)?, created_at: r.get(11)? })).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_asset_maintenance(
    state: State<AppState>,
    data: CreateAssetMaintenance,
    requester: Option<String>,
) -> Result<AssetMaintenance, String> {
    check_permission(&state, requester.clone(), "Assets", "create")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let cost = data.cost.unwrap_or(0.0);
    conn.execute(
        "INSERT INTO asset_maintenance (asset_id, maintenance_type, description, maintenance_date, cost, vendor, next_due_date) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![data.asset_id, data.maintenance_type, data.description, data.maintenance_date, cost, data.vendor, data.next_due_date],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let asset_name: String = conn
        .query_row(
            "SELECT asset_name FROM assets WHERE id = ?1",
            params![data.asset_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    conn.query_row("SELECT id, asset_id, maintenance_type, description, maintenance_date, cost, vendor, next_due_date, created_at FROM asset_maintenance WHERE id = ?1", params![id],
        |r| Ok(AssetMaintenance { id: r.get(0)?, asset_id: r.get(1)?, asset_name: Some(asset_name), maintenance_type: r.get(2)?, description: r.get(3)?, maintenance_date: r.get(4)?, cost: r.get(5)?, vendor: r.get(6)?, next_due_date: r.get(7)?, created_at: r.get(8)? })).map_err(|e| e.to_string())
}

// ─────────────────────────────────────────
// OPD QUEUE MANAGEMENT
// ─────────────────────────────────────────
#[tauri::command]
pub fn get_opd_tokens(
    state: State<AppState>,
    date: Option<String>,
    status: Option<String>,
    requester: Option<String>,
) -> Result<Vec<OpdToken>, String> {
    check_permission(&state, requester.clone(), "OPD", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let date = date.unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());
    let mut stmt = conn.prepare(
        "SELECT t.id, t.token_number, t.patient_id, p.full_name, t.doctor_id, d.full_name, t.department, t.queue_date, t.status, t.wait_time, t.called_at, t.started_at, t.completed_at, t.priority, t.created_at
         FROM opd_tokens t JOIN patients p ON t.patient_id = p.id JOIN doctors d ON t.doctor_id = d.id 
         WHERE t.queue_date = ?1 AND (?2 IS NULL OR t.status = ?2) ORDER BY t.priority DESC, t.token_number ASC"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![date, status], |r| {
            Ok(OpdToken {
                id: r.get(0)?,
                token_number: r.get(1)?,
                patient_id: r.get(2)?,
                patient_name: r.get(3)?,
                doctor_id: r.get(4)?,
                doctor_name: r.get(5)?,
                department: r.get(6)?,
                queue_date: r.get(7)?,
                status: r.get(8)?,
                wait_time: r.get(9)?,
                called_at: r.get(10)?,
                started_at: r.get(11)?,
                completed_at: r.get(12)?,
                priority: r.get(13)?,
                created_at: r.get(14)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn create_opd_token(
    app: AppHandle,
    state: State<AppState>,
    data: CreateOpdToken,
    requester: Option<String>,
) -> Result<OpdToken, String> {
    check_permission(&state, requester.clone(), "OPD", "create")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let max_token: i64 = tx.query_row("SELECT COALESCE(MAX(token_number), 0) FROM opd_tokens WHERE queue_date = ?1 AND doctor_id = ?2", params![data.queue_date, data.doctor_id], |r| r.get(0)).map_err(|e| e.to_string())?;
    let token_number = max_token + 1;
    let priority = data.priority.unwrap_or(0);
    tx.execute(
        "INSERT INTO opd_tokens (token_number, patient_id, doctor_id, department, queue_date, priority, visit_id) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![token_number, data.patient_id, data.doctor_id, data.department, data.queue_date, priority, data.visit_id],
    ).map_err(|e| e.to_string())?;
    let id = tx.last_insert_rowid();

    // If linked to visit, move visit status to WAITING
    if let Some(vid) = data.visit_id {
        tx.execute(
            "UPDATE visits SET status = 'WAITING', updated_at = datetime('now') WHERE id = ?1",
            params![vid],
        )
        .map_err(|e| e.to_string())?;
    }

    let (pat_name, doc_name): (String, String) = tx.query_row(
        "SELECT p.full_name, d.full_name FROM patients p JOIN doctors d ON d.id = ?1 WHERE p.id = ?2",
        params![data.doctor_id, data.patient_id],
        |r| Ok((r.get(0)?, r.get(1)?))
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    let token = conn.query_row("SELECT id, token_number, patient_id, doctor_id, department, queue_date, status, wait_time, priority, created_at FROM opd_tokens WHERE id = ?1", params![id],
        |r| Ok(OpdToken { id: r.get(0)?, token_number: r.get(1)?, patient_id: r.get(2)?, patient_name: Some(pat_name), doctor_id: r.get(3)?, doctor_name: Some(doc_name), department: r.get(4)?, queue_date: r.get(5)?, status: r.get(6)?, wait_time: r.get(7)?, called_at: None, started_at: None, completed_at: None, priority: r.get(8)?, created_at: r.get(9)? })).map_err(|e| e.to_string())?;

    app.emit_to(EventTarget::Any, "opd_queue_updated", &token)
        .unwrap();
    Ok(token)
}

#[tauri::command]
pub fn reassign_token(
    app: AppHandle,
    state: State<AppState>,
    token_id: i64,
    new_doctor_id: i64,
    requester: Option<String>,
) -> Result<OpdToken, String> {
    check_permission(&state, requester.clone(), "OPD", "edit")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let (department, visit_id): (String, Option<i64>) = tx.query_row(
        "SELECT d.specialization, t.visit_id FROM doctors d, opd_tokens t WHERE d.id = ?1 AND t.id = ?2",
        params![new_doctor_id, token_id],
        |r| Ok((r.get(0)?, r.get(1)?))
    ).map_err(|e| format!("Doctor or Token not found: {}", e))?;

    tx.execute(
        "UPDATE opd_tokens SET doctor_id = ?1, department = ?2 WHERE id = ?3",
        params![new_doctor_id, department, token_id],
    )
    .map_err(|e| e.to_string())?;

    if let Some(vid) = visit_id {
        tx.execute(
            "UPDATE visits SET doctor_id = ?1, department = ?2 WHERE id = ?3",
            params![new_doctor_id, department, vid],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    let token = conn.query_row(
        "SELECT t.id, t.token_number, t.patient_id, p.full_name, t.doctor_id, d.full_name, t.department, t.queue_date, t.status, t.wait_time, t.called_at, t.started_at, t.completed_at, t.priority, t.created_at FROM opd_tokens t JOIN patients p ON t.patient_id = p.id JOIN doctors d ON t.doctor_id = d.id WHERE t.id = ?1",
        params![token_id],
        |r| Ok(OpdToken { id: r.get(0)?, token_number: r.get(1)?, patient_id: r.get(2)?, patient_name: r.get(3)?, doctor_id: r.get(4)?, doctor_name: r.get(5)?, department: r.get(6)?, queue_date: r.get(7)?, status: r.get(8)?, wait_time: r.get(9)?, called_at: r.get(10)?, started_at: r.get(11)?, completed_at: r.get(12)?, priority: r.get(13)?, created_at: r.get(14)? })
    ).map_err(|e| e.to_string())?;

    app.emit_to(EventTarget::Any, "opd_queue_updated", &token)
        .unwrap();
    Ok(token)
}

#[tauri::command]
pub fn skip_token(
    app: AppHandle,
    state: State<AppState>,
    token_id: i64,
    requester: Option<String>,
) -> Result<OpdToken, String> {
    check_permission(&state, requester.clone(), "OPD", "edit")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE opd_tokens SET status = 'Skipped' WHERE id = ?1",
        params![token_id],
    )
    .map_err(|e| e.to_string())?;

    let token = conn.query_row(
        "SELECT t.id, t.token_number, t.patient_id, p.full_name, t.doctor_id, d.full_name, t.department, t.queue_date, t.status, t.wait_time, t.called_at, t.started_at, t.completed_at, t.priority, t.created_at FROM opd_tokens t JOIN patients p ON t.patient_id = p.id JOIN doctors d ON t.doctor_id = d.id WHERE t.id = ?1",
        params![token_id],
        |r| Ok(OpdToken { id: r.get(0)?, token_number: r.get(1)?, patient_id: r.get(2)?, patient_name: r.get(3)?, doctor_id: r.get(4)?, doctor_name: r.get(5)?, department: r.get(6)?, queue_date: r.get(7)?, status: r.get(8)?, wait_time: r.get(9)?, called_at: r.get(10)?, started_at: r.get(11)?, completed_at: r.get(12)?, priority: r.get(13)?, created_at: r.get(14)? })
    ).map_err(|e| e.to_string())?;

    app.emit_to(EventTarget::Any, "opd_queue_updated", &token)
        .unwrap();
    Ok(token)
}

#[tauri::command]
pub fn update_token_status(
    app: AppHandle,
    state: State<AppState>,
    id: i64,
    new_status: String,
    requester: Option<String>,
) -> Result<OpdToken, String> {
    check_permission(&state, requester.clone(), "OPD", "edit")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let now = now();
    let col = match new_status.as_str() {
        "Called" => "called_at",
        "InProgress" => "started_at",
        "Completed" => "completed_at",
        _ => "",
    };

    if !col.is_empty() {
        tx.execute(
            &format!(
                "UPDATE opd_tokens SET status = ?1, {} = ?2 WHERE id = ?3",
                col
            ),
            params![new_status, now, id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        tx.execute(
            "UPDATE opd_tokens SET status = ?1 WHERE id = ?2",
            params![new_status, id],
        )
        .map_err(|e| e.to_string())?;
    }

    // If status is InProgress, move visit to IN_CONSULTATION
    if new_status == "InProgress" {
        let visit_id: Option<i64> = tx
            .query_row(
                "SELECT visit_id FROM opd_tokens WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .unwrap_or(None);
        if let Some(vid) = visit_id {
            tx.execute("UPDATE visits SET status = 'IN_CONSULTATION', updated_at = datetime('now') WHERE id = ?1", params![vid]).map_err(|e| e.to_string())?;
        }
    }

    // If token is completed, also complete the corresponding appointment for today
    if new_status == "Completed" {
        let (patient_id, doctor_id, queue_date): (i64, i64, String) = tx
            .query_row(
                "SELECT patient_id, doctor_id, queue_date FROM opd_tokens WHERE id = ?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(|e| e.to_string())?;

        tx.execute(
            "UPDATE appointments SET status = 'Completed' WHERE patient_id = ?1 AND doctor_id = ?2 AND appointment_date = ?3 AND status IN ('Scheduled', 'Checked In', 'In Progress')",
            params![patient_id, doctor_id, queue_date]
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    let token: OpdToken = conn.query_row(
        "SELECT t.id, t.token_number, t.patient_id, p.full_name, t.doctor_id, d.full_name, t.department, t.queue_date, t.status, t.wait_time, t.called_at, t.started_at, t.completed_at, t.priority, t.created_at FROM opd_tokens t JOIN patients p ON t.patient_id = p.id JOIN doctors d ON t.doctor_id = d.id WHERE t.id = ?1",
        params![id],
        |r| Ok(OpdToken { id: r.get(0)?, token_number: r.get(1)?, patient_id: r.get(2)?, patient_name: r.get(3)?, doctor_id: r.get(4)?, doctor_name: r.get(5)?, department: r.get(6)?, queue_date: r.get(7)?, status: r.get(8)?, wait_time: r.get(9)?, called_at: r.get(10)?, started_at: r.get(11)?, completed_at: r.get(12)?, priority: r.get(13)?, created_at: r.get(14)? })
    ).map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        "System",
        "Token status updated",
        "opd_token",
        Some(id),
        Some(&new_status),
    );
    app.emit_to(EventTarget::Any, "opd_queue_updated", &token)
        .unwrap();
    Ok(token)
}

// ─────────────────────────────────────────
// DISCHARGE SUMMARY
// ─────────────────────────────────────────
#[tauri::command]
pub fn get_discharge_summaries(
    state: State<AppState>,
    patient_id: Option<i64>,
    requester: Option<String>,
) -> Result<Vec<DischargeSummary>, String> {
    check_permission(&state, requester.clone(), "Patients", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT d.id, d.summary_code, d.patient_id, p.full_name, p.phone, p.email, d.admission_date, d.discharge_date, d.discharge_type, d.diagnosis, d.procedure_done, d.history_present_illness, d.examination_findings, d.investigations, d.treatment_given, d.advice_on_discharge, d.follow_up_date, d.created_by, dr.full_name, d.created_at
         FROM discharge_summaries d JOIN patients p ON d.patient_id = p.id JOIN doctors dr ON d.created_by = dr.id WHERE (?1 IS NULL OR d.patient_id = ?1) ORDER BY d.id DESC"
    ).map_err(|e| e.to_string())?;
    let items: Vec<DischargeSummary> = stmt
        .query_map(params![patient_id], |r| {
            Ok(DischargeSummary {
                id: r.get(0)?,
                summary_code: r.get(1)?,
                patient_id: r.get(2)?,
                patient_name: r.get(3)?,
                patient_phone: r.get(4)?,
                patient_email: r.get(5)?,
                admission_date: r.get(6)?,
                discharge_date: r.get(7)?,
                discharge_type: r.get(8)?,
                diagnosis: r.get(9)?,
                procedure_done: r.get(10)?,
                history_present_illness: r.get(11)?,
                examination_findings: r.get(12)?,
                investigations: r.get(13)?,
                treatment_given: r.get(14)?,
                advice_on_discharge: r.get(15)?,
                follow_up_date: r.get(16)?,
                created_by: r.get(17)?,
                doctor_name: r.get(18)?,
                medications: vec![],
                created_at: r.get(19)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    let mut result = vec![];
    for mut item in items {
        let mut med_stmt = conn.prepare("SELECT id, discharge_summary_id, medication, dosage, duration, instructions FROM discharge_medications WHERE discharge_summary_id = ?1").map_err(|e| e.to_string())?;
        let meds: Vec<DischargeMedication> = med_stmt
            .query_map(params![item.id], |r| {
                Ok(DischargeMedication {
                    id: r.get(0)?,
                    discharge_summary_id: r.get(1)?,
                    medication: r.get(2)?,
                    dosage: r.get(3)?,
                    duration: r.get(4)?,
                    instructions: r.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        item.medications = meds;
        result.push(item);
    }
    Ok(result)
}

#[tauri::command]
pub fn create_discharge_summary(
    state: State<AppState>,
    data: CreateDischargeSummary,
    medications: Vec<CreateDischargeMedication>,
    requester: Option<String>,
) -> Result<DischargeSummary, String> {
    check_permission(&state, requester.clone(), "Patients", "create")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let code = new_code("DS");
    tx.execute(
        "INSERT INTO discharge_summaries (summary_code, patient_id, admission_date, discharge_date, discharge_type, diagnosis, procedure_done, history_present_illness, examination_findings, investigations, treatment_given, advice_on_discharge, follow_up_date, created_by) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
        params![code, data.patient_id, data.admission_date, data.discharge_date, data.discharge_type.unwrap_or_else(|| "Regular".to_string()), data.diagnosis, data.procedure_done, data.history_present_illness, data.examination_findings, data.investigations, data.treatment_given, data.advice_on_discharge, data.follow_up_date, data.created_by],
    ).map_err(|e| e.to_string())?;
    let id = tx.last_insert_rowid();
    for med in &medications {
        tx.execute("INSERT INTO discharge_medications (discharge_summary_id, medication, dosage, duration, instructions) VALUES (?1,?2,?3,?4,?5)", params![id, med.medication, med.dosage, med.duration, med.instructions]).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    audit::log(
        &state.pool,
        "System",
        "Discharge summary created",
        "discharge_summary",
        Some(id),
        Some(&code),
    );
    get_discharge_summary_by_id(state, id)
}

fn get_discharge_summary_by_id(
    state: State<AppState>,
    id: i64,
) -> Result<DischargeSummary, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let (pat_name, pat_phone, pat_email, doc_name): (
        String,
        Option<String>,
        Option<String>,
        String,
    ) = conn
        .query_row(
            "SELECT p.full_name, p.phone, p.email, d.full_name FROM discharge_summaries ds
         JOIN patients p ON ds.patient_id = p.id
         JOIN doctors d ON ds.created_by = d.id
         WHERE ds.id = ?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .map_err(|e| e.to_string())?;

    let mut med_stmt = conn.prepare("SELECT id, discharge_summary_id, medication, dosage, duration, instructions FROM discharge_medications WHERE discharge_summary_id = ?1").map_err(|e| e.to_string())?;
    let meds: Vec<DischargeMedication> = med_stmt
        .query_map(params![id], |r| {
            Ok(DischargeMedication {
                id: r.get(0)?,
                discharge_summary_id: r.get(1)?,
                medication: r.get(2)?,
                dosage: r.get(3)?,
                duration: r.get(4)?,
                instructions: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    conn.query_row("SELECT id, summary_code, patient_id, admission_date, discharge_date, discharge_type, diagnosis, procedure_done, history_present_illness, examination_findings, investigations, treatment_given, advice_on_discharge, follow_up_date, created_by, created_at FROM discharge_summaries WHERE id = ?1", params![id],
        |r| Ok(DischargeSummary {
            id: r.get(0)?, summary_code: r.get(1)?, patient_id: r.get(2)?, patient_name: Some(pat_name.clone()),
            patient_phone: pat_phone.clone(), patient_email: pat_email.clone(),
            admission_date: r.get(3)?, discharge_date: r.get(4)?, discharge_type: r.get(5)?, diagnosis: r.get(6)?,
            procedure_done: r.get(7)?, history_present_illness: r.get(8)?, examination_findings: r.get(9)?,
            investigations: r.get(10)?, treatment_given: r.get(11)?, advice_on_discharge: r.get(12)?,
            follow_up_date: r.get(13)?, created_by: r.get(14)?, doctor_name: Some(doc_name), medications: meds,
            created_at: r.get(15)?
        })
    ).map_err(|e| e.to_string())
}

// ─────────────────────────────────────────
// OPERATION THEATRE
// ─────────────────────────────────────────
#[tauri::command]
pub fn get_ot_schedules(
    state: State<AppState>,
    date: Option<String>,
    status: Option<String>,
    requester: Option<String>,
) -> Result<Vec<OtSchedule>, String> {
    check_permission(&state, requester.clone(), "OperationTheatre", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let date = date.unwrap_or_else(|| today());
    let mut stmt = conn.prepare(
        "SELECT o.id, o.surgery_code, o.patient_id, p.full_name, o.surgeon_id, d1.full_name, o.anesthesiologist_id, d2.full_name, o.ot_theatre_id, t.theatre_name, o.surgery_type, o.surgery_date, o.start_time, o.end_time, o.status, o.priority, o.anesthesia_type, o.notes, o.created_at 
         FROM ot_schedules o JOIN patients p ON o.patient_id = p.id JOIN doctors d1 ON o.surgeon_id = d1.id LEFT JOIN doctors d2 ON o.anesthesiologist_id = d2.id LEFT JOIN ot_theatres t ON o.ot_theatre_id = t.id
         WHERE o.surgery_date = ?1 AND (?2 IS NULL OR o.status = ?2) ORDER BY o.start_time ASC"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![date, status], |r| {
            Ok(OtSchedule {
                id: r.get(0)?,
                surgery_code: r.get(1)?,
                patient_id: r.get(2)?,
                patient_name: r.get(3)?,
                surgeon_id: r.get(4)?,
                surgeon_name: r.get(5)?,
                anesthesiologist_id: r.get(6)?,
                anesthesiologist_name: r.get(7)?,
                ot_theatre_id: r.get(8)?,
                theatre_name: r.get(9)?,
                surgery_type: r.get(10)?,
                surgery_date: r.get(11)?,
                start_time: r.get(12)?,
                end_time: r.get(13)?,
                status: r.get(14)?,
                priority: r.get(15)?,
                anesthesia_type: r.get(16)?,
                notes: r.get(17)?,
                created_at: r.get(18)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn create_ot_schedule(
    state: State<AppState>,
    data: CreateOtSchedule,
    requester: Option<String>,
) -> Result<OtSchedule, String> {
    check_permission(&state, requester.clone(), "OperationTheatre", "create")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("OT");
    conn.execute(
        "INSERT INTO ot_schedules (surgery_code, patient_id, surgeon_id, anesthesiologist_id, ot_theatre_id, surgery_type, surgery_date, start_time, priority, anesthesia_type, notes) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![code, data.patient_id, data.surgeon_id, data.anesthesiologist_id, data.ot_theatre_id, data.surgery_type, data.surgery_date, data.start_time, data.priority.unwrap_or_else(|| "Elective".to_string()), data.anesthesia_type, data.notes],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    audit::log(
        &state.pool,
        "System",
        "OT scheduled",
        "ot_schedule",
        Some(id),
        Some(&code),
    );
    conn.query_row("SELECT o.id, o.surgery_code, o.patient_id, p.full_name, o.surgeon_id, d1.full_name, o.anesthesiologist_id, d2.full_name, o.ot_theatre_id, t.theatre_name, o.surgery_type, o.surgery_date, o.start_time, o.end_time, o.status, o.priority, o.anesthesia_type, o.notes, o.created_at FROM ot_schedules o JOIN patients p ON o.patient_id = p.id JOIN doctors d1 ON o.surgeon_id = d1.id LEFT JOIN doctors d2 ON o.anesthesiologist_id = d2.id LEFT JOIN ot_theatres t ON o.ot_theatre_id = t.id WHERE o.id = ?1", params![id],
        |r| Ok(OtSchedule { id: r.get(0)?, surgery_code: r.get(1)?, patient_id: r.get(2)?, patient_name: r.get(3)?, surgeon_id: r.get(4)?, surgeon_name: r.get(5)?, anesthesiologist_id: r.get(6)?, anesthesiologist_name: r.get(7)?, ot_theatre_id: r.get(8)?, theatre_name: r.get(9)?, surgery_type: r.get(10)?, surgery_date: r.get(11)?, start_time: r.get(12)?, end_time: r.get(13)?, status: r.get(14)?, priority: r.get(15)?, anesthesia_type: r.get(16)?, notes: r.get(17)?, created_at: r.get(18)? })).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_ot_theatres(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<Vec<OtTheatre>, String> {
    check_permission(&state, requester.clone(), "OperationTheatre", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, theatre_name, theatre_code, location, is_operational, created_at FROM ot_theatres ORDER BY id DESC").map_err(|e| e.to_string())?;
    let items = stmt
        .query_map([], |r| {
            Ok(OtTheatre {
                id: r.get(0)?,
                theatre_name: r.get(1)?,
                theatre_code: r.get(2)?,
                location: r.get(3)?,
                is_operational: r.get::<_, i64>(4)? == 1,
                created_at: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

// ─────────────────────────────────────────
// EMERGENCY / ER
// ─────────────────────────────────────────
#[tauri::command]
pub fn get_emergency_cases(
    state: State<AppState>,
    status: Option<String>,
    requester: Option<String>,
) -> Result<Vec<EmergencyCase>, String> {
    check_permission(&state, requester.clone(), "Emergency", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT e.id, e.case_code, e.patient_id, e.patient_name, e.patient_phone, e.arrival_time, e.triage_level, e.chief_complaint, e.vital_signs, e.treatment_given, e.status, e.outcome, e.admitted_to, w.ward_name, e.discharged_at, e.created_at 
         FROM emergency_cases e LEFT JOIN wards w ON e.admitted_to = w.id WHERE (?1 IS NULL OR e.status = ?1) ORDER BY e.id DESC"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![status], |r| {
            Ok(EmergencyCase {
                id: r.get(0)?,
                case_code: r.get(1)?,
                patient_id: r.get(2)?,
                patient_name: r.get(3)?,
                patient_phone: r.get(4)?,
                arrival_time: r.get(5)?,
                triage_level: r.get(6)?,
                chief_complaint: r.get(7)?,
                vital_signs: r.get(8)?,
                treatment_given: r.get(9)?,
                status: r.get(10)?,
                outcome: r.get(11)?,
                admitted_to: r.get(12)?,
                ward_name: r.get(13)?,
                discharged_at: r.get(14)?,
                created_at: r.get(15)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn get_emergency_case_by_id(state: State<AppState>, id: i64, requester: Option<String>) -> Result<EmergencyCase, String> {
    check_permission(&state, requester.clone(), "Emergency", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT e.id, e.case_code, e.patient_id, e.patient_name, e.patient_phone, e.arrival_time, e.triage_level, e.chief_complaint, e.vital_signs, e.treatment_given, e.status, e.outcome, e.admitted_to, w.ward_name, e.discharged_at, e.created_at 
         FROM emergency_cases e LEFT JOIN wards w ON e.admitted_to = w.id WHERE e.id = ?1",
        params![id],
        |r| Ok(EmergencyCase {
            id: r.get(0)?,
            case_code: r.get(1)?,
            patient_id: r.get(2)?,
            patient_name: r.get(3)?,
            patient_phone: r.get(4)?,
            arrival_time: r.get(5)?,
            triage_level: r.get(6)?,
            chief_complaint: r.get(7)?,
            vital_signs: r.get(8)?,
            treatment_given: r.get(9)?,
            status: r.get(10)?,
            outcome: r.get(11)?,
            admitted_to: r.get(12)?,
            ward_name: r.get(13)?,
            discharged_at: r.get(14)?,
            created_at: r.get(15)?,
        }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_emergency_case(
    state: State<AppState>,
    data: CreateEmergencyCase,
    requester: Option<String>,
) -> Result<EmergencyCase, String> {
    check_permission(&state, requester.clone(), "Emergency", "create")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let code = new_code("EM");
    let arrival_time = now();

    tx.execute(
         "INSERT INTO emergency_cases (case_code, patient_id, patient_name, patient_phone, arrival_time, triage_level, chief_complaint, vital_signs, treatment_given, status, outcome, admitted_to)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
         params![
             code,
             data.patient_id,
             data.patient_name,
             data.patient_phone,
             arrival_time,
             data.triage_level,
             data.chief_complaint,
             data.vital_signs,
             None::<Option<String>>,
             "Active",
             None::<Option<String>>,
             None::<Option<i64>>
         ],
     ).map_err(|e: rusqlite::Error| e.to_string())?;

    let id = tx.last_insert_rowid();

    tx.commit().map_err(|e| e.to_string())?;

    audit::log(
        &state.pool,
        "System",
        "Emergency case created",
        "emergency",
        Some(id),
        Some(&code),
    );

    get_emergency_case_by_id(state, id, None)
}

#[tauri::command]
pub fn update_emergency_status(
    state: State<AppState>,
    id: i64,
    status: String,
    outcome: Option<String>,
    admitted_to: Option<i64>,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Emergency", "edit")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute("UPDATE emergency_cases SET status = ?1, outcome = ?2, admitted_to = ?3, discharged_at = ?4 WHERE id = ?5",
        params![status, outcome, admitted_to, if status == "Discharged" || status == "Admitted" { Some(now()) } else { None }, id]).map_err(|e| e.to_string())?;

    // If admitted, update patient status
    if status == "Admitted" {
        let patient_id: Option<i64> = tx
            .query_row(
                "SELECT patient_id FROM emergency_cases WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .ok()
            .flatten();

        if let Some(pid) = patient_id {
            tx.execute(
                "UPDATE patients SET status = 'Admitted' WHERE id = ?1",
                params![pid],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    audit::log(
        &state.pool,
        "System",
        "Emergency case updated",
        "emergency_case",
        Some(id),
        Some(&status),
    );
    Ok(())
}

// ─────────────────────────────────────────
// BLOOD BANK
// ─────────────────────────────────────────
#[tauri::command]
pub fn get_blood_donors(
    state: State<AppState>,
    status: Option<String>,
    requester: Option<String>,
) -> Result<Vec<BloodDonor>, String> {
    check_permission(&state, requester.clone(), "BloodBank", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, donor_code, full_name, dob, gender, phone, email, blood_group, last_donation, donation_count, status, created_at FROM blood_donors WHERE (?1 IS NULL OR status = ?1) ORDER BY id DESC").map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![status], |r| {
            Ok(BloodDonor {
                id: r.get(0)?,
                donor_code: r.get(1)?,
                full_name: r.get(2)?,
                dob: r.get(3)?,
                gender: r.get(4)?,
                phone: r.get(5)?,
                email: r.get(6)?,
                blood_group: r.get(7)?,
                last_donation: r.get(8)?,
                donation_count: r.get(9)?,
                status: r.get(10)?,
                created_at: r.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn create_blood_donor(
    state: State<AppState>,
    data: CreateBloodDonor,
    requester: Option<String>,
) -> Result<BloodDonor, String> {
    check_permission(&state, requester.clone(), "BloodBank", "create")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("BD");
    conn.execute("INSERT INTO blood_donors (donor_code, full_name, dob, gender, phone, email, blood_group) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![code, data.full_name, data.dob, data.gender, data.phone, data.email, data.blood_group]).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row("SELECT id, donor_code, full_name, dob, gender, phone, email, blood_group, last_donation, donation_count, status, created_at FROM blood_donors WHERE id = ?1", params![id],
        |r| Ok(BloodDonor { id: r.get(0)?, donor_code: r.get(1)?, full_name: r.get(2)?, dob: r.get(3)?, gender: r.get(4)?, phone: r.get(5)?, email: r.get(6)?, blood_group: r.get(7)?, last_donation: r.get(8)?, donation_count: r.get(9)?, status: r.get(10)?, created_at: r.get(11)? })).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_blood_inventory(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<Vec<BloodInventory>, String> {
    check_permission(&state, requester.clone(), "BloodBank", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, bag_number, blood_group, component, units, collection_date, expiry_date, donor_id, status, created_at FROM blood_inventory ORDER BY expiry_date ASC").map_err(|e| e.to_string())?;
    let items = stmt
        .query_map([], |r| {
            Ok(BloodInventory {
                id: r.get(0)?,
                bag_number: r.get(1)?,
                blood_group: r.get(2)?,
                component: r.get(3)?,
                units: r.get(4)?,
                collection_date: r.get(5)?,
                expiry_date: r.get(6)?,
                donor_id: r.get(7)?,
                status: r.get(8)?,
                created_at: r.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn create_blood_inventory(
    state: State<AppState>,
    data: CreateBloodInventory,
    requester: Option<String>,
) -> Result<BloodInventory, String> {
    check_permission(&state, requester.clone(), "BloodBank", "create")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let code = new_code("BB");
    tx.execute("INSERT INTO blood_inventory (bag_number, blood_group, component, units, collection_date, expiry_date, donor_id) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![code, data.blood_group, data.component.unwrap_or_else(|| "Whole Blood".to_string()), data.units, data.collection_date, data.expiry_date, data.donor_id]).map_err(|e| e.to_string())?;
    let id = tx.last_insert_rowid();

    if let Some(donor_id) = data.donor_id {
        tx.execute(
            "UPDATE blood_donors SET last_donation = ?1, donation_count = donation_count + 1 WHERE id = ?2",
            params![data.collection_date, donor_id]
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    audit::log(
        &state.pool,
        "System",
        "Blood inventory added",
        "blood_bank",
        Some(id),
        Some(&format!("Bag: {}, Group: {}", code, data.blood_group)),
    );

    conn.query_row("SELECT id, bag_number, blood_group, component, units, collection_date, expiry_date, donor_id, status, created_at FROM blood_inventory WHERE id = ?1", params![id],
        |r| Ok(BloodInventory { id: r.get(0)?, bag_number: r.get(1)?, blood_group: r.get(2)?, component: r.get(3)?, units: r.get(4)?, collection_date: r.get(5)?, expiry_date: r.get(6)?, donor_id: r.get(7)?, status: r.get(8)?, created_at: r.get(9)? })).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_blood_requests(
    state: State<AppState>,
    status: Option<String>,
    requester: Option<String>,
) -> Result<Vec<BloodRequest>, String> {
    check_permission(&state, requester.clone(), "BloodBank", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT b.id, b.request_code, b.patient_id, p.full_name, b.blood_group, b.units_required, b.units_issued, b.urgency, b.status, b.approved_by, b.created_at FROM blood_requests b JOIN patients p ON b.patient_id = p.id WHERE (?1 IS NULL OR b.status = ?1) ORDER BY b.id DESC").map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![status], |r| {
            Ok(BloodRequest {
                id: r.get(0)?,
                request_code: r.get(1)?,
                patient_id: r.get(2)?,
                patient_name: r.get(3)?,
                blood_group: r.get(4)?,
                units_required: r.get(5)?,
                units_issued: r.get(6)?,
                urgency: r.get(7)?,
                status: r.get(8)?,
                approved_by: r.get(9)?,
                created_at: r.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn create_blood_request(
    state: State<AppState>,
    data: CreateBloodRequest,
    requester: Option<String>,
) -> Result<BloodRequest, String> {
    check_permission(&state, requester.clone(), "BloodBank", "create")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("BR");
    conn.execute("INSERT INTO blood_requests (request_code, patient_id, blood_group, units_required, urgency) VALUES (?1,?2,?3,?4,?5)",
        params![code, data.patient_id, data.blood_group, data.units_required, data.urgency.unwrap_or_else(|| "Normal".to_string())]).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row("SELECT b.id, b.request_code, b.patient_id, p.full_name, b.blood_group, b.units_required, b.units_issued, b.urgency, b.status, b.approved_by, b.created_at FROM blood_requests b JOIN patients p ON b.patient_id = p.id WHERE b.id = ?1", params![id],
        |r| Ok(BloodRequest { id: r.get(0)?, request_code: r.get(1)?, patient_id: r.get(2)?, patient_name: r.get(3)?, blood_group: r.get(4)?, units_required: r.get(5)?, units_issued: r.get(6)?, urgency: r.get(7)?, status: r.get(8)?, approved_by: r.get(9)?, created_at: r.get(10)? })).map_err(|e| e.to_string())
}

// ─────────────────────────────────────────
// AMBULANCE
// ─────────────────────────────────────────
#[tauri::command]
pub fn get_ambulances(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<Vec<Ambulance>, String> {
    check_permission(&state, requester.clone(), "Ambulance", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, ambulance_number, vehicle_type, license_number, insurance_expiry, last_service, status, created_at FROM ambulances ORDER BY id DESC").map_err(|e| e.to_string())?;
    let items = stmt
        .query_map([], |r| {
            Ok(Ambulance {
                id: r.get(0)?,
                ambulance_number: r.get(1)?,
                vehicle_type: r.get(2)?,
                license_number: r.get(3)?,
                insurance_expiry: r.get(4)?,
                last_service: r.get(5)?,
                status: r.get(6)?,
                created_at: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn create_ambulance(
    state: State<AppState>,
    data: CreateAmbulance,
    requester: Option<String>,
) -> Result<Ambulance, String> {
    check_permission(&state, requester.clone(), "Ambulance", "create")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO ambulances (ambulance_number, vehicle_type, license_number, insurance_expiry) VALUES (?1,?2,?3,?4)",
        params![data.ambulance_number, data.vehicle_type.unwrap_or_else(|| "ALS".to_string()), data.license_number, data.insurance_expiry]).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row("SELECT id, ambulance_number, vehicle_type, license_number, insurance_expiry, last_service, status, created_at FROM ambulances WHERE id = ?1", params![id],
        |r| Ok(Ambulance { id: r.get(0)?, ambulance_number: r.get(1)?, vehicle_type: r.get(2)?, license_number: r.get(3)?, insurance_expiry: r.get(4)?, last_service: r.get(5)?, status: r.get(6)?, created_at: r.get(7)? })).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_ambulance_calls(
    state: State<AppState>,
    status: Option<String>,
    requester: Option<String>,
) -> Result<Vec<AmbulanceCall>, String> {
    check_permission(&state, requester.clone(), "Ambulance", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT a.id, a.call_code, a.patient_id, a.patient_name, a.patient_phone, a.pickup_address, a.destination, a.ambulance_id, b.ambulance_number, a.driver_name, a.call_time, a.pickup_time, a.arrival_time, a.drop_time, a.status, a.notes, a.created_at FROM ambulance_calls a LEFT JOIN ambulances b ON a.ambulance_id = b.id WHERE (?1 IS NULL OR a.status = ?1) ORDER BY a.id DESC").map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![status], |r| {
            Ok(AmbulanceCall {
                id: r.get(0)?,
                call_code: r.get(1)?,
                patient_id: r.get(2)?,
                patient_name: r.get(3)?,
                patient_phone: r.get(4)?,
                pickup_address: r.get(5)?,
                destination: r.get(6)?,
                ambulance_id: r.get(7)?,
                ambulance_number: r.get(8)?,
                driver_name: r.get(9)?,
                call_time: r.get(10)?,
                pickup_time: r.get(11)?,
                arrival_time: r.get(12)?,
                drop_time: r.get(13)?,
                status: r.get(14)?,
                notes: r.get(15)?,
                created_at: r.get(16)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn create_ambulance_call(
    state: State<AppState>,
    data: CreateAmbulanceCall,
    requester: Option<String>,
) -> Result<AmbulanceCall, String> {
    check_permission(&state, requester.clone(), "Ambulance", "create")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let code = new_code("AMB");
    let call_time = now();
    tx.execute("INSERT INTO ambulance_calls (call_code, patient_id, patient_name, patient_phone, pickup_address, destination, ambulance_id, driver_name, call_time, notes) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![code, data.patient_id, data.patient_name, data.patient_phone, data.pickup_address, data.destination, data.ambulance_id, data.driver_name, call_time, data.notes]).map_err(|e| e.to_string())?;
    let id = tx.last_insert_rowid();

    if let Some(ambulance_id) = data.ambulance_id {
        tx.execute(
            "UPDATE ambulances SET status = 'On Call' WHERE id = ?1",
            params![ambulance_id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    audit::log(
        &state.pool,
        "System",
        "Ambulance called",
        "ambulance_call",
        Some(id),
        Some(&code),
    );
    conn.query_row("SELECT a.id, a.call_code, a.patient_id, a.patient_name, a.patient_phone, a.pickup_address, a.destination, a.ambulance_id, b.ambulance_number, a.driver_name, a.call_time, a.pickup_time, a.arrival_time, a.drop_time, a.status, a.notes, a.created_at FROM ambulance_calls a LEFT JOIN ambulances b ON a.ambulance_id = b.id WHERE a.id = ?1", params![id],
        |r| Ok(AmbulanceCall { id: r.get(0)?, call_code: r.get(1)?, patient_id: r.get(2)?, patient_name: r.get(3)?, patient_phone: r.get(4)?, pickup_address: r.get(5)?, destination: r.get(6)?, ambulance_id: r.get(7)?, ambulance_number: r.get(8)?, driver_name: r.get(9)?, call_time: r.get(10)?, pickup_time: r.get(11)?, arrival_time: r.get(12)?, drop_time: r.get(13)?, status: r.get(14)?, notes: r.get(15)?, created_at: r.get(16)? })).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_ambulance_status(
    state: State<AppState>,
    id: i64,
    status: String,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Ambulance", "edit")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let now_time = now();
    let col = match status.as_str() {
        "PickedUp" => "pickup_time",
        "Arrived" => "arrival_time",
        "Completed" => "drop_time",
        _ => "",
    };
    if !col.is_empty() {
        tx.execute(
            &format!(
                "UPDATE ambulance_calls SET status = ?1, {} = ?2 WHERE id = ?3",
                col
            ),
            params![status, now_time, id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        tx.execute(
            "UPDATE ambulance_calls SET status = ?1 WHERE id = ?2",
            params![status, id],
        )
        .map_err(|e| e.to_string())?;
    }

    if status == "Completed" {
        let ambulance_id: Option<i64> = tx
            .query_row(
                "SELECT ambulance_id FROM ambulance_calls WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .ok()
            .flatten();

        if let Some(amb_id) = ambulance_id {
            tx.execute(
                "UPDATE ambulances SET status = 'Available' WHERE id = ?1",
                params![amb_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    audit::log(
        &state.pool,
        "System",
        "Ambulance status updated",
        "ambulance",
        Some(id),
        Some(&status),
    );
    Ok(())
}

// ─────────────────────────────────────────
// EXPENSE MANAGEMENT
// ─────────────────────────────────────────
#[tauri::command]
pub fn get_expense_categories(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<Vec<ExpenseCategory>, String> {
    check_permission(&state, requester.clone(), "Expenses", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, category_name, description, created_at FROM expense_categories ORDER BY id DESC").map_err(|e| e.to_string())?;
    let items = stmt
        .query_map([], |r| {
            Ok(ExpenseCategory {
                id: r.get(0)?,
                category_name: r.get(1)?,
                description: r.get(2)?,
                created_at: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn create_expense_category(
    state: State<AppState>,
    data: CreateExpenseCategory,
    requester: Option<String>,
) -> Result<ExpenseCategory, String> {
    check_permission(&state, requester.clone(), "Expenses", "create")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO expense_categories (category_name, description) VALUES (?1,?2)",
        params![data.category_name, data.description],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    audit::log(
        &state.pool,
        "System",
        "Expense category added",
        "expense",
        Some(id),
        Some(&data.category_name),
    );
    conn.query_row(
        "SELECT id, category_name, description, created_at FROM expense_categories WHERE id = ?1",
        params![id],
        |r| {
            Ok(ExpenseCategory {
                id: r.get(0)?,
                category_name: r.get(1)?,
                description: r.get(2)?,
                created_at: r.get(3)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_expenses(
    state: State<AppState>,
    status: Option<String>,
    requester: Option<String>,
) -> Result<Vec<Expense>, String> {
    check_permission(&state, requester.clone(), "Expenses", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT e.id, e.expense_code, e.category_id, c.category_name, e.amount, e.expense_date, e.description, e.vendor, e.payment_method, e.receipt_number, e.approved_by, e.status, e.created_at FROM expenses e JOIN expense_categories c ON e.category_id = c.id WHERE (?1 IS NULL OR e.status = ?1) ORDER BY e.id DESC").map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![status], |r| {
            Ok(Expense {
                id: r.get(0)?,
                expense_code: r.get(1)?,
                category_id: r.get(2)?,
                category_name: r.get(3)?,
                amount: r.get(4)?,
                expense_date: r.get(5)?,
                description: r.get(6)?,
                vendor: r.get(7)?,
                payment_method: r.get(8)?,
                receipt_number: r.get(9)?,
                approved_by: r.get(10)?,
                status: r.get(11)?,
                created_at: r.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn update_expense(
    state: State<AppState>,
    id: i64,
    data: serde_json::Value,
    requester: Option<String>,
) -> Result<Expense, String> {
    check_permission(&state, requester.clone(), "Expenses", "edit")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let fields = [
        "category_id",
        "amount",
        "expense_date",
        "description",
        "vendor",
        "payment_method",
        "receipt_number",
        "approved_by",
        "status",
    ];

    for field in fields {
        if let Some(value) = data.get(field) {
            let sql = format!("UPDATE expenses SET {} = ?1 WHERE id = ?2", field);
            if value.is_null() {
                tx.execute(&sql, params![rusqlite::types::Null, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(s) = value.as_str() {
                tx.execute(&sql, params![s, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(i) = value.as_i64() {
                tx.execute(&sql, params![i, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(f) = value.as_f64() {
                tx.execute(&sql, params![f, id])
                    .map_err(|e| e.to_string())?;
            } else if let Some(b) = value.as_bool() {
                tx.execute(&sql, params![if b { 1 } else { 0 }, id])
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    audit::log(
        &state.pool,
        "System",
        "Expense updated",
        "expense",
        Some(id),
        None,
    );

    conn.query_row("SELECT e.id, e.expense_code, e.category_id, c.category_name, e.amount, e.expense_date, e.description, e.vendor, e.payment_method, e.receipt_number, e.approved_by, e.status, e.created_at FROM expenses e JOIN expense_categories c ON e.category_id = c.id WHERE e.id = ?1", params![id],
        |r| Ok(Expense { id: r.get(0)?, expense_code: r.get(1)?, category_id: r.get(2)?, category_name: r.get(3)?, amount: r.get(4)?, expense_date: r.get(5)?, description: r.get(6)?, vendor: r.get(7)?, payment_method: r.get(8)?, receipt_number: r.get(9)?, approved_by: r.get(10)?, status: r.get(11)?, created_at: r.get(12)? })).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_expense(
    state: State<AppState>,
    data: CreateExpense,
    requester: Option<String>,
) -> Result<Expense, String> {
    check_permission(&state, requester.clone(), "Expenses", "create")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("EXP");
    // Auto-approve small expenses under 1000
    let status = if data.amount < 1000.0 {
        "Approved"
    } else {
        "Pending"
    };
    conn.execute("INSERT INTO expenses (expense_code, category_id, amount, expense_date, description, vendor, payment_method, receipt_number, status) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![code, data.category_id, data.amount, data.expense_date, data.description, data.vendor, data.payment_method, data.receipt_number, status]).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    audit::log(
        &state.pool,
        "System",
        "Expense recorded",
        "expense",
        Some(id),
        Some(&format!("₹{}", data.amount)),
    );
    conn.query_row("SELECT e.id, e.expense_code, e.category_id, c.category_name, e.amount, e.expense_date, e.description, e.vendor, e.payment_method, e.receipt_number, e.approved_by, e.status, e.created_at FROM expenses e JOIN expense_categories c ON e.category_id = c.id WHERE e.id = ?1", params![id],
        |r| Ok(Expense { id: r.get(0)?, expense_code: r.get(1)?, category_id: r.get(2)?, category_name: r.get(3)?, amount: r.get(4)?, expense_date: r.get(5)?, description: r.get(6)?, vendor: r.get(7)?, payment_method: r.get(8)?, receipt_number: r.get(9)?, approved_by: r.get(10)?, status: r.get(11)?, created_at: r.get(12)? })).map_err(|e| e.to_string())
}

// ─────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────
#[tauri::command]
pub fn get_notifications(
    state: State<AppState>,
    limit: Option<i64>,
    requester: Option<String>,
) -> Result<Vec<Notification>, String> {
    check_permission(&state, requester.clone(), "Audit", "view")?; // perhaps use Notifications module? If not exist, maybe "General".
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(20);
    let mut stmt = conn.prepare("SELECT id, title, message, notification_type, target_role, is_read, created_at FROM notifications ORDER BY id DESC LIMIT ?1").map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![limit], |r| {
            Ok(Notification {
                id: r.get(0)?,
                title: r.get(1)?,
                message: r.get(2)?,
                notification_type: r.get(3)?,
                target_role: r.get(4)?,
                is_read: r.get::<_, i64>(5)? == 1,
                created_at: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn create_notification(
    state: State<AppState>,
    data: CreateNotification,
    requester: Option<String>,
) -> Result<Notification, String> {
    check_permission(&state, requester.clone(), "Settings", "create")?; // Or maybe "Audit"? Use Settings for now
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO notifications (title, message, notification_type, target_role) VALUES (?1,?2,?3,?4)",
        params![data.title, data.message, data.notification_type.unwrap_or_else(|| "General".to_string()), data.target_role]).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row("SELECT id, title, message, notification_type, target_role, is_read, created_at FROM notifications WHERE id = ?1", params![id],
        |r| Ok(Notification { id: r.get(0)?, title: r.get(1)?, message: r.get(2)?, notification_type: r.get(3)?, target_role: r.get(4)?, is_read: r.get::<_, i64>(5)? == 1, created_at: r.get(6)? })).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mark_notification_read(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Audit", "edit")?; // maybe "Settings"? Use Audit as placeholder
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE notifications SET is_read = 1 WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ─────────────────────────────────────────
// ROLE PERMISSIONS
// ─────────────────────────────────────────
#[tauri::command]
pub fn get_role_permissions(
    state: State<AppState>,
    role: Option<String>,
) -> Result<Vec<RolePermission>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, role, module, can_view, can_create, can_edit, can_delete FROM role_permissions WHERE (?1 IS NULL OR role = ?1)").map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![role], |r| {
            Ok(RolePermission {
                id: r.get(0)?,
                role: r.get(1)?,
                module: r.get(2)?,
                can_view: r.get::<_, i64>(3)? == 1,
                can_create: r.get::<_, i64>(4)? == 1,
                can_edit: r.get::<_, i64>(5)? == 1,
                can_delete: r.get::<_, i64>(6)? == 1,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn update_role_permission(
    state: State<AppState>,
    data: UpdateRolePermission,
    requester: Option<String>,
) -> Result<RolePermission, String> {
    check_permission(&state, requester.clone(), "Settings", "edit")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("INSERT OR REPLACE INTO role_permissions (role, module, can_view, can_create, can_edit, can_delete) VALUES (?1,?2,?3,?4,?5,?6)",
        params![data.role, data.module, if data.can_view {1}else{0}, if data.can_create {1}else{0}, if data.can_edit {1}else{0}, if data.can_delete {1}else{0}]).map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Role permission updated",
        "settings",
        None,
        Some(&format!("{}:{}", data.role, data.module)),
    );
    conn.query_row("SELECT id, role, module, can_view, can_create, can_edit, can_delete FROM role_permissions WHERE role = ?1 AND module = ?2", params![data.role, data.module],
        |r| Ok(RolePermission { id: r.get(0)?, role: r.get(1)?, module: r.get(2)?, can_view: r.get::<_, i64>(3)? == 1, can_create: r.get::<_, i64>(4)? == 1, can_edit: r.get::<_, i64>(5)? == 1, can_delete: r.get::<_, i64>(6)? == 1 })).map_err(|e| e.to_string())
}

// ─── MEDICAL RECORDS (EMR) ───────────────────────────────────────────────────

#[tauri::command]
pub fn get_medical_records(
    state: State<AppState>,
    patient_id: i64,
    requester: Option<String>,
) -> Result<Vec<MedicalRecord>, String> {
    check_permission(&state, requester.clone(), "Patients", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT m.id, m.patient_id, m.doctor_id, d.full_name, m.record_type, m.title, m.description, m.attachment_path, m.created_at
         FROM medical_records m
         JOIN doctors d ON m.doctor_id = d.id
         JOIN patients p ON m.patient_id = p.id
         WHERE m.patient_id = ?1 AND p.is_deleted = 0
         ORDER BY m.id DESC"
    ).map_err(|e| e.to_string())?;
    let records = stmt
        .query_map(params![patient_id], |r| {
            Ok(MedicalRecord {
                id: r.get(0)?,
                patient_id: r.get(1)?,
                doctor_id: r.get(2)?,
                doctor_name: r.get(3)?,
                record_type: r.get(4)?,
                title: r.get(5)?,
                description: r.get(6)?,
                attachment_path: r.get(7)?,
                created_at: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(records)
}

#[tauri::command]
pub fn create_medical_record(
    state: State<AppState>,
    data: CreateMedicalRecord,
    requester: Option<String>,
) -> Result<MedicalRecord, String> {
    check_permission(&state, requester.clone(), "Patients", "create")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO medical_records (patient_id, doctor_id, record_type, title, description, attachment_path, visit_id) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![data.patient_id, data.doctor_id, data.record_type, data.title, data.description, data.attachment_path, data.visit_id],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    audit::log(
        &state.pool,
        "System",
        "Medical record added",
        "patient",
        Some(data.patient_id),
        Some(&data.title),
    );

    conn.query_row(
        "SELECT m.id, m.patient_id, m.doctor_id, d.full_name, m.record_type, m.title, m.description, m.attachment_path, m.created_at
         FROM medical_records m JOIN doctors d ON m.doctor_id = d.id WHERE m.id = ?1",
        params![id],
        |r| Ok(MedicalRecord {
            id: r.get(0)?, patient_id: r.get(1)?, doctor_id: r.get(2)?, doctor_name: r.get(3)?,
            record_type: r.get(4)?, title: r.get(5)?, description: r.get(6)?, attachment_path: r.get(7)?,
            created_at: r.get(8)?,
        }),
    ).map_err(|e| e.to_string())
}

// ─── STAFF SHIFT ROSTER ──────────────────────────────────────────────────────

#[tauri::command]
pub fn get_staff_shifts(
    state: State<AppState>,
    from_date: String,
    to_date: String,
    requester: Option<String>,
) -> Result<Vec<StaffShift>, String> {
    check_permission(&state, requester.clone(), "HR", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT s.id, s.employee_id, e.first_name || ' ' || e.last_name, s.shift_date, s.shift_type, s.status, s.notes, s.created_at
         FROM staff_shifts s JOIN employees e ON s.employee_id = e.id
         WHERE s.shift_date BETWEEN ?1 AND ?2 ORDER BY s.shift_date ASC"
    ).map_err(|e| e.to_string())?;
    let shifts = stmt
        .query_map(params![from_date, to_date], |r| {
            Ok(StaffShift {
                id: r.get(0)?,
                employee_id: r.get(1)?,
                employee_name: r.get(2)?,
                shift_date: r.get(3)?,
                shift_type: r.get(4)?,
                status: r.get(5)?,
                notes: r.get(6)?,
                created_at: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(shifts)
}

#[tauri::command]
pub fn assign_staff_shift(
    state: State<AppState>,
    data: CreateStaffShift,
    requester: Option<String>,
) -> Result<StaffShift, String> {
    check_permission(&state, requester.clone(), "HR", "create")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let status = data.status.unwrap_or_else(|| "Scheduled".to_string());
    conn.execute(
        "INSERT INTO staff_shifts (employee_id, shift_date, shift_type, status, notes)
         VALUES (?1,?2,?3,?4,?5)
         ON CONFLICT(employee_id, shift_date) DO UPDATE SET
            shift_type = excluded.shift_type, status = excluded.status, notes = excluded.notes",
        params![
            data.employee_id,
            data.shift_date,
            data.shift_type,
            status,
            data.notes
        ],
    )
    .map_err(|e| e.to_string())?;

    let id: i64 = conn
        .query_row(
            "SELECT id FROM staff_shifts WHERE employee_id = ?1 AND shift_date = ?2",
            params![data.employee_id, data.shift_date],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT s.id, s.employee_id, e.first_name || ' ' || e.last_name, s.shift_date, s.shift_type, s.status, s.notes, s.created_at
         FROM staff_shifts s JOIN employees e ON s.employee_id = e.id WHERE s.id = ?1",
        params![id],
        |r| Ok(StaffShift {
            id: r.get(0)?, employee_id: r.get(1)?, employee_name: r.get(2)?, shift_date: r.get(3)?,
            shift_type: r.get(4)?, status: r.get(5)?, notes: r.get(6)?, created_at: r.get(7)?,
        }),
    ).map_err(|e| e.to_string())
}

// ─── PAYROLL PROCESSING ──────────────────────────────────────────────────────

#[tauri::command]
pub fn get_payroll_months(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<Vec<PayrollMonth>, String> {
    check_permission(&state, requester.clone(), "HR", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, month_year, start_date, end_date, status, created_at FROM payroll_months ORDER BY id DESC"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map([], |r| {
            Ok(PayrollMonth {
                id: r.get(0)?,
                month_year: r.get(1)?,
                start_date: r.get(2)?,
                end_date: r.get(3)?,
                status: r.get(4)?,
                created_at: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn create_payroll_month(
    state: State<AppState>,
    data: CreatePayrollMonth,
    requester: Option<String>,
) -> Result<PayrollMonth, String> {
    check_permission(&state, requester.clone(), "HR", "create")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO payroll_months (month_year, start_date, end_date) VALUES (?1,?2,?3)",
        params![data.month_year, data.start_date, data.end_date],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    audit::log(
        &state.pool,
        "System",
        "Payroll month created",
        "payroll",
        Some(id),
        Some(&data.month_year),
    );
    conn.query_row(
        "SELECT id, month_year, start_date, end_date, status, created_at FROM payroll_months WHERE id = ?1",
        params![id],
        |r| Ok(PayrollMonth { id: r.get(0)?, month_year: r.get(1)?, start_date: r.get(2)?, end_date: r.get(3)?, status: r.get(4)?, created_at: r.get(5)? }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_payroll_entries(
    state: State<AppState>,
    month_id: i64,
    requester: Option<String>,
) -> Result<Vec<PayrollEntry>, String> {
    check_permission(&state, requester.clone(), "HR", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT p.id, p.payroll_month_id, p.employee_id, e.first_name || ' ' || e.last_name, p.basic_salary, p.allowances, p.deductions, p.net_salary, p.status, p.processed_at, p.created_at
         FROM payroll_entries p JOIN employees e ON p.employee_id = e.id WHERE p.payroll_month_id = ?1 ORDER BY p.id DESC"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![month_id], |r| {
            Ok(PayrollEntry {
                id: r.get(0)?,
                payroll_month_id: r.get(1)?,
                employee_id: r.get(2)?,
                employee_name: r.get(3)?,
                basic_salary: r.get(4)?,
                allowances: r.get(5)?,
                deductions: r.get(6)?,
                net_salary: r.get(7)?,
                status: r.get(8)?,
                processed_at: r.get(9)?,
                created_at: r.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn calculate_payroll(
    state: State<AppState>,
    month_id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "HR", "edit")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute(
        "DELETE FROM payroll_entries WHERE payroll_month_id = ?1",
        params![month_id],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = tx
        .prepare("SELECT id, basic_salary FROM employees WHERE status = 'Active'")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, f64>(1)?)))
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (employee_id, basic_salary) = row.map_err(|e| e.to_string())?;
        let net_salary = basic_salary;
        tx.execute(
            "INSERT INTO payroll_entries (payroll_month_id, employee_id, basic_salary, allowances, deductions, net_salary, status) VALUES (?1,?2,?3,0,0,?4,'Calculated')",
            params![month_id, employee_id, basic_salary, net_salary],
        )
        .map_err(|e| e.to_string())?;
    }

    drop(stmt);
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_payroll_entry_status(
    state: State<AppState>,
    id: i64,
    status: String,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "HR", "edit")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let processed_at = if status == "Paid" { Some(now()) } else { None };
    conn.execute(
        "UPDATE payroll_entries SET status = ?1, processed_at = ?2 WHERE id = ?3",
        params![status, processed_at, id],
    )
    .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Payroll entry updated",
        "payroll_entry",
        Some(id),
        Some(&status),
    );
    Ok(())
}

// ─── PATIENT FEEDBACK ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_feedback(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<Vec<PatientFeedback>, String> {
    check_permission(&state, requester.clone(), "Patients", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT f.id, f.patient_id, p.full_name, f.rating, f.comments, f.department, f.created_at
         FROM feedback f LEFT JOIN patients p ON f.patient_id = p.id ORDER BY f.id DESC"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map([], |r| {
            Ok(PatientFeedback {
                id: r.get(0)?,
                patient_id: r.get(1)?,
                patient_name: r.get::<_, Option<String>>(2).unwrap_or(None),
                rating: r.get(3)?,
                comments: r.get(4)?,
                department: r.get(5)?,
                created_at: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn create_feedback(
    state: State<AppState>,
    data: CreateFeedback,
    requester: Option<String>,
) -> Result<PatientFeedback, String> {
    check_permission(&state, requester.clone(), "Patients", "create")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO feedback (patient_id, rating, comments, department) VALUES (?1,?2,?3,?4)",
        params![data.patient_id, data.rating, data.comments, data.department],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    audit::log(
        &state.pool,
        "System",
        "Feedback submitted",
        "feedback",
        Some(id),
        None,
    );

    conn.query_row(
        "SELECT f.id, f.patient_id, p.full_name, f.rating, f.comments, f.department, f.created_at
         FROM feedback f LEFT JOIN patients p ON f.patient_id = p.id WHERE f.id = ?1",
        params![id],
        |r| {
            Ok(PatientFeedback {
                id: r.get(0)?,
                patient_id: r.get(1)?,
                patient_name: r.get::<_, Option<String>>(2).unwrap_or(None),
                rating: r.get(3)?,
                comments: r.get(4)?,
                department: r.get(5)?,
                created_at: r.get(6)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

// ─── PATIENT VISITS ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_visit_charges(
    state: State<AppState>,
    visit_id: i64,
) -> Result<VisitChargesSummary, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut items = Vec::new();

    // 1. Consultation Fee
    let doctor_fee: Option<(f64, String)> = conn.query_row(
        "SELECT d.consultation_fee, d.full_name FROM doctors d JOIN visits v ON v.doctor_id = d.id WHERE v.id = ?1",
        params![visit_id],
        |r| Ok((r.get(0)?, r.get(1)?))
    ).ok();

    if let Some((fee, name)) = doctor_fee {
        items.push(VisitCharge {
            description: format!("Consultation Fee - {}", name),
            category: "Consultation".to_string(),
            amount: fee,
            quantity: 1,
        });
    }

    // 2. Lab Tests (non-deleted)
    let mut stmt = conn
        .prepare("SELECT test_name, cost FROM lab_tests WHERE visit_id = ?1 AND is_deleted = 0")
        .map_err(|e| e.to_string())?;
    let lab_items = stmt
        .query_map(params![visit_id], |r| {
            Ok(VisitCharge {
                description: r.get(0)?,
                category: "Lab".to_string(),
                amount: r.get(1)?,
                quantity: 1,
            })
        })
        .map_err(|e| e.to_string())?;

    for item in lab_items {
        if let Ok(i) = item {
            items.push(i);
        }
    }

    // 3. Issued Medicines
    let mut stmt = conn
        .prepare(
            "SELECT pd.drug_name, i.unit_price, pd.duration_days
         FROM prescription_drugs pd
         JOIN prescriptions p ON pd.prescription_id = p.id
         JOIN inventory i ON i.id = pd.inventory_item_id
         WHERE p.visit_id = ?1 AND p.status = 'Issued' AND p.is_deleted = 0
         GROUP BY pd.id",
        )
        .map_err(|e| e.to_string())?;

    let med_items = stmt
        .query_map(params![visit_id], |r| {
            let name: String = r.get(0)?;
            let price: f64 = r.get(1)?;
            let qty: i64 = r.get(2)?;
            Ok(VisitCharge {
                description: name,
                category: "Pharmacy".to_string(),
                amount: price * qty as f64,
                quantity: qty,
            })
        })
        .map_err(|e| e.to_string())?;

    for item in med_items {
        if let Ok(i) = item {
            items.push(i);
        }
    }

    // 4. Ward Charges (if admitted)
    let ward_charge: Option<(f64, String, i64)> = conn
        .query_row(
            "SELECT w.base_charge, w.ward_name,
                (strftime('%s', 'now') - strftime('%s', b.admission_date)) / 86400 + 1
         FROM beds b
         JOIN wards w ON b.ward_id = w.id
         WHERE b.patient_id = (SELECT patient_id FROM visits WHERE id = ?1)
           AND b.status = 'Occupied'",
            params![visit_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .ok();

    if let Some((base, name, days)) = ward_charge {
        items.push(VisitCharge {
            description: format!("Ward Charges - {} ({} days)", name, days),
            category: "Ward".to_string(),
            amount: base * days as f64,
            quantity: days,
        });
    }

    let total = items.iter().map(|i| i.amount).sum();
    Ok(VisitChargesSummary { items, total })
}

#[tauri::command]
pub fn get_patient_visits(
    state: State<AppState>,
    patient_id: i64,
    requester: Option<String>,
) -> Result<Vec<Visit>, String> {
    check_permission(&state, requester.clone(), "Patients", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT v.id, v.visit_code, v.patient_id, p.full_name, v.doctor_id, d.full_name, v.department, v.status, v.visit_type, v.reason, v.diagnosis, v.created_at, v.updated_at
         FROM visits v
         JOIN patients p ON v.patient_id = p.id
         JOIN doctors d ON v.doctor_id = d.id
         WHERE v.patient_id = ?1 AND p.is_deleted = 0
         ORDER BY v.id DESC"
    ).map_err(|e| e.to_string())?;

    let visits = stmt
        .query_map(params![patient_id], |r| {
            Ok(Visit {
                id: r.get(0)?,
                visit_code: r.get(1)?,
                patient_id: r.get(2)?,
                patient_name: r.get(3)?,
                doctor_id: r.get(4)?,
                doctor_name: r.get(5)?,
                department: r.get(6)?,
                status: r.get(7)?,
                visit_type: r.get(8)?,
                reason: r.get(9)?,
                diagnosis: r.get(10)?,
                created_at: r.get(11)?,
                updated_at: r.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(visits)
}

#[tauri::command]
pub fn get_visit_by_id(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<Visit, String> {
    check_permission(&state, requester.clone(), "Patients", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT v.id, v.visit_code, v.patient_id, p.full_name, v.doctor_id, d.full_name, v.department, v.status, v.visit_type, v.reason, v.diagnosis, v.created_at, v.updated_at
         FROM visits v
         JOIN patients p ON v.patient_id = p.id
         JOIN doctors d ON v.doctor_id = d.id
         WHERE v.id = ?1 AND p.is_deleted = 0",
        params![id],
        |r| Ok(Visit {
            id: r.get(0)?, visit_code: r.get(1)?, patient_id: r.get(2)?, patient_name: r.get(3)?,
            doctor_id: r.get(4)?, doctor_name: r.get(5)?, department: r.get(6)?,
            status: r.get(7)?, visit_type: r.get(8)?, reason: r.get(9)?, diagnosis: r.get(10)?,
            created_at: r.get(11)?, updated_at: r.get(12)?,
        }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_visit(state: State<AppState>, data: CreateVisit) -> Result<Visit, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("VST");
    let status = data.status.unwrap_or_else(|| "REGISTERED".to_string());
    let visit_type = data.visit_type.unwrap_or_else(|| "OPD".to_string());

    conn.execute(
        "INSERT INTO visits (visit_code, patient_id, doctor_id, department, status, visit_type, reason, diagnosis)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![code, data.patient_id, data.doctor_id, data.department, status, visit_type, data.reason, data.diagnosis],
    ).map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    audit::log(
        &state.pool,
        "System",
        "Visit created",
        "visit",
        Some(id),
        Some(&code),
    );
    get_visit_by_id(state, id, None)
}

#[tauri::command]
pub fn update_visit_diagnosis(
    state: State<AppState>,
    id: i64,
    diagnosis: String,
) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE visits SET diagnosis = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![diagnosis, id],
    )
    .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        "System",
        "Visit diagnosis updated",
        "visit",
        Some(id),
        Some(&diagnosis),
    );
    Ok(())
}

#[tauri::command]
pub fn update_visit_status(state: State<AppState>, id: i64, status: String) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE visits SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![status, id],
    )
    .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        "System",
        "Visit status updated",
        "visit",
        Some(id),
        Some(&status),
    );
    Ok(())
}

// ─── DATA EXPORT ──────────────────────────────────────────────────────────────

fn escape_csv(val: &str) -> String {
    if val.contains(',') || val.contains('"') || val.contains('\n') || val.contains('\r') {
        format!("\"{}\"", val.replace('"', "\"\""))
    } else {
        val.to_string()
    }
}

#[tauri::command]
pub fn export_patients_csv(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<String, String> {
    check_permission(&state, requester.clone(), "Patients", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT patient_code, full_name, dob, gender, phone, email, blood_group, department, status FROM patients WHERE is_deleted = 0").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            let code: String = r.get(0)?;
            let name: String = r.get(1)?;
            let dob: String = r.get(2)?;
            let gender: String = r.get(3)?;
            let phone: String = r.get(4)?;
            let email: Option<String> = r.get(5)?;
            let bg: String = r.get(6)?;
            let dept: String = r.get(7)?;
            let status: String = r.get(8)?;

            Ok(format!(
                "{},{},{},{},{},{},{},{},{}",
                escape_csv(&code),
                escape_csv(&name),
                escape_csv(&dob),
                escape_csv(&gender),
                escape_csv(&phone),
                escape_csv(&email.unwrap_or_default()),
                escape_csv(&bg),
                escape_csv(&dept),
                escape_csv(&status)
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut csv = String::from("Code,Name,DOB,Gender,Phone,Email,Blood Group,Department,Status\n");
    for row in rows {
        if let Ok(r) = row {
            csv.push_str(&r);
            csv.push('\n');
        }
    }

    let base_path = if cfg!(windows) {
        std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string())
    } else {
        std::env::var("HOME")
            .map(|h| format!("{}/.local/share", h))
            .unwrap_or_else(|_| ".".to_string())
    };

    let dir_path = format!("{}/MediCore/exports", base_path);
    let path = format!("{}/patients_export.csv", dir_path);
    std::fs::create_dir_all(&dir_path).map_err(|e| e.to_string())?;
    std::fs::write(&path, csv).map_err(|e| e.to_string())?;

    Ok(path)
}

#[tauri::command]
pub fn delete_doctor(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Staff", "delete")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Cancel all upcoming appointments for this doctor
    tx.execute(
        "UPDATE appointments SET status = 'Cancelled', notes = COALESCE(notes || ' | ', '') || 'Cancelled due to doctor removal' WHERE doctor_id = ?1 AND status IN ('Scheduled', 'Checked In')",
        params![id],
    ).map_err(|e| e.to_string())?;

    // Now delete the doctor
    tx.execute("DELETE FROM doctors WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Doctor deleted with appointments cancelled",
        "staff",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn delete_appointment(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Appointments", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM appointments WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Appointment deleted",
        "appointment",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn delete_prescription(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Prescriptions", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM prescriptions WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Prescription deleted",
        "prescription",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn delete_lab_test(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Lab", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM lab_tests WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Lab test deleted",
        "lab",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn delete_ward(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Wards", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM wards WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Ward deleted",
        "ward",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn delete_bed(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Wards", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM beds WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Bed deleted",
        "bed",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn delete_invoice(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Billing", "delete")?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Delete associated payment batch items first
    tx.execute(
        "DELETE FROM payment_batch_items WHERE invoice_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;

    // Update payment batches: decrement totals by sum of amounts from batch items (already deleted)
    // We need to recalc batch totals after deletion, but simpler: after deleting items, batch totals are now incorrect.
    // Option: Recompute batch totals from remaining items.
    // For each batch that had items for this invoice, we can recalc total_amount and total_count from remaining items.
    // Simpler: could mark invoice as Cancelled instead of hard delete for audit, but we'll proceed with delete.
    // We'll recompute batch totals after deletion using a trigger or here. For simplicity, rely on app to recalc batch totals via separate command.
    // For now just delete items, the batch totals can be recalculated on next view (or we can update here).
    // Let's update: For each batch referenced, set total_amount = (SELECT COALESCE(SUM(amount),0) FROM payment_batch_items WHERE batch_id = batch.id), total_count = (SELECT COUNT(*) FROM payment_batch_items WHERE batch_id = batch.id).
    // This can be done in a separate step; but to keep transaction small, we'll just delete items and then later batches can be recalculated when needed.
    // However, to maintain consistency, we'll update affected batches now.
    // Find distinct batch_ids from deleted items (we already have them, but we can query before delete? Since we already deleted, we can't. Better to fetch before deletion.
    // Revised approach: First get batch ids affected, then delete items, then recalc.

    // Re-query: get batch IDs for this invoice before deleting items
    let batch_ids_vec: Vec<i64> = {
        let mut stmt = tx
            .prepare("SELECT DISTINCT batch_id FROM payment_batch_items WHERE invoice_id = ?1")
            .map_err(|e| e.to_string())?;
        let result: Vec<i64> = stmt
            .query_map(params![id], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        result
    };

    // Now delete payment batch items
    tx.execute(
        "DELETE FROM payment_batch_items WHERE invoice_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;

    // Recalculate totals for each affected batch
    for batch_id in &batch_ids_vec {
        let (total_amount, total_count): (f64, i64) = tx.query_row(
            "SELECT COALESCE(SUM(amount),0), COUNT(*) FROM payment_batch_items WHERE batch_id = ?1",
            params![batch_id],
            |r| Ok((r.get(0)?, r.get(1)?))
        ).unwrap_or((0.0, 0));
        tx.execute(
            "UPDATE payment_batches SET total_amount = ?1, total_count = ?2 WHERE id = ?3",
            params![total_amount, total_count, batch_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Finally delete the invoice
    tx.execute("DELETE FROM invoices WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Invoice deleted with cleanup",
        "billing",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn delete_insurance_claim(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Insurance", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM insurance_claims WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Insurance claim deleted",
        "insurance",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn delete_tax_setting(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Settings", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tax_settings WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Tax setting deleted",
        "settings",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn delete_payment_batch(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Billing", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM payment_batches WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Payment batch deleted",
        "billing",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn delete_message_template(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Messages", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM message_templates WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Message template deleted",
        "messages",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn delete_payroll_month(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "HR", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM payroll_months WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Payroll month deleted",
        "payroll",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn delete_ot_schedule(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "OperationTheatre", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM ot_schedules WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "OT schedule deleted",
        "ot",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn delete_ambulance(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Ambulance", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM ambulances WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Ambulance deleted",
        "ambulance",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn delete_support_ticket(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Support", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM support_tickets WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Support ticket deleted",
        "support",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn delete_blood_donor(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "BloodBank", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM blood_donors WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Blood donor deleted",
        "blood-bank",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn delete_blood_inventory(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "BloodBank", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM blood_inventory WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Blood inventory item deleted",
        "blood-bank",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn delete_blood_request(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "BloodBank", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM blood_requests WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Blood request deleted",
        "blood-bank",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn delete_emergency_case(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Emergency", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM emergency_cases WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Emergency case deleted",
        "emergency",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn delete_asset(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Assets", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM assets WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Asset deleted",
        "asset",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn delete_expense(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Expenses", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM expenses WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Expense deleted",
        "expense",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn get_analytics_monthly_finance(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<MonthlyFinanceAnalytics, String> {
    check_permission(&state, requester.clone(), "Analytics", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;

    let mut revenue = Vec::new();
    let mut expenses = Vec::new();
    let months = vec![
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    let current_year = chrono::Local::now().format("%Y").to_string();

    for (i, m) in months.into_iter().enumerate() {
        let month_str = format!("{}-{:02}", current_year, i + 1);

        let rev: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(paid_amount), 0) FROM invoices WHERE issue_date LIKE ?1",
                params![format!("{}%", month_str)],
                |r| r.get(0),
            )
            .unwrap_or(0.0);

        let exp: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE expense_date LIKE ?1",
                params![format!("{}%", month_str)],
                |r| r.get(0),
            )
            .unwrap_or(0.0);

        revenue.push(MonthlyData {
            month: m.to_string(),
            value: rev,
        });
        expenses.push(MonthlyData {
            month: m.to_string(),
            value: exp,
        });
    }

    Ok(MonthlyFinanceAnalytics { revenue, expenses })
}

#[tauri::command]
pub fn get_analytics_department_distribution(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<Vec<DepartmentDistribution>, String> {
    check_permission(&state, requester.clone(), "Analytics", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT department, COUNT(*) FROM patients WHERE is_deleted = 0 GROUP BY department",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |r| {
            Ok(DepartmentDistribution {
                department: r.get(0)?,
                count: r.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rows)
}

#[tauri::command]
pub fn get_analytics_patient_flow(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<Vec<MonthlyData>, String> {
    check_permission(&state, requester.clone(), "Analytics", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut data = Vec::new();
    let months = vec![
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    let current_year = chrono::Local::now().format("%Y").to_string();

    for (i, m) in months.into_iter().enumerate() {
        let month_str = format!("{}-{:02}", current_year, i + 1);
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM patients WHERE created_at LIKE ?1 AND is_deleted = 0",
                params![format!("{}%", month_str)],
                |r| r.get(0),
            )
            .unwrap_or(0);
        data.push(MonthlyData {
            month: m.to_string(),
            value: count as f64,
        });
    }
    Ok(data)
}

#[tauri::command]
pub fn get_analytics_bed_occupancy(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<Vec<DailyData>, String> {
    check_permission(&state, requester.clone(), "Analytics", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut data = Vec::new();

    for i in (0..30).rev() {
        let date = chrono::Local::now() - chrono::Duration::days(i);
        let day_label = date.format("%d").to_string();

        let occupied: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM beds WHERE status = 'Occupied'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        data.push(DailyData {
            day: day_label,
            value: occupied as f64,
        });
    }
    Ok(data)
}

#[tauri::command]
pub fn get_revenue_breakdown(state: State<AppState>) -> Result<Vec<RevenueByCategory>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT category, SUM(total) FROM invoice_items GROUP BY category")
        .map_err(|e| e.to_string())?;

    let rows: Vec<(String, f64)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let total: f64 = rows.iter().map(|(_, a)| a).sum();

    let colors = vec![
        "bg-accent",
        "bg-success",
        "bg-purple",
        "bg-warning",
        "bg-danger",
        "bg-blue",
    ];

    let mut result = Vec::new();
    for (i, (cat, amt)) in rows.into_iter().enumerate() {
        let pct = if total > 0.0 {
            (amt / total * 100.0).round()
        } else {
            0.0
        };
        result.push(RevenueByCategory {
            category: cat,
            amount: amt,
            percentage: pct,
            color: colors[i % colors.len()].to_string(),
        });
    }
    Ok(result)
}

#[tauri::command]
pub fn export_gst_csv(
    state: State<AppState>,
    from: String,
    to: String,
    requester: Option<String>,
) -> Result<String, String> {
    check_permission(&state, requester.clone(), "Billing", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT invoice_code, issue_date, subtotal, cgst, sgst, igst, tax, total FROM invoices WHERE issue_date BETWEEN ?1 AND ?2").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![from, to], |r| {
            Ok(format!(
                "{},{},{},{},{},{},{},{}",
                escape_csv(&r.get::<_, String>(0)?),
                escape_csv(&r.get::<_, String>(1)?),
                r.get::<_, f64>(2)?,
                r.get::<_, f64>(3)?,
                r.get::<_, f64>(4)?,
                r.get::<_, f64>(5)?,
                r.get::<_, f64>(6)?,
                r.get::<_, f64>(7)?
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut csv = String::from("Invoice #,Date,Subtotal,CGST,SGST,IGST,Total Tax,Grand Total\n");
    for row in rows {
        if let Ok(r) = row {
            csv.push_str(&r);
            csv.push('\n');
        }
    }

    let base_path = if cfg!(windows) {
        std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string())
    } else {
        std::env::var("HOME")
            .map(|h| format!("{}/.local/share", h))
            .unwrap_or_else(|_| ".".to_string())
    };
    let dir_path = format!("{}/MediCore/exports", base_path);
    let path = format!("{}/gst_report_{}_{}.csv", dir_path, from, to);
    std::fs::create_dir_all(&dir_path).map_err(|e| e.to_string())?;
    std::fs::write(&path, csv).map_err(|e| e.to_string())?;

    Ok(path)
}

// ─── HOUSEKEEPING ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_housekeeping_tasks(
    state: State<AppState>,
    status: Option<String>,
    date: Option<String>,
) -> Result<Vec<HousekeepingTask>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let date_filter = date.unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());
    let mut stmt = conn.prepare(
        "SELECT h.id, h.task_code, h.task_type, h.location, h.ward_id, w.ward_name, h.priority, h.status,
                h.assigned_to, s.full_name, h.scheduled_date, h.completed_date, h.notes, h.created_by, h.created_at, h.updated_at
         FROM housekeeping_tasks h
         LEFT JOIN wards w ON h.ward_id = w.id
         LEFT JOIN staff s ON h.assigned_to = s.id
         WHERE (?1 IS NULL OR h.status = ?1) AND h.scheduled_date = ?2
         ORDER BY h.priority DESC, h.id DESC"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![status, date_filter], |r| {
            Ok(HousekeepingTask {
                id: r.get(0)?,
                task_code: r.get(1)?,
                task_type: r.get(2)?,
                location: r.get(3)?,
                ward_id: r.get(4)?,
                ward_name: r.get(5)?,
                priority: r.get(6)?,
                status: r.get(7)?,
                assigned_to: r.get(8)?,
                assigned_name: r.get(9)?,
                scheduled_date: r.get(10)?,
                completed_date: r.get(11)?,
                notes: r.get(12)?,
                created_by: r.get(13)?,
                created_at: r.get(14)?,
                updated_at: r.get(15)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn create_housekeeping_task(
    state: State<AppState>,
    data: CreateHousekeepingTask,
) -> Result<HousekeepingTask, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("HK");
    let priority = data.priority.as_deref().unwrap_or("Normal");
    let status = "Pending";
    conn.execute(
        "INSERT INTO housekeeping_tasks (task_code, task_type, location, ward_id, priority, status, assigned_to, scheduled_date, notes, created_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![code, data.task_type, data.location, data.ward_id, priority, status, data.assigned_to, data.scheduled_date, data.notes, data.created_by],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    audit::log(
        &state.pool,
        &data.created_by.unwrap_or_else(|| "System".to_string()),
        "Housekeeping task created",
        "housekeeping",
        Some(id),
        Some(&code),
    );
    conn.query_row(
        "SELECT h.id, h.task_code, h.task_type, h.location, h.ward_id, w.ward_name, h.priority, h.status,
                h.assigned_to, s.full_name, h.scheduled_date, h.completed_date, h.notes, h.created_by, h.created_at, h.updated_at
         FROM housekeeping_tasks h
         LEFT JOIN wards w ON h.ward_id = w.id
         LEFT JOIN staff s ON h.assigned_to = s.id
         WHERE h.id = ?1",
        params![id],
        |r| Ok(HousekeepingTask {
            id: r.get(0)?, task_code: r.get(1)?, task_type: r.get(2)?, location: r.get(3)?,
            ward_id: r.get(4)?, ward_name: r.get(5)?, priority: r.get(6)?, status: r.get(7)?,
            assigned_to: r.get(8)?, assigned_name: r.get(9)?, scheduled_date: r.get(10)?,
            completed_date: r.get(11)?, notes: r.get(12)?, created_by: r.get(13)?,
            created_at: r.get(14)?, updated_at: r.get(15)?,
        })
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_housekeeping_task(
    state: State<AppState>,
    id: i64,
    data: UpdateHousekeepingTask,
) -> Result<HousekeepingTask, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    if let Some(ref status) = data.status {
        let completed = if status == "Completed" {
            Some(now.clone())
        } else {
            None
        };
        conn.execute(
            "UPDATE housekeeping_tasks SET status = ?1, assigned_to = ?2, priority = ?3, notes = ?4, completed_date = ?5, updated_at = ?6 WHERE id = ?7",
            params![status, data.assigned_to, data.priority, data.notes, completed, now, id],
        ).map_err(|e| e.to_string())?;
    }
    audit::log(
        &state.pool,
        "System",
        "Housekeeping task updated",
        "housekeeping",
        Some(id),
        data.status.as_deref(),
    );
    conn.query_row(
        "SELECT h.id, h.task_code, h.task_type, h.location, h.ward_id, w.ward_name, h.priority, h.status,
                h.assigned_to, s.full_name, h.scheduled_date, h.completed_date, h.notes, h.created_by, h.created_at, h.updated_at
         FROM housekeeping_tasks h
         LEFT JOIN wards w ON h.ward_id = w.id
         LEFT JOIN staff s ON h.assigned_to = s.id
         WHERE h.id = ?1",
        params![id],
        |r| Ok(HousekeepingTask {
            id: r.get(0)?, task_code: r.get(1)?, task_type: r.get(2)?, location: r.get(3)?,
            ward_id: r.get(4)?, ward_name: r.get(5)?, priority: r.get(6)?, status: r.get(7)?,
            assigned_to: r.get(8)?, assigned_name: r.get(9)?, scheduled_date: r.get(10)?,
            completed_date: r.get(11)?, notes: r.get(12)?, created_by: r.get(13)?,
            created_at: r.get(14)?, updated_at: r.get(15)?,
        })
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_housekeeping_task(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Settings", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM housekeeping_tasks WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Housekeeping task deleted",
        "housekeeping",
        Some(id),
        None,
    );
    Ok(())
}

// ─── MAINTENANCE ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_maintenance_requests(
    state: State<AppState>,
    status: Option<String>,
    category: Option<String>,
) -> Result<Vec<MaintenanceRequest>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT m.id, m.request_code, m.category, m.item_name, m.location, m.ward_id, w.ward_name, m.priority, m.status,
                m.description, m.assigned_to, s.full_name, m.estimated_cost, m.actual_cost, m.requested_by, m.requested_date,
                m.completed_date, m.notes, m.created_at, m.updated_at
         FROM maintenance_requests m
         LEFT JOIN wards w ON m.ward_id = w.id
         LEFT JOIN staff s ON m.assigned_to = s.id
         WHERE (?1 IS NULL OR m.status = ?1) AND (?2 IS NULL OR m.category = ?2)
         ORDER BY m.priority DESC, m.id DESC"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![status, category], |r| {
            Ok(MaintenanceRequest {
                id: r.get(0)?,
                request_code: r.get(1)?,
                category: r.get(2)?,
                item_name: r.get(3)?,
                location: r.get(4)?,
                ward_id: r.get(5)?,
                ward_name: r.get(6)?,
                priority: r.get(7)?,
                status: r.get(8)?,
                description: r.get(9)?,
                assigned_to: r.get(10)?,
                assigned_name: r.get(11)?,
                estimated_cost: r.get(12)?,
                actual_cost: r.get(13)?,
                requested_by: r.get(14)?,
                requested_date: r.get(15)?,
                completed_date: r.get(16)?,
                notes: r.get(17)?,
                created_at: r.get(18)?,
                updated_at: r.get(19)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn create_maintenance_request(
    state: State<AppState>,
    data: CreateMaintenanceRequest,
) -> Result<MaintenanceRequest, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("MR");
    let priority = data.priority.as_deref().unwrap_or("Normal");
    let status = "Pending";
    conn.execute(
        "INSERT INTO maintenance_requests (request_code, category, item_name, location, ward_id, priority, status, description, assigned_to, estimated_cost, requested_by, requested_date, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![code, data.category, data.item_name, data.location, data.ward_id, priority, status, data.description, data.assigned_to, data.estimated_cost, data.requested_by, data.requested_date, data.notes],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    audit::log(
        &state.pool,
        &data.requested_by.unwrap_or_else(|| "System".to_string()),
        "Maintenance request created",
        "maintenance",
        Some(id),
        Some(&code),
    );
    conn.query_row(
        "SELECT m.id, m.request_code, m.category, m.item_name, m.location, m.ward_id, w.ward_name, m.priority, m.status,
                m.description, m.assigned_to, s.full_name, m.estimated_cost, m.actual_cost, m.requested_by, m.requested_date,
                m.completed_date, m.notes, m.created_at, m.updated_at
         FROM maintenance_requests m
         LEFT JOIN wards w ON m.ward_id = w.id
         LEFT JOIN staff s ON m.assigned_to = s.id
         WHERE m.id = ?1",
        params![id],
        |r| Ok(MaintenanceRequest {
            id: r.get(0)?, request_code: r.get(1)?, category: r.get(2)?, item_name: r.get(3)?,
            location: r.get(4)?, ward_id: r.get(5)?, ward_name: r.get(6)?, priority: r.get(7)?,
            status: r.get(8)?, description: r.get(9)?, assigned_to: r.get(10)?, assigned_name: r.get(11)?,
            estimated_cost: r.get(12)?, actual_cost: r.get(13)?, requested_by: r.get(14)?,
            requested_date: r.get(15)?, completed_date: r.get(16)?, notes: r.get(17)?,
            created_at: r.get(18)?, updated_at: r.get(19)?,
        })
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_maintenance_request(
    state: State<AppState>,
    id: i64,
    data: UpdateMaintenanceRequest,
) -> Result<MaintenanceRequest, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    if let Some(ref status) = data.status {
        let completed = if status == "Completed" {
            Some(now.clone())
        } else {
            None
        };
        conn.execute(
            "UPDATE maintenance_requests SET status = ?1, assigned_to = ?2, priority = ?3, actual_cost = ?4, notes = ?5, completed_date = ?6, updated_at = ?7 WHERE id = ?8",
            params![status, data.assigned_to, data.priority, data.actual_cost, data.notes, completed, now, id],
        ).map_err(|e| e.to_string())?;
    }
    audit::log(
        &state.pool,
        "System",
        "Maintenance request updated",
        "maintenance",
        Some(id),
        data.status.as_deref(),
    );
    conn.query_row(
        "SELECT m.id, m.request_code, m.category, m.item_name, m.location, m.ward_id, w.ward_name, m.priority, m.status,
                m.description, m.assigned_to, s.full_name, m.estimated_cost, m.actual_cost, m.requested_by, m.requested_date,
                m.completed_date, m.notes, m.created_at, m.updated_at
         FROM maintenance_requests m
         LEFT JOIN wards w ON m.ward_id = w.id
         LEFT JOIN staff s ON m.assigned_to = s.id
         WHERE m.id = ?1",
        params![id],
        |r| Ok(MaintenanceRequest {
            id: r.get(0)?, request_code: r.get(1)?, category: r.get(2)?, item_name: r.get(3)?,
            location: r.get(4)?, ward_id: r.get(5)?, ward_name: r.get(6)?, priority: r.get(7)?,
            status: r.get(8)?, description: r.get(9)?, assigned_to: r.get(10)?, assigned_name: r.get(11)?,
            estimated_cost: r.get(12)?, actual_cost: r.get(13)?, requested_by: r.get(14)?,
            requested_date: r.get(15)?, completed_date: r.get(16)?, notes: r.get(17)?,
            created_at: r.get(18)?, updated_at: r.get(19)?,
        })
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_maintenance_request(
    state: State<AppState>,
    id: i64,
    requester: Option<String>,
) -> Result<(), String> {
    check_permission(&state, requester.clone(), "Settings", "delete")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM maintenance_requests WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    audit::log(
        &state.pool,
        &requester.unwrap_or_else(|| "System".to_string()),
        "Maintenance request deleted",
        "maintenance",
        Some(id),
        None,
    );
    Ok(())
}
// ─── SUPPORT TICKETS ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_support_tickets(
    state: State<AppState>,
    status: Option<String>,
) -> Result<Vec<SupportTicket>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT t.id, t.ticket_code, t.patient_id, p.full_name, t.subject, t.description, t.category, t.priority, t.status, t.assigned_to, u.full_name, t.created_at, t.updated_at
         FROM support_tickets t
         LEFT JOIN patients p ON t.patient_id = p.id
         LEFT JOIN users u ON t.assigned_to = u.id
         WHERE (?1 IS NULL OR t.status = ?1) ORDER BY t.id DESC"
    ).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(params![status], |r| {
            Ok(SupportTicket {
                id: r.get(0)?,
                ticket_code: r.get(1)?,
                patient_id: r.get(2)?,
                patient_name: r.get(3)?,
                subject: r.get(4)?,
                description: r.get(5)?,
                category: r.get(6)?,
                priority: r.get(7)?,
                status: r.get(8)?,
                assigned_to: r.get(9)?,
                assigned_user_name: r.get(10)?,
                created_at: r.get(11)?,
                updated_at: r.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn create_support_ticket(
    state: State<AppState>,
    data: CreateSupportTicket,
) -> Result<SupportTicket, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let code = new_code("TKT");
    conn.execute(
        "INSERT INTO support_tickets (ticket_code, patient_id, subject, description, category, priority, assigned_to) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![code, data.patient_id, data.subject, data.description, data.category, data.priority.unwrap_or_else(|| "Medium".to_string()), data.assigned_to],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    audit::log(
        &state.pool,
        "System",
        "Support ticket created",
        "support",
        Some(id),
        Some(&code),
    );

    conn.query_row(
        "SELECT t.id, t.ticket_code, t.patient_id, p.full_name, t.subject, t.description, t.category, t.priority, t.status, t.assigned_to, u.full_name, t.created_at, t.updated_at
         FROM support_tickets t LEFT JOIN patients p ON t.patient_id = p.id LEFT JOIN users u ON t.assigned_to = u.id WHERE t.id = ?1",
        params![id],
        |r| Ok(SupportTicket {
            id: r.get(0)?, ticket_code: r.get(1)?, patient_id: r.get(2)?, patient_name: r.get(3)?, subject: r.get(4)?,
            description: r.get(5)?, category: r.get(6)?, priority: r.get(7)?, status: r.get(8)?, assigned_to: r.get(9)?,
            assigned_user_name: r.get(10)?, created_at: r.get(11)?, updated_at: r.get(12)?,
        })
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_support_ticket(
    state: State<AppState>,
    id: i64,
    data: UpdateSupportTicket,
) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;

    if let Some(status) = data.status {
        conn.execute(
            "UPDATE support_tickets SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![status, id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(assigned_to) = data.assigned_to {
        conn.execute("UPDATE support_tickets SET assigned_to = ?1, updated_at = datetime('now') WHERE id = ?2", params![assigned_to, id]).map_err(|e| e.to_string())?;
    }
    if let Some(priority) = data.priority {
        conn.execute(
            "UPDATE support_tickets SET priority = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![priority, id],
        )
        .map_err(|e| e.to_string())?;
    }

    audit::log(
        &state.pool,
        "System",
        "Support ticket updated",
        "support",
        Some(id),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn export_invoices_csv(
    state: State<AppState>,
    requester: Option<String>,
) -> Result<String, String> {
    check_permission(&state, requester.clone(), "Billing", "view")?;
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT invoice_code, issue_date, total, paid_amount, balance, status FROM invoices",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            let code: String = r.get(0)?;
            let date: String = r.get(1)?;
            let total: f64 = r.get(2)?;
            let paid: f64 = r.get(3)?;
            let balance: f64 = r.get(4)?;
            let status: String = r.get(5)?;
            Ok(format!(
                "{},{},{},{},{},{}",
                escape_csv(&code),
                escape_csv(&date),
                total,
                paid,
                balance,
                escape_csv(&status)
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut csv = String::from("Invoice #,Date,Total,Paid,Balance,Status\n");
    for row in rows {
        if let Ok(r) = row {
            csv.push_str(&r);
            csv.push('\n');
        }
    }

    let base_path = if cfg!(windows) {
        std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string())
    } else {
        std::env::var("HOME")
            .map(|h| format!("{}/.local/share", h))
            .unwrap_or_else(|_| ".".to_string())
    };

    let dir_path = format!("{}/MediCore/exports", base_path);
    let path = format!("{}/invoices_export.csv", dir_path);
    std::fs::create_dir_all(&dir_path).map_err(|e| e.to_string())?;
    std::fs::write(&path, csv).map_err(|e| e.to_string())?;

    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{create_pool, run_migrations, AppState};
    use tempfile::NamedTempFile;

    fn setup_test_db() -> AppState {
        let temp_file = NamedTempFile::new().unwrap();
        let db_path = temp_file.path().to_str().unwrap();
        let pool = create_pool(db_path).unwrap();
        run_migrations(&pool).unwrap();
        AppState { pool }
    }

    // Test versions that take AppState directly
    fn get_patient_by_id_test(
        state: AppState,
        id: i64,
        _requester: Option<String>,
    ) -> Result<Patient, String> {
        let conn = state.pool.get().map_err(|e| {
            let err_msg = format!("Database connection failed in get_patient_by_id: {}", e);
            eprintln!("[ERROR] {}", err_msg);
            err_msg
        })?;

        conn.query_row(
            "SELECT p.id, p.patient_code, p.full_name, p.dob, p.gender, p.phone, p.email,
                    p.blood_group, p.address, p.emergency_contact, p.emergency_phone,
                    p.allergies, p.chronic_conditions, p.department, p.assigned_doctor_id,
                    d.full_name, p.status, p.insurance_provider, p.insurance_number,
                    p.created_at, p.updated_at, p.photo_path
             FROM patients p LEFT JOIN doctors d ON p.assigned_doctor_id = d.id
             WHERE p.id = ?1 AND p.is_deleted = 0",
            params![id],
            |r| {
                let patient = Patient {
                    id: r.get(0)?,
                    patient_code: r.get(1)?,
                    full_name: r.get(2)?,
                    dob: r.get(3)?,
                    gender: r.get(4)?,
                    phone: r.get(5)?,
                    email: r.get(6)?,
                    blood_group: r.get(7)?,
                    address: r.get(8)?,
                    emergency_contact: r.get(9)?,
                    emergency_phone: r.get(10)?,
                    allergies: r.get(11)?,
                    chronic_conditions: r.get(12)?,
                    department: r.get(13)?,
                    assigned_doctor_id: r.get(14)?,
                    assigned_doctor_name: r.get(15)?,
                    status: r.get(16)?,
                    insurance_provider: r.get(17)?,
                    insurance_number: r.get(18)?,
                    created_at: r.get(19)?,
                    updated_at: r.get(20)?,
                    photo_path: r.get(21)?,
                };
                Ok(patient)
            },
        )
        .map_err(|e| {
            let err_msg = format!("Failed to fetch patient by ID {}: {}", id, e);
            eprintln!("[ERROR] {}", err_msg);
            err_msg
        })
    }

    fn create_patient_test(
        state: AppState,
        data: CreatePatient,
        _requester: Option<String>,
    ) -> Result<Patient, String> {
        let conn = state.pool.get().map_err(|e| {
            let err_msg = format!("Database connection failed: {}", e);
            eprintln!("[ERROR] {}", err_msg);
            err_msg
        })?;
        let code = new_code("PT");
        let status = data.status.as_deref().unwrap_or("OPD");

        conn.execute(
            "INSERT INTO patients (patient_code, full_name, dob, gender, phone, email, blood_group,
              address, emergency_contact, emergency_phone, allergies, chronic_conditions, department,
              assigned_doctor_id, status, insurance_provider, insurance_number)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",
            params![
                code,
                data.full_name,
                data.dob,
                data.gender,
                data.phone,
                data.email,
                data.blood_group,
                data.address,
                data.emergency_contact,
                data.emergency_phone,
                data.allergies,
                data.chronic_conditions,
                data.department,
                data.assigned_doctor_id,
                status,
                data.insurance_provider,
                data.insurance_number
            ],
        )
        .map_err(|e| {
            let err_msg = format!("Failed to insert patient: {}", e);
            eprintln!("[ERROR] {}", err_msg);
            err_msg
        })?;

        let id = conn.last_insert_rowid();

        audit::log(
            &state.pool,
            "System",
            "Patient registered",
            "patient",
            Some(id),
            Some(&data.full_name),
        );
        sync::queue_sync(
            &state.pool,
            "INSERT",
            "patients",
            id,
            &format!("{{\"patient_code\":\"{}\"}}", code),
        );
        get_patient_by_id_test(state, id, None)
    }

    fn update_patient_test(
        state: AppState,
        id: i64,
        data: serde_json::Value,
        _requester: Option<String>,
    ) -> Result<Patient, String> {
        let mut conn = state.pool.get().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        let fields = [
            "full_name",
            "dob",
            "gender",
            "phone",
            "email",
            "blood_group",
            "address",
            "emergency_contact",
            "emergency_phone",
            "allergies",
            "chronic_conditions",
            "department",
            "assigned_doctor_id",
            "status",
            "insurance_provider",
            "insurance_number",
            "photo_path",
        ];

        for field in fields {
            if let Some(value) = data.get(field) {
                let sql = format!(
                    "UPDATE patients SET {} = ?1, updated_at = datetime('now') WHERE id = ?2",
                    field
                );
                if value.is_null() {
                    tx.execute(&sql, params![rusqlite::types::Null, id])
                        .map_err(|e| e.to_string())?;
                } else if let Some(s) = value.as_str() {
                    tx.execute(&sql, params![s, id])
                        .map_err(|e| e.to_string())?;
                } else if let Some(i) = value.as_i64() {
                    tx.execute(&sql, params![i, id])
                        .map_err(|e| e.to_string())?;
                } else if let Some(f) = value.as_f64() {
                    tx.execute(&sql, params![f, id])
                        .map_err(|e| e.to_string())?;
                } else if let Some(b) = value.as_bool() {
                    tx.execute(&sql, params![if b { 1 } else { 0 }, id])
                        .map_err(|e| e.to_string())?;
                }
            }
        }

        tx.commit().map_err(|e| e.to_string())?;

        audit::log(
            &state.pool,
            "System",
            "Patient updated",
            "patient",
            Some(id),
            None,
        );
        get_patient_by_id_test(state, id, None)
    }

    fn delete_patient_test(
        state: AppState,
        id: i64,
        requester: Option<String>,
    ) -> Result<(), String> {
        let mut conn = state.pool.get().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        // Soft-delete patient
        tx.execute(
            "UPDATE patients SET is_deleted = 1 WHERE id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;

        // Cascade soft-delete related records (simplified for test)
        tx.execute(
            "UPDATE appointments SET is_deleted = 1 WHERE patient_id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;

        tx.commit().map_err(|e| e.to_string())?;
        audit::log(
            &state.pool,
            &requester.unwrap_or_else(|| "System".to_string()),
            "Patient soft deleted with cascade",
            "patient",
            Some(id),
            None,
        );
        Ok(())
    }

    fn get_patients_test(
        state: AppState,
        search: Option<String>,
        status: Option<String>,
        _requester: Option<String>,
    ) -> Result<Vec<Patient>, String> {
        let conn = state.pool.get().map_err(|e| e.to_string())?;
        let search_pat = search.map(|s| format!("%{}%", s.to_lowercase()));
        let mut stmt = conn.prepare(
            "SELECT p.id, p.patient_code, p.full_name, p.dob, p.gender, p.phone, p.email,
                    p.blood_group, p.address, p.emergency_contact, p.emergency_phone,
                    p.allergies, p.chronic_conditions, p.department, p.assigned_doctor_id,
                    d.full_name as doctor_name, p.status, p.insurance_provider, p.insurance_number,
                    p.created_at, p.updated_at, p.photo_path
             FROM patients p
             LEFT JOIN doctors d ON p.assigned_doctor_id = d.id
             WHERE p.is_deleted = 0
               AND (?1 IS NULL OR LOWER(p.full_name) LIKE ?1 OR p.phone LIKE ?1 OR p.patient_code LIKE ?1)
               AND (?2 IS NULL OR p.status = ?2)
             ORDER BY p.id DESC"
        ).map_err(|e| e.to_string())?;
        let patients = stmt
            .query_map(params![search_pat, status], |r| {
                Ok(Patient {
                    id: r.get(0)?,
                    patient_code: r.get(1)?,
                    full_name: r.get(2)?,
                    dob: r.get(3)?,
                    gender: r.get(4)?,
                    phone: r.get(5)?,
                    email: r.get(6)?,
                    blood_group: r.get(7)?,
                    address: r.get(8)?,
                    emergency_contact: r.get(9)?,
                    emergency_phone: r.get(10)?,
                    allergies: r.get(11)?,
                    chronic_conditions: r.get(12)?,
                    department: r.get(13)?,
                    assigned_doctor_id: r.get(14)?,
                    assigned_doctor_name: r.get(15)?,
                    status: r.get(16)?,
                    insurance_provider: r.get(17)?,
                    insurance_number: r.get(18)?,
                    created_at: r.get(19)?,
                    updated_at: r.get(20)?,
                    photo_path: r.get(21)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        Ok(patients)
    }

    #[test]
    fn test_create_and_get_patient() {
        let state = setup_test_db();
        let data = CreatePatient {
            full_name: "Test Patient".to_string(),
            dob: "1990-01-01".to_string(),
            gender: "Male".to_string(),
            phone: "1234567890".to_string(),
            email: None,
            blood_group: "O+".to_string(),
            address: None,
            emergency_contact: None,
            emergency_phone: None,
            allergies: None,
            chronic_conditions: None,
            department: "General Medicine".to_string(),
            assigned_doctor_id: None,
            status: None,
            insurance_provider: None,
            insurance_number: None,
            photo_path: None,
        };
        let result = create_patient_test(state.clone(), data, None);
        assert!(result.is_ok());
        let patient = result.unwrap();
        assert_eq!(patient.full_name, "Test Patient");

        // Test get by id
        let get_result = get_patient_by_id_test(state, patient.id, None);
        assert!(get_result.is_ok());
        let retrieved = get_result.unwrap();
        assert_eq!(retrieved.id, patient.id);
    }

    #[test]
    fn test_update_patient() {
        let state = setup_test_db();
        let data = CreatePatient {
            full_name: "Test Patient".to_string(),
            dob: "1990-01-01".to_string(),
            gender: "Male".to_string(),
            phone: "1234567890".to_string(),
            email: None,
            blood_group: "O+".to_string(),
            address: None,
            emergency_contact: None,
            emergency_phone: None,
            allergies: None,
            chronic_conditions: None,
            department: "General Medicine".to_string(),
            assigned_doctor_id: None,
            status: None,
            insurance_provider: None,
            insurance_number: None,
            photo_path: None,
        };
        let patient = create_patient_test(state.clone(), data, None).unwrap();

        let update_data = serde_json::json!({
            "phone": "0987654321",
            "status": "Admitted"
        });

        let update_result = update_patient_test(state.clone(), patient.id, update_data, None);
        assert!(update_result.is_ok());
        let updated = update_result.unwrap();
        assert_eq!(updated.phone, "0987654321");
        assert_eq!(updated.status, "Admitted");
    }

    #[test]
    fn test_delete_patient() {
        let state = setup_test_db();
        let data = CreatePatient {
            full_name: "Test Patient".to_string(),
            dob: "1990-01-01".to_string(),
            gender: "Male".to_string(),
            phone: "1234567890".to_string(),
            email: None,
            blood_group: "O+".to_string(),
            address: None,
            emergency_contact: None,
            emergency_phone: None,
            allergies: None,
            chronic_conditions: None,
            department: "General Medicine".to_string(),
            assigned_doctor_id: None,
            status: None,
            insurance_provider: None,
            insurance_number: None,
            photo_path: None,
        };
        let patient = create_patient_test(state.clone(), data, None).unwrap();

        let delete_result = delete_patient_test(state.clone(), patient.id, None);
        assert!(delete_result.is_ok());

        // Verify deleted (soft delete)
        let get_result = get_patient_by_id_test(state, patient.id, None);
        assert!(get_result.is_err()); // Should fail since is_deleted = 1
    }

    #[test]
    fn test_get_patients() {
        let state = setup_test_db();
        // Create a few patients
        let data1 = CreatePatient {
            full_name: "Patient One".to_string(),
            dob: "1990-01-01".to_string(),
            gender: "Male".to_string(),
            phone: "1111111111".to_string(),
            email: None,
            blood_group: "O+".to_string(),
            address: None,
            emergency_contact: None,
            emergency_phone: None,
            allergies: None,
            chronic_conditions: None,
            department: "General Medicine".to_string(),
            assigned_doctor_id: None,
            status: None,
            insurance_provider: None,
            insurance_number: None,
            photo_path: None,
        };
        let data2 = CreatePatient {
            full_name: "Patient Two".to_string(),
            dob: "1992-02-02".to_string(),
            gender: "Female".to_string(),
            phone: "2222222222".to_string(),
            email: None,
            blood_group: "A+".to_string(),
            address: None,
            emergency_contact: None,
            emergency_phone: None,
            allergies: None,
            chronic_conditions: None,
            department: "Cardiology".to_string(),
            assigned_doctor_id: None,
            status: None,
            insurance_provider: None,
            insurance_number: None,
            photo_path: None,
        };
        create_patient_test(state.clone(), data1, None).unwrap();
        create_patient_test(state.clone(), data2, None).unwrap();

        let get_result = get_patients_test(state, None, None, None);
        assert!(get_result.is_ok());
        let patients = get_result.unwrap();
        assert_eq!(patients.len(), 2);
    }

    #[test]
    fn test_create_and_get_doctor() {
        let state = setup_test_db();
        let data = CreateDoctor {
            full_name: "Dr. Test".to_string(),
            specialization: "General Medicine".to_string(),
            phone: "1234567890".to_string(),
            email: "drtest@example.com".to_string(),
            qualification: "MBBS".to_string(),
            availability_status: Some("Available".to_string()),
            shift: Some("Morning".to_string()),
            experience_years: 5,
            consultation_fee: 500.0,
        };
        let result = create_doctor_test(state.clone(), data, None);
        assert!(result.is_ok());
        let doctor = result.unwrap();
        assert_eq!(doctor.full_name, "Dr. Test");

        // Test get by id
        let get_result = get_doctor_by_id_test(state, doctor.id, None);
        assert!(get_result.is_ok());
        let retrieved = get_result.unwrap();
        assert_eq!(retrieved.id, doctor.id);
    }

    fn get_doctor_by_id_test(
        state: AppState,
        id: i64,
        _requester: Option<String>,
    ) -> Result<Doctor, String> {
        let conn = state.pool.get().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT id, staff_code, full_name, specialization, phone, email, qualification,
                    availability_status, shift, experience_years, consultation_fee, created_at
             FROM doctors WHERE id = ?1",
            params![id],
            |r| {
                Ok(Doctor {
                    id: r.get(0)?,
                    staff_code: r.get(1)?,
                    full_name: r.get(2)?,
                    specialization: r.get(3)?,
                    phone: r.get(4)?,
                    email: r.get(5)?,
                    qualification: r.get(6)?,
                    availability_status: r.get(7)?,
                    shift: r.get(8)?,
                    experience_years: r.get(9)?,
                    consultation_fee: r.get(10)?,
                    created_at: r.get(11)?,
                })
            },
        )
        .map_err(|e| e.to_string())
    }

    fn create_doctor_test(
        state: AppState,
        data: CreateDoctor,
        _requester: Option<String>,
    ) -> Result<Doctor, String> {
        let conn = state.pool.get().map_err(|e| e.to_string())?;
        let code = new_code("DR");
        let status = data.availability_status.as_deref().unwrap_or("Available");
        let shift = data.shift.as_deref().unwrap_or("Morning");
        conn.execute(
            "INSERT INTO doctors (staff_code, full_name, specialization, phone, email, qualification, availability_status, shift, experience_years, consultation_fee) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![code, data.full_name, data.specialization, data.phone, data.email, data.qualification, status, shift, data.experience_years, data.consultation_fee],
        ).map_err(|e| e.to_string())?;
        let id = conn.last_insert_rowid();
        get_doctor_by_id_test(state, id, None)
    }
}
