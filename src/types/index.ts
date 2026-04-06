export type BloodGroup = "A+" | "A-" | "B+" | "B-" | "O+" | "O-" | "AB+" | "AB-";
export type Department =
  | "General Medicine" | "Cardiology" | "Neurology" | "Orthopedics"
  | "Gynecology" | "Pediatrics" | "Radiology" | "ENT"
  | "Dermatology" | "Oncology" | "Psychiatry" | "Urology";
export type PatientStatus = "Active" | "Admitted" | "Discharged" | "Critical" | "OPD";
export type VisitStatus = "REGISTERED" | "WAITING" | "IN_CONSULTATION" | "TEST_PENDING" | "TEST_COMPLETED" | "BILL_PENDING" | "COMPLETED";
export type AppointmentStatus = "Scheduled" | "Checked In" | "In Progress" | "Completed" | "Cancelled" | "No Show";
export type AppointmentType =
  | "General Checkup" | "Follow-up" | "Consultation" | "Emergency"
  | "Post-Op" | "Lab Review" | "ECG" | "X-Ray Review" | "MRI Consultation" | "Vaccination";
export type BedStatus = "Available" | "Occupied" | "Reserved" | "Maintenance";
export type InvoiceStatus = "Draft" | "Pending" | "Paid" | "Partial" | "Overdue" | "Cancelled";
export type PaymentMethod = "Cash" | "Card" | "UPI" | "Insurance" | "Net Banking" | "Cheque";
export type LabCategory = "Hematology" | "Biochemistry" | "Microbiology" | "Pathology" | "Radiology" | "Cardiology" | "Immunology";
export type ClaimStatus = "Draft" | "Submitted" | "Under Review" | "Approved" | "Rejected" | "Paid";

export interface Patient {
  id: number; patient_code: string; full_name: string; dob: string;
  gender: "Male" | "Female" | "Other"; phone: string; email?: string;
  blood_group: BloodGroup; address?: string; emergency_contact?: string;
  emergency_phone?: string; allergies?: string; chronic_conditions?: string;
  department: Department; assigned_doctor_id?: number; assigned_doctor_name?: string;
  status: PatientStatus; insurance_provider?: string; insurance_number?: string;
  photo_path?: string;
  created_at: string; updated_at: string;
}

export interface Doctor {
  id: number; staff_code: string; full_name: string; specialization: Department;
  phone: string; email: string; qualification: string;
  availability_status: "Available" | "In Surgery" | "On Round" | "Off Duty" | "On Leave";
  shift: "Morning" | "Evening" | "Night"; experience_years: number;
  consultation_fee: number; created_at: string;
}

export interface Appointment {
  id: number; appointment_code: string; patient_id: number; patient_name?: string;
  doctor_id: number; doctor_name?: string; department: Department;
  appointment_date: string; appointment_time: string; type: AppointmentType;
  status: AppointmentStatus; notes?: string; follow_up_date?: string; visit_id?: number; created_at: string;
}

export interface Prescription {
  id: number; rx_code: string; patient_id: number; patient_name?: string;
  doctor_id: number; doctor_name?: string; issue_date: string; valid_until: string;
  status: "Active" | "Expired" | "Cancelled"; drugs: PrescriptionDrug[];
  diagnosis?: string; notes?: string; visit_id?: number; created_at: string;
}

export interface PrescriptionDrug {
  id: number; prescription_id: number; drug_name: string; dosage: string;
  frequency: string; duration_days: number;
  route: "Oral" | "IV" | "IM" | "Topical" | "Inhaled";
  instructions?: string; refills_remaining: number;
}

export interface LabTest {
  id: number; lab_code: string; patient_id: number; patient_name?: string;
  doctor_id: number; doctor_name?: string; test_name: string; test_category: LabCategory;
  ordered_date: string; result_date?: string;
  status: "Ordered" | "Sample Collected" | "Processing" | "Ready" | "Reviewed";
  result_value?: string; result_unit?: string; reference_range?: string;
  is_abnormal: boolean; notes?: string; report_path?: string; visit_id?: number;
}

