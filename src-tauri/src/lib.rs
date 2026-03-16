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

            if let Err(e) = db::run_migrations(&pool) {
                eprintln!("[ERR] Migration failed: {}", e);
                panic!("Migration failed: {}", e);
            }

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
            commands::transfer_patient,
            commands::update_bed_status,
            commands::create_ward,
            commands::create_ward_with_beds,
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
            // Settings
            commands::get_setting,
            commands::set_setting,
            commands::get_all_settings,
            commands::backup_database,
            // Users & Auth
            commands::create_user,
            commands::get_users,
            commands::login_user,
            commands::update_user_status,
            commands::delete_user,
            // Tax Settings
            commands::get_tax_settings,
            commands::create_tax_setting,
            // Revenue Cycle - Payment Batches
            commands::get_payment_batches,
            commands::create_payment_batch,
            commands::add_payment_batch_item,
            // WhatsApp & SMS
            commands::get_message_templates,
            commands::create_message_template,
            commands::send_message,
            commands::get_message_logs,
            // Payroll & HR
            commands::get_employees,
            commands::create_employee,
            commands::get_leave_requests,
            commands::create_leave_request,
            commands::approve_leave_request,
            commands::get_attendance,
            commands::mark_attendance,
            // Asset Management
            commands::get_asset_categories,
            commands::create_asset_category,
            commands::get_assets,
            commands::create_asset,
            commands::get_asset_maintenance,
            commands::create_asset_maintenance,
            // OPD Queue
            commands::get_opd_tokens,
            commands::create_opd_token,
            commands::update_token_status,
            // Discharge Summary
            commands::get_discharge_summaries,
            commands::create_discharge_summary,
            // Operation Theatre
            commands::get_ot_schedules,
            commands::create_ot_schedule,
            commands::get_ot_theatres,
            // Emergency / ER
            commands::get_emergency_cases,
            commands::create_emergency_case,
            commands::update_emergency_status,
            // Blood Bank
            commands::get_blood_donors,
            commands::create_blood_donor,
            commands::get_blood_inventory,
            commands::create_blood_inventory,
            commands::get_blood_requests,
            commands::create_blood_request,
            // Ambulance
            commands::get_ambulances,
            commands::create_ambulance,
            commands::get_ambulance_calls,
            commands::create_ambulance_call,
            commands::update_ambulance_status,
            // Expense Management
            commands::get_expense_categories,
            commands::create_expense_category,
            commands::get_expenses,
            commands::create_expense,
            // Notifications
            commands::get_notifications,
            commands::create_notification,
            commands::mark_notification_read,
            // Role Permissions
            commands::get_role_permissions,
            commands::update_role_permission,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
