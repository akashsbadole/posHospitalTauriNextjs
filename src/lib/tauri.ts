import { invoke } from "@tauri-apps/api/core";
import type {
  Patient, Doctor, Appointment, Prescription, PrescriptionDrug,
  LabTest, Ward, Bed, Invoice, InvoiceItem, InsuranceClaim, InventoryItem,
  DashboardStats, AuditLog, Staff, VitalSigns, User, Setting,
  PatientStatus, AppointmentStatus, BedStatus, InvoiceStatus, ClaimStatus,
  TaxSetting, PaymentBatch, PaymentBatchItem, MessageTemplate, MessageLog,
  Employee, LeaveRequest, Attendance, PayrollMonth, PayrollEntry, AssetCategory, Asset, AssetMaintenance,
  OpdToken, DischargeSummary, DischargeMedication, MedicalRecord, StaffShift,
  OtSchedule, OtTheatre, EmergencyCase, BloodDonor, BloodInventory, BloodRequest,
  Ambulance, AmbulanceCall, ExpenseCategory, Expense, Notification, RolePermission, PatientFeedback,
  Visit, VisitStatus, SupportTicket,
} from "@/types";

const cmd = <T>(command: string, args?: Record<string, unknown>) =>
  invoke<T>(command, args);

// Dashboard
export const getDashboardStats       = ()               => cmd<DashboardStats>("get_dashboard_stats");
export const getTodayAdmissions      = ()               => cmd<Patient[]>("get_today_admissions");
export const getTodayDischarges      = ()               => cmd<Patient[]>("get_today_discharges");
export const openFile                = (path: string)   => cmd<void>("open_file", { path });
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
export const getNextAvailableDoctor  = (department: string) => cmd<Doctor>("get_next_available_doctor", { department });
export const getDoctors              = ()               => cmd<Doctor[]>("get_doctors");
export const getDoctorById           = (id: number)     => cmd<Doctor>("get_doctor_by_id", { id });
export const createDoctor            = (data: Omit<Doctor,"id"|"staff_code"|"created_at">) => cmd<Doctor>("create_doctor", { data });
export const updateDoctor            = (id: number, data: Partial<Doctor>) => cmd<Doctor>("update_doctor", { id, data });
export const deleteDoctor            = (id: number) => cmd<void>("delete_doctor", { id });
export const updateDoctorStatus      = (id: number, status: Doctor["availability_status"]) => cmd<void>("update_doctor_status", { id, status });

// Staff
export const getStaff                = ()               => cmd<Staff[]>("get_staff");
export const createStaff             = (data: Omit<Staff,"id"|"staff_code">) => cmd<Staff>("create_staff", { data });
export const updateStaff             = (id: number, data: Partial<Staff>) => cmd<Staff>("update_staff", { id, data });
export const deleteStaff             = (id: number)     => cmd<void>("delete_staff", { id });

// Appointments
export const getAppointments         = (date?: string, doctor_id?: number, patient_id?: number) => cmd<Appointment[]>("get_appointments", { date, doctor_id, patient_id });
export const getAppointmentById      = (id: number)     => cmd<Appointment>("get_appointment_by_id", { id });
export const createAppointment       = (data: Omit<Appointment,"id"|"appointment_code"|"created_at"|"patient_name"|"doctor_name">) => cmd<Appointment>("create_appointment", { data });
export const updateAppointmentStatus = (id: number, status: AppointmentStatus) => cmd<void>("update_appointment_status", { id, status });
export const deleteAppointment       = (id: number) => cmd<void>("delete_appointment", { id });
export const cancelAppointment       = (id: number, reason?: string) => cmd<void>("cancel_appointment", { id, reason });
export const getUpcomingAppointments = (patient_id: number) => cmd<Appointment[]>("get_upcoming_appointments", { patient_id });