export interface Ward {
  id: number; ward_name: string; ward_code: string;
  ward_type: "General" | "ICU" | "NICU" | "Pediatric" | "Maternity" | "Surgical" | "Isolation";
  total_beds: number; department: Department;
}

export interface Bed {
  id: number; ward_id: number; ward_name?: string; bed_number: string; status: BedStatus;
  patient_id?: number; patient_name?: string; admission_date?: string;
  expected_discharge?: string; notes?: string;
}

export interface Invoice {
  id: number; invoice_code: string; patient_id: number; patient_name?: string;
  issue_date: string; due_date: string; status: InvoiceStatus; items: InvoiceItem[];
  subtotal: number; discount: number; tax: number;
  cgst: number; sgst: number; igst: number;
  total: number;
  paid_amount: number; balance: number; payment_method?: PaymentMethod;
  insurance_claim_id?: number; notes?: string; visit_id?: number; created_at: string;
}

export interface InvoiceItem {
  id: number; invoice_id: number; description: string;
  category: "Consultation" | "Lab" | "Surgery" | "Pharmacy" | "Ward" | "Radiology" | "Procedure";
  quantity: number; unit_price: number; total: number;
}

export interface InsuranceClaim {
  id: number; claim_code: string; patient_id: number; patient_name?: string;
  invoice_id: number; provider_name: string; policy_number: string;
  claim_amount: number; approved_amount?: number; status: ClaimStatus;
  submitted_date?: string; resolved_date?: string; notes?: string;
}

export interface InventoryItem {
  id: number; item_code: string; name: string;
  category: "Medicine" | "Consumable" | "Equipment" | "Lab Reagent" | "PPE";
  current_stock: number; min_threshold: number; max_capacity: number;
  unit: string; unit_price: number; supplier?: string;
  expiry_date?: string; location?: string; last_restocked?: string;
}

export interface DashboardStats {
  total_patients: number; today_appointments: number; beds_occupied: number;
  total_beds: number; today_revenue: number; pending_labs: number;
  rx_due_refill: number; low_stock_items: number; pending_claims: number;
  discharges_today: number; admissions_today: number; monthly_revenue: number; new_patients_this_month: number;
  opd_patients_count: number; admitted_patients_count: number;
}

export interface AuditLog {
  id: number; user_name: string; action: string; entity: string;
  entity_id?: number; details?: string; ip_address?: string; timestamp: string;
}

export interface Staff {
  id: number; staff_code: string; full_name: string;
  role: "Doctor" | "Nurse" | "Technician" | "Receptionist" | "Admin" | "Pharmacist";
  department: Department; phone: string; email: string;
  shift: "Morning" | "Evening" | "Night"; status: "Active" | "On Leave" | "Resigned";
  join_date: string; salary?: number;
}

export interface VitalSigns {
  id: number; patient_id: number; recorded_by: string; recorded_at: string;
  blood_pressure_sys: number; blood_pressure_dia: number; heart_rate: number;
  temperature: number; spo2: number; respiratory_rate: number;
  weight_kg: number; height_cm: number; notes?: string; visit_id?: number;
}

export interface User {
  id: number; username: string; role: "Admin" | "Doctor" | "Nurse" | "Receptionist" | "Pharmacist" | "Accountant";
  full_name: string; department?: Department; is_active: boolean;
  last_login?: string; created_at: string;
}

export interface Setting {
  key: string; value: string; updated_at: string;
}

// Tax Settings
export interface TaxSetting {
  id: number; tax_name: string; tax_type: "GST" | "VAT" | "Other";
  rate: number; cgst_rate: number; sgst_rate: number; igst_rate: number;
  is_active: boolean; created_at: string;
}

// Payment Batches (Revenue Cycle)
export interface PaymentBatch {
  id: number; batch_code: string; batch_date: string;
  total_amount: number; total_count: number; status: string;
  created_by?: string; created_at: string;
}

export interface PaymentBatchItem {
  id: number; batch_id: number; invoice_id: number; invoice_code?: string;
  amount: number; payment_method: string; reference_no?: string; created_at: string;
}

