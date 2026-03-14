import { invoke } from "@tauri-apps/api/core";
import type {
  Patient, Doctor, Appointment, Prescription, PrescriptionDrug,
  LabTest, Ward, Bed, Invoice, InvoiceItem, InsuranceClaim, InventoryItem,
  DashboardStats, AuditLog, Staff, VitalSigns,
  PatientStatus, AppointmentStatus, BedStatus, InvoiceStatus, ClaimStatus,
} from "@/types";

const cmd = <T>(command: string, args?: Record<string, unknown>) =>
  invoke<T>(command, args);

// Dashboard
export const getDashboardStats       = ()               => cmd<DashboardStats>("get_dashboard_stats");
export const getRecentActivity       = (limit = 20)     => cmd<AuditLog[]>("get_recent_activity", { limit });

// Patients
export const getPatients             = (search?: string, status?: string) => cmd<Patient[]>("get_patients", { search, status });
export const getPatientById          = (id: number)     => cmd<Patient>("get_patient_by_id", { id });
export const createPatient           = (data: Omit<Patient,"id"|"patient_code"|"created_at"|"updated_at"|"assigned_doctor_name">) => cmd<Patient>("create_patient", { data });
export const updatePatient           = (id: number, data: Partial<Patient>) => cmd<Patient>("update_patient", { id, data });
export const deletePatient           = (id: number)     => cmd<void>("delete_patient", { id });
export const getPatientVitals        = (patient_id: number) => cmd<VitalSigns[]>("get_patient_vitals", { patient_id });
export const addVitalSigns           = (data: Omit<VitalSigns,"id">) => cmd<VitalSigns>("add_vital_signs", { data });

// Doctors
export const getDoctors              = ()               => cmd<Doctor[]>("get_doctors");
export const getDoctorById           = (id: number)     => cmd<Doctor>("get_doctor_by_id", { id });
export const createDoctor            = (data: Omit<Doctor,"id"|"staff_code"|"created_at">) => cmd<Doctor>("create_doctor", { data });
export const updateDoctor            = (id: number, data: Partial<Doctor>) => cmd<Doctor>("update_doctor", { id, data });
export const updateDoctorStatus      = (id: number, status: Doctor["availability_status"]) => cmd<void>("update_doctor_status", { id, status });

// Staff
export const getStaff                = ()               => cmd<Staff[]>("get_staff");
export const createStaff             = (data: Omit<Staff,"id"|"staff_code">) => cmd<Staff>("create_staff", { data });
export const updateStaff             = (id: number, data: Partial<Staff>) => cmd<Staff>("update_staff", { id, data });
export const deleteStaff             = (id: number)     => cmd<void>("delete_staff", { id });

// Appointments
export const getAppointments         = (date?: string, doctor_id?: number) => cmd<Appointment[]>("get_appointments", { date, doctor_id });
export const getAppointmentById      = (id: number)     => cmd<Appointment>("get_appointment_by_id", { id });
export const createAppointment       = (data: Omit<Appointment,"id"|"appointment_code"|"created_at"|"patient_name"|"doctor_name">) => cmd<Appointment>("create_appointment", { data });
export const updateAppointmentStatus = (id: number, status: AppointmentStatus) => cmd<void>("update_appointment_status", { id, status });
export const cancelAppointment       = (id: number, reason?: string) => cmd<void>("cancel_appointment", { id, reason });
export const getUpcomingAppointments = (patient_id: number) => cmd<Appointment[]>("get_upcoming_appointments", { patient_id });

// Prescriptions
export const getPrescriptions        = (patient_id?: number) => cmd<Prescription[]>("get_prescriptions", { patient_id });
export const getPrescriptionById     = (id: number)     => cmd<Prescription>("get_prescription_by_id", { id });
export const createPrescription      = (
  data: Omit<Prescription,"id"|"rx_code"|"created_at"|"patient_name"|"doctor_name"|"drugs">,
  drugs: Omit<PrescriptionDrug,"id"|"prescription_id">[]
) => cmd<Prescription>("create_prescription", { data, drugs });
export const cancelPrescription      = (id: number)     => cmd<void>("cancel_prescription", { id });
export const refillPrescription      = (id: number, drug_id: number) => cmd<void>("refill_prescription", { id, drug_id });
export const getDueRefillRx          = ()               => cmd<Prescription[]>("get_prescriptions_due_refill");