// Prescriptions
export const getPrescriptions        = (patient_id?: number) => cmd<Prescription[]>("get_prescriptions", { patient_id });
export const getPrescriptionById     = (id: number)     => cmd<Prescription>("get_prescription_by_id", { id });
export const createPrescription      = (
  data: Omit<Prescription,"id"|"rx_code"|"created_at"|"patient_name"|"doctor_name"|"drugs">,
  drugs: Omit<PrescriptionDrug,"id"|"prescription_id">[]
) => cmd<Prescription>("create_prescription", { data, drugs });
export const issuePrescription = (id: number) => invoke<void>("issue_prescription", { id });
export const deletePrescription      = (id: number) => cmd<void>("delete_prescription", { id });
export const cancelPrescription      = (id: number)     => cmd<void>("cancel_prescription", { id });
export const refillPrescription      = (id: number, drug_id: number) => cmd<void>("refill_prescription", { id, drug_id });
export const exportPrescriptionPdf   = (prescription_id: number) => cmd<string>("export_prescription_pdf", { prescription_id });
export const getDueRefillRx          = ()               => cmd<Prescription[]>("get_prescriptions_due_refill");

// Lab
export const getLabTests             = (status?: LabTest["status"], patient_id?: number) => cmd<LabTest[]>("get_lab_tests", { status, patient_id });
export const createLabTest           = (data: Omit<LabTest,"id"|"lab_code"|"patient_name"|"doctor_name">) => cmd<LabTest>("create_lab_test", { data });
export const updateLabResult         = (id: number, result: { result_value: string; result_unit: string; is_abnormal: boolean; notes?: string }) => cmd<void>("update_lab_result", { id, result });
export const updateLabStatus         = (id: number, status: LabTest["status"]) => cmd<void>("update_lab_status", { id, status });
export const deleteLabTest           = (id: number) => cmd<void>("delete_lab_test", { id });
export const uploadLabReport         = (lab_id: number, file_path: string) => cmd<void>("upload_lab_report", { lab_id, file_path });

// Wards & Beds
export const getWards                = ()               => cmd<Ward[]>("get_wards");
export const getBeds                 = (ward_id?: number) => cmd<Bed[]>("get_beds", { ward_id });
export const admitPatient            = (bed_id: number, patient_id: number, expected_discharge?: string) => cmd<void>("admit_patient", { bed_id, patient_id, expected_discharge });
export const dischargePatient        = (bed_id: number) => cmd<void>("discharge_patient", { bed_id });
export const transferPatient        = (from_bed_id: number, to_bed_id: number) => cmd<void>("transfer_patient", { from_bed_id, to_bed_id });
export const updateBedStatus         = (bed_id: number, status: BedStatus) => cmd<void>("update_bed_status", { bed_id, status });
export const deleteWard              = (id: number) => cmd<void>("delete_ward", { id });
export const deleteBed               = (id: number) => cmd<void>("delete_bed", { id });
export const createWard              = (data: Omit<Ward,"id">) => cmd<Ward>("create_ward", { data });
export const createWardWithBeds      = (data: Omit<Ward,"id">) => cmd<Ward>("create_ward_with_beds", { data });

// Billing
export const getInvoices             = (status?: InvoiceStatus, patient_id?: number) => cmd<Invoice[]>("get_invoices", { status, patient_id });
export const getInvoiceById          = (id: number)     => cmd<Invoice>("get_invoice_by_id", { id });
export const createInvoice           = (
  data: Omit<Invoice,"id"|"invoice_code"|"created_at"|"patient_name"|"items">,
  items: Omit<InvoiceItem,"id"|"invoice_id">[]
) => cmd<Invoice>("create_invoice", { data, items });
export const recordPayment           = (invoice_id: number, amount: number, method: Invoice["payment_method"]) => cmd<void>("record_payment", { invoice_id, amount, method });
export const deleteInvoice           = (id: number) => cmd<void>("delete_invoice", { id });
export const exportInvoicePdf        = (invoice_id: number) => cmd<string>("export_invoice_pdf", { invoice_id });
export const getRevenueByRange       = (from: string, to: string) => cmd<{ date: string; amount: number }[]>("get_revenue_by_range", { from, to });
export const getRevenueBreakdown     = () => cmd<{ category: string; amount: number; percentage: number; color: string }[]>("get_revenue_breakdown");