// WhatsApp & SMS
export interface MessageTemplate {
  id: number; template_name: string; message_type: "SMS" | "WhatsApp" | "Both";
  template_body: string; is_active: boolean; created_at: string;
}

export interface MessageLog {
  id: number; patient_id?: number; patient_name?: string; phone: string;
  message_type: string; template_name?: string; message_body: string;
  status: string; sent_at?: string; error_message?: string; created_at: string;
}

// Payroll & HR
export interface PayrollMonth {
  id: number;
  month_year: string;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
}

export interface PayrollEntry {
  id: number;
  payroll_month_id: number;
  employee_id: number;
  employee_name?: string;
  basic_salary: number;
  allowances: number;
  deductions: number;
  net_salary: number;
  status: string;
  processed_at?: string;
  created_at: string;
}

export interface Employee {
  id: number; employee_code: string; staff_id?: number;
  first_name: string; last_name: string; full_name: string;
  email: string; phone: string; department: string;
  designation: string; employee_type: "Full-time" | "Part-time" | "Contract" | "Intern";
  date_of_join: string; date_of_birth?: string; gender?: string; address?: string;
  bank_name?: string; bank_account?: string; ifsc_code?: string;
  pan_number?: string; aadhar_number?: string; basic_salary: number;
  status: "Active" | "Inactive" | "Resigned" | "Terminated"; created_at: string;
}

export interface LeaveRequest {
  id: number; employee_id: number; employee_name?: string;
  leave_type: "Casual" | "Sick" | "Earned" | "Maternity" | "Paternity" | "Unpaid";
  start_date: string; end_date: string; total_days: number; reason?: string;
  status: "Pending" | "Approved" | "Rejected"; approved_by?: string; approved_at?: string; created_at: string;
}

export interface Attendance {
  id: number; employee_id: number; employee_name?: string;
  attendance_date: string; check_in?: string; check_out?: string;
  work_hours: number; status: "Present" | "Absent" | "Late" | "Half Day"; created_at: string;
}

// Asset Management
export interface AssetCategory {
  id: number; category_name: string; depreciation_rate: number;
  description?: string; created_at: string;
}

export interface Asset {
  id: number; asset_code: string; asset_name: string; category_id: number;
  category_name?: string; purchase_date: string; purchase_cost: number;
  current_value: number; warranty_expiry?: string; location?: string;
  assigned_to?: number; assigned_employee?: string;
  status: "Active" | "Under Maintenance" | "Scrapped" | "Disposed"; created_at: string;
}

export interface AssetMaintenance {
  id: number; asset_id: number; asset_name?: string;
  maintenance_type: "Preventive" | "Corrective" | "Upgrade" | "Inspection";
  description: string; maintenance_date: string; cost: number;
  vendor?: string; next_due_date?: string; created_at: string;
}

// OPD Queue
export interface OpdToken {
  id: number; token_number: number; patient_id: number; patient_name?: string;
  doctor_id: number; doctor_name?: string; department: string; queue_date: string;
  status: "Waiting" | "Called" | "InProgress" | "Completed" | "Cancelled";
  wait_time: number; called_at?: string; started_at?: string; completed_at?: string;
  priority: number; visit_id?: number; created_at: string;
}

// Discharge Summary
export interface DischargeSummary {
  id: number; summary_code: string; patient_id: number; patient_name?: string;
  admission_date: string; discharge_date: string;
  discharge_type: "Regular" | "LAMA" | "DOR" | "Transfer";
  diagnosis: string; procedure_done?: string;
  history_present_illness?: string; examination_findings?: string;
  investigations?: string; treatment_given?: string; advice_on_discharge?: string;
  follow_up_date?: string; created_by: number; doctor_name?: string;
  medications: DischargeMedication[]; created_at: string;
}

export interface DischargeMedication {
  id: number; discharge_summary_id: number; medication: string;
  dosage: string; duration: string; instructions?: string;
}

