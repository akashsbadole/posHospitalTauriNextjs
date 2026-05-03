// src-tauri/src/db.rs
use anyhow::Result;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::params;

pub type DbPool = Pool<SqliteConnectionManager>;

#[derive(Clone)]
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
    let invoice_cols = ["cgst", "sgst", "igst", "tax_type", "vat_amount"];
    for col in invoice_cols {
        if !column_exists(conn, "invoices", col)? {
            let sql = if col == "tax_type" {
                format!("ALTER TABLE invoices ADD COLUMN {} TEXT", col)
            } else {
                format!("ALTER TABLE invoices ADD COLUMN {} REAL DEFAULT 0", col)
            };
            conn.execute(&sql, [])?;
        }
    }

    if !column_exists(conn, "invoice_items", "hsn_code")? {
        conn.execute("ALTER TABLE invoice_items ADD COLUMN hsn_code TEXT", [])?;
    }

    if !column_exists(conn, "message_logs", "email")? {
        conn.execute("ALTER TABLE message_logs ADD COLUMN email TEXT", [])?;
    }

    // Add visit_type and diagnosis to visits table
    if !column_exists(conn, "visits", "visit_type")? {
        eprintln!("[MIGRATION] Adding visit_type column to visits table");
        conn.execute(
            "ALTER TABLE visits ADD COLUMN visit_type TEXT DEFAULT 'OPD'",
            [],
        )?;
    }
    if !column_exists(conn, "visits", "diagnosis")? {
        eprintln!("[MIGRATION] Adding diagnosis column to visits table");
        conn.execute("ALTER TABLE visits ADD COLUMN diagnosis TEXT", [])?;
    }

    // Add photo_path column to patients table if it doesn't exist
    if !column_exists(conn, "patients", "photo_path")? {
        eprintln!("[MIGRATION] Adding photo_path column to patients table");
        conn.execute("ALTER TABLE patients ADD COLUMN photo_path TEXT", [])?;
    }

    // Add priority column to opd_tokens table if it doesn't exist
    if !column_exists(conn, "opd_tokens", "priority")? {
        eprintln!("[MIGRATION] Adding priority column to opd_tokens table");
        conn.execute(
            "ALTER TABLE opd_tokens ADD COLUMN priority INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }

    // Add visit_id to various tables
    let tables_needing_visit_id = [
        "opd_tokens",
        "appointments",
        "prescriptions",
        "lab_tests",
        "invoices",
        "medical_records",
        "vital_signs",
    ];
    for table in tables_needing_visit_id {
        if !column_exists(conn, table, "visit_id")? {
            eprintln!("[MIGRATION] Adding visit_id column to {} table", table);
            let sql = format!("ALTER TABLE {} ADD COLUMN visit_id INTEGER", table);
            conn.execute(&sql, [])?;
        }
    }

    // Add inventory_item_id to prescription_drugs table
    if !column_exists(conn, "prescription_drugs", "inventory_item_id")? {
        eprintln!("[MIGRATION] Adding inventory_item_id column to prescription_drugs table");
        conn.execute("ALTER TABLE prescription_drugs ADD COLUMN inventory_item_id INTEGER REFERENCES inventory(id)", [])?;
    }

    // Add is_deleted to patients table for soft delete
    if !column_exists(conn, "patients", "is_deleted")? {
        eprintln!("[MIGRATION] Adding is_deleted column to patients table");
        conn.execute(
            "ALTER TABLE patients ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }

    // Add cost column to lab_tests table if it doesn't exist
    if !column_exists(conn, "lab_tests", "cost")? {
        eprintln!("[MIGRATION] Adding cost column to lab_tests table");
        conn.execute(
            "ALTER TABLE lab_tests ADD COLUMN cost REAL NOT NULL DEFAULT 0",
            [],
        )?;
    }

    // Add base_charge column to wards table if it doesn't exist
    if !column_exists(conn, "wards", "base_charge")? {
        eprintln!("[MIGRATION] Adding base_charge column to wards table");
        conn.execute(
            "ALTER TABLE wards ADD COLUMN base_charge REAL NOT NULL DEFAULT 500",
            [],
        )?;
    }

    if !column_exists(conn, "audit_logs", "ip_address")? {
        eprintln!("[MIGRATION] Adding ip_address column to audit_logs table");
        conn.execute("ALTER TABLE audit_logs ADD COLUMN ip_address TEXT", [])?;
    }

    // Soft delete support for appointments, prescriptions, lab_tests
    for (table, col) in &[
        ("appointments", "is_deleted"),
        ("prescriptions", "is_deleted"),
        ("lab_tests", "is_deleted"),
    ] {
        if !column_exists(conn, *table, *col)? {
            eprintln!("[MIGRATION] Adding {} column to {} table", col, table);
            let sql = format!(
                "ALTER TABLE {} ADD COLUMN {} INTEGER NOT NULL DEFAULT 0",
                table, col
            );
            conn.execute(&sql, [])?;
        }
    }

    // Support Tickets table
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS support_tickets (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_code     TEXT NOT NULL UNIQUE,
            patient_id      INTEGER REFERENCES patients(id) ON DELETE SET NULL,
            subject         TEXT NOT NULL,
            description     TEXT NOT NULL,
            category        TEXT NOT NULL,
            priority        TEXT NOT NULL DEFAULT 'Medium',
            status          TEXT NOT NULL DEFAULT 'Open',
            assigned_to     INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );
    ",
    )?;

    Ok(())
}

fn seed_data(conn: &rusqlite::Connection) -> Result<()> {
    use rand::distributions::Alphanumeric;
    use rand::{thread_rng, Rng};
    use rusqlite::params;

    let count: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))?;
    if count > 0 {
        return Ok(());
    }

    // Generate strong random passwords (16 chars) - must be changed on first login
    let generate_password = || -> String {
        thread_rng()
            .sample_iter(&Alphanumeric)
            .take(16)
            .map(char::from)
            .collect()
    };

    // Use predefined passwords matching demo login buttons
    let admin_pass = bcrypt::hash("admin123", 10).unwrap();
    let doctor_pass = bcrypt::hash("doctor123", 10).unwrap();
    let nurse_pass = bcrypt::hash("nurse123", 10).unwrap();
    let reception_pass = bcrypt::hash("reception123", 10).unwrap();
    let pharma_pass = bcrypt::hash("pharma123", 10).unwrap();
    let account_pass = bcrypt::hash("account123", 10).unwrap();

    conn.execute("INSERT INTO users (username, password_hash, role, full_name, department) VALUES (?1, ?2, ?3, ?4, ?5)",
        params!["admin", admin_pass, "Admin", "Administrator", "Administration"])?;
    conn.execute("INSERT INTO users (username, password_hash, role, full_name, department) VALUES (?1, ?2, ?3, ?4, ?5)",
        params!["doctor", doctor_pass, "Doctor", "Dr. Smith", "General Medicine"])?;
    conn.execute("INSERT INTO users (username, password_hash, role, full_name, department) VALUES (?1, ?2, ?3, ?4, ?5)",
        params!["nurse", nurse_pass, "Nurse", "Nurse Johnson", "General Medicine"])?;
    conn.execute("INSERT INTO users (username, password_hash, role, full_name, department) VALUES (?1, ?2, ?3, ?4, ?5)",
        params!["reception", reception_pass, "Receptionist", "Reception Desk", "Front Office"])?;
    conn.execute("INSERT INTO users (username, password_hash, role, full_name, department) VALUES (?1, ?2, ?3, ?4, ?5)",
        params!["pharmacist", pharma_pass, "Pharmacist", "Pharma Store", "Pharmacy"])?;
    conn.execute("INSERT INTO users (username, password_hash, role, full_name, department) VALUES (?1, ?2, ?3, ?4, ?5)",
        params!["accountant", account_pass, "Accountant", "Accounts Dept", "Finance"])?;

    conn.execute("INSERT INTO doctors (staff_code, full_name, specialization, phone, email, qualification, availability_status, shift, experience_years, consultation_fee) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params!["DR-001", "Dr. Smith", "General Medicine", "+91 9876543210", "dr.smith@medicore.com", "MBBS MD", "Available", "Morning", 10, 500])?;
    conn.execute("INSERT INTO doctors (staff_code, full_name, specialization, phone, email, qualification, availability_status, shift, experience_years, consultation_fee) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params!["DR-002", "Dr. Sarah", "Cardiology", "+91 9876543211", "dr.sarah@medicore.com", "MBBS DM", "Available", "Morning", 15, 800])?;
    conn.execute("INSERT INTO doctors (staff_code, full_name, specialization, phone, email, qualification, availability_status, shift, experience_years, consultation_fee) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params!["DR-003", "Dr. Raj", "Orthopedics", "+91 9876543212", "dr.raj@medicore.com", "MBBS MS", "Available", "Evening", 8, 600])?;
    conn.execute("INSERT INTO doctors (staff_code, full_name, specialization, phone, email, qualification, availability_status, shift, experience_years, consultation_fee) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params!["DR-004", "Dr. Priya", "Pediatrics", "+91 9876543213", "dr.priya@medicore.com", "MBBS DCH", "Available", "Morning", 12, 550])?;
    conn.execute("INSERT INTO doctors (staff_code, full_name, specialization, phone, email, qualification, availability_status, shift, experience_years, consultation_fee) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params!["DR-005", "Dr. Amit", "Neurology", "+91 9876543214", "dr.amit@medicore.com", "MBBS DM", "Available", "Evening", 18, 1000])?;
    conn.execute("INSERT INTO doctors (staff_code, full_name, specialization, phone, email, qualification, availability_status, shift, experience_years, consultation_fee) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params!["DR-006", "Dr. Meera", "Dermatology", "+91 9876543215", "dr.meera@medicore.com", "MBBS DDVL", "Available", "Morning", 9, 600])?;

    // Seed Patients
    let patients = vec![
        (
            "PT-0001",
            "Rajesh Kumar",
            "1985-03-15",
            "Male",
            "+91 9123456789",
            "rajesh.kumar@email.com",
            "B+",
            "123 Main Road, Mumbai",
            "-wife",
            "+91 9123456788",
            "None",
            "None",
            "Cardiology",
        ),
        (
            "PT-0002",
            "Anita Sharma",
            "1990-07-22",
            "Female",
            "+91 9123456790",
            "anita.sharma@email.com",
            "O+",
            "456 Oak Street, Delhi",
            "Husband",
            "+91 9123456791",
            "Penicillin",
            "Diabetes",
            "General Medicine",
        ),
        (
            "PT-0003",
            "Vikram Singh",
            "1978-11-08",
            "Male",
            "+91 9123456792",
            "vikram.singh@email.com",
            "A+",
            "789 Pine Ave, Bangalore",
            "Wife",
            "+91 9123456793",
            "None",
            "Hypertension",
            "Cardiology",
        ),
        (
            "PT-0004",
            "Sunita Devi",
            "1995-02-14",
            "Female",
            "+91 9123456794",
            "sunita.devi@email.com",
            "AB+",
            "321 Elm Road, Chennai",
            "Father",
            "+91 9123456795",
            "Aspirin",
            "None",
            "Pediatrics",
        ),
        (
            "PT-0005",
            "Mohammad Ali",
            "1982-09-30",
            "Male",
            "+91 9123456796",
            "mohammad.ali@email.com",
            "B-",
            "654 Cedar Lane, Hyderabad",
            "Mother",
            "+91 9123456797",
            "None",
            "Asthma",
            "General Medicine",
        ),
        (
            "PT-0006",
            "Pooja Patel",
            "1988-05-18",
            "Female",
            "+91 9123456798",
            "pooja.patel@email.com",
            "O-",
            "987 Birch Street, Pune",
            "Husband",
            "+91 9123456799",
            "Sulfa",
            "None",
            "Dermatology",
        ),
        (
            "PT-0007",
            "Arun Joshi",
            "1975-12-25",
            "Male",
            "+91 9123456800",
            "arun.joshi@email.com",
            "A+",
            "147 Maple Road, Kolkata",
            "Wife",
            "+91 9123456801",
            "None",
            "Arthritis",
            "Orthopedics",
        ),
        (
            "PT-0008",
            "Lakshmi Narayanan",
            "1992-08-10",
            "Male",
            "+91 9123456802",
            "lakshmi.n@email.com",
            "AB-",
            "258 Willow Ave, Coimbatore",
            "Sister",
            "+91 9123456803",
            "None",
            "Migraine",
            "Neurology",
        ),
        (
            "PT-0009",
            "Fatima Begum",
            "1998-04-05",
            "Female",
            "+91 9123456804",
            "fatima.b@email.com",
            "O+",
            "369 Rose Garden, Lucknow",
            "Father",
            "+91 9123456805",
            "None",
            "None",
            "General Medicine",
        ),
        (
            "PT-0010",
            "Suresh Reddy",
            "1968-06-20",
            "Male",
            "+91 9123456806",
            "suresh.reddy@email.com",
            "A-",
            "741 Lotus Street, Chennai",
            "Wife",
            "+91 9123456807",
            "Codeine",
            "Heart Disease",
            "Cardiology",
        ),
    ];
    for (
        code,
        name,
        dob,
        gender,
        phone,
        email,
        bg,
        addr,
        econtact,
        ephone,
        allergy,
        chronic,
        dept,
    ) in patients
    {
        conn.execute("INSERT INTO patients (patient_code, full_name, dob, gender, phone, email, blood_group, address, emergency_contact, emergency_phone, allergies, chronic_conditions, department, assigned_doctor_id, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![code, name, dob, gender, phone, email, bg, addr, econtact, ephone, allergy, chronic, dept, 1, "OPD"])?;
    }

    // Seed Staff
    let staff = vec![
        (
            "STF-001",
            "Nurse Radhika",
            "Nurse",
            "Nursing",
            "+91 9988776655",
            "radhika@medicore.com",
            "Morning",
            "Active",
        ),
        (
            "STF-002",
            "Nurse Kavita",
            "Nurse",
            "Nursing",
            "+91 9988776656",
            "kavita@medicore.com",
            "Night",
            "Active",
        ),
        (
            "STF-003",
            "Receptionist Amit",
            "Receptionist",
            "Front Office",
            "+91 9988776657",
            "amit.rec@medicore.com",
            "Morning",
            "Active",
        ),
        (
            "STF-004",
            "Pharmacist Suresh",
            "Pharmacist",
            "Pharmacy",
            "+91 9988776658",
            "suresh.pharma@medicore.com",
            "Morning",
            "Active",
        ),
        (
            "STF-005",
            "Lab Technician Ravi",
            "Lab Technician",
            "Laboratory",
            "+91 9988776659",
            "ravi.lab@medicore.com",
            "Morning",
            "Active",
        ),
        (
            "STF-006",
            "Ward Boy Ganesh",
            "Ward Boy",
            "General Ward",
            "+91 9988776660",
            "ganesh@medicore.com",
            "Night",
            "Active",
        ),
        (
            "STF-007",
            "Security Guard Mahesh",
            "Security",
            "Security",
            "+91 9988776661",
            "mahesh.sec@medicore.com",
            "Night",
            "Active",
        ),
        (
            "STF-008",
            "HR Executive Sunita",
            "HR Executive",
            "Human Resources",
            "+91 9988776662",
            "sunita.hr@medicore.com",
            "Morning",
            "Active",
        ),
    ];
    for (code, name, role, dept, phone, email, shift, status) in staff {
        conn.execute("INSERT INTO staff (staff_code, full_name, role, department, phone, email, shift, status, join_date, salary) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![code, name, role, dept, phone, email, shift, status, "2023-01-15", 25000.0])?;
    }

    // Seed Wards and Beds
    conn.execute("INSERT INTO wards (ward_name, ward_code, ward_type, total_beds, department, base_charge) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params!["General Ward A", "WARD-001", "General", 10, "General Medicine", 500])?;
    conn.execute("INSERT INTO wards (ward_name, ward_code, ward_type, total_beds, department, base_charge) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params!["General Ward B", "WARD-002", "General", 8, "General Medicine", 500])?;
    conn.execute("INSERT INTO wards (ward_name, ward_code, ward_type, total_beds, department, base_charge) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params!["ICU", "WARD-003", "ICU", 5, "Critical Care", 2000])?;
    conn.execute("INSERT INTO wards (ward_name, ward_code, ward_type, total_beds, department, base_charge) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params!["Cardiology Ward", "WARD-004", "Specialized", 6, "Cardiology", 1500])?;
    conn.execute("INSERT INTO wards (ward_name, ward_code, ward_type, total_beds, department, base_charge) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params!["Pediatrics Ward", "WARD-005", "Specialized", 8, "Pediatrics", 800])?;
    conn.execute("INSERT INTO wards (ward_name, ward_code, ward_type, total_beds, department, base_charge) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params!["Orthopedics Ward", "WARD-006", "Specialized", 6, "Orthopedics", 1200])?;

    // Seed Beds
    let beds = vec![
        (1, "B101", "Occupied"),
        (1, "B102", "Available"),
        (1, "B103", "Available"),
        (1, "B104", "Occupied"),
        (1, "B105", "Available"),
        (1, "B106", "Available"),
        (1, "B107", "Occupied"),
        (1, "B108", "Available"),
        (1, "B109", "Available"),
        (1, "B110", "Available"),
        (2, "B201", "Available"),
        (2, "B202", "Occupied"),
        (2, "B203", "Available"),
        (2, "B204", "Available"),
        (2, "B205", "Available"),
        (2, "B206", "Available"),
        (2, "B207", "Available"),
        (2, "B208", "Occupied"),
        (3, "ICU-1", "Occupied"),
        (3, "ICU-2", "Available"),
        (3, "ICU-3", "Occupied"),
        (3, "ICU-4", "Available"),
        (3, "ICU-5", "Available"),
        (4, "CARD-1", "Available"),
        (4, "CARD-2", "Occupied"),
        (4, "CARD-3", "Available"),
        (4, "CARD-4", "Available"),
        (4, "CARD-5", "Occupied"),
        (4, "CARD-6", "Available"),
        (5, "PED-1", "Available"),
        (5, "PED-2", "Available"),
        (5, "PED-3", "Occupied"),
        (5, "PED-4", "Available"),
        (5, "PED-5", "Available"),
        (5, "PED-6", "Available"),
        (5, "PED-7", "Available"),
        (5, "PED-8", "Available"),
        (6, "ORTH-1", "Available"),
        (6, "ORTH-2", "Occupied"),
        (6, "ORTH-3", "Available"),
        (6, "ORTH-4", "Occupied"),
        (6, "ORTH-5", "Available"),
        (6, "ORTH-6", "Available"),
    ];
    for (ward_id, bed_num, status) in beds {
        conn.execute(
            "INSERT INTO beds (ward_id, bed_number, status) VALUES (?1, ?2, ?3)",
            params![ward_id, bed_num, status],
        )?;
    }

    // Seed Appointments
    let appointments = vec![
        (
            1,
            1,
            "Cardiology",
            "2025-05-02",
            "09:00",
            "General Checkup",
            "Scheduled",
        ),
        (
            1,
            2,
            "Cardiology",
            "2025-05-02",
            "10:00",
            "Follow up",
            "Completed",
        ),
        (
            2,
            1,
            "General Medicine",
            "2025-05-02",
            "11:00",
            "Consultation",
            "Scheduled",
        ),
        (
            3,
            3,
            "Orthopedics",
            "2025-05-02",
            "14:00",
            "Joint Pain",
            "Scheduled",
        ),
        (
            4,
            4,
            "Pediatrics",
            "2025-05-02",
            "15:00",
            "Vaccination",
            "Completed",
        ),
        (
            5,
            1,
            "General Medicine",
            "2025-05-03",
            "09:30",
            "Checkup",
            "Scheduled",
        ),
        (
            6,
            6,
            "Dermatology",
            "2025-05-03",
            "10:30",
            "Skin Issue",
            "Scheduled",
        ),
        (
            7,
            3,
            "Orthopedics",
            "2025-05-03",
            "11:30",
            "Follow up",
            "Scheduled",
        ),
        (
            8,
            5,
            "Neurology",
            "2025-05-03",
            "14:00",
            "Headache",
            "Scheduled",
        ),
        (
            9,
            1,
            "General Medicine",
            "2025-05-04",
            "09:00",
            "Annual Checkup",
            "Scheduled",
        ),
    ];
    for (patient_id, doctor_id, dept, date, time, appt_type, status) in appointments {
        conn.execute("INSERT INTO appointments (appointment_code, patient_id, doctor_id, department, appointment_date, appointment_time, type, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![format!("APT-{}", thread_rng().sample_iter(&Alphanumeric).take(8).map(char::from).collect::<String>()), patient_id, doctor_id, dept, date, time, appt_type, status])?;
    }

    // Seed Inventory/Pharmacy Items
    let inventory = vec![
        (
            "MED-001",
            "Paracetamol 500mg",
            "Tablet",
            1000,
            2.50,
            "2026-12-31",
            "Pharmacy",
        ),
        (
            "MED-002",
            "Amoxicillin 250mg",
            "Capsule",
            500,
            5.00,
            "2026-06-30",
            "Pharmacy",
        ),
        (
            "MED-003",
            "Ibuprofen 400mg",
            "Tablet",
            800,
            3.00,
            "2027-01-31",
            "Pharmacy",
        ),
        (
            "MED-004",
            "Cetirizine 10mg",
            "Tablet",
            600,
            2.00,
            "2026-11-30",
            "Pharmacy",
        ),
        (
            "MED-005",
            "Metformin 500mg",
            "Tablet",
            1200,
            4.00,
            "2027-06-30",
            "Pharmacy",
        ),
        (
            "MED-006",
            "Aspirin 75mg",
            "Tablet",
            900,
            1.50,
            "2026-09-30",
            "Pharmacy",
        ),
        (
            "MED-007",
            "Omeprazole 20mg",
            "Capsule",
            450,
            6.00,
            "2026-08-31",
            "Pharmacy",
        ),
        (
            "MED-008",
            "Azithromycin 500mg",
            "Tablet",
            300,
            8.00,
            "2026-07-31",
            "Pharmacy",
        ),
        (
            "MED-009",
            "Atorvastatin 20mg",
            "Tablet",
            700,
            7.00,
            "2027-03-31",
            "Pharmacy",
        ),
        (
            "MED-010",
            "Pantoprazole 40mg",
            "Tablet",
            550,
            9.00,
            "2026-10-31",
            "Pharmacy",
        ),
        (
            "Syr-001",
            "Disposable Syringe 5ml",
            "Item",
            2000,
            3.00,
            "2027-12-31",
            "Medical Supplies",
        ),
        (
            "Syr-002",
            "Disposable Syringe 10ml",
            "Item",
            1500,
            4.00,
            "2027-12-31",
            "Medical Supplies",
        ),
        (
            "Glove-001",
            "Surgical Gloves (Box)",
            "Item",
            200,
            150.00,
            "2026-06-30",
            "Medical Supplies",
        ),
        (
            "Band-001",
            "Sterile Bandage",
            "Item",
            500,
            25.00,
            "2027-01-31",
            "Medical Supplies",
        ),
        (
            "Cot-001",
            "Cotton Roll",
            "Item",
            300,
            40.00,
            "2027-06-30",
            "Medical Supplies",
        ),
    ];
    for (code, name, category, qty, price, expiry, _dept) in inventory {
        conn.execute("INSERT INTO inventory (item_code, name, category, current_stock, unit_price, expiry_date, unit) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![code, name, category, qty, price, expiry, "pcs"])?;
    }

    // Seed Lab Tests
    let lab_tests = vec![
        (1, 1, "Complete Blood Count", "Hematology", "Ordered", 300),
        (2, 2, "Lipid Profile", "Biochemistry", "Completed", 500),
        (
            3,
            1,
            "Blood Glucose Fasting",
            "Biochemistry",
            "Ordered",
            150,
        ),
        (4, 4, "Thyroid Profile", "Biochemistry", "Completed", 600),
        (5, 1, "ECG", "Cardiology", "Completed", 350),
        (6, 6, "Skin Patch Test", "Dermatology", "Ordered", 200),
    ];
    for (patient_id, doctor_id, test_name, category, status, cost) in lab_tests {
        conn.execute("INSERT INTO lab_tests (lab_code, patient_id, doctor_id, test_name, test_category, ordered_date, status, cost) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![format!("LAB-{}", thread_rng().sample_iter(&Alphanumeric).take(8).map(char::from).collect::<String>()), patient_id, doctor_id, test_name, category, "2025-05-01", status, cost])?;
    }

    // Seed Prescriptions
    conn.execute("INSERT INTO prescriptions (rx_code, patient_id, doctor_id, issue_date, valid_until, status, diagnosis) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params!["RX-001", 1, 1, "2025-05-01", "2025-05-08", "Active", "Common Cold"])?;
    conn.execute("INSERT INTO prescription_drugs (prescription_id, drug_name, dosage, frequency, duration_days, route) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![1, "Paracetamol 500mg", "1 tablet", "3 times a day", 5, "Oral"])?;
    conn.execute("INSERT INTO prescription_drugs (prescription_id, drug_name, dosage, frequency, duration_days, route) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![1, "Cetirizine 10mg", "1 tablet", "once at night", 5, "Oral"])?;

    conn.execute("INSERT INTO prescriptions (rx_code, patient_id, doctor_id, issue_date, valid_until, status, diagnosis) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params!["RX-002", 2, 2, "2025-05-01", "2025-05-15", "Active", "Hypertension"])?;
    conn.execute("INSERT INTO prescription_drugs (prescription_id, drug_name, dosage, frequency, duration_days, route) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![2, "Amlodipine 5mg", "1 tablet", "once daily", 14, "Oral"])?;
    conn.execute("INSERT INTO prescription_drugs (prescription_id, drug_name, dosage, frequency, duration_days, route) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![2, "Atorvastatin 20mg", "1 tablet", "once at night", 14, "Oral"])?;

    // Seed Invoices
    conn.execute("INSERT INTO invoices (invoice_code, patient_id, issue_date, due_date, status, subtotal, discount, tax, total, paid_amount, balance) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params!["INV-001", 1, "2025-05-01", "2025-05-15", "Pending", 1000, 0, 180, 1180, 0, 1180])?;
    conn.execute("INSERT INTO invoice_items (invoice_id, description, category, quantity, unit_price, total) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![1, "Consultation Fee - Dr. Smith", "Consultation", 1, 500, 500])?;
    conn.execute("INSERT INTO invoice_items (invoice_id, description, category, quantity, unit_price, total) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![1, "Blood Test - CBC", "Lab", 1, 300, 300])?;
    conn.execute("INSERT INTO invoice_items (invoice_id, description, category, quantity, unit_price, total) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![1, "Medicines", "Pharmacy", 1, 200, 200])?;

    conn.execute("INSERT INTO invoices (invoice_code, patient_id, issue_date, due_date, status, subtotal, discount, tax, total, paid_amount, balance) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params!["INV-002", 2, "2025-05-01", "2025-05-15", "Paid", 2000, 100, 342, 2242, 2242, 0])?;
    conn.execute("INSERT INTO invoice_items (invoice_id, description, category, quantity, unit_price, total) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![2, "ECG Test", "Lab", 1, 350, 350])?;
    conn.execute("INSERT INTO invoice_items (invoice_id, description, category, quantity, unit_price, total) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![2, "Cardiac Profile", "Lab", 1, 1200, 1200])?;
    conn.execute("INSERT INTO invoice_items (invoice_id, description, category, quantity, unit_price, total) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![2, "Medications", "Pharmacy", 1, 450, 450])?;

    // Seed Insurance Claims
    conn.execute("INSERT INTO insurance_claims (claim_code, patient_id, invoice_id, provider_name, policy_number, claim_amount, approved_amount, status, submitted_date) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params!["CLM-001", 1, 1, "Star Health Insurance", "POL-123456", 1180, 1000, "Submitted", "2025-05-02"])?;
    conn.execute("INSERT INTO insurance_claims (claim_code, patient_id, invoice_id, provider_name, policy_number, claim_amount, approved_amount, status, submitted_date) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params!["CLM-002", 2, 2, "Max Bupa Insurance", "POL-789012", 2242, 2000, "Approved", "2025-05-02"])?;

    conn.execute(
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('hospital_gstin', '27AAACM4821M1Z5')",
        [],
    )?;

    // Seed Role Permissions
    let modules = vec![
        "Dashboard",
        "Patients",
        "Appointments",
        "Prescriptions",
        "Lab",
        "Wards",
        "Beds",
        "Billing",
        "Insurance",
        "Inventory",
        "Staff",
        "Doctors",
        "Settings",
        "Audit",
        "HR",
        "Payroll",
        "Messages",
        "Assets",
        "BloodBank",
        "Ambulance",
        "Emergency",
        "OperationTheatre",
        "Discharge",
        "OPDQueue",
        "Feedback",
        "Support",
        "Housekeeping",
        "Maintenance",
    ];

    // Admin gets full access to everything
    for module in &modules {
        conn.execute("INSERT OR IGNORE INTO role_permissions (role, module, can_view, can_create, can_edit, can_delete) VALUES (?1, ?2, 1, 1, 1, 1)",
            params!["Admin", module])?;
    }

    // Doctor gets view, create, edit but no delete
    for module in &modules {
        conn.execute("INSERT OR IGNORE INTO role_permissions (role, module, can_view, can_create, can_edit, can_delete) VALUES (?1, ?2, 1, 1, 1, 0)",
            params!["Doctor", module])?;
    }

    // Nurse gets view and create for clinical modules
    let nurse_modules = vec![
        "Dashboard",
        "Patients",
        "Wards",
        "Beds",
        "Prescriptions",
        "Billing",
    ];
    for module in &nurse_modules {
        conn.execute("INSERT OR IGNORE INTO role_permissions (role, module, can_view, can_create, can_edit, can_delete) VALUES (?1, ?2, 1, 1, 0, 0)",
            params!["Nurse", module])?;
    }

    // Receptionist gets view and create for appointments and patients
    let reception_modules = vec![
        "Dashboard",
        "Patients",
        "Appointments",
        "Billing",
        "Inventory",
    ];
    for module in &reception_modules {
        conn.execute("INSERT OR IGNORE INTO role_permissions (role, module, can_view, can_create, can_edit, can_delete) VALUES (?1, ?2, 1, 1, 0, 0)",
            params!["Receptionist", module])?;
    }

    // Pharmacist gets full access to inventory and prescriptions
    let pharma_modules = vec![
        "Dashboard",
        "Patients",
        "Inventory",
        "Prescriptions",
        "Billing",
    ];
    for module in &pharma_modules {
        conn.execute("INSERT OR IGNORE INTO role_permissions (role, module, can_view, can_create, can_edit, can_delete) VALUES (?1, ?2, 1, 1, 1, 0)",
            params!["Pharmacist", module])?;
    }

    // Accountant gets access to billing, insurance, revenue
    let account_modules = vec!["Dashboard", "Patients", "Billing", "Insurance", "Inventory"];
    for module in &account_modules {
        conn.execute("INSERT OR IGNORE INTO role_permissions (role, module, can_view, can_create, can_edit, can_delete) VALUES (?1, ?2, 1, 1, 1, 0)",
            params!["Accountant", module])?;
    }

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
    is_deleted          INTEGER NOT NULL DEFAULT 0,
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
    visit_id            INTEGER,
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
    visit_id    INTEGER,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prescription_drugs (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    prescription_id     INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    inventory_item_id   INTEGER REFERENCES inventory(id),
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
    report_path     TEXT,
    visit_id        INTEGER,
    cost            REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_lab_status  ON lab_tests(status);
CREATE INDEX IF NOT EXISTS idx_lab_patient ON lab_tests(patient_id);

-- ─────────────────────────────────────────
-- WARDS & BEDS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wards (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ward_name       TEXT NOT NULL,
    ward_code       TEXT NOT NULL UNIQUE,
    ward_type       TEXT NOT NULL DEFAULT 'General',
    total_beds      INTEGER NOT NULL DEFAULT 0,
    department      TEXT NOT NULL,
    base_charge     REAL NOT NULL DEFAULT 500
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
    visit_id            INTEGER,
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
    notes               TEXT,
    visit_id            INTEGER
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
    email           TEXT,
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
    priority        INTEGER NOT NULL DEFAULT 0,
    visit_id        INTEGER,
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

-- ─────────────────────────────────────────
-- MEDICAL RECORDS (EMR)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medical_records (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id      INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id       INTEGER NOT NULL REFERENCES doctors(id),
    record_type     TEXT NOT NULL CHECK(record_type IN ('Clinical Note', 'Diagnostic Report', 'Prescription Archive', 'Imaging', 'Other')),
    title           TEXT NOT NULL,
    description     TEXT,
    attachment_path TEXT,
    visit_id        INTEGER,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_medical_patient ON medical_records(patient_id);

-- ─────────────────────────────────────────
-- STAFF SHIFT ROSTER
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_shifts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    shift_date      TEXT NOT NULL,
    shift_type      TEXT NOT NULL CHECK(shift_type IN ('Morning', 'Evening', 'Night', 'On-Call', 'Holiday')),
    status          TEXT NOT NULL DEFAULT 'Scheduled',
    notes           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(employee_id, shift_date)
);

CREATE INDEX IF NOT EXISTS idx_shift_date ON staff_shifts(shift_date);

-- ─────────────────────────────────────────
-- PATIENT FEEDBACK
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id      INTEGER REFERENCES patients(id) ON DELETE SET NULL,
    rating          INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comments        TEXT NOT NULL,
    department      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────
-- PATIENT VISITS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS visits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_code      TEXT NOT NULL UNIQUE,
    patient_id      INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id       INTEGER NOT NULL REFERENCES doctors(id),
    department      TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'REGISTERED',
    visit_type      TEXT NOT NULL DEFAULT 'OPD',
    reason          TEXT,
    diagnosis       TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_visits_patient ON visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_status  ON visits(status);

-- ─────────────────────────────────────────
-- HOUSEKEEPING
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS housekeeping_tasks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    task_code       TEXT NOT NULL UNIQUE,
    task_type       TEXT NOT NULL CHECK(task_type IN ('Cleaning', 'Sanitation', 'Laundry', 'Waste Management', 'Deep Cleaning', 'Inspection')),
    location        TEXT NOT NULL,
    ward_id         INTEGER REFERENCES wards(id) ON DELETE SET NULL,
    priority        TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low', 'Normal', 'High', 'Urgent')),
    status          TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending', 'In Progress', 'Completed', 'Verified', 'Cancelled')),
    assigned_to     INTEGER REFERENCES staff(id) ON DELETE SET NULL,
    scheduled_date  TEXT NOT NULL,
    completed_date  TEXT,
    notes           TEXT,
    created_by      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_housekeeping_status ON housekeeping_tasks(status);
CREATE INDEX IF NOT EXISTS idx_housekeeping_date ON housekeeping_tasks(scheduled_date);

-- ─────────────────────────────────────────
-- MAINTENANCE
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_requests (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    request_code    TEXT NOT NULL UNIQUE,
    category        TEXT NOT NULL CHECK(category IN ('Equipment', 'Electrical', 'Plumbing', 'HVAC', 'Furniture', 'IT Infrastructure', 'Building', 'Other')),
    item_name       TEXT NOT NULL,
    location        TEXT NOT NULL,
    ward_id         INTEGER REFERENCES wards(id) ON DELETE SET NULL,
    priority        TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low', 'Normal', 'High', 'Critical')),
    status          TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending', 'Assigned', 'In Progress', 'Completed', 'Cancelled')),
    description     TEXT NOT NULL,
    assigned_to     INTEGER REFERENCES staff(id) ON DELETE SET NULL,
    estimated_cost  REAL,
    actual_cost     REAL,
    requested_by    TEXT,
    requested_date  TEXT NOT NULL,
    completed_date  TEXT,
    notes           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_requests(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_category ON maintenance_requests(category);
";
