// src-tauri/src/db.rs
use anyhow::Result;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::params;

pub type DbPool = Pool<SqliteConnectionManager>;

pub struct AppState {
    pub pool: DbPool,
}

pub fn create_pool(db_path: &str) -> Result<DbPool> {
    let manager = SqliteConnectionManager::file(db_path).with_init(|conn| {
        conn.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;",
        )?;
        Ok(())
    });
    let pool = Pool::builder().max_size(10).build(manager)?;
    Ok(pool)
}

pub fn run_migrations(pool: &DbPool) -> Result<()> {
    let conn = pool.get()?;
    conn.execute_batch(SCHEMA)?;
    run_gst_migrations(&conn)?;
    seed_data(&conn)?;
    Ok(())
}

fn column_exists(conn: &rusqlite::Connection, table: &str, column: &str) -> Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info(?1) WHERE name = ?2",
        params![table, column],
        |r| r.get(0),
    )?;
    Ok(count > 0)
}

fn run_gst_migrations(conn: &rusqlite::Connection) -> Result<()> {
    let columns = ["cgst", "sgst", "igst", "tax_type", "vat_amount", "hsn_code"];
    for col in columns {
        if !column_exists(conn, "invoices", col)? {
            let sql = if col == "tax_type" || col == "hsn_code" {
                format!("ALTER TABLE invoices ADD COLUMN {} TEXT", col)
            } else {
                format!("ALTER TABLE invoices ADD COLUMN {} REAL DEFAULT 0", col)
            };
            conn.execute(&sql, [])?;
        }
    }
    
    // Add photo_path column to patients table if it doesn't exist
    if !column_exists(conn, "patients", "photo_path")? {
        eprintln!("[MIGRATION] Adding photo_path column to patients table");
        conn.execute("ALTER TABLE patients ADD COLUMN photo_path TEXT", [])?;
    }
    
    Ok(())
}