// Insurance
export const getInsuranceClaims      = (status?: ClaimStatus) => cmd<InsuranceClaim[]>("get_insurance_claims", { status });
export const createInsuranceClaim    = (data: Omit<InsuranceClaim,"id"|"claim_code"|"patient_name">) => cmd<InsuranceClaim>("create_insurance_claim", { data });
export const updateClaimStatus       = (id: number, status: ClaimStatus, approved_amount?: number) => cmd<void>("update_claim_status", { id, status, approved_amount });
export const deleteInsuranceClaim    = (id: number) => cmd<void>("delete_insurance_claim", { id });

// Inventory
export const getInventory            = (category?: InventoryItem["category"]) => cmd<InventoryItem[]>("get_inventory", { category });
export const getLowStockItems        = ()               => cmd<InventoryItem[]>("get_low_stock_items");
export const getExpiringInventory    = (days?: number)  => cmd<InventoryItem[]>("get_expiring_inventory", { days });
export const updateStock             = (item_id: number, quantity: number, operation: "add"|"subtract") => cmd<void>("update_stock", { item_id, quantity, operation });
export const createInventoryItem     = (data: Omit<InventoryItem,"id"|"item_code">) => cmd<InventoryItem>("create_inventory_item", { data });
export const updateInventoryItem     = (id: number, data: Partial<InventoryItem>) => cmd<InventoryItem>("update_inventory_item", { id, data });
export const deleteInventoryItem     = (id: number)     => cmd<void>("delete_inventory_item", { id });

// Audit
export const getAuditLogs            = (limit?: number, entity?: string) => cmd<AuditLog[]>("get_audit_logs", { limit, entity });

// Sync
export const syncToCloud             = () => cmd<{ synced: number; errors: number }>("sync_to_cloud");
export const getSyncStatus           = () => cmd<{ last_sync: string; pending: number }>("get_sync_status");

// Settings
export const getSetting              = (key: string) => cmd<string | null>("get_setting", { key });
export const setSetting              = (key: string, value: string) => cmd<void>("set_setting", { key, value });
export const getAllSettings          = () => cmd<Setting[]>("get_all_settings");
export const backupDatabase          = () => cmd<string>("backup_database");

// Users & Auth
export const getUsers                = () => cmd<User[]>("get_users");
export const createUser              = (data: { username: string; password: string; role: string; full_name: string; department?: string }) => cmd<User>("create_user", { data });
export const loginUser               = (username: string, password: string) => cmd<User>("login_user", { username, password });
export const updateUserStatus        = (id: number, is_active: boolean) => cmd<void>("update_user_status", { id, is_active });
export const deleteUser              = (id: number)     => cmd<void>("delete_user", { id });

// Tax Settings
export const getTaxSettings          = ()               => cmd<TaxSetting[]>("get_tax_settings");
export const createTaxSetting        = (data: { tax_name: string; tax_type?: string; rate: number; cgst_rate?: number; sgst_rate?: number; igst_rate?: number }) => cmd<TaxSetting>("create_tax_setting", { data });
export const deleteTaxSetting        = (id: number) => cmd<void>("delete_tax_setting", { id });

// Revenue Cycle - Payment Batches
export const getPaymentBatches       = ()               => cmd<PaymentBatch[]>("get_payment_batches");
export const createPaymentBatch     = (data: { batch_date: string; created_by?: string }) => cmd<PaymentBatch>("create_payment_batch", { data });
export const deletePaymentBatch     = (id: number) => cmd<void>("delete_payment_batch", { id });
export const addPaymentBatchItem    = (batch_id: number, invoice_id: number, amount: number, payment_method: string, reference_no?: string) => cmd<PaymentBatchItem>("add_payment_batch_item", { batch_id, invoice_id, amount, payment_method, reference_no });

// WhatsApp & SMS
export const getMessageTemplates     = ()               => cmd<MessageTemplate[]>("get_message_templates");
export const createMessageTemplate  = (data: { template_name: string; message_type: string; template_body: string }) => cmd<MessageTemplate>("create_message_template", { data });
export const deleteMessageTemplate  = (id: number) => cmd<void>("delete_message_template", { id });
export const sendMessage            = (data: { patient_id?: number; phone: string; email?: string; message_type: string; template_name?: string; message_body: string }) => cmd<MessageLog>("send_message", { data });
export const getMessageLogs          = (limit?: number)  => cmd<MessageLog[]>("get_message_logs", { limit });

