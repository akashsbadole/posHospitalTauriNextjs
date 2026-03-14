// src-tauri/src/db.rs
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::params;
use anyhow::Result;

pub type DbPool = Pool<SqliteConnectionManager>;

pub struct AppState {
    pub pool: DbPool,
}

pub fn create_pool(db_path: &str) -> Result<DbPool> {
    let manager = SqliteConnectionManager::file(db_path)
        .with_init(|conn| {
            conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL;")?;
            Ok(())
        });
    let pool = Pool::builder()
        .max_size(10)
        .build(manager)?;
    Ok(pool)
}

pub fn run_migrations(pool: &DbPool) -> Result<()> {
    let conn = pool.get()?;
    conn.execute_batch(SCHEMA)?;
    Ok(())
}

const SCHEMA: &str = "
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
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
CREATE INDEX IF NOT EXISTS idx_patients_phone  ON patients(phone);
CREATE INDEX IF NOT EXISTS idx_patients_code   ON patients(patient_code);

-- ─────────────────────────────────────────
-- DOCTORS
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
";