fn seed_data(conn: &rusqlite::Connection) -> Result<()> {
    use rusqlite::params;

    let count: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))?;
    if count > 0 {
        return Ok(());
    }

    let admin_hash = bcrypt::hash("admin123", 10)?;
    let doctor_hash = bcrypt::hash("doctor123", 10)?;
    let nurse_hash = bcrypt::hash("nurse123", 10)?;
    let reception_hash = bcrypt::hash("reception123", 10)?;
    let pharma_hash = bcrypt::hash("pharma123", 10)?;
    let account_hash = bcrypt::hash("account123", 10)?;

    conn.execute("INSERT INTO users (username, password_hash, role, full_name, department) VALUES (?1, ?2, ?3, ?4, ?5)",
        params!["admin", admin_hash, "Admin", "Administrator", "Administration"])?;
    conn.execute("INSERT INTO users (username, password_hash, role, full_name, department) VALUES (?1, ?2, ?3, ?4, ?5)",
        params!["doctor", doctor_hash, "Doctor", "Dr. Smith", "General Medicine"])?;
    conn.execute("INSERT INTO users (username, password_hash, role, full_name, department) VALUES (?1, ?2, ?3, ?4, ?5)",
        params!["nurse", nurse_hash, "Nurse", "Nurse Johnson", "General Medicine"])?;
    conn.execute("INSERT INTO users (username, password_hash, role, full_name, department) VALUES (?1, ?2, ?3, ?4, ?5)",
        params!["reception", reception_hash, "Receptionist", "Reception Desk", "Front Office"])?;
    conn.execute("INSERT INTO users (username, password_hash, role, full_name, department) VALUES (?1, ?2, ?3, ?4, ?5)",
        params!["pharmacist", pharma_hash, "Pharmacist", "Pharma Store", "Pharmacy"])?;
    conn.execute("INSERT INTO users (username, password_hash, role, full_name, department) VALUES (?1, ?2, ?3, ?4, ?5)",
        params!["accountant", account_hash, "Accountant", "Accounts Dept", "Finance"])?;

    conn.execute("INSERT INTO doctors (staff_code, full_name, specialization, phone, email, qualification, availability_status, shift, experience_years, consultation_fee) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params!["DR-001", "Dr. Smith", "General Medicine", "+91 9876543210", "dr.smith@medicore.com", "MBBS MD", "Available", "Morning", 10, 500])?;
    conn.execute("INSERT INTO doctors (staff_code, full_name, specialization, phone, email, qualification, availability_status, shift, experience_years, consultation_fee) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params!["DR-002", "Dr. Sarah", "Cardiology", "+91 9876543211", "dr.sarah@medicore.com", "MBBS DM", "Available", "Morning", 15, 800])?;
    conn.execute("INSERT INTO doctors (staff_code, full_name, specialization, phone, email, qualification, availability_status, shift, experience_years, consultation_fee) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params!["DR-003", "Dr. Raj", "Orthopedics", "+91 9876543212", "dr.raj@medicore.com", "MBBS MS", "Available", "Evening", 8, 600])?;

    Ok(())
}

const SCHEMA: &str = "
-- ─────────────────────────────────────────
-- DOCTORS (must be before patients due to FK)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doctors (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_code          TEXT NOT NULL UNIQUE,
    full_name           TEXT NOT NULL,
    specialization      TEXT NOT NULL,
    phone               TEXT NOT NULL,
    email               TEXT NOT NULL,
    qualification       TEXT NOT NULL,
    availability_status TEXT NOT NULL DEFAULT 'Available',
    shift               TEXT NOT NULL DEFAULT 'Morning',
    experience_years    INTEGER NOT NULL DEFAULT 0,
    consultation_fee    REAL NOT NULL DEFAULT 500,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────
-- PATIENTS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_code        TEXT NOT NULL UNIQUE,
    full_name           TEXT NOT NULL,
    dob                 TEXT NOT NULL,
    gender              TEXT NOT NULL CHECK(gender IN ('Male','Female','Other')),
    phone               TEXT NOT NULL,
    email               TEXT,
    blood_group         TEXT NOT NULL,
    address             TEXT,
    emergency_contact   TEXT,
    emergency_phone     TEXT,
    allergies           TEXT,
    chronic_conditions  TEXT,
    department          TEXT NOT NULL,
    assigned_doctor_id  INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
    status              TEXT NOT NULL DEFAULT 'OPD',
    insurance_provider  TEXT,
    insurance_number    TEXT,
    photo_path          TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
CREATE INDEX IF NOT EXISTS idx_patients_phone  ON patients(phone);
CREATE INDEX IF NOT EXISTS idx_patients_code   ON patients(patient_code);

-- ─────────────────────────────────────────
-- STAFF
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_code  TEXT NOT NULL UNIQUE,
    full_name   TEXT NOT NULL,
    role        TEXT NOT NULL,
    department  TEXT NOT NULL,
    phone       TEXT NOT NULL,
    email       TEXT NOT NULL,
    shift       TEXT NOT NULL DEFAULT 'Morning',
    status      TEXT NOT NULL DEFAULT 'Active',
    join_date   TEXT NOT NULL,
    salary      REAL
);

-- ─────────────────────────────────────────
-- APPOINTMENTS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_code    TEXT NOT NULL UNIQUE,
    patient_id          INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id           INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    department          TEXT NOT NULL,
    appointment_date    TEXT NOT NULL,
    appointment_time    TEXT NOT NULL,
    type                TEXT NOT NULL DEFAULT 'General Checkup',
    status              TEXT NOT NULL DEFAULT 'Scheduled',
    notes               TEXT,
    follow_up_date      TEXT,
    is_video_consultation INTEGER NOT NULL DEFAULT 0,
    video_link          TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_appt_date   ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appt_doctor ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appt_patient ON appointments(patient_id);

-- ─────────────────────────────────────────
-- PRESCRIPTIONS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prescriptions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    rx_code     TEXT NOT NULL UNIQUE,
    patient_id  INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id   INTEGER NOT NULL REFERENCES doctors(id),
    issue_date  TEXT NOT NULL,
    valid_until TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'Active',
    diagnosis   TEXT,
    notes       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prescription_drugs (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    prescription_id     INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    drug_name           TEXT NOT NULL,
    dosage              TEXT NOT NULL,
    frequency           TEXT NOT NULL,
    duration_days       INTEGER NOT NULL DEFAULT 7,
    route               TEXT NOT NULL DEFAULT 'Oral',
    instructions        TEXT,
    refills_remaining   INTEGER NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────
-- LAB TESTS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lab_tests (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    lab_code        TEXT NOT NULL UNIQUE,
    patient_id      INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id       INTEGER NOT NULL REFERENCES doctors(id),
    test_name       TEXT NOT NULL,
    test_category   TEXT NOT NULL,
    ordered_date    TEXT NOT NULL,
    result_date     TEXT,
    status          TEXT NOT NULL DEFAULT 'Ordered',
    result_value    TEXT,
    result_unit     TEXT,
    reference_range TEXT,
    is_abnormal     INTEGER NOT NULL DEFAULT 0,
    notes           TEXT,
    report_path     TEXT
);

CREATE INDEX IF NOT EXISTS idx_lab_status  ON lab_tests(status);
CREATE INDEX IF NOT EXISTS idx_lab_patient ON lab_tests(patient_id);

-- ─────────────────────────────────────────
-- WARDS & BEDS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wards (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ward_name   TEXT NOT NULL,
    ward_code   TEXT NOT NULL UNIQUE,
    ward_type   TEXT NOT NULL DEFAULT 'General',
    total_beds  INTEGER NOT NULL DEFAULT 0,
    department  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS beds (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ward_id             INTEGER NOT NULL REFERENCES wards(id) ON DELETE CASCADE,
    bed_number          TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'Available',
    patient_id          INTEGER REFERENCES patients(id) ON DELETE SET NULL,
    admission_date      TEXT,
    expected_discharge  TEXT,
    notes               TEXT,
    UNIQUE(ward_id, bed_number)
);

-- ─────────────────────────────────────────
-- INVOICES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_code        TEXT NOT NULL UNIQUE,
    patient_id          INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    issue_date          TEXT NOT NULL,
    due_date            TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'Pending',
    subtotal            REAL NOT NULL DEFAULT 0,
    discount            REAL NOT NULL DEFAULT 0,
    tax                 REAL NOT NULL DEFAULT 0,
    total               REAL NOT NULL DEFAULT 0,
    paid_amount         REAL NOT NULL DEFAULT 0,
    balance             REAL NOT NULL DEFAULT 0,
    payment_method      TEXT,
    insurance_claim_id  INTEGER,
    notes               TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoice_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id  INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    category    TEXT NOT NULL,
    quantity    INTEGER NOT NULL DEFAULT 1,
    unit_price  REAL NOT NULL,
    total       REAL NOT NULL
);

-- ─────────────────────────────────────────
-- INSURANCE CLAIMS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS insurance_claims (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_code      TEXT NOT NULL UNIQUE,
    patient_id      INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    invoice_id      INTEGER NOT NULL REFERENCES invoices(id),
    provider_name   TEXT NOT NULL,
    policy_number   TEXT NOT NULL,
    claim_amount    REAL NOT NULL,
    approved_amount REAL,
    status          TEXT NOT NULL DEFAULT 'Draft',
    submitted_date  TEXT,
    resolved_date   TEXT,
    notes           TEXT
);

-- ─────────────────────────────────────────
-- INVENTORY
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    item_code       TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    category        TEXT NOT NULL,
    current_stock   INTEGER NOT NULL DEFAULT 0,
    min_threshold   INTEGER NOT NULL DEFAULT 10,
    max_capacity    INTEGER NOT NULL DEFAULT 500,
    unit            TEXT NOT NULL DEFAULT 'pcs',
    unit_price      REAL NOT NULL DEFAULT 0,
    supplier        TEXT,
    expiry_date     TEXT,
    location        TEXT,
    last_restocked  TEXT
);

-- ─────────────────────────────────────────
-- VITAL SIGNS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vital_signs (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id          INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    recorded_by         TEXT NOT NULL,
    recorded_at         TEXT NOT NULL DEFAULT (datetime('now')),
    blood_pressure_sys  INTEGER,
    blood_pressure_dia  INTEGER,
    heart_rate          INTEGER,
    temperature         REAL,
    spo2                INTEGER,
    respiratory_rate    INTEGER,
    weight_kg           REAL,
    height_cm           REAL,
    notes               TEXT
);

-- ─────────────────────────────────────────
-- AUDIT LOGS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name   TEXT NOT NULL DEFAULT 'System',
    action      TEXT NOT NULL,
    entity      TEXT NOT NULL,
    entity_id   INTEGER,
    details     TEXT,
    ip_address  TEXT,
    timestamp   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_entity    ON audit_logs(entity);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);

-- ─────────────────────────────────────────
-- SYNC QUEUE
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_queue (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    operation   TEXT NOT NULL,
    table_name  TEXT NOT NULL,
    record_id   INTEGER NOT NULL,
    payload     TEXT NOT NULL,
    synced      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────
-- SETTINGS (Key-Value Store)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────
-- USERS (Security & Auth)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'Receptionist',
    full_name       TEXT NOT NULL,
    department      TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    last_login      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────
-- TAX SETTINGS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_settings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tax_name        TEXT NOT NULL,
    tax_type        TEXT NOT NULL DEFAULT 'GST',
    rate            REAL NOT NULL DEFAULT 0,
    cgst_rate       REAL DEFAULT 0,
    sgst_rate       REAL DEFAULT 0,
    igst_rate       REAL DEFAULT 0,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────
-- REVENUE CYCLE - PAYMENT BATCHES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_batches (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_code      TEXT NOT NULL UNIQUE,
    batch_date      TEXT NOT NULL,
    total_amount    REAL NOT NULL DEFAULT 0,
    total_count     INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'Pending',
    created_by      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payment_batch_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id        INTEGER NOT NULL REFERENCES payment_batches(id) ON DELETE CASCADE,
    invoice_id      INTEGER NOT NULL REFERENCES invoices(id),
    amount          REAL NOT NULL,
    payment_method  TEXT NOT NULL,
    reference_no    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────
-- WHATSAPP & SMS INTEGRATION
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_templates (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    template_name   TEXT NOT NULL,
    message_type    TEXT NOT NULL CHECK(message_type IN ('SMS','WhatsApp','Both')),
    template_body   TEXT NOT NULL,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS message_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id      INTEGER REFERENCES patients(id) ON DELETE SET NULL,
    phone           TEXT NOT NULL,
    message_type    TEXT NOT NULL,
    template_name   TEXT,
    message_body    TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'Pending',
    sent_at         TEXT,
    error_message   TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sms_settings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    provider        TEXT NOT NULL DEFAULT 'Twilio',
    api_key         TEXT,
    api_secret      TEXT,
    sender_id       TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────
-- PAYROLL & HR
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_code   TEXT NOT NULL UNIQUE,
    staff_id        INTEGER REFERENCES staff(id) ON DELETE SET NULL,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    email           TEXT NOT NULL,
    phone           TEXT NOT NULL,
    department      TEXT NOT NULL,
    designation     TEXT NOT NULL,
    employee_type   TEXT NOT NULL DEFAULT 'Full-time',
    date_of_join    TEXT NOT NULL,
    date_of_birth   TEXT,
    gender          TEXT,
    address         TEXT,
    bank_name       TEXT,
    bank_account    TEXT,
    ifsc_code       TEXT,
    pan_number      TEXT,
    aadhar_number   TEXT,
    basic_salary    REAL NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'Active',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payroll_months (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    month_year      TEXT NOT NULL UNIQUE,
    start_date      TEXT NOT NULL,
    end_date        TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'Open',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payroll_entries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    payroll_month_id INTEGER NOT NULL REFERENCES payroll_months(id),
    employee_id     INTEGER NOT NULL REFERENCES employees(id),
    basic_salary    REAL NOT NULL,
    allowances      REAL NOT NULL DEFAULT 0,
    deductions      REAL NOT NULL DEFAULT 0,
    net_salary      REAL NOT NULL,
    status          TEXT NOT NULL DEFAULT 'Calculated',
    processed_at    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leave_requests (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id     INTEGER NOT NULL REFERENCES employees(id),
    leave_type      TEXT NOT NULL,
    start_date      TEXT NOT NULL,
    end_date        TEXT NOT NULL,
    total_days      REAL NOT NULL,
    reason          TEXT,
    status          TEXT NOT NULL DEFAULT 'Pending',
    approved_by     TEXT,
    approved_at     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendance (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id     INTEGER NOT NULL REFERENCES employees(id),
    attendance_date TEXT NOT NULL,
    check_in        TEXT,
    check_out       TEXT,
    work_hours      REAL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'Present',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(employee_id, attendance_date)
);

-- ─────────────────────────────────────────
-- ASSET MANAGEMENT
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_categories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    category_name   TEXT NOT NULL,
    depreciation_rate REAL NOT NULL DEFAULT 10,
    description     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_code      TEXT NOT NULL UNIQUE,
    asset_name      TEXT NOT NULL,
    category_id     INTEGER NOT NULL REFERENCES asset_categories(id),
    purchase_date   TEXT NOT NULL,
    purchase_cost   REAL NOT NULL,
    current_value   REAL NOT NULL,
    warranty_expiry TEXT,
    location        TEXT,
    assigned_to     INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'Active',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS asset_maintenance (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id        INTEGER NOT NULL REFERENCES assets(id),
    maintenance_type TEXT NOT NULL,
    description     TEXT NOT NULL,
    maintenance_date TEXT NOT NULL,
    cost            REAL NOT NULL DEFAULT 0,
    vendor          TEXT,
    next_due_date   TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────
-- OPD QUEUE MANAGEMENT
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS opd_tokens (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    token_number    INTEGER NOT NULL,
    patient_id      INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id       INTEGER NOT NULL REFERENCES doctors(id),
    department      TEXT NOT NULL,
    queue_date      TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'Waiting',
    wait_time       INTEGER DEFAULT 0,
    called_at       TEXT,
    started_at      TEXT,
    completed_at    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS opd_queue_settings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    department      TEXT NOT NULL UNIQUE,
    token_prefix    TEXT NOT NULL DEFAULT 'TKN',
    start_time      TEXT NOT NULL DEFAULT '09:00',
    end_time        TEXT NOT NULL DEFAULT '17:00',
    max_tokens_per_day INTEGER NOT NULL DEFAULT 50,
    avg_consultation_minutes INTEGER NOT NULL DEFAULT 15,
    is_active       INTEGER NOT NULL DEFAULT 1,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────
-- DISCHARGE SUMMARY
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discharge_summaries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    summary_code    TEXT NOT NULL UNIQUE,
    patient_id      INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    admission_date  TEXT NOT NULL,
    discharge_date  TEXT NOT NULL,
    discharge_type  TEXT NOT NULL DEFAULT 'Regular',
    diagnosis       TEXT NOT NULL,
    procedure_done  TEXT,
    history_present_illness TEXT,
    examination_findings TEXT,
    investigations  TEXT,
    treatment_given TEXT,
    advice_on_discharge TEXT,
    follow_up_date  TEXT,
    created_by      INTEGER NOT NULL REFERENCES doctors(id),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS discharge_medications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    discharge_summary_id INTEGER NOT NULL REFERENCES discharge_summaries(id) ON DELETE CASCADE,
    medication      TEXT NOT NULL,
    dosage           TEXT NOT NULL,
    duration        TEXT NOT NULL,
    instructions    TEXT
);

-- ─────────────────────────────────────────
-- OPERATION THEATRE
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ot_schedules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    surgery_code    TEXT NOT NULL UNIQUE,
    patient_id      INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    surgeon_id      INTEGER NOT NULL REFERENCES doctors(id),
    anesthesiologist_id INTEGER REFERENCES doctors(id),
    ot_theatre_id  INTEGER NOT NULL,
    surgery_type   TEXT NOT NULL,
    surgery_date   TEXT NOT NULL,
    start_time     TEXT NOT NULL,
    end_time       TEXT,
    status         TEXT NOT NULL DEFAULT 'Scheduled',
    priority       TEXT NOT NULL DEFAULT 'Elective',
    anesthesia_type TEXT,
    notes          TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ot_theatres (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    theatre_name    TEXT NOT NULL,
    theatre_code    TEXT NOT NULL UNIQUE,
    location       TEXT,
    is_operational  INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────
-- EMERGENCY / ER
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emergency_cases (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    case_code       TEXT NOT NULL UNIQUE,
    patient_id      INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    patient_name    TEXT NOT NULL,
    patient_phone   TEXT,
    arrival_time    TEXT NOT NULL,
    triage_level    TEXT NOT NULL CHECK(triage_level IN ('Red','Orange','Yellow','Green')),
    chief_complaint TEXT NOT NULL,
    vital_signs     TEXT,
    treatment_given TEXT,
    status         TEXT NOT NULL DEFAULT 'Under Observation',
    outcome         TEXT,
    admitted_to     INTEGER REFERENCES wards(id),
    discharged_at   TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────
-- BLOOD BANK
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blood_donors (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    donor_code      TEXT NOT NULL UNIQUE,
    full_name       TEXT NOT NULL,
    dob             TEXT,
    gender          TEXT,
    phone           TEXT NOT NULL,
    email           TEXT,
    blood_group     TEXT NOT NULL,
    last_donation   TEXT,
    donation_count  INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'Active',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS blood_inventory (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    bag_number      TEXT NOT NULL UNIQUE,
    blood_group     TEXT NOT NULL,
    component       TEXT NOT NULL DEFAULT 'Whole Blood',
    units           INTEGER NOT NULL DEFAULT 1,
    collection_date TEXT NOT NULL,
    expiry_date     TEXT NOT NULL,
    donor_id        INTEGER REFERENCES blood_donors(id),
    status          TEXT NOT NULL DEFAULT 'Available',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS blood_requests (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    request_code    TEXT NOT NULL UNIQUE,
    patient_id      INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    blood_group     TEXT NOT NULL,
    units_required  INTEGER NOT NULL,
    units_issued    INTEGER NOT NULL DEFAULT 0,
    urgency         TEXT NOT NULL DEFAULT 'Normal',
    status          TEXT NOT NULL DEFAULT 'Pending',
    approved_by     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────
-- AMBULANCE
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ambulances (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ambulance_number TEXT NOT NULL UNIQUE,
    vehicle_type    TEXT NOT NULL DEFAULT 'ALS',
    license_number  TEXT NOT NULL,
    insurance_expiry TEXT,
    last_service    TEXT,
    status          TEXT NOT NULL DEFAULT 'Available',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ambulance_calls (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    call_code       TEXT NOT NULL UNIQUE,
    patient_id      INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    patient_name    TEXT NOT NULL,
    patient_phone   TEXT NOT NULL,
    pickup_address  TEXT NOT NULL,
    destination    TEXT,
    ambulance_id    INTEGER REFERENCES ambulances(id),
    driver_name     TEXT,
    call_time       TEXT NOT NULL,
    pickup_time     TEXT,
    arrival_time    TEXT,
    drop_time       TEXT,
    status          TEXT NOT NULL DEFAULT 'Dispatched',
    notes           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────
-- EXPENSE MANAGEMENT
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_categories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    category_name   TEXT NOT NULL UNIQUE,
    description     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_code    TEXT NOT NULL UNIQUE,
    category_id     INTEGER NOT NULL REFERENCES expense_categories(id),
    amount          REAL NOT NULL,
    expense_date    TEXT NOT NULL,
    description     TEXT NOT NULL,
    vendor          TEXT,
    payment_method  TEXT,
    receipt_number  TEXT,
    approved_by     TEXT,
    status          TEXT NOT NULL DEFAULT 'Pending',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────
-- NOTIFICATIONS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    message         TEXT NOT NULL,
    notification_type TEXT NOT NULL DEFAULT 'General',
    target_role     TEXT,
    is_read         INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────
-- ROLE-BASED ACCESS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    role            TEXT NOT NULL,
    module          TEXT NOT NULL,
    can_view        INTEGER NOT NULL DEFAULT 1,
    can_create      INTEGER NOT NULL DEFAULT 0,
    can_edit        INTEGER NOT NULL DEFAULT 0,
    can_delete      INTEGER NOT NULL DEFAULT 0,
    UNIQUE(role, module)
);
";
