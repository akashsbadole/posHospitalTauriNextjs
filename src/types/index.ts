export type BloodGroup = "A+" | "A-" | "B+" | "B-" | "O+" | "O-" | "AB+" | "AB-";
export type Department =
  | "General Medicine" | "Cardiology" | "Neurology" | "Orthopedics"
  | "Gynecology" | "Pediatrics" | "Radiology" | "ENT"
  | "Dermatology" | "Oncology" | "Psychiatry" | "Urology";
export type PatientStatus = "Active" | "Admitted" | "Discharged" | "Critical" | "OPD";
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
  status: AppointmentStatus; notes?: string; follow_up_date?: string; created_at: string;
}

export interface Prescription {
  id: number; rx_code: string; patient_id: number; patient_name?: string;
  doctor_id: number; doctor_name?: string; issue_date: string; valid_until: string;
  status: "Active" | "Expired" | "Cancelled"; drugs: PrescriptionDrug[];
  diagnosis?: string; notes?: string; created_at: string;
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
  is_abnormal: boolean; notes?: string; report_path?: string;
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
  subtotal: number; discount: number; tax: number; total: number;
  paid_amount: number; balance: number; payment_method?: PaymentMethod;
  insurance_claim_id?: number; notes?: string; created_at: string;
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
  discharges_today: number; monthly_revenue: number; new_patients_this_month: number;
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
  weight_kg: number; height_cm: number; notes?: string;
}
