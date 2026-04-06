// src-tauri/src/models.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Patient {
    pub id: i64,
    pub patient_code: String,
    pub full_name: String,
    pub dob: String,
    pub gender: String,
    pub phone: String,
    pub email: Option<String>,
    pub blood_group: String,
    pub address: Option<String>,
    pub emergency_contact: Option<String>,
    pub emergency_phone: Option<String>,
    pub allergies: Option<String>,
    pub chronic_conditions: Option<String>,
    pub department: String,
    pub assigned_doctor_id: Option<i64>,
    pub assigned_doctor_name: Option<String>,
    pub status: String,
    pub insurance_provider: Option<String>,
    pub insurance_number: Option<String>,
    pub photo_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreatePatient {
    pub full_name: String,
    pub dob: String,
    pub gender: String,
    pub phone: String,
    #[serde(default)]
    pub email: Option<String>,
    pub blood_group: String,
    #[serde(default)]
    pub address: Option<String>,
    #[serde(default)]
    pub emergency_contact: Option<String>,
    #[serde(default)]
    pub emergency_phone: Option<String>,
    #[serde(default)]
    pub allergies: Option<String>,
    #[serde(default)]
    pub chronic_conditions: Option<String>,
    pub department: String,
    #[serde(default)]
    pub assigned_doctor_id: Option<i64>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub insurance_provider: Option<String>,
    #[serde(default)]
    pub insurance_number: Option<String>,
    #[serde(default)]
    pub photo_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Doctor {
    pub id: i64,
    pub staff_code: String,
    pub full_name: String,
    pub specialization: String,
    pub phone: String,
    pub email: String,
    pub qualification: String,
    pub availability_status: String,
    pub shift: String,
    pub experience_years: i64,
    pub consultation_fee: f64,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateDoctor {
    pub full_name: String,
    pub specialization: String,
    pub phone: String,
    pub email: String,
    pub qualification: String,
    pub availability_status: Option<String>,
    pub shift: Option<String>,
    pub experience_years: i64,
    pub consultation_fee: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Staff {
    pub id: i64,
    pub staff_code: String,
    pub full_name: String,
    pub role: String,
    pub department: String,
    pub phone: String,
    pub email: String,
    pub shift: String,
    pub status: String,
    pub join_date: String,
    pub salary: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateStaff {
    pub full_name: String,
    pub role: String,
    pub department: String,
    pub phone: String,
    pub email: String,
    pub shift: Option<String>,
    pub status: Option<String>,
    pub join_date: String,
    pub salary: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Appointment {
    pub id: i64,
    pub appointment_code: String,
    pub patient_id: i64,
    pub patient_name: Option<String>,
    pub doctor_id: i64,
    pub doctor_name: Option<String>,
    pub department: String,
    pub appointment_date: String,
    pub appointment_time: String,
    #[serde(rename = "type")]
    pub appt_type: String,
    pub status: String,
    pub notes: Option<String>,
    pub follow_up_date: Option<String>,
    pub is_video_consultation: Option<bool>,
    pub video_link: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateAppointment {
    pub patient_id: i64,
    pub doctor_id: i64,
    pub department: String,
    pub appointment_date: String,
    pub appointment_time: String,
    #[serde(rename = "type")]
    pub appt_type: String,
    pub status: Option<String>,
    pub notes: Option<String>,
    pub follow_up_date: Option<String>,
    pub is_video_consultation: Option<bool>,
    pub video_link: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Prescription {
    pub id: i64,
    pub rx_code: String,
    pub patient_id: i64,
    pub patient_name: Option<String>,
    pub doctor_id: i64,
    pub doctor_name: Option<String>,
    pub issue_date: String,
    pub valid_until: String,
    pub status: String,
    pub drugs: Vec<PrescriptionDrug>,
    pub diagnosis: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PrescriptionDrug {
    pub id: i64,
    pub prescription_id: i64,
    pub drug_name: String,
    pub dosage: String,
    pub frequency: String,
    pub duration_days: i64,
    pub route: String,
    pub instructions: Option<String>,
    pub refills_remaining: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreatePrescription {
    pub patient_id: i64,
    pub doctor_id: i64,
    pub issue_date: String,
    pub valid_until: String,
    pub status: Option<String>,
    pub diagnosis: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePrescriptionDrug {
    pub drug_name: String,
    pub dosage: String,
    pub frequency: String,
    pub duration_days: i64,
    pub route: Option<String>,
    pub instructions: Option<String>,
    pub refills_remaining: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LabTest {
    pub id: i64,
    pub lab_code: String,
    pub patient_id: i64,
    pub patient_name: Option<String>,
    pub doctor_id: i64,
    pub doctor_name: Option<String>,
    pub test_name: String,
    pub test_category: String,
    pub ordered_date: String,
    pub result_date: Option<String>,
    pub status: String,
    pub result_value: Option<String>,
    pub result_unit: Option<String>,
    pub reference_range: Option<String>,
    pub is_abnormal: bool,
    pub notes: Option<String>,
    pub report_path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateLabTest {
    pub patient_id: i64,
    pub doctor_id: i64,
    pub test_name: String,
    pub test_category: String,
    pub ordered_date: String,
    pub status: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateLabResult {
    pub result_value: String,
    pub result_unit: String,
    pub is_abnormal: bool,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Ward {
    pub id: i64,
    pub ward_name: String,
    pub ward_code: String,
    pub ward_type: String,
    pub total_beds: i64,
    pub department: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Bed {
    pub id: i64,
    pub ward_id: i64,
    pub ward_name: Option<String>,
    pub bed_number: String,
    pub status: String,
    pub patient_id: Option<i64>,
    pub patient_name: Option<String>,
    pub admission_date: Option<String>,
    pub expected_discharge: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Invoice {
    pub id: i64,
    pub invoice_code: String,
    pub patient_id: i64,
    pub patient_name: Option<String>,
    pub issue_date: String,
    pub due_date: String,
    pub status: String,
    pub items: Vec<InvoiceItem>,
    pub subtotal: f64,
    pub discount: f64,
    pub tax: f64,
    pub cgst: f64,
    pub sgst: f64,
    pub igst: f64,
    pub total: f64,
    pub paid_amount: f64,
    pub balance: f64,
    pub payment_method: Option<String>,
    pub insurance_claim_id: Option<i64>,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InvoiceItem {
    pub id: i64,
    pub invoice_id: i64,
    pub description: String,
    pub category: String,
    pub quantity: i64,
    pub unit_price: f64,
    pub total: f64,
}

#[derive(Debug, Deserialize)]
pub struct CreateInvoice {
    pub patient_id: i64,
    pub issue_date: String,
    pub due_date: String,
    pub discount: Option<f64>,
    pub tax_rate: Option<f64>,
    pub cgst_rate: Option<f64>,
    pub sgst_rate: Option<f64>,
    pub igst_rate: Option<f64>,
    pub payment_method: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateInvoiceItem {
    pub description: String,
    pub category: String,
    pub quantity: i64,
    pub unit_price: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InsuranceClaim {
    pub id: i64,
    pub claim_code: String,
    pub patient_id: i64,
    pub patient_name: Option<String>,
    pub invoice_id: i64,
    pub provider_name: String,
    pub policy_number: String,
    pub claim_amount: f64,
    pub approved_amount: Option<f64>,
    pub status: String,
    pub submitted_date: Option<String>,
    pub resolved_date: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateInsuranceClaim {
    pub patient_id: i64,
    pub invoice_id: i64,
    pub provider_name: String,
    pub policy_number: String,
    pub claim_amount: f64,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InventoryItem {
    pub id: i64,
    pub item_code: String,
    pub name: String,
    pub category: String,
    pub current_stock: i64,
    pub min_threshold: i64,
    pub max_capacity: i64,
    pub unit: String,
    pub unit_price: f64,
    pub supplier: Option<String>,
    pub expiry_date: Option<String>,
    pub location: Option<String>,
    pub last_restocked: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateInventoryItem {
    pub name: String,
    pub category: String,
    pub current_stock: i64,
    pub min_threshold: i64,
    pub max_capacity: i64,
    pub unit: String,
    pub unit_price: f64,
    pub supplier: Option<String>,
    pub expiry_date: Option<String>,
    pub location: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VitalSigns {
    pub id: i64,
    pub patient_id: i64,
    pub recorded_by: String,
    pub recorded_at: String,
    pub blood_pressure_sys: Option<i64>,
    pub blood_pressure_dia: Option<i64>,
    pub heart_rate: Option<i64>,
    pub temperature: Option<f64>,
    pub spo2: Option<i64>,
    pub respiratory_rate: Option<i64>,
    pub weight_kg: Option<f64>,
    pub height_cm: Option<f64>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuditLog {
    pub id: i64,
    pub user_name: String,
    pub action: String,
    pub entity: String,
    pub entity_id: Option<i64>,
    pub details: Option<String>,
    pub ip_address: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DashboardStats {
    pub total_patients: i64,
    pub today_appointments: i64,
    pub beds_occupied: i64,
    pub total_beds: i64,
    pub today_revenue: f64,
    pub pending_labs: i64,
    pub rx_due_refill: i64,
    pub low_stock_items: i64,
    pub pending_claims: i64,
    pub discharges_today: i64,
    pub admissions_today: i64,
    pub monthly_revenue: f64,
    pub new_patients_this_month: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RevenuePoint {
    pub date: String,
    pub amount: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TaxReport {
    pub period: String,
    pub subtotal: f64,
    pub cgst: f64,
    pub sgst: f64,
    pub igst: f64,
    pub total_tax: f64,
    pub total_amount: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncStatus {
    pub last_sync: String,
    pub pending: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncResult {
    pub synced: i64,
    pub errors: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct User {
    pub id: i64,
    pub username: String,
    pub role: String,
    pub full_name: String,
    pub department: Option<String>,
    pub is_active: bool,
    pub last_login: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateUser {
    pub username: String,
    pub password: String,
    pub role: String,
    pub full_name: String,
    pub department: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Setting {
    pub key: String,
    pub value: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSetting {
    pub key: String,
    pub value: String,
}

// ─────────────────────────────────────────
// TAX SETTINGS
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TaxSetting {
    pub id: i64,
    pub tax_name: String,
    pub tax_type: String,
    pub rate: f64,
    pub cgst_rate: f64,
    pub sgst_rate: f64,
    pub igst_rate: f64,
    pub is_active: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateTaxSetting {
    pub tax_name: String,
    pub tax_type: Option<String>,
    pub rate: f64,
    pub cgst_rate: Option<f64>,
    pub sgst_rate: Option<f64>,
    pub igst_rate: Option<f64>,
}

// ─────────────────────────────────────────
// REVENUE CYCLE - PAYMENT BATCHES
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PaymentBatch {
    pub id: i64,
    pub batch_code: String,
    pub batch_date: String,
    pub total_amount: f64,
    pub total_count: i64,
    pub status: String,
    pub created_by: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreatePaymentBatch {
    pub batch_date: String,
    pub created_by: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PaymentBatchItem {
    pub id: i64,
    pub batch_id: i64,
    pub invoice_id: i64,
    pub invoice_code: Option<String>,
    pub amount: f64,
    pub payment_method: String,
    pub reference_no: Option<String>,
    pub created_at: String,
}

// ─────────────────────────────────────────
// WHATSAPP & SMS
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessageTemplate {
    pub id: i64,
    pub template_name: String,
    pub message_type: String,
    pub template_body: String,
    pub is_active: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateMessageTemplate {
    pub template_name: String,
    pub message_type: String,
    pub template_body: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessageLog {
    pub id: i64,
    pub patient_id: Option<i64>,
    pub patient_name: Option<String>,
    pub phone: String,
    pub message_type: String,
    pub template_name: Option<String>,
    pub message_body: String,
    pub status: String,
    pub sent_at: Option<String>,
    pub error_message: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct SendMessage {
    pub patient_id: Option<i64>,
    pub phone: String,
    pub message_type: String,
    pub template_name: Option<String>,
    pub message_body: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SmsSettings {
    pub id: i64,
    pub provider: String,
    pub sender_id: Option<String>,
    pub is_active: bool,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSmsSettings {
    pub provider: Option<String>,
    pub api_key: Option<String>,
    pub api_secret: Option<String>,
    pub sender_id: Option<String>,
    pub is_active: Option<bool>,
}

// ─────────────────────────────────────────
// PAYROLL & HR
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PayrollMonth {
    pub id: i64,
    pub month_year: String,
    pub start_date: String,
    pub end_date: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreatePayrollMonth {
    pub month_year: String,
    pub start_date: String,
    pub end_date: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PayrollEntry {
    pub id: i64,
    pub payroll_month_id: i64,
    pub employee_id: i64,
    pub employee_name: Option<String>,
    pub basic_salary: f64,
    pub allowances: f64,
    pub deductions: f64,
    pub net_salary: f64,
    pub status: String,
    pub processed_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreatePayrollEntry {
    pub payroll_month_id: i64,
    pub employee_id: i64,
    pub basic_salary: f64,
    pub allowances: Option<f64>,
    pub deductions: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Employee {
    pub id: i64,
    pub employee_code: String,
    pub staff_id: Option<i64>,
    pub first_name: String,
    pub last_name: String,
    pub full_name: String,
    pub email: String,
    pub phone: String,
    pub department: String,
    pub designation: String,
    pub employee_type: String,
    pub date_of_join: String,
    pub date_of_birth: Option<String>,
    pub gender: Option<String>,
    pub address: Option<String>,
    pub bank_name: Option<String>,
    pub bank_account: Option<String>,
    pub ifsc_code: Option<String>,
    pub pan_number: Option<String>,
    pub aadhar_number: Option<String>,
    pub basic_salary: f64,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateEmployee {
    pub staff_id: Option<i64>,
    pub first_name: String,
    pub last_name: String,
    pub email: String,
    pub phone: String,
    pub department: String,
    pub designation: String,
    pub employee_type: Option<String>,
    pub date_of_join: String,
    pub date_of_birth: Option<String>,
    pub gender: Option<String>,
    pub address: Option<String>,
    pub bank_name: Option<String>,
    pub bank_account: Option<String>,
    pub ifsc_code: Option<String>,
    pub pan_number: Option<String>,
    pub aadhar_number: Option<String>,
    pub basic_salary: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PayrollMonth {
    pub id: i64,
    pub month_year: String,
    pub start_date: String,
    pub end_date: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreatePayrollMonth {
    pub month_year: String,
    pub start_date: String,
    pub end_date: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PayrollEntry {
    pub id: i64,
    pub payroll_month_id: i64,
    pub employee_id: i64,
    pub employee_name: Option<String>,
    pub basic_salary: f64,
    pub allowances: f64,
    pub deductions: f64,
    pub net_salary: f64,
    pub status: String,
    pub processed_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreatePayrollEntry {
    pub payroll_month_id: i64,
    pub employee_id: i64,
    pub basic_salary: f64,
    pub allowances: Option<f64>,
    pub deductions: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LeaveRequest {
    pub id: i64,
    pub employee_id: i64,
    pub employee_name: Option<String>,
    pub leave_type: String,
    pub start_date: String,
    pub end_date: String,
    pub total_days: f64,
    pub reason: Option<String>,
    pub status: String,
    pub approved_by: Option<String>,
    pub approved_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateLeaveRequest {
    pub employee_id: i64,
    pub leave_type: String,
    pub start_date: String,
    pub end_date: String,
    pub total_days: f64,
    pub reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Attendance {
    pub id: i64,
    pub employee_id: i64,
    pub employee_name: Option<String>,
    pub attendance_date: String,
    pub check_in: Option<String>,
    pub check_out: Option<String>,
    pub work_hours: f64,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct MarkAttendance {
    pub employee_id: i64,
    pub attendance_date: String,
    pub check_in: Option<String>,
    pub check_out: Option<String>,
    pub status: String,
}

// ─────────────────────────────────────────
// ASSET MANAGEMENT
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AssetCategory {
    pub id: i64,
    pub category_name: String,
    pub depreciation_rate: f64,
    pub description: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateAssetCategory {
    pub category_name: String,
    pub depreciation_rate: f64,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Asset {
    pub id: i64,
    pub asset_code: String,
    pub asset_name: String,
    pub category_id: i64,
    pub category_name: Option<String>,
    pub purchase_date: String,
    pub purchase_cost: f64,
    pub current_value: f64,
    pub warranty_expiry: Option<String>,
    pub location: Option<String>,
    pub assigned_to: Option<i64>,
    pub assigned_employee: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateAsset {
    pub asset_name: String,
    pub category_id: i64,
    pub purchase_date: String,
    pub purchase_cost: f64,
    pub warranty_expiry: Option<String>,
    pub location: Option<String>,
    pub assigned_to: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AssetMaintenance {
    pub id: i64,
    pub asset_id: i64,
    pub asset_name: Option<String>,
    pub maintenance_type: String,
    pub description: String,
    pub maintenance_date: String,
    pub cost: f64,
    pub vendor: Option<String>,
    pub next_due_date: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateAssetMaintenance {
    pub asset_id: i64,
    pub maintenance_type: String,
    pub description: String,
    pub maintenance_date: String,
    pub cost: Option<f64>,
    pub vendor: Option<String>,
    pub next_due_date: Option<String>,
}

// ─────────────────────────────────────────
// OPD QUEUE MANAGEMENT
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpdToken {
    pub id: i64,
    pub token_number: i64,
    pub patient_id: i64,
    pub patient_name: Option<String>,
    pub doctor_id: i64,
    pub doctor_name: Option<String>,
    pub department: String,
    pub queue_date: String,
    pub status: String,
    pub wait_time: i64,
    pub called_at: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateOpdToken {
    pub patient_id: i64,
    pub doctor_id: i64,
    pub department: String,
    pub queue_date: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpdQueueSettings {
    pub id: i64,
    pub department: String,
    pub token_prefix: String,
    pub start_time: String,
    pub end_time: String,
    pub max_tokens_per_day: i64,
    pub avg_consultation_minutes: i64,
    pub is_active: bool,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateOpdQueueSettings {
    pub department: String,
    pub token_prefix: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub max_tokens_per_day: Option<i64>,
    pub avg_consultation_minutes: Option<i64>,
}

// ─────────────────────────────────────────
// DISCHARGE SUMMARY
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DischargeSummary {
    pub id: i64,
    pub summary_code: String,
    pub patient_id: i64,
    pub patient_name: Option<String>,
    pub admission_date: String,
    pub discharge_date: String,
    pub discharge_type: String,
    pub diagnosis: String,
    pub procedure_done: Option<String>,
    pub history_present_illness: Option<String>,
    pub examination_findings: Option<String>,
    pub investigations: Option<String>,
    pub treatment_given: Option<String>,
    pub advice_on_discharge: Option<String>,
    pub follow_up_date: Option<String>,
    pub created_by: i64,
    pub doctor_name: Option<String>,
    pub medications: Vec<DischargeMedication>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateDischargeSummary {
    pub patient_id: i64,
    pub admission_date: String,
    pub discharge_date: String,
    pub discharge_type: Option<String>,
    pub diagnosis: String,
    pub procedure_done: Option<String>,
    pub history_present_illness: Option<String>,
    pub examination_findings: Option<String>,
    pub investigations: Option<String>,
    pub treatment_given: Option<String>,
    pub advice_on_discharge: Option<String>,
    pub follow_up_date: Option<String>,
    pub created_by: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DischargeMedication {
    pub id: i64,
    pub discharge_summary_id: i64,
    pub medication: String,
    pub dosage: String,
    pub duration: String,
    pub instructions: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateDischargeMedication {
    pub medication: String,
    pub dosage: String,
    pub duration: String,
    pub instructions: Option<String>,
}

// ─────────────────────────────────────────
// OPERATION THEATRE
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OtSchedule {
    pub id: i64,
    pub surgery_code: String,
    pub patient_id: i64,
    pub patient_name: Option<String>,
    pub surgeon_id: i64,
    pub surgeon_name: Option<String>,
    pub anesthesiologist_id: Option<i64>,
    pub anesthesiologist_name: Option<String>,
    pub ot_theatre_id: i64,
    pub theatre_name: Option<String>,
    pub surgery_type: String,
    pub surgery_date: String,
    pub start_time: String,
    pub end_time: Option<String>,
    pub status: String,
    pub priority: String,
    pub anesthesia_type: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateOtSchedule {
    pub patient_id: i64,
    pub surgeon_id: i64,
    pub anesthesiologist_id: Option<i64>,
    pub ot_theatre_id: i64,
    pub surgery_type: String,
    pub surgery_date: String,
    pub start_time: String,
    pub priority: Option<String>,
    pub anesthesia_type: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OtTheatre {
    pub id: i64,
    pub theatre_name: String,
    pub theatre_code: String,
    pub location: Option<String>,
    pub is_operational: bool,
    pub created_at: String,
}

// ─────────────────────────────────────────
// EMERGENCY / ER
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EmergencyCase {
    pub id: i64,
    pub case_code: String,
    pub patient_id: Option<i64>,
    pub patient_name: String,
    pub patient_phone: Option<String>,
    pub arrival_time: String,
    pub triage_level: String,
    pub chief_complaint: String,
    pub vital_signs: Option<String>,
    pub treatment_given: Option<String>,
    pub status: String,
    pub outcome: Option<String>,
    pub admitted_to: Option<i64>,
    pub ward_name: Option<String>,
    pub discharged_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateEmergencyCase {
    pub patient_id: Option<i64>,
    pub patient_name: String,
    pub patient_phone: Option<String>,
    pub triage_level: String,
    pub chief_complaint: String,
    pub vital_signs: Option<String>,
}

// ─────────────────────────────────────────
// BLOOD BANK
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BloodDonor {
    pub id: i64,
    pub donor_code: String,
    pub full_name: String,
    pub dob: Option<String>,
    pub gender: Option<String>,
    pub phone: String,
    pub email: Option<String>,
    pub blood_group: String,
    pub last_donation: Option<String>,
    pub donation_count: i64,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateBloodDonor {
    pub full_name: String,
    pub dob: Option<String>,
    pub gender: Option<String>,
    pub phone: String,
    pub email: Option<String>,
    pub blood_group: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BloodInventory {
    pub id: i64,
    pub bag_number: String,
    pub blood_group: String,
    pub component: String,
    pub units: i64,
    pub collection_date: String,
    pub expiry_date: String,
    pub donor_id: Option<i64>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateBloodInventory {
    pub blood_group: String,
    pub component: Option<String>,
    pub units: i64,
    pub collection_date: String,
    pub expiry_date: String,
    pub donor_id: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BloodRequest {
    pub id: i64,
    pub request_code: String,
    pub patient_id: i64,
    pub patient_name: Option<String>,
    pub blood_group: String,
    pub units_required: i64,
    pub units_issued: i64,
    pub urgency: String,
    pub status: String,
    pub approved_by: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateBloodRequest {
    pub patient_id: i64,
    pub blood_group: String,
    pub units_required: i64,
    pub urgency: Option<String>,
}

// ─────────────────────────────────────────
// AMBULANCE
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Ambulance {
    pub id: i64,
    pub ambulance_number: String,
    pub vehicle_type: String,
    pub license_number: String,
    pub insurance_expiry: Option<String>,
    pub last_service: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateAmbulance {
    pub ambulance_number: String,
    pub vehicle_type: Option<String>,
    pub license_number: String,
    pub insurance_expiry: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AmbulanceCall {
    pub id: i64,
    pub call_code: String,
    pub patient_id: Option<i64>,
    pub patient_name: String,
    pub patient_phone: String,
    pub pickup_address: String,
    pub destination: Option<String>,
    pub ambulance_id: Option<i64>,
    pub ambulance_number: Option<String>,
    pub driver_name: Option<String>,
    pub call_time: String,
    pub pickup_time: Option<String>,
    pub arrival_time: Option<String>,
    pub drop_time: Option<String>,
    pub status: String,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateAmbulanceCall {
    pub patient_id: Option<i64>,
    pub patient_name: String,
    pub patient_phone: String,
    pub pickup_address: String,
    pub destination: Option<String>,
    pub ambulance_id: Option<i64>,
    pub driver_name: Option<String>,
    pub notes: Option<String>,
}

// ─────────────────────────────────────────
// EXPENSE MANAGEMENT
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExpenseCategory {
    pub id: i64,
    pub category_name: String,
    pub description: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateExpenseCategory {
    pub category_name: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Expense {
    pub id: i64,
    pub expense_code: String,
    pub category_id: i64,
    pub category_name: Option<String>,
    pub amount: f64,
    pub expense_date: String,
    pub description: String,
    pub vendor: Option<String>,
    pub payment_method: Option<String>,
    pub receipt_number: Option<String>,
    pub approved_by: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateExpense {
    pub category_id: i64,
    pub amount: f64,
    pub expense_date: String,
    pub description: String,
    pub vendor: Option<String>,
    pub payment_method: Option<String>,
    pub receipt_number: Option<String>,
}

// ─────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Notification {
    pub id: i64,
    pub title: String,
    pub message: String,
    pub notification_type: String,
    pub target_role: Option<String>,
    pub is_read: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateNotification {
    pub title: String,
    pub message: String,
    pub notification_type: Option<String>,
    pub target_role: Option<String>,
}

// ─────────────────────────────────────────
// ROLE PERMISSIONS
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RolePermission {
    pub id: i64,
    pub role: String,
    pub module: String,
    pub can_view: bool,
    pub can_create: bool,
    pub can_edit: bool,
    pub can_delete: bool,
}

// ─────────────────────────────────────────
// MEDICAL RECORDS (EMR)
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MedicalRecord {
    pub id: i64,
    pub patient_id: i64,
    pub doctor_id: i64,
    pub doctor_name: Option<String>,
    pub record_type: String,
    pub title: String,
    pub description: Option<String>,
    pub attachment_path: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateMedicalRecord {
    pub patient_id: i64,
    pub doctor_id: i64,
    pub record_type: String,
    pub title: String,
    pub description: Option<String>,
    pub attachment_path: Option<String>,
}

// ─────────────────────────────────────────
// STAFF SHIFT ROSTER
// ─────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StaffShift {
    pub id: i64,
    pub employee_id: i64,
    pub employee_name: Option<String>,
    pub shift_date: String,
    pub shift_type: String,
    pub status: String,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateStaffShift {
    pub employee_id: i64,
    pub shift_date: String,
    pub shift_type: String,
    pub status: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRolePermission {
    pub role: String,
    pub module: String,
    pub can_view: bool,
    pub can_create: bool,
    pub can_edit: bool,
    pub can_delete: bool,
}

// ─── PATIENT FEEDBACK ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PatientFeedback {
    pub id: i64,
    pub patient_id: Option<i64>,
    pub patient_name: Option<String>,
    pub rating: i64,
    pub comments: String,
    pub department: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateFeedback {
    pub patient_id: Option<i64>,
    pub patient_name: Option<String>,
    pub rating: i64,
    pub comments: String,
    pub department: Option<String>,
}