// Operation Theatre
export interface OtSchedule {
  id: number; surgery_code: string; patient_id: number; patient_name?: string;
  surgeon_id: number; surgeon_name?: string; anesthesiologist_id?: number; anesthesiologist_name?: string;
  ot_theatre_id: number; theatre_name?: string; surgery_type: string; surgery_date: string;
  start_time: string; end_time?: string; status: string; priority: string;
  anesthesia_type?: string; notes?: string; created_at: string;
}

export interface OtTheatre {
  id: number; theatre_name: string; theatre_code: string;
  location?: string; is_operational: boolean; created_at: string;
}

// Emergency / ER
export interface EmergencyCase {
  id: number; case_code: string; patient_id?: number; patient_name: string;
  patient_phone?: string; arrival_time: string; triage_level: "Red" | "Orange" | "Yellow" | "Green";
  chief_complaint: string; vital_signs?: string; treatment_given?: string;
  status: string; outcome?: string; admitted_to?: number; ward_name?: string;
  discharged_at?: string; created_at: string;
}

// Blood Bank
export interface BloodDonor {
  id: number; donor_code: string; full_name: string; dob?: string;
  gender?: string; phone: string; email?: string; blood_group: string;
  last_donation?: string; donation_count: number; status: string; created_at: string;
}

export interface BloodInventory {
  id: number; bag_number: string; blood_group: string; component: string;
  units: number; collection_date: string; expiry_date: string; donor_id?: number;
  status: string; created_at: string;
}

export interface BloodRequest {
  id: number; request_code: string; patient_id: number; patient_name?: string;
  blood_group: string; units_required: number; units_issued: number;
  urgency: string; status: string; approved_by?: string; created_at: string;
}

// Ambulance
export interface Ambulance {
  id: number; ambulance_number: string; vehicle_type: string;
  license_number: string; insurance_expiry?: string; last_service?: string;
  status: string; created_at: string;
}

export interface AmbulanceCall {
  id: number; call_code: string; patient_id?: number; patient_name: string;
  patient_phone: string; pickup_address: string; destination?: string;
  ambulance_id?: number; ambulance_number?: string; driver_name?: string;
  call_time: string; pickup_time?: string; arrival_time?: string; drop_time?: string;
  status: string; notes?: string; created_at: string;
}

// Expense Management
export interface ExpenseCategory {
  id: number; category_name: string; description?: string; created_at: string;
}

export interface Expense {
  id: number; expense_code: string; category_id: number; category_name?: string;
  amount: number; expense_date: string; description: string; vendor?: string;
  payment_method?: string; receipt_number?: string; approved_by?: string;
  status: string; created_at: string;
}

// Notifications
export interface Notification {
  id: number; title: string; message: string; notification_type: string;
  target_role?: string; is_read: boolean; created_at: string;
}

// Role Permissions
export interface RolePermission {
  id: number; role: string; module: string;
  can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean;
}

// Medical Records (EMR)
export interface MedicalRecord {
  id: number;
  patient_id: number;
  doctor_id: number;
  doctor_name?: string;
  record_type: "Clinical Note" | "Diagnostic Report" | "Prescription Archive" | "Imaging" | "Other";
  title: string;
  description?: string;
  attachment_path?: string;
  visit_id?: number;
  created_at: string;
}

// Visits
export interface Visit {
  id: number;
  visit_code: string;
  patient_id: number;
  patient_name?: string;
  doctor_id: number;
  doctor_name?: string;
  department: string;
  status: VisitStatus;
  visit_type: "OPD" | "Emergency";
  reason?: string;
  diagnosis?: string;
  created_at: string;
  updated_at: string;
}

// Staff Shift Roster
export interface StaffShift {
  id: number;
  employee_id: number;
  employee_name?: string;
  shift_date: string;
  shift_type: "Morning" | "Evening" | "Night" | "On-Call" | "Holiday";
  status: string;
  notes?: string;
  created_at: string;
}

export interface PatientFeedback {
  id: number;
  patient_id?: number;
  patient_name?: string;
  rating: number;
  comments: string;
  department?: string;
  created_at: string;
}