// Payroll & HR
export const getEmployees           = (status?: string) => cmd<Employee[]>("get_employees", { status });
export const createEmployee         = (data: { staff_id?: number; first_name: string; last_name: string; email: string; phone: string; department: string; designation: string; employee_type?: string; date_of_join: string; date_of_birth?: string; gender?: string; address?: string; bank_name?: string; bank_account?: string; ifsc_code?: string; pan_number?: string; aadhar_number?: string; basic_salary: number }) => cmd<Employee>("create_employee", { data });
export const getPayrollMonths       = ()               => cmd<PayrollMonth[]>("get_payroll_months");
export const createPayrollMonth     = (data: { month_year: string; start_date: string; end_date: string }) => cmd<PayrollMonth>("create_payroll_month", { data });
export const deletePayrollMonth     = (id: number) => cmd<void>("delete_payroll_month", { id });
export const getPayrollEntries      = (month_id: number) => cmd<PayrollEntry[]>("get_payroll_entries", { month_id });
export const calculatePayroll       = (month_id: number) => cmd<void>("calculate_payroll", { month_id });
export const updatePayrollStatus    = (id: number, status: string) => cmd<void>("update_payroll_entry_status", { id, status });
export const getLeaveRequests        = (status?: string) => cmd<LeaveRequest[]>("get_leave_requests", { status });
export const createLeaveRequest     = (data: { employee_id: number; leave_type: string; start_date: string; end_date: string; total_days: number; reason?: string }) => cmd<LeaveRequest>("create_leave_request", { data });
export const approveLeaveRequest     = (id: number, approved_by: string) => cmd<void>("approve_leave_request", { id, approved_by });
export const getAttendance           = (date?: string)  => cmd<Attendance[]>("get_attendance", { date });
export const markAttendance          = (data: { employee_id: number; attendance_date: string; check_in?: string; check_out?: string; status: string }) => cmd<Attendance>("mark_attendance", { data });

// Asset Management
export const getAssetCategories      = ()               => cmd<AssetCategory[]>("get_asset_categories");
export const createAssetCategory    = (data: { category_name: string; depreciation_rate: number; description?: string }) => cmd<AssetCategory>("create_asset_category", { data });
export const getAssets               = (status?: string) => cmd<Asset[]>("get_assets", { status });
export const createAsset            = (data: { asset_name: string; category_id: number; purchase_date: string; purchase_cost: number; warranty_expiry?: string; location?: string; assigned_to?: number }) => cmd<Asset>("create_asset", { data });
export const updateAsset            = (id: number, data: Partial<Asset>) => cmd<Asset>("update_asset", { id, data });
export const deleteAsset            = (id: number) => cmd<void>("delete_asset", { id });
export const getAssetMaintenance     = (asset_id?: number) => cmd<AssetMaintenance[]>("get_asset_maintenance", { asset_id });
export const createAssetMaintenance  = (data: { asset_id: number; maintenance_type: string; description: string; maintenance_date: string; cost?: number; vendor?: string; next_due_date?: string }) => cmd<AssetMaintenance>("create_asset_maintenance", { data });

// OPD Queue
export const getOpdTokens           = (date?: string, status?: string) => cmd<OpdToken[]>("get_opd_tokens", { date, status });
export const createOpdToken         = (data: { patient_id: number; doctor_id: number; department: string; queue_date: string; priority?: number; visit_id?: number }) => cmd<OpdToken>("create_opd_token", { data });
export const updateTokenStatus       = (id: number, new_status: string) => cmd<OpdToken>("update_token_status", { id, new_status });
export const reassignToken          = (token_id: number, new_doctor_id: number) => cmd<OpdToken>("reassign_token", { token_id, new_doctor_id });
export const skipToken              = (token_id: number) => cmd<OpdToken>("skip_token", { token_id });

