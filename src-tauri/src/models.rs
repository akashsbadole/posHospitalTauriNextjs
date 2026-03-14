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
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreatePatient {
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
    pub status: Option<String>,
    pub insurance_provider: Option<String>,
    pub insurance_number: Option<String>,
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
    pub tax: Option<f64>,
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
    pub monthly_revenue: f64,
    pub new_patients_this_month: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RevenuePoint {
    pub date: String,
    pub amount: f64,
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
