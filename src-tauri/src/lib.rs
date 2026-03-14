// src-tauri/src/lib.rs
use tauri::Manager;

mod db;
mod models;
mod commands;
mod sync;
mod audit;

pub use db::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir().expect("Failed to get app dir");
            std::fs::create_dir_all(&app_dir)?;
            let db_path = app_dir.join("medicore.db");

            let pool = db::create_pool(&db_path.to_str().unwrap())
                .expect("Failed to create DB pool");

            db::run_migrations(&pool).expect("Failed to run migrations");

            app.manage(AppState { pool });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Dashboard
            commands::get_dashboard_stats,
            commands::get_recent_activity,
            // Patients
            commands::get_patients,
            commands::get_patient_by_id,
            commands::create_patient,
            commands::update_patient,
            commands::delete_patient,
            commands::get_patient_vitals,
            commands::add_vital_signs,
            // Doctors
            commands::get_doctors,
            commands::get_doctor_by_id,
            commands::create_doctor,
            commands::update_doctor,
            commands::update_doctor_status,
            // Staff
            commands::get_staff,
            commands::create_staff,
            commands::update_staff,
            commands::delete_staff,
            // Appointments
            commands::get_appointments,
            commands::get_appointment_by_id,
            commands::create_appointment,
            commands::update_appointment_status,
            commands::cancel_appointment,
            commands::get_upcoming_appointments,
            // Prescriptions
            commands::get_prescriptions,
            commands::get_prescription_by_id,
            commands::create_prescription,
            commands::cancel_prescription,
            commands::refill_prescription,
            commands::get_prescriptions_due_refill,
            // Lab
            commands::get_lab_tests,
            commands::create_lab_test,
            commands::update_lab_result,
            commands::update_lab_status,
            commands::upload_lab_report,
            // Wards & Beds
            commands::get_wards,
            commands::get_beds,
            commands::admit_patient,
            commands::discharge_patient,
            commands::update_bed_status,
            commands::create_ward,
            // Billing
            commands::get_invoices,
            commands::get_invoice_by_id,
            commands::create_invoice,
            commands::record_payment,
            commands::export_invoice_pdf,
            commands::get_revenue_by_range,
            // Insurance
            commands::get_insurance_claims,
            commands::create_insurance_claim,
            commands::update_claim_status,
            // Inventory
            commands::get_inventory,
            commands::get_low_stock_items,
            commands::update_stock,
            commands::create_inventory_item,
            commands::delete_inventory_item,
            // Audit
            commands::get_audit_logs,
            // Sync
            commands::sync_to_cloud,
            commands::get_sync_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