// Discharge Summary
export const getDischargeSummaries   = (patient_id?: number) => cmd<DischargeSummary[]>("get_discharge_summaries", { patient_id });
export const createDischargeSummary = (
  data: Omit<DischargeSummary,"id"|"summary_code"|"patient_name"|"doctor_name"|"medications"|"created_at">,
  medications: { medication: string; dosage: string; duration: string; instructions?: string }[]
) => cmd<DischargeSummary>("create_discharge_summary", { data, medications });
export const exportDischargeSummaryPdf = (id: number) => cmd<string>("export_discharge_summary_pdf", { id });

// Operation Theatre
export const getOtSchedules = (date?: string, status?: string) => cmd<OtSchedule[]>("get_ot_schedules", { date, status });
export const createOtSchedule = (data: { patient_id: number; surgeon_id: number; anesthesiologist_id?: number; ot_theatre_id: number; surgery_type: string; surgery_date: string; start_time: string; priority?: string; anesthesia_type?: string; notes?: string }) => cmd<OtSchedule>("create_ot_schedule", { data });
export const deleteOtSchedule = (id: number) => cmd<void>("delete_ot_schedule", { id });
export const getOtTheatres = () => cmd<OtTheatre[]>("get_ot_theatres");

// Emergency / ER
export const getEmergencyCases = (status?: string) => cmd<EmergencyCase[]>("get_emergency_cases", { status });
export const createEmergencyCase = (data: { patient_id?: number; patient_name: string; patient_phone?: string; triage_level: string; chief_complaint: string; vital_signs?: string }) => cmd<EmergencyCase>("create_emergency_case", { data });
export const updateEmergencyStatus = (id: number, status: string, outcome?: string, admitted_to?: number) => cmd<void>("update_emergency_status", { id, status, outcome, admitted_to });
export const deleteEmergencyCase = (id: number) => cmd<void>("delete_emergency_case", { id });

// Blood Bank
export const getBloodDonors = (status?: string) => cmd<BloodDonor[]>("get_blood_donors", { status });
export const createBloodDonor = (data: { full_name: string; dob?: string; gender?: string; phone: string; email?: string; blood_group: string }) => cmd<BloodDonor>("create_blood_donor", { data });
export const deleteBloodDonor = (id: number) => cmd<void>("delete_blood_donor", { id });
export const getBloodInventory = () => cmd<BloodInventory[]>("get_blood_inventory");
export const createBloodInventory = (data: { blood_group: string; component?: string; units: number; collection_date: string; expiry_date: string; donor_id?: number }) => cmd<BloodInventory>("create_blood_inventory", { data });
export const deleteBloodInventory = (id: number) => cmd<void>("delete_blood_inventory", { id });
export const getBloodRequests = (status?: string) => cmd<BloodRequest[]>("get_blood_requests", { status });
export const createBloodRequest = (data: { patient_id: number; blood_group: string; units_required: number; urgency?: string }) => cmd<BloodRequest>("create_blood_request", { data });
export const deleteBloodRequest = (id: number) => cmd<void>("delete_blood_request", { id });

// Ambulance
export const getAmbulances = () => cmd<Ambulance[]>("get_ambulances");
export const createAmbulance = (data: { ambulance_number: string; vehicle_type?: string; license_number: string; insurance_expiry?: string }) => cmd<Ambulance>("create_ambulance", { data });
export const deleteAmbulance = (id: number) => cmd<void>("delete_ambulance", { id });
export const getAmbulanceCalls = (status?: string) => cmd<AmbulanceCall[]>("get_ambulance_calls", { status });
export const createAmbulanceCall = (data: { patient_id?: number; patient_name: string; patient_phone: string; pickup_address: string; destination?: string; ambulance_id?: number; driver_name?: string; notes?: string }) => cmd<AmbulanceCall>("create_ambulance_call", { data });
export const updateAmbulanceStatus = (id: number, status: string) => cmd<void>("update_ambulance_status", { id, status });