// Lab
export const getLabTests             = (status?: LabTest["status"], patient_id?: number) => cmd<LabTest[]>("get_lab_tests", { status, patient_id });
export const createLabTest           = (data: Omit<LabTest,"id"|"lab_code"|"patient_name"|"doctor_name">) => cmd<LabTest>("create_lab_test", { data });
export const updateLabResult         = (id: number, result: { result_value: string; result_unit: string; is_abnormal: boolean; notes?: string }) => cmd<void>("update_lab_result", { id, result });
export const updateLabStatus         = (id: number, status: LabTest["status"]) => cmd<void>("update_lab_status", { id, status });
export const uploadLabReport         = (lab_id: number, file_path: string) => cmd<void>("upload_lab_report", { lab_id, file_path });

// Wards & Beds
export const getWards                = ()               => cmd<Ward[]>("get_wards");
export const getBeds                 = (ward_id?: number) => cmd<Bed[]>("get_beds", { ward_id });
export const admitPatient            = (bed_id: number, patient_id: number, expected_discharge?: string) => cmd<void>("admit_patient", { bed_id, patient_id, expected_discharge });
export const dischargePatient        = (bed_id: number) => cmd<void>("discharge_patient", { bed_id });
export const updateBedStatus         = (bed_id: number, status: BedStatus) => cmd<void>("update_bed_status", { bed_id, status });
export const createWard              = (data: Omit<Ward,"id">) => cmd<Ward>("create_ward", { data });

// Billing
export const getInvoices             = (status?: InvoiceStatus, patient_id?: number) => cmd<Invoice[]>("get_invoices", { status, patient_id });
export const getInvoiceById          = (id: number)     => cmd<Invoice>("get_invoice_by_id", { id });
export const createInvoice           = (
  data: Omit<Invoice,"id"|"invoice_code"|"created_at"|"patient_name"|"items">,
  items: Omit<InvoiceItem,"id"|"invoice_id">[]
) => cmd<Invoice>("create_invoice", { data, items });
export const recordPayment           = (invoice_id: number, amount: number, method: Invoice["payment_method"]) => cmd<void>("record_payment", { invoice_id, amount, method });
export const exportInvoicePdf        = (invoice_id: number) => cmd<string>("export_invoice_pdf", { invoice_id });
export const getRevenueByRange       = (from: string, to: string) => cmd<{ date: string; amount: number }[]>("get_revenue_by_range", { from, to });

// Insurance
export const getInsuranceClaims      = (status?: ClaimStatus) => cmd<InsuranceClaim[]>("get_insurance_claims", { status });
export const createInsuranceClaim    = (data: Omit<InsuranceClaim,"id"|"claim_code"|"patient_name">) => cmd<InsuranceClaim>("create_insurance_claim", { data });
export const updateClaimStatus       = (id: number, status: ClaimStatus, approved_amount?: number) => cmd<void>("update_claim_status", { id, status, approved_amount });

// Inventory
export const getInventory            = (category?: InventoryItem["category"]) => cmd<InventoryItem[]>("get_inventory", { category });
export const getLowStockItems        = ()               => cmd<InventoryItem[]>("get_low_stock_items");
export const updateStock             = (item_id: number, quantity: number, operation: "add"|"subtract") => cmd<void>("update_stock", { item_id, quantity, operation });
export const createInventoryItem     = (data: Omit<InventoryItem,"id"|"item_code">) => cmd<InventoryItem>("create_inventory_item", { data });
export const deleteInventoryItem     = (id: number)     => cmd<void>("delete_inventory_item", { id });

// Audit
export const getAuditLogs            = (limit?: number, entity?: string) => cmd<AuditLog[]>("get_audit_logs", { limit, entity });

// Sync
export const syncToCloud             = () => cmd<{ synced: number; errors: number }>("sync_to_cloud");
export const getSyncStatus           = () => cmd<{ last_sync: string; pending: number }>("get_sync_status");