// Expense Management
export const getExpenseCategories = () => cmd<ExpenseCategory[]>("get_expense_categories");
export const createExpenseCategory = (data: { category_name: string; description?: string }) => cmd<ExpenseCategory>("create_expense_category", { data });
export const getExpenses = (status?: string) => cmd<Expense[]>("get_expenses", { status });
export const createExpense = (data: { category_id: number; amount: number; expense_date: string; description: string; vendor?: string; payment_method?: string; receipt_number?: string }) => cmd<Expense>("create_expense", { data });
export const updateExpense = (id: number, data: Partial<Expense>) => cmd<Expense>("update_expense", { id, data });
export const deleteExpense = (id: number) => cmd<void>("delete_expense", { id });

// Notifications
export const getNotifications = (limit?: number) => cmd<Notification[]>("get_notifications", { limit });
export const createNotification = (data: { title: string; message: string; notification_type?: string; target_role?: string }) => cmd<Notification>("create_notification", { data });
export const markNotificationRead = (id: number) => cmd<void>("mark_notification_read", { id });

// Role Permissions
export const getRolePermissions = (role?: string) => cmd<RolePermission[]>("get_role_permissions", { role });
export const updateRolePermission = (data: { role: string; module: string; can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }) => cmd<RolePermission>("update_role_permission", { data });

// Medical Records (EMR)
export const getMedicalRecords = (patient_id: number) => cmd<MedicalRecord[]>("get_medical_records", { patient_id });
export const createMedicalRecord = (data: Omit<MedicalRecord, "id" | "doctor_name" | "created_at">) => cmd<MedicalRecord>("create_medical_record", { data });

// Staff Shifts
export const getStaffShifts = (from_date: string, to_date: string) => cmd<StaffShift[]>("get_staff_shifts", { from_date, to_date });
export const assignStaffShift = (data: { employee_id: number; shift_date: string; shift_type: string; status?: string; notes?: string }) => cmd<StaffShift>("assign_staff_shift", { data });

// Patient Feedback
export const getFeedback = () => cmd<PatientFeedback[]>("get_feedback");
export const createFeedback = (data: { patient_id?: number; rating: number; comments: string; department?: string }) => cmd<PatientFeedback>("create_feedback", { data });

// Visits
export const getPatientVisits = (patient_id: number) => cmd<Visit[]>("get_patient_visits", { patient_id });
export const getVisitById = (id: number) => cmd<Visit>("get_visit_by_id", { id });
export const createVisit = (data: { patient_id: number; doctor_id: number; department: string; visit_type?: string; reason?: string; diagnosis?: string; status?: string }) => cmd<Visit>("create_visit", { data });
export const updateVisitDiagnosis = (id: number, diagnosis: string) => cmd<void>("update_visit_diagnosis", { id, diagnosis });
export const updateVisitStatus = (id: number, status: VisitStatus) => cmd<void>("update_visit_status", { id, status });
export const getVisitCharges = (visit_id: number) => cmd<{ items: { description: string; category: string; amount: number; quantity: number }[]; total: number }>("get_visit_charges", { visit_id });

// Support Tickets
export const getSupportTickets = (status?: string) => cmd<SupportTicket[]>("get_support_tickets", { status });
export const createSupportTicket = (data: { patient_id?: number; subject: string; description: string; category: string; priority?: string; assigned_to: number }) => cmd<SupportTicket>("create_support_ticket", { data });
export const updateSupportTicket = (id: number, data: { status?: string; assigned_to?: number; priority?: string }) => cmd<void>("update_support_ticket", { id, data });
export const deleteSupportTicket = (id: number) => cmd<void>("delete_support_ticket", { id });

// Analytics
export const getMonthlyFinance    = () => cmd<any>("get_analytics_monthly_finance");
export const getDeptDistribution  = () => cmd<any>("get_analytics_department_distribution");
export const getPatientFlow       = () => cmd<any>("get_analytics_patient_flow");
export const getBedOccupancy      = () => cmd<any>("get_analytics_bed_occupancy");

// Data Export
export const exportPatientsCsv = () => cmd<string>("export_patients_csv");
export const exportInvoicesCsv = () => cmd<string>("export_invoices_csv");
export const exportGstCsv = (from: string, to: string) => cmd<string>("export_gst_csv", { from, to });
